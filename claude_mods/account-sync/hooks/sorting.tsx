import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, ResolveInput } from 'claude-code'

import type { LastRestore, SortingOverview, SortingPhase, SortingSnapshot, SortingState, SortingSummary } from '../types'
import { LAUNCH_TIMEOUT_MS, ago, messageOf, plural, runEngine } from './shared'

const PANE = 'sidebar-sorting'
const RESTORE_COMMAND = 'restore-sorting'
const SNAPSHOT_COMMAND = 'snapshot-sorting'
const TITLE = 'Sidebar Sorting'

/**
 * How often each Code session asks for an automatic snapshot. The engine keeps at most one per nine minutes, however
 * many sessions ask, and none when the layout did not change.
 */
const SNAPSHOT_INTERVAL_MS = 10 * 60_000
const LIST_TIMEOUT_MS = 60_000
const ANNOUNCE_WINDOW_MS = 15 * 60_000
const ANNOUNCED_KEY = 'announcedRestoreAt'

// Change a tag when the value's fields change: it declines what an earlier version stored, which outlives a reload.
const sortingState = atom({ plugin: 'account-sync', key: 'sorting' } as const, { isLoading: false }, {
  shape: 'sorting-1',
})
const sortingPhase = atom({ plugin: 'account-sync', key: 'sortingPhase' } as const, { kind: 'idle' } as SortingPhase, {
  shape: 'sorting-phase-1',
})

type PaneRender = ResolveInput<'Pane'>

const TRIGGER_LABELS: Record<SortingSnapshot['trigger'], string> = {
  auto: 'Auto',
  manual: 'Saved by you',
  'before-restore': 'Before a restore',
}

const IDLE: SortingPhase = { kind: 'idle' }

function setPhase($: EngineInterface, phase: SortingPhase): Promise<SortingPhase> {
  return update($, sortingPhase, () => phase)
}

// One list load at a time: a second request while one runs waits for that one
let loading: Promise<void> | undefined
// Set synchronously on a press, before the redraw dims the buttons: a quick second press must not start two workers
let isLaunching = false

/** Registers the commands and starts the automatic snapshots; called from the module's one session.start hook. */
export async function startSorting($: EngineInterface): Promise<void> {
  await $.command.register({
    name: RESTORE_COMMAND,
    description: 'Put back a saved sidebar layout: group order, grouping and sorting (switching accounts resets it)',
  })
  await $.command.register({
    name: SNAPSHOT_COMMAND,
    description: 'Save the current sidebar layout (group order, grouping and sorting) now',
  })
  void autoSnapshot($)
  $.clock.every(SNAPSHOT_INTERVAL_MS, () => void autoSnapshot($))
  void announceLastRestore($)
}

export function registerSorting(on: On): void {
  on('command.run', { command: RESTORE_COMMAND }, async $ => {
    await update($, sortingPhase, phase => (phase.kind === 'closing' ? phase : IDLE))
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    // The pane is already up and says it is loading; the command ends with the list, a fraction of a second later
    await refresh($)

    return {}
  }).catch($ => {
    $.ui.toast(`${TITLE} could not open. Try /${RESTORE_COMMAND} again.`)

    return {}
  })

  on('command.run', { command: SNAPSHOT_COMMAND }, async $ => {
    $.ui.toast(await saveSnapshot($))

    return {}
  }).catch($ => {
    $.ui.toast(`The sidebar layout could not be saved. Try /${SNAPSHOT_COMMAND} again.`)

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const state = await read($, sortingState)
    const phase = await read($, sortingPhase)

    return e.props.placement === 'widget' ? glance($, e, state, phase) : pane($, e, state, phase)
  })
}

function refresh($: EngineInterface): Promise<void> {
  loading ??= loadOverview($).finally(() => {
    loading = undefined
  })

  return loading
}

async function loadOverview($: EngineInterface): Promise<void> {
  await update($, sortingState, state => ({ ...state, isLoading: true, error: undefined }))
  try {
    const answer = await runEngine($, ['sorting-list'], LIST_TIMEOUT_MS)
    await update($, sortingState, state => ({
      ...state,
      overview: answer as unknown as SortingOverview,
      isLoading: false,
    }))
  } catch (error) {
    await update($, sortingState, state => ({ ...state, isLoading: false, error: messageOf(error) }))
  }
}

async function autoSnapshot($: EngineInterface): Promise<void> {
  try {
    await runEngine($, ['sorting-snapshot', '--auto'], LIST_TIMEOUT_MS)
  } catch {
    // The next period tries again; the pane says it when snapshots cannot be read at all.
  }
}

/** Saves the layout now and says what happened, in words for a toast or the pane. */
async function saveSnapshot($: EngineInterface): Promise<string> {
  const answer = await runEngine($, ['sorting-snapshot'], LIST_TIMEOUT_MS)
  const notice =
    answer.reason === 'no-order'
      ? 'This account has no custom group order to save right now. Drag the groups into place first.'
      : answer.saved
        ? 'Sidebar layout saved.'
        : 'The sidebar layout has not changed since it was saved; that snapshot is now the newest.'
  await update($, sortingState, state => ({ ...state, notice }))
  await refresh($)

  return notice
}

/** Starts the worker that quits Claude, puts the snapshot back and opens Claude again. */
async function launchRestore($: EngineInterface, id: string): Promise<void> {
  if (isLaunching) {
    return
  }
  isLaunching = true
  try {
    await setPhase($, { kind: 'starting' })
    await runEngine($, ['launch', '--action', 'restore-sorting', '--snapshot', id], LAUNCH_TIMEOUT_MS)
    await setPhase($, { kind: 'closing' })
  } catch (error) {
    await setPhase($, IDLE)
    await update($, sortingState, state => ({ ...state, error: messageOf(error) }))
  } finally {
    isLaunching = false
  }
}

/** After Claude reopened, says once how the restore went, in whichever session starts first. */
async function announceLastRestore($: EngineInterface): Promise<void> {
  try {
    const answer = await runEngine($, ['status'], LAUNCH_TIMEOUT_MS)
    const last = answer.lastRestore as LastRestore | null
    if (!last || Date.now() - last.finishedAt > ANNOUNCE_WINDOW_MS) {
      return
    }
    if (Number((await $.store.get(ANNOUNCED_KEY)) ?? 0) >= last.finishedAt) {
      return
    }
    await $.store.set(ANNOUNCED_KEY, last.finishedAt)
    $.ui.toast(
      last.ok
        ? `Sidebar layout restored (${plural(last.groups ?? 0, 'group')}).`
        : `The sidebar layout could not be restored: ${last.error ?? 'unknown error'}`,
    )
  } catch {
    // A missing toast costs nothing: the pane shows the same result.
  }
}

/** The app's names for a setting (camelCase, as `savedEnvironment`) in words. */
function words(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
}

/** How a saved layout groups and sorts the sessions, in one line. */
function describeSummary(summary: SortingSummary | undefined): string {
  const parts = [
    summary?.groupBy ? `Grouped by ${words(summary.groupBy)}` : 'Default grouping',
    summary?.sortBy ? `sorted by ${words(summary.sortBy)}${summary.ascending ? ', ascending' : ''}` : 'default sorting',
  ]
  if (summary?.emptyGroups) {
    parts.push('empty groups shown')
  }

  return parts.join(' · ')
}

function accountLabel(overview: SortingOverview, account: string): string {
  return overview.emails[account] ?? (account === overview.activeAccount ? 'This account' : 'Other account')
}

function snapshotRow($: EngineInterface, e: PaneRender, overview: SortingOverview, snapshot: SortingSnapshot,
                     phase: SortingPhase): RenderElement {
  const { Box, Button, Text } = $.ui.resolve(e)
  const activeDigest = overview.activeAccount ? overview.current[overview.activeAccount] : undefined
  const isCurrent = snapshot.digest === activeDigest
  const isConfirming = phase.kind === 'confirm' && phase.id === snapshot.id

  return (
    <Box key={`snapshot-${snapshot.id}`} flexDirection="column" borderStyle="round" borderDimColor={!isConfirming}
         borderColor={isConfirming ? 'warning' : undefined} paddingX={1}>
      <Box gap={1} alignItems="center" justifyContent="space-between">
        <Box gap={1} flexWrap="wrap" flexShrink={1}>
          <Text weight="semibold">{ago(snapshot.takenAt)}</Text>
          <Text dimColor>
            {accountLabel(overview, snapshot.account)} · {TRIGGER_LABELS[snapshot.trigger] ?? snapshot.trigger}
          </Text>
        </Box>
        {isCurrent ? (
          <Text color="success">In use now</Text>
        ) : (
          !isConfirming &&
          phase.kind === 'idle' && (
            <Button key={`restore-${snapshot.id}`} label="Restore"
                    onPress={() => setPhase($, { kind: 'confirm', id: snapshot.id })} />
          )
        )}
      </Box>
      <Text size="footnote">{describeSummary(snapshot.summary)}</Text>
      <Text dimColor size="footnote" maxLines={2}>
        {snapshot.labels.map((label, index) => `${index + 1}. ${label}`).join('   ')}
      </Text>
      {isConfirming && (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text>
            Claude quits, puts this layout back for {accountLabel(overview, overview.activeAccount ?? '')} (group
            order, grouping, sorting and what the sidebar shows), and opens again. Sessions that are running now get
            stopped. The layout you have now is saved first.
          </Text>
          <Box gap={1}>
            <Button key="restore-confirm" variant="primary" label="Restore & Restart"
                    onPress={() => launchRestore($, snapshot.id)} />
            <Button key="restore-cancel" label="Cancel" onPress={() => setPhase($, IDLE)} />
          </Box>
        </Box>
      )}
    </Box>
  )
}

function pane($: EngineInterface, e: PaneRender, state: SortingState, phase: SortingPhase) {
  const { Box, Button, Progress, Text } = $.ui.resolve(e)
  const header = (
    <Box flexDirection="column">
      <Text size="heading" weight="semibold">
        {TITLE}
      </Text>
      <Text dimColor size="footnote">
        Switching accounts resets the order of your sidebar groups. The whole sidebar layout (group order, grouping,
        sorting) is saved every 10 minutes and the last 20 are kept, so you can put a good one back.
      </Text>
    </Box>
  )

  if (phase.kind === 'starting' || phase.kind === 'closing') {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Progress label={phase.kind === 'closing' ? 'Closing Claude' : 'Starting the restore'} />
        <Text dimColor>Claude closes in a moment and opens again by itself with the layout back in place.</Text>
      </Box>
    )
  }

  const overview = state.overview
  if (!overview) {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {state.error ? (
          <Box flexDirection="column" gap={1}>
            <Text color="error">Couldn't read the saved layouts: {state.error}</Text>
            <Box>
              <Button key="retry" variant="primary" label="Try Again" onPress={() => refresh($)} />
            </Box>
          </Box>
        ) : (
          <Progress label="Loading the saved layouts" />
        )}
      </Box>
    )
  }

  const hasCurrentOrder = overview.activeAccount !== null && overview.current[overview.activeAccount] !== undefined
  return (
    <Box flexDirection="column" gap={1}>
      {header}
      <Box gap={1} alignItems="center" flexWrap="wrap">
        <Button key="save" label="Save Current Layout" dimColor={overview.isWorking}
                onPress={() => (overview.isWorking ? undefined : saveSnapshot($).catch(error =>
                  update($, sortingState, current => ({ ...current, error: messageOf(error) }))))} />
        {state.notice && (
          <Text dimColor size="footnote">
            {state.notice}
          </Text>
        )}
      </Box>
      {!hasCurrentOrder && (
        <Text color="warning" size="footnote">
          This account uses the default group order right now, as after an account switch.
        </Text>
      )}
      {state.error && <Text color="error">{state.error}</Text>}
      {overview.isWorking && <Text color="warning">A sync or restore is running right now.</Text>}
      {overview.snapshots.length === 0 ? (
        <Text dimColor>
          No saved layouts yet. One is saved every 10 minutes while Claude is open, or press Save Current Layout.
        </Text>
      ) : (
        <Box flexDirection="column" gap={1}>
          {overview.snapshots.map(snapshot => snapshotRow($, e, overview, snapshot, phase))}
        </Box>
      )}
      {overview.lastRestore && !overview.lastRestore.ok && (
        <Text color="error">
          Last restore failed {ago(overview.lastRestore.finishedAt)}: {overview.lastRestore.error}
        </Text>
      )}
    </Box>
  )
}

/** The minimized pane: one line that reads at a glance, since clicks may not reach it. */
function glance($: EngineInterface, e: PaneRender, state: SortingState, phase: SortingPhase) {
  const { Text } = $.ui.resolve(e)
  if (phase.kind === 'starting' || phase.kind === 'closing') {
    return <Text dimColor>Restoring the sidebar layout</Text>
  }
  const count = state.overview?.snapshots.length

  return <Text dimColor>{count === undefined ? TITLE : `${plural(count, 'saved layout')}`}</Text>
}
