/** What the band knows about the session's folder, refreshed by polling git. */
export type RepoStatus = { isRepo: false } | { isRepo: true; hasRemote: boolean; hasChanges: boolean }

/** Where the commit flow stands; the band draws the button, its spinner or the message editor from it. */
export type Phase = 'idle' | 'generating' | 'editing' | 'committing'

/** The message editor's content while the phase is `editing` or `committing`. */
export type Draft = {
  message: string
  /** False when Haiku could not write a message: the editor starts empty and says so. */
  isGenerated: boolean
  /** Whether confirming also pushes: a remote existed when the button was pressed. */
  willPush: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'commit-push': {
      status: RepoStatus | null
      phase: Phase
      draft: Draft | null
      error: string | null
      spinnerFrame: number
    }
  }
}
