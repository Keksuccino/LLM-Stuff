import { expect, test } from 'claude-code/testing'

import { parseAspectRatio } from '../hooks/tool'
import { IMAGE_ANSWER, KEY, TOOL, fakeHost } from './fakes'

const MINI = { settings: { model: 'openai/gpt-image-1-mini', resolution: 'auto', quality: 'low', outputDir: '~/Pictures/Generated Images' } }
const NANO = { settings: { model: 'google/gemini-3.1-flash-image', resolution: '4K', quality: 'high', outputDir: '~/Art' } }

test('a finished image comes back as its summary and the preview', async ($, on) => {
  const host = fakeHost(on, { key: KEY, store: MINI })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const called = await $.tool.call({ tool: TOOL, prompt: ' A fox sticker ', transparent_background: true, aspect_ratio: '1:1', output_path: '/tmp/out/fox.png' })
  expect(called.isError).toBeUndefined()
  expect(called.result).toMatchObject([
    { type: 'text', text: expect.stringContaining('Saved image: /tmp/out/fox.png') },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE_ANSWER.preview } },
  ])
  expect(host.jobs).toHaveLength(1)
  expect(host.jobs[0]).toMatchObject({
    apiKey: KEY,
    body: { model: 'openai/gpt-image-1-mini', prompt: 'A fox sticker', aspect_ratio: '1:1', background: 'transparent', output_format: 'png', quality: 'low' },
    output: { path: '/tmp/out/fox.png', overwrite: false, directory: '~/Pictures/Generated Images', transparent: true },
  })
})

test('a shape the model lacks becomes its closest one, and only supported options are sent', async ($, on) => {
  const host = fakeHost(on, { key: KEY, store: NANO })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const called = await $.tool.call({ tool: TOOL, prompt: 'A wide landscape', aspect_ratio: '7:3', output_path: '/tmp/out/wide.jpg' })
  expect(called.isError).toBeUndefined()
  expect(JSON.stringify(called.result)).toContain('closest shape, 21:9')
  // Nano Banana takes a resolution but no quality, background or format
  expect(host.jobs[0]?.body).toEqual({ model: 'google/gemini-3.1-flash-image', prompt: 'A wide landscape', aspect_ratio: '21:9', resolution: '4K' })
  expect(host.jobs[0]?.output).toMatchObject({ path: '/tmp/out/wide.jpg', directory: '~/Art', transparent: false })
})

test('what the model cannot do is refused before anything is generated', async ($, on) => {
  const host = fakeHost(on, { key: KEY })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // GPT Image 2, the default, makes no transparent backgrounds
  const transparent = await $.tool.call({ tool: TOOL, prompt: 'A sticker', transparent_background: true })
  expect(transparent.isError).toBe(true)
  expect(transparent.text).toContain('/image-gen-settings')

  const tooMany = await $.tool.call({ tool: TOOL, prompt: 'Combine', reference_images: Array.from({ length: 17 }, (_, i) => `/tmp/${i}.png`) })
  expect(tooMany.isError).toBe(true)

  const badShape = await $.tool.call({ tool: TOOL, prompt: 'Tall', aspect_ratio: '1:4' })
  expect(badShape.isError).toBe(true)
  expect(host.jobs).toHaveLength(0)
})

test('an edit-only model needs a reference image', async ($, on) => {
  const host = fakeHost(on, { key: KEY, store: { settings: { model: 'krea/k3-edit', resolution: 'auto', quality: 'auto', outputDir: '~/x' } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const called = await $.tool.call({ tool: TOOL, prompt: 'A cat' })
  expect(called.isError).toBe(true)
  expect(host.jobs).toHaveLength(0)
})

test('without a key the settings open and nothing is generated', async ($, on) => {
  const host = fakeHost(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const called = await $.tool.call({ tool: TOOL, prompt: 'A cat' })
  expect(called.isError).toBe(true)
  expect(host.opened.count).toBe(1)
  expect(host.jobs).toHaveLength(0)
})

test('a rejected key opens the settings; other failures only report', async ($, on) => {
  const host = fakeHost(on, { key: KEY })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  host.answer.value = { ok: false, kind: 'auth', error: 'The OpenRouter API key was rejected.' }
  const rejected = await $.tool.call({ tool: TOOL, prompt: 'A cat' })
  expect(rejected.isError).toBe(true)
  expect(host.opened.count).toBe(1)

  host.answer.value = { ok: false, kind: 'failed', error: 'The image model could not make this image.' }
  const failed = await $.tool.call({ tool: TOOL, prompt: 'A cat' })
  expect(failed.isError).toBe(true)
  expect(host.opened.count).toBe(1)
})

test('aspect ratios are checked and reduced', () => {
  expect(parseAspectRatio(undefined)).toBeUndefined()
  expect(parseAspectRatio('Auto')).toBeUndefined()
  expect(parseAspectRatio('1920x1080')).toBe('16:9')
  expect(parseAspectRatio('2.35:1')).toBe('2.35:1')
  expect(() => parseAspectRatio('4:1')).toThrow()
  expect(() => parseAspectRatio('wide')).toThrow()
})
