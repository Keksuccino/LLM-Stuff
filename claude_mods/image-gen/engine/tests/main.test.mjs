// The engine as the mod runs it: main.mjs in a child process, the job on standard input, against a local stand-in for
// the Images API (IMAGE_GEN_API_BASE). Run with `node --test engine/tests/*.test.mjs`.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { deflateSync } from 'node:zlib'

const MAIN = new URL('../main.mjs', import.meta.url).pathname

/** A solid 8x8 PNG, built here so the test needs no image files. */
function png() {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = bytes => (bytes.reduce((c, b) => crcTable[(c ^ b) & 0xff] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([length, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(8, 0)
  header.writeUInt32BE(8, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const rows = Buffer.concat(Array.from({ length: 8 }, () => Buffer.from([0, ...Array.from({ length: 8 }, () => [30, 160, 90]).flat()])))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

const IMAGE = png()
let server
let base
let folder
/** What the stand-in answers next: `{ status, body, delayMs }`, and the requests it received. */
const next = { reply: undefined }
const received = []

before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'image-gen-engine-test-'))
  server = createServer((request, response) => {
    let text = ''
    request.on('data', piece => (text += piece))
    request.on('end', () => {
      received.push({ url: request.url, headers: request.headers, body: JSON.parse(text || '{}') })
      const { status = 200, body = { data: [{ b64_json: IMAGE.toString('base64'), media_type: 'image/png' }], usage: { cost: 0.015 } }, delayMs = 0, headers = {} } = next.reply ?? {}
      setTimeout(() => {
        response.writeHead(status, { 'Content-Type': 'application/json', ...headers })
        response.end(typeof body === 'string' ? body : JSON.stringify(body))
      }, delayMs)
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  server.closeAllConnections()
  server.close()
  await rm(folder, { recursive: true, force: true })
})

function run(job) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN], { env: { ...process.env, IMAGE_GEN_API_BASE: base } })
    let out = ''
    child.stdout.on('data', piece => (out += piece))
    child.on('error', reject)
    child.on('close', () => resolve(JSON.parse(out.trim())))
    child.stdin.end(JSON.stringify(job))
  })
}

function job(overrides = {}) {
  return {
    apiKey: 'sk-or-v1-test',
    body: { model: 'test/model', prompt: 'A green square' },
    referenceImages: [],
    output: { overwrite: false, directory: folder, transparent: false },
    timeoutMs: 10_000,
    ...overrides,
  }
}

test('a generated image is saved, measured and previewed', async () => {
  next.reply = undefined
  received.length = 0
  const answer = await run(job({ output: { path: join(folder, 'square.png'), overwrite: false, directory: folder, transparent: false } }))
  assert.equal(answer.ok, true, answer.error)
  assert.equal(answer.path, join(folder, 'square.png'))
  assert.deepEqual([answer.width, answer.height, answer.cost], [8, 8, 0.015])
  assert.deepEqual(await readFile(answer.path), IMAGE)
  assert.equal(Buffer.from(answer.preview, 'base64').subarray(0, 3).toString('hex'), 'ffd8ff')
  assert.equal(received[0].url, '/images')
  assert.equal(received[0].headers.authorization, 'Bearer sk-or-v1-test')
  assert.deepEqual(received[0].body, { model: 'test/model', prompt: 'A green square', response_format: 'b64_json' })
})

test('reference images go along as data URLs, and a .jpg target gets a JPEG', async () => {
  next.reply = undefined
  received.length = 0
  const reference = join(folder, 'reference.png')
  await writeFile(reference, IMAGE)
  const answer = await run(job({ referenceImages: [reference], output: { path: join(folder, 'edit.jpg'), overwrite: false, directory: folder, transparent: false } }))
  assert.equal(answer.ok, true, answer.error)
  assert.equal((await readFile(answer.path)).subarray(0, 3).toString('hex'), 'ffd8ff')
  assert.deepEqual(received[0].body.input_references, [{ type: 'image_url', image_url: { url: `data:image/png;base64,${IMAGE.toString('base64')}` } }])
})

test('without a path the image gets a new name in the default folder', async () => {
  next.reply = undefined
  const subfolder = join(folder, 'default')
  const first = await run(job({ output: { overwrite: false, directory: subfolder, transparent: false } }))
  assert.equal(first.ok, true, first.error)
  assert.match(first.path, /\/default\/\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d_a-green-square\.png$/)
  assert.deepEqual(await readdir(subfolder), [first.path.split('/').pop()])
})

test('a bad target is refused before anything is sent', async () => {
  received.length = 0
  const taken = join(folder, 'taken.png')
  await writeFile(taken, IMAGE)
  const cases = [
    { path: taken, overwrite: false, transparent: false },
    { path: 'relative.png', overwrite: false, transparent: false },
    { path: join(folder, 'image.gif'), overwrite: false, transparent: false },
    { path: join(folder, 'cutout.jpg'), overwrite: false, transparent: true },
  ]
  for (const output of cases) {
    const answer = await run(job({ output: { ...output, directory: folder } }))
    assert.equal(answer.ok, false)
    assert.equal(answer.kind, 'input')
  }
  const missing = await run(job({ referenceImages: [join(folder, 'missing.png')] }))
  assert.equal(missing.kind, 'input')
  assert.equal(received.length, 0)
})

test('service errors map to kinds the mod acts on', async () => {
  const cases = [
    [{ status: 401, body: { error: { message: 'User not found.', code: 401 } } }, 'auth'],
    [{ status: 402, body: { error: { message: 'Insufficient credits', metadata: { limit_source: 'openrouter_credits' } } } }, 'credits'],
    [{ status: 402, body: { error: { message: 'Busy', metadata: { limit_source: 'openrouter_in_flight_budget' } } }, headers: { 'Retry-After': '3' } }, 'rate'],
    [{ status: 403, body: { error: { message: 'Limit', metadata: { limit_source: 'openrouter_key_limit' } } } }, 'limit'],
    [{ status: 403, body: { error: { message: 'Flagged by moderation' } } }, 'refused'],
    [{ status: 429, body: { error: { message: 'Slow down' } } }, 'rate'],
    [{ status: 502, body: { error: { message: 'Provider failed' } } }, 'failed'],
    [{ status: 200, body: { data: [] } }, 'failed'],
    [{ status: 500, body: 'not json' }, 'api'],
  ]
  for (const [reply, kind] of cases) {
    next.reply = reply
    const answer = await run(job())
    assert.equal(answer.ok, false)
    assert.equal(answer.kind, kind, `HTTP ${reply.status} answered ${answer.kind}: ${answer.error}`)
  }
  next.reply = { status: 400, body: { success: false, error: { name: 'ZodError', message: JSON.stringify([{ path: ['aspect_ratio'], message: 'Invalid option' }]) } } }
  const invalid = await run(job())
  assert.equal(invalid.kind, 'api')
  assert.match(invalid.error, /aspect_ratio: Invalid option/)
})

test('a service that takes too long times out', async () => {
  next.reply = { delayMs: 1_000 }
  const answer = await run(job({ timeoutMs: 200 }))
  assert.equal(answer.ok, false)
  assert.equal(answer.kind, 'timeout')
})
