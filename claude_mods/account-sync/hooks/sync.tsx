import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, ResolveInput } from 'claude-code'

import type { AccountChanges, AccountInfo, LastRun, Phase, Preview, PreviewState } from '../types'
import { LAUNCH_TIMEOUT_MS, ago, messageOf, plural, runEngine } from './shared'

const PANE = 'account-sync'
const COMMAND = 'sync-accounts'
const TITLE = 'Account Sync'

/**
 * Deletions a sync may find beyond the preview's, for sessions deleted between looking and pressing. A run that finds
 * more is refused by the engine: the folders then read differently than they did for the preview.
 */
const REMOVAL_MARGIN = 5

/** How long a finished run is still worth a toast when a session starts after Claude reopened. */
const ANNOUNCE_WINDOW_MS = 15 * 60_000
const ANNOUNCED_KEY = 'announcedRunAt'

const PLAN_TIMEOUT_MS = 60_000

// Change a tag when the value's fields change: it declines what an earlier version stored, which outlives a reload.
const previewState = atom({ plugin: 'account-sync', key: 'preview' } as const, { isChecking: false }, {
  shape: 'preview-1',
})
const phaseState = atom({ plugin: 'account-sync', key: 'phase' } as const, 'idle', { shape: 'phase-1' })

type PaneRender = ResolveInput<'Pane'>

// One preview at a time: a second press of Refresh while one runs waits for that one
let checking: Promise<void> | undefined
// Set synchronously on a press, before the redraw dims the buttons: a quick second press must not start two workers
let isLaunching = false

/** Registers the command; called from the module's one session.start hook. */
export async function startSync($: EngineInterface): Promise<void> {
  await $.command.register({
    name: COMMAND,
    description: 'Sync Code sessions and environments between your Claude accounts',
  })
  void announceLastRun($)
}

export function registerSync(on: On): void {
  on('command.run', { command: COMMAND }, async $ => {
    await update($, phaseState, phase => (phase === 'closing' ? phase : 'idle'))
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    // The pane is already up and says it is checking; the command ends with the preview, a fraction of a second later
    await refresh($)

    return {}
  }).catch($ => {
    $.ui.toast(`${TITLE} could not open. Try /${COMMAND} again.`)

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const state = await read($, previewState)
    const phase = await read($, phaseState)

    return e.props.placement === 'widget' ? glance($, e, state, phase) : pane($, e, state, phase)
  })
}

function refresh($: EngineInterface): Promise<void> {
  checking ??= checkAccounts($).finally(() => {
    checking = undefined
  })

  return checking
}

async function checkAccounts($: EngineInterface): Promise<void> {
  await update($, previewState, state => ({ ...state, isChecking: true, error: undefined }))
  try {
    const answer = await runEngine($, ['plan'], PLAN_TIMEOUT_MS)
    await update($, previewState, () => ({
      preview: answer as unknown as Preview,
      checkedAt: Date.now(),
      isChecking: false,
    }))
  } catch (error) {
    await update($, previewState, state => ({ ...state, isChecking: false, error: messageOf(error) }))
  }
}

/** Starts the worker that quits Claude, runs the action and opens Claude again. */
async function launch($: EngineInterface, action: 'sync' | 'undo'): Promise<void> {
  const { preview } = await read($, previewState)
  if (isLaunching || preview === undefined) {
    return
  }
  isLaunching = true
  try {
    await update($, phaseState, () => (action === 'sync' ? 'starting-sync' : 'starting-undo'))
    const args = ['launch', '--action', action]
    if (action === 'sync') {
      args.push('--max-removals', String(preview.removals + REMOVAL_MARGIN))
    }
    await runEngine($, args, LAUNCH_TIMEOUT_MS)
    await update($, phaseState, () => 'closing')
  } catch (error) {
    await update($, phaseState, () => 'idle')
    await update($, previewState, state => ({ ...state, error: messageOf(error) }))
  } finally {
    isLaunching = false
  }
}

/** After Claude reopened, says once how the run went, in whichever session starts first. */
async function announceLastRun($: EngineInterface): Promise<void> {
  try {
    const answer = await runEngine($, ['status'], LAUNCH_TIMEOUT_MS)
    const last = answer.lastRun as LastRun | null
    if (!last) {
      return
    }
    const at = Math.max(last.finishedAt, last.lastError?.finishedAt ?? 0)
    if (Date.now() - at > ANNOUNCE_WINDOW_MS || Number((await $.store.get(ANNOUNCED_KEY)) ?? 0) >= at) {
      return
    }
    await $.store.set(ANNOUNCED_KEY, at)
    $.ui.toast(announcement(last))
  } catch {
    // A missing toast costs nothing: the pane shows the same result.
  }
}

function announcement(last: LastRun): string {
  if (last.lastError && last.lastError.finishedAt > last.finishedAt) {
    return `Account ${last.lastError.kind === 'undo' ? 'undo' : 'sync'} failed: ${last.lastError.error}`
  }
  if (!last.ok) {
    return `Account ${last.kind === 'undo' ? 'undo' : 'sync'} failed: ${last.error ?? 'unknown error'}`
  }
  if (last.kind === 'undo') {
    return 'The last account sync is undone.'
  }

  return last.total
    ? `Accounts synced: ${plural(last.total, 'change')}. Run /${COMMAND} to see or undo it.`
    : 'Accounts checked: everything was already in sync.'
}

function changeParts(c: AccountChanges): string[] {
  const parts: string[] = []
  if (c.sessionsAdded) parts.push(`${plural(c.sessionsAdded, 'new session')}`)
  if (c.sessionsRestored) parts.push(`${plural(c.sessionsRestored, 'restored session')}`)
  if (c.sessionsUpdated) parts.push(`${plural(c.sessionsUpdated, 'updated session')}`)
  if (c.sessionsRemoved) parts.push(`${plural(c.sessionsRemoved, 'session')} deleted`)
  if (c.environmentsAdded) parts.push(`${plural(c.environmentsAdded, 'new environment')}`)
  if (c.environmentsUpdated) parts.push(`${plural(c.environmentsUpdated, 'updated environment')}`)
  if (c.environmentsRemoved) parts.push(`${plural(c.environmentsRemoved, 'environment')} deleted`)
  if (c.defaultsUpdated) parts.push('new Local defaults')

  return parts
}

function accountCard($: EngineInterface, e: PaneRender, account: AccountInfo, changes: AccountChanges | undefined) {
  const { Box, Text } = $.ui.resolve(e)
  const counts = [
    plural(account.sessions, 'session'),
    ...(account.archived ? [`${account.archived} archived`] : []),
    plural(account.environments, 'environment'),
  ].join(' · ')
  const parts = changes ? changeParts(changes) : []
  const isLosing = Boolean(changes?.sessionsRemoved || changes?.environmentsRemoved)

  return (
    <Box key={`account-${account.id}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
      <Box gap={1} flexWrap="wrap">
        <Text weight="semibold">{account.isActive ? 'Signed-In Account' : 'Other Account'}</Text>
        {account.email && <Text dimColor>{account.email}</Text>}
      </Box>
      <Text dimColor size="footnote">
        {counts}
      </Text>
      {parts.length === 0 ? (
        <Text color="success">Up to date</Text>
      ) : (
        <Text color={isLosing ? 'warning' : undefined}>Gets {parts.join(', ')}</Text>
      )}
    </Box>
  )
}

function lastRunLine($: EngineInterface, e: PaneRender, last: LastRun | null, phase: Phase): RenderElement[] {
  const { Box, Button, Text } = $.ui.resolve(e)
  if (!last) {
    return []
  }
  const rows: RenderElement[] = []
  const failedLater = last.lastError && last.lastError.finishedAt > last.finishedAt ? last.lastError : undefined
  let summary: RenderElement
  if (!last.ok) {
    summary = (
      <Text color="error">
        Last {last.kind === 'undo' ? 'undo' : 'sync'} failed {ago(last.finishedAt)}: {last.error}
      </Text>
    )
  } else if (last.kind === 'undo') {
    summary = <Text dimColor>Last sync undone {ago(last.finishedAt)}</Text>
  } else {
    summary = (
      <Text dimColor>
        Last synced {ago(last.finishedAt)}
        {last.total ? ` · ${plural(last.total, 'change')}` : ''}
      </Text>
    )
  }
  rows.push(
    <Box key="last-run" gap={1} alignItems="center" flexWrap="wrap">
      {summary}
      {last.undoable && phase === 'idle' && (
        <Button key="undo" dimColor label="Undo Last Sync" onPress={() => update($, phaseState, () => 'confirm-undo')} />
      )}
    </Box>,
  )
  if (failedLater) {
    rows.push(
      <Text key="last-error" color="error">
        Last {failedLater.kind === 'undo' ? 'undo' : 'sync'} try {ago(failedLater.finishedAt)} failed: {failedLater.error}
      </Text>,
    )
  }

  return rows
}

function pane($: EngineInterface, e: PaneRender, state: PreviewState, phase: Phase) {
  const { Box, Button, Progress, Text } = $.ui.resolve(e)
  const header = (
    <Box flexDirection="column">
      <Text size="heading" weight="semibold">
        {TITLE}
      </Text>
      <Text dimColor size="footnote">
        Keeps your Code sessions and environments the same in every Claude account on this Mac.
      </Text>
    </Box>
  )

  if (phase === 'starting-sync' || phase === 'starting-undo' || phase === 'closing') {
    const isUndo = phase === 'starting-undo'
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Progress label={phase === 'closing' ? 'Closing Claude' : isUndo ? 'Starting the undo' : 'Starting the sync'} />
        <Text dimColor>Claude closes in a moment and opens again by itself once everything is done.</Text>
      </Box>
    )
  }

  const preview = state.preview
  if (!preview) {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {state.error ? (
          <Box flexDirection="column" gap={1}>
            <Text color="error">Couldn't read your accounts: {state.error}</Text>
            <Box>
              <Button key="retry" variant="primary" label="Try Again" onPress={() => refresh($)} />
            </Box>
          </Box>
        ) : (
          <Progress label="Checking your accounts" />
        )}
      </Box>
    )
  }

  if (preview.accounts.length < 2) {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Text>
          Only one account has Code sessions on this Mac so far. Sign in to your other account, open the Code tab once,
          then come back here.
        </Text>
        <Box>
          <Button key="refresh" dimColor={state.isChecking} label="Check Again" onPress={() => refresh($)} />
        </Box>
      </Box>
    )
  }

  if (preview.isWorking) {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        <Progress label="A sync is running right now" />
        <Box>
          <Button key="refresh" dimColor={state.isChecking} label="Check Again" onPress={() => refresh($)} />
        </Box>
      </Box>
    )
  }

  const canSync = preview.total > 0 && !state.isChecking
  return (
    <Box flexDirection="column" gap={1}>
      {header}
      <Box flexDirection="column" gap={1}>
        {preview.accounts.map(account => accountCard($, e, account, preview.changes[account.id]))}
      </Box>
      {state.error && <Text color="error">{state.error}</Text>}
      {phase === 'confirm-undo' ? (
        <Box key="confirm-undo" flexDirection="column" gap={1} borderStyle="round" borderColor="warning" paddingX={1}>
          <Text>
            Undo puts back everything the last sync changed, then restarts Claude. Changes you made since then to the
            same sessions or environments are lost.
          </Text>
          <Box gap={1}>
            <Button key="undo-confirm" variant="primary" label="Undo & Restart" onPress={() => launch($, 'undo')} />
            <Button key="undo-cancel" label="Cancel" onPress={() => update($, phaseState, () => 'idle')} />
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          {preview.total === 0 && <Text color="success">Everything is already in sync.</Text>}
          <Box gap={1} alignItems="center">
            <Button
              key="sync"
              variant="primary"
              autoFocus
              label="Sync & Restart"
              dimColor={!canSync}
              onPress={() => (canSync ? launch($, 'sync') : undefined)}
            />
            <Button key="refresh" dimColor label={state.isChecking ? 'Checking' : 'Refresh'} onPress={() => refresh($)} />
          </Box>
          {preview.total > 0 && (
            <Text dimColor size="footnote">
              Claude quits, syncs and opens again. Sessions that are running now get stopped.
            </Text>
          )}
        </Box>
      )}
      {lastRunLine($, e, preview.lastRun, phase)}
    </Box>
  )
}

/** The minimized pane: one line that reads at a glance, since clicks may not reach it. */
function glance($: EngineInterface, e: PaneRender, state: PreviewState, phase: Phase) {
  const { Text } = $.ui.resolve(e)
  if (phase !== 'idle' && phase !== 'confirm-undo') {
    return <Text dimColor>Syncing accounts</Text>
  }
  const total = state.preview?.total

  return (
    <Text dimColor>{total === undefined ? TITLE : total === 0 ? 'Accounts in sync' : `${plural(total, 'change')} to sync`}</Text>
  )
}
