import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

import { EngineError } from './errors.mjs'

const execFileAsync = promisify(execFile)

const OUTPUT_FORMATS = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg' }
// Reference formats sent as they are; anything else macOS can decode is converted to PNG first.
const DIRECT_REFERENCE_TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
const PREVIEW_MAX_EDGE = 1024
const PREVIEW_JPEG_QUALITY = 80
const SLUG_MAX_WORDS = 6
const SLUG_MAX_LENGTH = 48

/**
 * Validates and resolves where the image will be saved, before anything is generated, so a bad path never costs a
 * generation. Without `path`, a new file in `directory` is named after the time and the start of the prompt.
 */
export async function resolveOutputTarget({ path: rawPath, overwrite, transparent, directory, prompt, now = new Date() }) {
  if (rawPath === undefined) {
    const folder = expandHome(directory)
    if (!isAbsolute(folder)) {
      throw new EngineError('input', `The output folder in the settings must be an absolute path, not "${directory}".`)
    }
    return { path: join(folder, `${timestamp(now)}_${slugify(prompt)}.png`), format: 'png', overwrite: false, uniquify: true }
  }
  const path = expandHome(rawPath)
  if (!isAbsolute(path)) {
    throw new EngineError('input', `output_path must be an absolute path, not "${rawPath}".`)
  }
  const format = OUTPUT_FORMATS[extname(path).toLowerCase()]
  if (!format) {
    throw new EngineError('input', 'output_path must end in .png, .jpg or .jpeg.')
  }
  if (format === 'jpeg' && transparent) {
    throw new EngineError('input', 'JPEG cannot store transparency. Use a .png output_path for transparent backgrounds.')
  }
  if (!overwrite && (await exists(path))) {
    throw new EngineError('input', `${path} already exists. Choose another output_path, or set overwrite to true to replace it.`)
  }
  return { path, format, overwrite, uniquify: false }
}

/** Writes the image to the resolved target, converting it when needed, and returns the final path. */
export async function saveImage(bytes, { path, format, overwrite, uniquify }) {
  const encoded = detectImageType(bytes) === format ? bytes : await convertImage(bytes, format)
  await mkdir(dirname(path), { recursive: true })
  for (let attempt = 1; ; attempt++) {
    const candidate = attempt === 1 ? path : path.replace(/(\.\w+)$/, `-${attempt}$1`)
    try {
      await writeFile(candidate, encoded, { flag: overwrite ? 'w' : 'wx' })
      return candidate
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error
      }
      if (!uniquify) {
        throw new EngineError('input', `${path} already exists. Choose another output_path, or set overwrite to true to replace it.`)
      }
    }
  }
}

/** Loads local images as data URLs for the request's `input_references`. */
export function loadReferenceImages(paths) {
  return Promise.all(
    paths.map(async rawPath => {
      const path = expandHome(rawPath)
      if (!isAbsolute(path)) {
        throw new EngineError('input', `Reference image paths must be absolute, not "${rawPath}".`)
      }
      let bytes
      try {
        bytes = await readFile(path)
      } catch (error) {
        throw new EngineError('input', `Cannot read reference image ${path}: ${error.code === 'ENOENT' ? 'file not found' : error.message}`)
      }
      const mimeType = DIRECT_REFERENCE_TYPES[detectImageType(bytes)]
      if (mimeType) {
        return `data:${mimeType};base64,${bytes.toString('base64')}`
      }
      let png
      try {
        png = await convertImage(bytes, 'png')
      } catch {
        throw new EngineError('input', `${path} is not an image format that can be used as a reference.`)
      }
      return `data:image/png;base64,${png.toString('base64')}`
    }),
  )
}

/** Returns the pixel size of an image file and whether it has an alpha channel. */
export async function imageInfo(path) {
  const { stdout } = await execFileAsync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', path])
  return {
    width: Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1]),
    height: Number(/pixelHeight:\s*(\d+)/.exec(stdout)?.[1]),
    hasAlpha: /hasAlpha:\s*yes/.test(stdout),
  }
}

/** Creates a small JPEG preview of an image file. Transparent areas become white. */
export async function createPreview(path, { width, height }) {
  const resize = Math.max(width, height) > PREVIEW_MAX_EDGE ? ['-Z', String(PREVIEW_MAX_EDGE)] : []
  return convertImage(await readFile(path), 'jpeg', ['-s', 'formatOptions', String(PREVIEW_JPEG_QUALITY), ...resize])
}

/** Identifies PNG, JPEG, WebP and GIF data by their signatures. */
export function detectImageType(bytes) {
  if (bytes.length >= 8 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.readUInt32BE(4) === 0x0d0a1a0a) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'GIF8') return 'gif'
  return undefined
}

async function convertImage(bytes, format, extraArgs = []) {
  const dir = await mkdtemp(join(tmpdir(), 'image-gen-'))
  try {
    const source = join(dir, 'source')
    const target = join(dir, `target.${format}`)
    await writeFile(source, bytes)
    await execFileAsync('/usr/bin/sips', ['-s', 'format', format, ...extraArgs, source, '--out', target])
    return await readFile(target)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function expandHome(path) {
  return path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function timestamp(date) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

function slugify(prompt) {
  const words = prompt.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) ?? []
  const slug = words.slice(0, SLUG_MAX_WORDS).join('-').slice(0, SLUG_MAX_LENGTH).replace(/-+$/, '')
  return slug || 'image'
}
