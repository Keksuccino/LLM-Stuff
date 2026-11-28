/**
 * Generates one image: the mod starts this once per tool call, writes the job as JSON to standard input, and reads one
 * JSON line back from standard output. Nothing runs between calls.
 *
 * The job: `{ apiKey, body, referenceImages, output: { path?, overwrite, directory, transparent }, timeoutMs }`, where
 * `body` holds the API fields the mod already checked against the model's capabilities.
 *
 * The answer: `{ ok: true, path, width, height, hasAlpha, cost?, preview }` with `preview` a base64 JPEG of at most
 * 1024 px, or `{ ok: false, kind, error }` (kinds in errors.mjs).
 */
import { text } from 'node:stream/consumers'

import { EngineError } from './errors.mjs'
import { createPreview, imageInfo, loadReferenceImages, resolveOutputTarget, saveImage } from './image-files.mjs'
import { requestImage } from './openrouter.mjs'

async function generate(job) {
  const { apiKey, body, referenceImages = [], output, timeoutMs } = job
  const target = await resolveOutputTarget({ ...output, prompt: body.prompt })
  const references = await loadReferenceImages(referenceImages)
  const { bytes, cost } = await requestImage({ apiKey, body, references, timeoutMs })
  const path = await saveImage(bytes, target)
  const info = await imageInfo(path)
  const preview = await createPreview(path, info)

  return { ok: true, path, ...info, ...(cost === undefined ? {} : { cost }), preview: preview.toString('base64') }
}

let answer
try {
  answer = await generate(JSON.parse(await text(process.stdin)))
} catch (error) {
  answer = error instanceof EngineError
    ? { ok: false, kind: error.kind, error: error.message }
    : { ok: false, kind: 'internal', error: error?.message ?? String(error) }
}
process.stdout.write(`${JSON.stringify(answer)}\n`)
