import type { EngineInterface, ToolSpec } from 'claude-code'

import type { ImageModel, ImageSettings } from '../types'
import { canMakeTransparent, closestAspectRatio } from './catalog'
import { COMMAND, DEFAULT_OUTPUT_DIR } from './config'

const TOOL_NAME = 'generate_image'

const MAX_ASPECT_RATIO = 3
/** The Images API's own cap; each model's lower one is checked against the catalog. */
const MAX_REFERENCE_IMAGES = 16
/** How long the engine waits for the image service; the slowest models take a few minutes at high quality. */
export const REQUEST_TIMEOUT_MS = 5 * 60_000

const DESCRIPTION = `Generates a new raster image from a text prompt, or edits, restyles or combines existing local images, and saves the result as a PNG or JPEG file. Returns the saved file path, the pixel size and a downscaled preview so you can check the result.

Use it for photos, illustrations, concept art, icons, logos, textures, sprites, UI mockups, posters, comics and cutouts with transparent backgrounds. Prefer writing code (SVG, HTML/CSS, plotting libraries) for precise vector graphics, data charts, or diagrams whose exact geometry or values matter.

Writing the prompt:
- The image model sees only the prompt and the reference images, not this conversation. Make the prompt self-contained: subject, composition and framing, style or medium, lighting, color palette, mood, and the intended use (for example "app icon", "website hero image", "seamless tileable texture").
- Put any text that must appear in the image in quotes and spell it exactly.
- State important constraints explicitly, for example "no text", "plain white background" or "centered with generous margins".

Editing images:
- Pass the files in reference_images and describe the change plus what must stay the same, for example "Replace the sky with a sunset; keep the house, framing and lighting unchanged."
- Also use reference_images to combine images or to match the style or character of existing images; say in the prompt how each image should be used.
- An image that exists only in the conversation, without a file on disk, cannot be used as a reference.

Output:
- Without output_path, the image is saved as a new file in the user's default image folder (${DEFAULT_OUTPUT_DIR}/ unless they changed it). Pass output_path when the image belongs somewhere specific, such as inside a project.
- The image model, resolution and quality come from the user's settings; aspect_ratio only controls the shape.
- A call usually takes 5 to 60 seconds and returns one image. For variations, make separate calls; they can run in parallel.
- Check the preview before presenting the result. If it does not match the request, refine it with an edit of the saved file or a revised prompt.
- If the call fails because of the API key, credits or the chosen model, tell the user they can change these with /${COMMAND}.`

export const TOOL_SPEC: ToolSpec = {
  name: TOOL_NAME,
  description: DESCRIPTION,
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        minLength: 1,
        description: 'Self-contained description of the image to create, or of the changes to make to the reference images.',
      },
      reference_images: {
        type: 'array',
        items: { type: 'string' },
        maxItems: MAX_REFERENCE_IMAGES,
        description:
          'Absolute paths of local images (PNG, JPEG, WebP, GIF, HEIC, TIFF or BMP) to edit, combine or use as references. Most models take up to 5 or more; the call says so when the chosen model takes fewer. Omit to create a new image from the prompt alone.',
      },
      aspect_ratio: {
        type: 'string',
        description:
          'Shape of the output as width:height, for example "1:1", "3:2", "2:3", "16:9", "9:16" or "21:9", between 1:3 and 3:1. The closest shape the model offers is used. Omit or use "auto" to let the model choose a shape that suits the prompt; edits then usually keep the shape of the reference image.',
      },
      transparent_background: {
        type: 'boolean',
        default: false,
        description:
          'Produce a PNG with a transparent background, for cutouts, stickers, icons and sprites. Set it when editing an image whose transparency must be kept.',
      },
      output_path: {
        type: 'string',
        description: `Absolute path of the file to save, ending in .png, .jpg or .jpeg. Missing folders are created. Defaults to a new file in the user's default image folder.`,
      },
      overwrite: {
        type: 'boolean',
        default: false,
        description: 'Replace an existing file at output_path. When false, the call fails before generating if the file exists.',
      },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
}

/** The tool's arguments, checked. `aspectRatio` is "W:H" in lowest terms, or undefined for automatic. */
export type ImageRequest = {
  prompt: string
  referenceImages: string[]
  aspectRatio: string | undefined
  transparentBackground: boolean
  outputPath: string | undefined
  overwrite: boolean
}

/** What the engine (engine/main.mjs) reads from standard input, the key aside. */
export type EngineJob = {
  body: Record<string, string>
  referenceImages: string[]
  output: { path?: string; overwrite: boolean; directory: string; transparent: boolean }
  timeoutMs: number
}

/** A job ready to run, with what the result should tell Claude about choices made for the request. */
export type PreparedJob = { job: EngineJob; notes: string[] }

/** Validates a width:height aspect ratio and returns it as "W:H" in lowest terms, or undefined for automatic. */
export function parseAspectRatio(aspectRatio: string | undefined): string | undefined {
  if (aspectRatio === undefined || aspectRatio.trim().toLowerCase() === 'auto') {
    return undefined
  }
  const match = /^\s*(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)\s*$/i.exec(aspectRatio)
  let [width, height] = match ? [Number(match[1]), Number(match[2])] : [Number.NaN, Number.NaN]
  const ratio = width / height
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new Error(`aspect_ratio must look like "16:9" or "auto", not "${aspectRatio}".`)
  }
  if (ratio > MAX_ASPECT_RATIO || ratio < 1 / MAX_ASPECT_RATIO) {
    throw new Error(`aspect_ratio must be between 1:${MAX_ASPECT_RATIO} and ${MAX_ASPECT_RATIO}:1.`)
  }
  if (Number.isInteger(width) && Number.isInteger(height)) {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    const divisor = gcd(width, height)
    ;[width, height] = [width / divisor, height / divisor]
  }

  return `${width}:${height}`
}

/** Checks the tool's arguments; throws with what Claude should fix. */
export function parseRequest(e: Readonly<Record<string, unknown>>): ImageRequest {
  // Treats explicit nulls like omitted optional arguments.
  const given = (name: string) => (e[name] === null ? undefined : e[name])
  const prompt = given('prompt')
  const referenceImages = given('reference_images') ?? []
  const aspectRatio = given('aspect_ratio')
  const transparentBackground = given('transparent_background') ?? false
  const outputPath = given('output_path')
  const overwrite = given('overwrite') ?? false
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error('prompt must be a non-empty string.')
  }
  if (!Array.isArray(referenceImages) || referenceImages.some(path => typeof path !== 'string')) {
    throw new Error('reference_images must be an array of file paths.')
  }
  if (referenceImages.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`reference_images accepts at most ${MAX_REFERENCE_IMAGES} images.`)
  }
  if (aspectRatio !== undefined && typeof aspectRatio !== 'string') {
    throw new Error('aspect_ratio must be a string such as "16:9".')
  }
  if (typeof transparentBackground !== 'boolean') {
    throw new Error('transparent_background must be true or false.')
  }
  if (outputPath !== undefined && typeof outputPath !== 'string') {
    throw new Error('output_path must be a string.')
  }
  if (typeof overwrite !== 'boolean') {
    throw new Error('overwrite must be true or false.')
  }

  return {
    prompt: prompt.trim(),
    referenceImages: referenceImages as string[],
    aspectRatio: parseAspectRatio(aspectRatio),
    transparentBackground,
    outputPath,
    overwrite,
  }
}

/**
 * Turns a request into the engine's job for one model, sending only what the model supports: the Images API drops
 * fields a model does not take and still bills the image, so what cannot be honored is refused here, before anything
 * is spent.
 */
export function prepareJob(request: ImageRequest, model: ImageModel, settings: ImageSettings): PreparedJob {
  const notes: string[] = []
  const { min, max } = model.references
  const count = request.referenceImages.length
  if (count > 0 && max === 0) {
    throw new Error(`The image model in the settings (${model.title}) cannot use reference images. Generate from the prompt alone, or ask the user to pick a model that edits images in /${COMMAND}.`)
  }
  if (count > max) {
    throw new Error(`The image model in the settings (${model.title}) takes at most ${max} reference image${max === 1 ? '' : 's'}; ${count} were given.`)
  }
  if (count < min) {
    throw new Error(`The image model in the settings (${model.title}) only edits images and needs at least ${min} reference image${min === 1 ? '' : 's'}. Pass reference_images, or ask the user to pick another model in /${COMMAND}.`)
  }
  if (request.transparentBackground && !canMakeTransparent(model)) {
    throw new Error(`The image model in the settings (${model.title}) cannot make transparent backgrounds. Generate without transparent_background, or ask the user to pick a model with transparent backgrounds in /${COMMAND}.`)
  }

  let prompt = request.prompt
  const body: Record<string, string> = { model: model.id, prompt }
  if (request.aspectRatio === undefined) {
    if (model.aspectRatios.includes('auto')) {
      body.aspect_ratio = 'auto'
    }
  } else {
    const closest = closestAspectRatio(model, request.aspectRatio)
    if (closest === undefined) {
      // A model without the field takes the shape from the prompt, as the plugin always asked for it before.
      prompt = `${prompt}\n\nAspect ratio: ${request.aspectRatio}.`
      body.prompt = prompt
    } else {
      body.aspect_ratio = closest
      if (closest !== request.aspectRatio) {
        notes.push(`The model offers no ${request.aspectRatio}; the closest shape, ${closest}, was used.`)
      }
    }
  }
  if (request.transparentBackground) {
    body.background = 'transparent'
  }
  const isJpeg = request.outputPath !== undefined && /\.jpe?g$/i.test(request.outputPath)
  const format = request.transparentBackground || !isJpeg ? 'png' : 'jpeg'
  if (model.formats.includes(format)) {
    body.output_format = format
  }
  if (settings.resolution !== 'auto' && model.resolutions.includes(settings.resolution)) {
    body.resolution = settings.resolution
  }
  if (settings.quality !== 'auto' && model.qualities.includes(settings.quality)) {
    body.quality = settings.quality
  }

  return {
    job: {
      body,
      referenceImages: request.referenceImages,
      output: {
        ...(request.outputPath === undefined ? {} : { path: request.outputPath }),
        overwrite: request.overwrite,
        directory: settings.outputDir,
        transparent: request.transparentBackground,
      },
      timeoutMs: REQUEST_TIMEOUT_MS,
    },
    notes,
  }
}

/** What the engine answers on its one line of standard output. */
export type EngineAnswer =
  | { ok: true; path: string; width: number; height: number; hasAlpha: boolean; cost?: number; preview: string }
  | { ok: false; kind: string; error: string }

/** The folders that may hold `node`: the session's PATH first, then where Homebrew and the installer put it. */
const NODE_FOLDERS = ['/opt/homebrew/bin', '/usr/local/bin']
let nodePath: string | undefined

async function findNode($: EngineInterface): Promise<string> {
  if (nodePath !== undefined) {
    return nodePath
  }
  const path = (await $.env.get('PATH')) ?? ''
  for (const folder of [...path.split(':').filter(Boolean), ...NODE_FOLDERS]) {
    const candidate = `${folder}/node`
    if (await $.fs.exists(candidate)) {
      nodePath = candidate
      return candidate
    }
  }
  throw new Error('Node.js was not found. The image tool needs Node.js 20 or newer (for example from https://nodejs.org or `brew install node`).')
}

/** Runs the engine for one job; a cancelled tool call kills it through the dispatch's signal. */
export async function runEngine($: EngineInterface, apiKey: string, job: EngineJob): Promise<EngineAnswer> {
  const node = await findNode($)
  const child = $.process.spawn({
    argv: [node, `${$.plugin.root}/engine/main.mjs`],
    input: JSON.stringify({ apiKey, ...job }),
  })
  let stdout = ''
  let stderr = ''
  for await (const { stream, text } of child) {
    if (stream === 'stdout') {
      stdout += text
    } else if (stderr.length < 4000) {
      stderr += text
    }
  }
  const line = stdout.trim().split('\n').pop() ?? ''
  try {
    return JSON.parse(line) as EngineAnswer
  } catch {
    return { ok: false, kind: 'internal', error: `The image engine stopped unexpectedly${stderr.trim() ? `: ${stderr.trim().slice(0, 500)}` : '.'}` }
  }
}

/** What Claude reads after a finished image: the summary, then the preview. */
export function describeImage(answer: Extract<EngineAnswer, { ok: true }>, request: ImageRequest, model: ImageModel, notes: readonly string[]) {
  // Some models answer RGBA for every image, so an alpha channel alone does not mean the background is transparent.
  const transparent = request.transparentBackground && answer.hasAlpha
  const lines = [
    `Saved image: ${answer.path}`,
    `Size: ${answer.width}x${answer.height} px${transparent ? ', transparent background' : ''}`,
    `Model: ${model.title}${answer.cost === undefined ? '' : ` · cost $${formatCost(answer.cost)}`}`,
    ...notes,
    ...(request.transparentBackground && !answer.hasAlpha ? ['The model returned no transparency: the background is opaque.'] : []),
    `The preview below is a downscaled JPEG${transparent ? ' in which transparent areas appear white' : ''}.`,
  ]

  return [
    { type: 'text', text: lines.join('\n') },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: answer.preview } },
  ]
}

function formatCost(cost: number): string {
  return cost >= 0.1 ? cost.toFixed(2) : cost.toPrecision(2).replace(/0+$/, '').replace(/\.$/, '')
}
