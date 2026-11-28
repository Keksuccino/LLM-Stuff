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

/** How a saved layout groups and sorts the sessions section, as the app names it (absent: the app's default). */
export type SortingSummary = {
  groupBy?: string | null
  sortBy?: string | null
  ascending?: boolean | null
  emptyGroups?: boolean | null
}

/**
 * One saved sidebar layout: the groups top to bottom (by id and by the name the sidebar shows) and how the sidebar
 * groups and sorts. The full layout the engine restores travels as `layout`, which the pane never reads.
 */
export type SortingSnapshot = {
  id: string
  takenAt: number
  account: string
  trigger: 'auto' | 'manual' | 'before-restore'
  groups: string[]
  labels: string[]
  summary: SortingSummary
  digest: string
}

/** The engine's record of its last sidebar layout restore. */
export type LastRestore = {
  kind: 'restore-sorting'
  ok: boolean
  finishedAt: number
  error?: string
  groups?: number
}

/** The engine's `sorting-list` output. `current` maps each account to the digest of the layout it has right now. */
export type SortingOverview = {
  snapshots: SortingSnapshot[]
  activeAccount: string | null
  emails: Record<string, string>
  current: Record<string, string>
  lastRestore: LastRestore | null
  isWorking: boolean
}

/** The sorting pane's data. */
export type SortingState = {
  overview?: SortingOverview
  isLoading: boolean
  error?: string
  notice?: string
}

/** Where the sorting pane's flow stands: idle, confirming the restore of one snapshot, or restarting Claude. */
export type SortingPhase = { kind: 'idle' } | { kind: 'confirm'; id: string } | { kind: 'starting' } | { kind: 'closing' }

declare module 'claude-code' {
  interface PluginState {
    'account-sync': {
      preview: Shaped<PreviewState>
      phase: Shaped<Phase>
      sorting: Shaped<SortingState>
      sortingPhase: Shaped<SortingPhase>
    }
  }
}
