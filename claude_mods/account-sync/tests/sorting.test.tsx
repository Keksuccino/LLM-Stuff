import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import type { SortingOverview, SortingSnapshot } from '../types'

const ACTIVE = 'bbbbbbbb-3333-4333-8333-bbbbbbbbbbbb'
const OTHER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'

const PANE = {
  plugin: 'account-sync',
  component: 'Pane',
  requestId: 'sidebar-sorting',
  props: {
    title: 'Sidebar Sorting',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

function snapshot(id: string, account: string, digest: string): SortingSnapshot {
  return {
    id,
    takenAt: Date.now() - 5 * 60_000,
    account,
    trigger: 'auto',
    groups: ['preset::p1', 'keksuccino/kaleeta'],
    labels: ['Alice', 'kaleeta'],
    summary: { groupBy: 'savedEnvironment', sortBy: 'recency', ascending: false, emptyGroups: true },
    digest,
  }
}

function overview(overrides: Partial<SortingOverview> = {}): SortingOverview {
  return {
    snapshots: [snapshot('new', ACTIVE, 'd-new'), snapshot('old', OTHER, 'd-old')],
    activeAccount: ACTIVE,
    emails: { [OTHER]: 'main@example.com' },
    current: { [ACTIVE]: 'd-new' },
    lastRestore: null,
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
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  return calls
}

/** Runs a slash command as the person typing it would. */
function run($: Engine, command: string) {
  return $.command.run({
    command,
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })
}

test('the pane lists the saved orders and offers to restore all but the one in use, on every surface', async ($, on) => {
  fakeEngine(on, { 'sorting-list': { ok: true, ...overview() } })
  await run($, 'restore-sorting')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'snapshot-new' })).toBeDefined()
    expect(await ui.find({ key: 'snapshot-old' })).toBeDefined()
    expect(await ui.find({ key: 'restore-new' })).toBeUndefined()
    expect(await ui.find({ key: 'restore-old' })).toBeDefined()
    expect(await ui.find({ key: 'save' })).toBeDefined()
    await ui.unmount()
  }
})

test('a restore asks first, then starts the worker for that snapshot', async ($, on) => {
  const calls = fakeEngine(on, { 'sorting-list': { ok: true, ...overview() }, launch: { ok: true, started: true } })
  await run($, 'restore-sorting')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'restore-old' })
  expect(await ui.find({ key: 'restore-confirm' })).toBeDefined()
  await ui.press({ key: 'restore-cancel' })
  expect(await ui.find({ key: 'restore-confirm' })).toBeUndefined()
  expect(calls.some(args => args[0] === 'launch')).toBe(false)

  await ui.press({ key: 'restore-old' })
  await ui.press({ key: 'restore-confirm' })
  expect(calls).toContainEqual(['launch', '--action', 'restore-sorting', '--snapshot', 'old'])
  // While Claude closes the pane offers nothing to press
  expect(await ui.find({ key: 'save' })).toBeUndefined()
  await ui.unmount()
})

test('saving the order now asks the engine for a manual snapshot and lists it', async ($, on) => {
  const calls = fakeEngine(on, {
    'sorting-list': { ok: true, ...overview() },
    'sorting-snapshot': { ok: true, saved: 1, reason: null },
  })
  await run($, 'snapshot-sorting')
  expect(calls).toContainEqual(['sorting-snapshot'])
  expect(calls.filter(args => args[0] === 'sorting-list').length).toBe(1)

  await run($, 'restore-sorting')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'save' })
  expect(calls.filter(args => args[0] === 'sorting-snapshot' && args.length === 1).length).toBe(2)
  await ui.unmount()
})

test('a session start takes an automatic snapshot', async ($, on) => {
  const calls = fakeEngine(on, { status: { ok: true, lastRun: null, lastRestore: null } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(calls).toContainEqual(['sorting-snapshot', '--auto'])
})

test('no saved order yet offers only to save one', async ($, on) => {
  fakeEngine(on, { 'sorting-list': { ok: true, ...overview({ snapshots: [], current: {} }) } })
  await run($, 'restore-sorting')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'save' })).toBeDefined()
  expect(await ui.find({ key: 'restore-confirm' })).toBeUndefined()
  await ui.unmount()
})

test('an engine that fails offers to try again', async ($, on) => {
  const calls = fakeEngine(on, { 'sorting-list': { ok: false, error: 'unreadable' } }, 1)
  await run($, 'restore-sorting')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'retry' })
  expect(calls.filter(args => args[0] === 'sorting-list').length).toBe(2)
  await ui.unmount()
})
