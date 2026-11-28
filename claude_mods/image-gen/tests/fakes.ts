import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

// Not shaped like real keys (those end in 64 hex digits), so no secret scanner mistakes them for one
export const KEY = 'sk-or-v1-placeholder-key-for-tests-aaaa'
export const OTHER_KEY = 'sk-or-v1-placeholder-key-for-tests-bbbb'
export const TOOL = 'mcp__image-gen__generate_image'

/** Five models as OpenRouter's /images/models lists them: the defaults, an editor, an edit-only and a vector model. */
export const RAW_MODELS = {
  data: [
    {
      id: 'openai/gpt-image-2',
      name: 'OpenAI: GPT Image 2',
      created: 300,
      supported_parameters: {
        aspect_ratio: { type: 'enum', values: ['1:1', '3:2', '2:3', '16:9', '9:16', '21:9', 'auto'] },
        background: { type: 'enum', values: ['auto', 'opaque'] },
        quality: { type: 'enum', values: ['auto', 'low', 'medium', 'high'] },
        output_format: { type: 'enum', values: ['png', 'jpeg', 'webp'] },
        input_references: { type: 'range', min: 0, max: 16 },
      },
    },
    {
      id: 'openai/gpt-image-1-mini',
      name: 'OpenAI: GPT Image 1 Mini',
      created: 200,
      supported_parameters: {
        aspect_ratio: { type: 'enum', values: ['1:1', '3:2', '2:3', 'auto'] },
        background: { type: 'enum', values: ['auto', 'transparent', 'opaque'] },
        quality: { type: 'enum', values: ['auto', 'low', 'medium', 'high'] },
        output_format: { type: 'enum', values: ['png', 'jpeg', 'webp'] },
        input_references: { type: 'range', min: 0, max: 16 },
      },
    },
    {
      id: 'google/gemini-3.1-flash-image',
      name: 'Google: Nano Banana 2 (Gemini 3.1 Flash Image)',
      created: 400,
      supported_parameters: {
        aspect_ratio: { type: 'enum', values: ['1:1', '4:3', '16:9', '21:9'] },
        resolution: { type: 'enum', values: ['512', '1K', '2K', '4K'] },
        input_references: { type: 'range', min: 0, max: 14 },
      },
    },
    {
      id: 'krea/k3-edit',
      name: 'Krea: K3 Edit',
      created: 100,
      supported_parameters: { aspect_ratio: { type: 'enum', values: ['1:1'] }, input_references: { type: 'range', min: 1, max: 8 } },
    },
    {
      id: 'recraft/recraft-v4-vector',
      name: 'Recraft: Recraft V4 Vector',
      created: 500,
      supported_parameters: { output_format: { type: 'enum', values: ['svg'] }, input_references: { type: 'range', min: 0, max: 1 } },
    },
  ],
}

/** What the fake engine answers for a finished image. */
export const IMAGE_ANSWER = { ok: true, path: '/tmp/out/fox.png', width: 1024, height: 1024, hasAlpha: true, cost: 0.0022, preview: 'AAAA' }

export type Host = {
  /** The key the fake Keychain holds. */
  keychain: { key: string | undefined }
  /** Each job the fake engine was started with, as it read it from standard input. */
  jobs: Record<string, unknown>[]
  /** The URLs fetched. */
  fetched: string[]
  /** How often the pane was opened. */
  opened: { count: number }
  /** What the fake engine answers next. */
  answer: { value: unknown }
  /** The plugin's store, as the mod left it. */
  store: Map<string, unknown>
}

/**
 * Stands for everything beneath the mod: the Keychain behind /usr/bin/security, OpenRouter behind `$.http.fetch`, the
 * engine behind `$.process.spawn`, and the store, the clock-free registrations and the pane's surface.
 */
export function fakeHost(on: On, options: { key?: string; store?: Record<string, unknown> } = {}): Host {
  const store = new Map(Object.entries(options.store ?? {}))
  const host: Host = { keychain: { key: options.key }, jobs: [], fetched: [], opened: { count: 0 }, answer: { value: IMAGE_ANSWER }, store }
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  mock.env(on, { PATH: '/usr/bin:/bin' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'image-gen-settings' } }))
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('ui.open', () => {
    host.opened.count++
    return { value: { isPlaced: true } }
  })
  on('fs.exists', (_, e) => ({ value: e.path === '/usr/bin/node' }))
  on('process.run', (_, e) => {
    const [, verb] = e.argv
    const done = (exitCode: number, stdout = '', stderr = '') => ({
      value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
    })
    if (verb === 'find-generic-password') {
      return host.keychain.key === undefined ? done(44, '', 'could not be found') : done(0, `${host.keychain.key}\n`)
    }
    if (verb === '-i') {
      host.keychain.key = /-w "([^"]+)"/.exec(e.init?.stdin ?? '')?.[1]
      return done(0)
    }
    if (verb === 'delete-generic-password') {
      const had = host.keychain.key !== undefined
      host.keychain.key = undefined
      return done(had ? 0 : 44)
    }
    return done(1, '', `unexpected command ${e.argv.join(' ')}`)
  })
  on('http.fetch', (_, e) => {
    host.fetched.push(e.url)
    const answer = (status: number, body: unknown) => ({ value: { status, ok: status < 300, headers: {}, text: JSON.stringify(body) } })
    if (e.url.endsWith('/images/models')) {
      return answer(200, RAW_MODELS)
    }
    const auth = e.init?.headers?.Authorization
    if (auth !== `Bearer ${KEY}` && auth !== `Bearer ${OTHER_KEY}`) {
      return answer(401, { error: { message: 'User not found.', code: 401 } })
    }
    if (e.url.endsWith('/key')) {
      const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString()
      return answer(200, { data: { limit: 10, limit_remaining: 7.5, expires_at: expiresAt } })
    }
    if (e.url.endsWith('/credits')) {
      return answer(200, { data: { total_credits: 20, total_usage: 5 } })
    }
    return answer(404, {})
  })
  on('process.spawn', async function* (_, e) {
    host.jobs.push(JSON.parse(e.input ?? '{}') as Record<string, unknown>)
    yield { stream: 'stdout' as const, text: `${JSON.stringify(host.answer.value)}\n` }
    return { value: { code: 0, signal: null } }
  })

  return host
}

/** Runs /image-gen-settings as the person typing it would. */
export function openPane($: Engine) {
  return $.command.run({
    command: 'image-gen-settings',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })
}

export const PANE = {
  plugin: 'image-gen',
  component: 'Pane',
  requestId: 'image-gen-settings',
  props: {
    title: 'Image Generation',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

export const SURFACES = ['terminal', 'desktop'] as const
