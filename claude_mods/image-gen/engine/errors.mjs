/**
 * An error the engine reports to the mod as `{ ok: false, kind, error }`. `kind` lets the mod react (an `auth` error
 * opens the settings), `message` is what Claude reads.
 *
 * Kinds: `input` (a bad path or file, nothing was sent), `auth` (the key was rejected), `credits`, `limit` (the key's
 * spending cap), `rate` (rate limited), `failed` (the model failed, not billed), `refused` (the request was flagged),
 * `network`, `timeout`, `api` (anything else the service answered).
 */
export class EngineError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind
  }
}
