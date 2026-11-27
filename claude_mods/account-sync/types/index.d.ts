/** One account as the engine's preview describes it. `email` is known only for an account the terminal CLI used. */
export type AccountInfo = {
  id: string
  email: string | null
  isActive: boolean
  sessions: number
  archived: number
  environments: number
}

/** What a sync changes in one account. */
export type AccountChanges = {
  sessionsAdded: number
  sessionsUpdated: number
  sessionsRemoved: number
  sessionsRestored: number
  environmentsAdded: number
  environmentsUpdated: number
  environmentsRemoved: number
  defaultsUpdated: boolean
  total: number
}

/** The engine's record of its last sync or undo. */
export type LastRun = {
  kind: 'sync' | 'undo'
  ok: boolean
  finishedAt: number
  error?: string
  total?: number
  undoable?: boolean
  /** A later try that failed without changing anything, noted on the sync it left undoable. */
  lastError?: { kind: 'sync' | 'undo'; error: string; finishedAt: number }
}

/** The engine's `plan` output. */
export type Preview = {
  accounts: AccountInfo[]
  changes: Record<string, AccountChanges>
  total: number
  removals: number
  isFirstSync: boolean
  lastRun: LastRun | null
  isWorking: boolean
}

/** The pane's data: the last preview, whether a new one is being made, and the last error to show. */
export type PreviewState = {
  preview?: Preview
  checkedAt?: number
  isChecking: boolean
  error?: string
}

/** Where the pane's flow stands: idle, asking to confirm an undo, starting the worker, or waiting for Claude to quit. */
export type Phase = 'idle' | 'confirm-undo' | 'starting-sync' | 'starting-undo' | 'closing'

declare module 'claude-code' {
  interface PluginState {
    'account-sync': {
      preview: Shaped<PreviewState>
      phase: Shaped<Phase>
    }
  }
}
