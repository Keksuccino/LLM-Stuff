import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import type { Preview } from '../types'

const ACTIVE = 'bbbbbbbb-3333-4333-8333-bbbbbbbbbbbb'
const OTHER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'

const PANE = {
  plugin: 'account-sync',
  component: 'Pane',
  requestId: 'account-sync',
  props: {
    title: 'Account Sync',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const NO_CHANGES = {
  sessionsAdded: 0,
  sessionsUpdated: 0,
  sessionsRemoved: 0,
  sessionsRestored: 0,
  environmentsAdded: 0,
  environmentsUpdated: 0,
  environmentsRemoved: 0,
  defaultsUpdated: false,
  total: 0,
}

function preview(overrides: Partial<Preview> = {}): Preview {
  return {
    accounts: [
      { id: ACTIVE, email: null, isActive: true, sessions: 1, archived: 0, environments: 0 },
      { id: OTHER, email: 'main@example.com', isActive: false, sessions: 434, archived: 111, environments: 9 },
    ],
    changes: {
      [ACTIVE]: { ...NO_CHANGES, sessionsAdded: 434, environmentsAdded: 9, total: 443 },
      [OTHER]: { ...NO_CHANGES, sessionsAdded: 1, total: 1 },
    },
    total: 444,
    removals: 2,
    isFirstSync: true,
    lastRun: null,
    isWorking: false,
    ...overrides,
  }
}

/** Stands for the Python engine: answers each command with the JSON it would print, and records every call. */
function fakeEngine(on: On, answers: Record<string, unknown>, exitCode = 0): string[][] {
  const calls: string[][] = []
  on('process.run', (_, e) => {
    const args = e.argv.slice(3)
    calls.push(args)
    const command = args[0] ?? ''
    const answer = command in answers ? answers[command] : { ok: true }
    return {
      value: {
        exitCode,
        stdout: `${JSON.stringify(answer)}\n`,
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('command.register', () => ({ value: { command: 'sync-accounts' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  return calls
}

const SURFACES = ['terminal', 'desktop'] as const

/** Runs /sync-accounts as the person typing it would. */
function openPane($: Engine) {
  return $.command.run({
    command: 'sync-accounts',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })
}

test('the command opens a preview of both accounts, on every surface', async ($, on) => {
  const calls = fakeEngine(on, { plan: { ok: true, ...preview() }, status: { ok: true, lastRun: null } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await openPane($)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: `account-${ACTIVE}` })).toBeDefined()
    expect(await ui.find({ key: `account-${OTHER}` })).toBeDefined()
    expect(await ui.find({ key: 'sync' })).toBeDefined()
    expect(await ui.find({ key: 'undo' })).toBeUndefined()
    await ui.unmount()
  }
  expect(calls.some(args => args[0] === 'plan')).toBe(true)
})

test('Sync & Restart starts the worker with room for a few more deletions', async ($, on) => {
  const calls = fakeEngine(on, { plan: { ok: true, ...preview() }, launch: { ok: true, started: true, pid: 1 } })
  await openPane($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'sync' })
  expect(calls).toContainEqual(['launch', '--action', 'sync', '--max-removals', '7'])
  // While Claude closes the pane offers nothing to press
  expect(await ui.find({ key: 'sync' })).toBeUndefined()
  expect(await ui.find({ key: 'refresh' })).toBeUndefined()
  await ui.unmount()
})

test('nothing to sync leaves the worker unstarted', async ($, on) => {
  const quiet = preview({ total: 0, removals: 0, changes: { [ACTIVE]: NO_CHANGES, [OTHER]: NO_CHANGES } })
  const calls = fakeEngine(on, { plan: { ok: true, ...quiet } })
  await openPane($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'sync' })
  expect(calls.some(args => args[0] === 'launch')).toBe(false)
  await ui.unmount()
})

test('undo asks first, and Cancel goes back', async ($, on) => {
  const lastRun = { kind: 'sync', ok: true, finishedAt: Date.now() - 60_000, total: 444, undoable: true } as const
  const calls = fakeEngine(on, { plan: { ok: true, ...preview({ lastRun }) }, launch: { ok: true, started: true } })
  await openPane($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'undo' })
  expect(await ui.find({ key: 'undo-confirm' })).toBeDefined()
  expect(await ui.find({ key: 'sync' })).toBeUndefined()
  await ui.press({ key: 'undo-cancel' })
  expect(await ui.find({ key: 'sync' })).toBeDefined()

  await ui.press({ key: 'undo' })
  await ui.press({ key: 'undo-confirm' })
  expect(calls).toContainEqual(['launch', '--action', 'undo'])
  await ui.unmount()
})

test('an engine that fails offers to try again', async ($, on) => {
  const calls = fakeEngine(on, { plan: { ok: false, error: 'unreadable' } }, 1)
  await openPane($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'retry' })).toBeDefined()
  await ui.press({ key: 'retry' })
  expect(calls.filter(args => args[0] === 'plan').length).toBe(2)
  await ui.unmount()
})

test('a single account explains what to do instead of offering a sync', async ($, on) => {
  const single = preview({ accounts: [preview().accounts[0]!], total: 0 })
  fakeEngine(on, { plan: { ok: true, ...single } })
  await openPane($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'sync' })).toBeUndefined()
  expect(await ui.find({ key: 'refresh' })).toBeDefined()
  await ui.unmount()
})
