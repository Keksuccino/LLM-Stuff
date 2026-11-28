import type { Register } from 'claude-code'

import { registerSorting, startSorting } from './sorting'
import { registerSync, startSync } from './sync'

/**
 * Two features share this mod: /sync-accounts (sync.tsx) and the sidebar order snapshots behind /restore-sorting
 * (sorting.tsx). Both run the same Python engine.
 */
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await startSync($)
    await startSorting($)

    return started
  })

  registerSync(on)
  registerSorting(on)
}
