import { EngineError } from './errors.mjs'

/**
 * OpenRouter's Images API. `IMAGE_GEN_API_BASE` points the engine at another server; only the engine's tests set it
 * (TESTING_GUIDELINES.md).
 */
const API_BASE = process.env.IMAGE_GEN_API_BASE ?? 'https://openrouter.ai/api/v1'

/** The app name OpenRouter's activity log shows for these requests. */
const APP_TITLE = 'Claude Image Gen'

/**
 * Generates one image. `body` holds the request's fields as the API spells them (model, prompt, aspect_ratio, ...),
 * already checked against the model's capabilities; `references` are data URLs. Resolves `{ bytes, cost }`.
 */
export async function requestImage({ apiKey, body, references, timeoutMs }) {
  // A cancelled tool call kills the engine process, so the timeout is the only signal needed here.
  const timeout = AbortSignal.timeout(timeoutMs)
  const request = {
    ...body,
    ...(references.length > 0 ? { input_references: references.map(url => ({ type: 'image_url', image_url: { url } })) } : {}),
    response_format: 'b64_json',
  }
  let response
  try {
    response = await fetch(`${API_BASE}/images`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': APP_TITLE,
      },
      body: JSON.stringify(request),
      signal: timeout,
    })
  } catch (error) {
    throw requestFailure(error, timeout, timeoutMs)
  }
  let text
  try {
    text = await response.text()
  } catch (error) {
    throw requestFailure(error, timeout, timeoutMs)
  }
  const answer = parseJson(text)
  if (!response.ok) {
    throw describeFailure(response.status, answer, text, response.headers.get('retry-after'))
  }
  const image = answer?.data?.[0]
  let bytes
  if (typeof image?.b64_json === 'string' && image.b64_json.length > 0) {
    bytes = Buffer.from(image.b64_json, 'base64')
  } else if (typeof image?.url === 'string') {
    bytes = await download(image.url, timeout, timeoutMs)
  } else {
    throw new EngineError('failed', 'The model answered without an image. Try again, or rephrase the prompt.')
  }
  const cost = answer?.usage?.cost

  return { bytes, cost: typeof cost === 'number' ? cost : undefined }
}

async function download(url, timeout, timeoutMs) {
  try {
    const response = await fetch(url, { signal: timeout })
    if (!response.ok) {
      throw new EngineError('network', `The finished image could not be downloaded (HTTP ${response.status}).`)
    }
    return Buffer.from(await response.arrayBuffer())
  } catch (error) {
    throw error instanceof EngineError ? error : requestFailure(error, timeout, timeoutMs)
  }
}

function requestFailure(error, timeout, timeoutMs) {
  if (timeout.aborted) {
    return new EngineError('timeout', `The image service did not answer within ${Math.round(timeoutMs / 1000)} seconds. Try again.`)
  }
  return new EngineError('network', `The image service could not be reached: ${error?.cause?.message ?? error?.message ?? error}`)
}

/** Maps an error answer to what Claude should read; see OpenRouter's Images API errors. */
export function describeFailure(status, answer, text, retryAfter) {
  const message = errorMessage(answer, text)
  const limitSource = answer?.error?.metadata?.limit_source
  const wait = retryAfter && Number(retryAfter) > 0 ? ` in about ${Math.ceil(Number(retryAfter))} seconds` : ' in a moment'
  switch (true) {
    case status === 401:
      return new EngineError('auth', 'The OpenRouter API key was rejected. It may be wrong, deleted or expired.')
    case status === 402 && limitSource === 'openrouter_in_flight_budget':
      return new EngineError('rate', `Too many images are being generated at once on this account. Try again${wait}.`)
    case status === 402:
      return new EngineError('credits', 'The OpenRouter account has not enough credits for this image. Credits can be added at https://openrouter.ai/settings/credits.')
    case status === 403 && limitSource === 'openrouter_key_limit':
      return new EngineError('limit', "The API key's spending limit is used up. It can be raised at https://openrouter.ai/keys.")
    case status === 403:
      return new EngineError('refused', `The request was refused${message ? `: ${message}` : '.'}`)
    case status === 408 || status === 504:
      return new EngineError('timeout', `The image model took too long and gave up${message ? ` (${message})` : ''}. Try again.`)
    case status === 429:
      return new EngineError('rate', `The image service is rate limiting this key. Try again${wait}.`)
    case status === 502 || status === 503:
      return new EngineError('failed', `The image model could not make this image${message ? ` (${message})` : ''}. Nothing was billed. Try again, or rephrase the prompt.`)
    default:
      return new EngineError('api', `The image service answered HTTP ${status}${message ? `: ${message}` : '.'}`)
  }
}

/** The error text of an answer: OpenRouter's `{ error: { message } }`, or a validation error's list of issues. */
function errorMessage(answer, text) {
  const raw = answer?.error?.message ?? answer?.message
  if (typeof raw !== 'string') {
    return text.trim().slice(0, 300)
  }
  // Request validation answers `{ success: false, error: { name: "ZodError", message: "<JSON list of issues>" } }`
  const issues = parseJson(raw)
  if (Array.isArray(issues)) {
    return issues
      .map(issue => `${Array.isArray(issue.path) && issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message ?? 'invalid'}`)
      .join('; ')
      .slice(0, 500)
  }
  return raw.slice(0, 500)
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
