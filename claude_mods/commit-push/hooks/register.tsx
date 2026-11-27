import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { writeCommitMessage } from './commit-message'
import type { CompleteText } from './commit-message'
import { commitAll, preparePush, push, readPendingChanges, readRepoStatus } from './git'
import type { RunCommand } from './git'

const status = atom({ plugin: 'commit-push', key: 'status' } as const, null)
const phase = atom({ plugin: 'commit-push', key: 'phase' } as const, 'idle')
const draft = atom({ plugin: 'commit-push', key: 'draft' } as const, null)
const error = atom({ plugin: 'commit-push', key: 'error' } as const, null)
const spinnerFrame = atom({ plugin: 'commit-push', key: 'spinnerFrame' } as const, 0)

/** How often the folder's git state is read, so edits made outside Claude update the button too. */
const POLL_MS = 4000

const SPINNER_MS = 120
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** What Ask for Push sends, as the person's own message. */
const PUSH_REQUEST = 'Please commit and push your changes.'

// Set synchronously on a press, before the first await: a second quick press would otherwise pass the same checks while
// the first one waits for its state reads, and start a second flow
let isBusy = false
// Set synchronously on an Ask for Push press, before the new turn redraws the band dimmed: a quick second press must not send twice
let isAsking = false
let isPolling = false
let spinner: Timer | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // A reload ends the previous module's work, but $.state keeps the phase it left behind. Resume from a phase this module can continue
    const left = await read($, phase)
    if (left === 'generating') {
      await update($, phase, () => 'idle')
    } else if (left === 'committing') {
      await update($, phase, () => 'editing')
    }
    void refreshStatus($)
    $.clock.every(POLL_MS, () => void refreshStatus($))

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)
    void refreshStatus($)

    return completed
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const repo = await read($, status)
    if (e.props.hasSurvey || repo === null || !repo.isRepo || (e.surface !== 'terminal' && e.surface !== 'desktop')) {
      return next(e)
    }
    const { Box, Button, Input, Text } = $.ui.resolve({ ...e, surface: e.surface })
    const isWorking = e.props.isWorking
    const current = await read($, phase)
    const errorText = await read($, error)
    const editing = await read($, draft)
    const spin = current === 'generating' || current === 'committing' ? `${SPINNER[(await read($, spinnerFrame)) % SPINNER.length]} ` : ''
    const errorRow = errorText !== null && (
      <Box gap={1}>
        <Text color="error">{errorText}</Text>
        <Button key="dismiss-error" label="Dismiss" plain dimColor onPress={() => void update($, error, () => null)} />
      </Box>
    )

    if ((current === 'editing' || current === 'committing') && editing !== null) {
      const canConfirm = current === 'editing' && !isWorking && editing.message.trim() !== ''

      return (
        <Box flexDirection="column">
          {!editing.isGenerated && <Text color="warning">Haiku couldn't generate a commit message. Please write one.</Text>}
          <Input
            key="message"
            label="Commit message:"
            placeholder="Describe your changes"
            value={editing.message}
            autoFocus
            onInput={value => void update($, draft, before => (before === null ? before : { ...before, message: value }))}
            onSubmit={(_, input) => void $.ui.focus({ requestId: input.requestId, key: 'confirm' })}
          />
          <Box gap={1}>
            <Button key="confirm" label={spin + (editing.willPush ? 'Commit & Push Now' : 'Commit Now')} variant="primary" dimColor={!canConfirm} onPress={() => void confirmCommit($, isWorking)} />
            <Button key="cancel" label="Cancel" dimColor={current !== 'editing'} onPress={() => void cancelEditor($)} />
          </Box>
          {errorRow}
        </Box>
      )
    }

    // Both always drawn in a repository; dimmed and ignoring presses while a turn runs or the message is being written.
    // Commit & Push also dims while there is nothing to commit; Ask for Push doesn't, as the model can still push commits made earlier
    const canStart = current === 'idle' && !isWorking && repo.hasChanges
    const canAsk = current === 'idle' && !isWorking

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Button key="commit" label={spin + (repo.hasRemote ? 'Commit & Push' : 'Commit')} dimColor={!canStart} onPress={() => void startCommit($, isWorking)} />
          <Button key="ask-push" label="Ask for Push" dimColor={!canAsk} onPress={() => void askForPush($, isWorking)} />
          {current === 'generating' && <Text dimColor>Writing commit message…</Text>}
        </Box>
        {errorRow}
      </Box>
    )
  })
}

/** The button: writes the commit message with Haiku, then opens the editor. */
async function startCommit($: EngineInterface, isWorking: boolean): Promise<void> {
  if (isBusy || isWorking) {
    return
  }
  isBusy = true
  try {
    const repo = await read($, status)
    if (!repo?.isRepo || !repo.hasChanges || (await read($, phase)) !== 'idle') {
      return
    }
    await update($, error, () => null)
    await update($, phase, () => 'generating')
    startSpinner($)
    if (repo.hasRemote) {
      // Checked before Haiku runs, so a missing gh login shows up at once
      const prepared = await preparePush(commandRunner($))
      if (!prepared.isOk) {
        await update($, error, () => prepared.error)
        await update($, phase, () => 'idle')

        return
      }
    }
    const message = await generateMessage($)
    await update($, draft, () => ({ message: message ?? '', isGenerated: message !== undefined, willPush: repo.hasRemote }))
    await update($, phase, () => 'editing')
  } finally {
    stopSpinner()
    isBusy = false
  }
}

/** The Ask for Push button: leaves committing and pushing to the model, asked in the person's own words. */
async function askForPush($: EngineInterface, isWorking: boolean): Promise<void> {
  if (isAsking || isWorking) {
    return
  }
  isAsking = true
  try {
    // The commit flow may have started since the band was drawn: the model must not commit alongside it
    if ((await read($, phase)) === 'idle') {
      await $.prompt.submit({ text: PUSH_REQUEST, asUser: true })
    }
  } finally {
    isAsking = false
  }
}

async function generateMessage($: EngineInterface): Promise<string | undefined> {
  try {
    const written = await writeCommitMessage(textCompleter($), await readPendingChanges(commandRunner($)))
    if (written.isOk) {
      return written.value
    }
    $.ui.log(`commit-push: no commit message: ${written.error}`, { to: 'debug' })
  } catch (failure) {
    $.ui.log(`commit-push: the changes could not be read for the commit message: ${String(failure)}`, { to: 'debug' })
  }

  return undefined
}

/** The editor's confirm button: commits everything, then pushes when the draft says so. */
async function confirmCommit($: EngineInterface, isWorking: boolean): Promise<void> {
  if (isBusy || isWorking) {
    return
  }
  isBusy = true
  try {
    const current = await read($, draft)
    const message = current?.message.trim() ?? ''
    if (current === null || message === '' || (await read($, phase)) !== 'editing') {
      return
    }
    // Only a press that got this far changed git, so only it needs the spinner stopped and the status read again
    try {
      await update($, error, () => null)
      await update($, phase, () => 'committing')
      startSpinner($)
      const run = commandRunner($)
      const plan = current.willPush ? await preparePush(run) : undefined
      if (plan !== undefined && !plan.isOk) {
        await showEditorError($, plan.error)

        return
      }
      const committed = await commitAll(run, message)
      if (!committed.isOk) {
        await showEditorError($, committed.error)

        return
      }
      if (plan !== undefined) {
        const pushed = await push(run, plan.value)
        if (!pushed.isOk) {
          // The commit stands; only the editor closes, with the push error left on the band
          await closeEditor($, `Committed ${committed.value}, but the push failed: ${pushed.error}`)

          return
        }
      }
      await closeEditor($, null)
      $.ui.toast(`${plan === undefined ? 'Committed' : 'Committed and pushed'} ${committed.value}: ${message}`, { timeoutMs: 6000 })
    } finally {
      stopSpinner()
      void refreshStatus($)
    }
  } finally {
    isBusy = false
  }
}

async function cancelEditor($: EngineInterface): Promise<void> {
  // A commit or push already under way can't be cancelled
  if (!isBusy && (await read($, phase)) === 'editing') {
    await closeEditor($, null)
  }
}

/** Keeps the editor open with its message, so the person can fix the cause and try again. */
async function showEditorError($: EngineInterface, text: string): Promise<void> {
  await update($, error, () => text)
  await update($, phase, () => 'editing')
}

async function closeEditor($: EngineInterface, errorText: string | null): Promise<void> {
  await update($, draft, () => null)
  await update($, error, () => errorText)
  await update($, phase, () => 'idle')
}

async function refreshStatus($: EngineInterface): Promise<void> {
  if (isPolling) {
    return
  }
  isPolling = true
  try {
    const next = await readRepoStatus(commandRunner($))
    // Written only on a change: every write redraws the band
    if (JSON.stringify(next) !== JSON.stringify(await read($, status))) {
      await update($, status, () => next)
    }
  } finally {
    isPolling = false
  }
}

function startSpinner($: EngineInterface): void {
  spinner?.cancel()
  spinner = $.clock.every(SPINNER_MS, () => void update($, spinnerFrame, frame => (frame + 1) % SPINNER.length))
}

function stopSpinner(): void {
  spinner?.cancel()
  spinner = undefined
}

function commandRunner($: EngineInterface): RunCommand {
  return (argv, init) => $.process.run(argv, init)
}

function textCompleter($: EngineInterface): CompleteText {
  return request => $.model.complete(request)
}
