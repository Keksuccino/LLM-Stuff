import type { EngineInterface } from 'claude-code'

import type { KeyStatus } from '../types'
import { API_BASE } from './catalog'

/** The API key lives in the login Keychain, never in the plugin's store. */
const KEYCHAIN_SERVICE = 'Claude Image Gen (OpenRouter)'
const KEYCHAIN_ACCOUNT = 'api-key'
const SECURITY = '/usr/bin/security'
/** `security` exits with this when no such item exists. */
const NOT_FOUND = 44

/** What an OpenRouter key looks like, loosely: nothing that would need quoting below. */
const KEY_PATTERN = /^[A-Za-z0-9._-]{20,200}$/

export async function readKey($: EngineInterface): Promise<string | undefined> {
  const ran = await $.process.run([SECURITY, 'find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w'])
  if (ran.exitCode === NOT_FOUND) {
    return undefined
  }
  if (ran.exitCode !== 0) {
    throw new Error(`The Keychain could not be read: ${ran.stderr.trim() || `exit ${ran.exitCode}`}`)
  }
  const key = ran.stdout.trim()

  return key === '' ? undefined : key
}

export function isKeyShaped(key: string): boolean {
  return KEY_PATTERN.test(key)
}

export async function saveKey($: EngineInterface, key: string): Promise<void> {
  if (!isKeyShaped(key)) {
    throw new Error("That doesn't look like an API key.")
  }
  // `security -i` reads the command from standard input, which keeps the key out of the process list. The key pattern
  // rules out quotes and spaces, so it needs no escaping inside the quotes.
  const command = `add-generic-password -U -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w "${key}"\n`
  const ran = await $.process.run([SECURITY, '-i'], { stdin: command })
  if (ran.exitCode !== 0 || /error|fail/i.test(ran.stderr)) {
    throw new Error(`The Keychain refused the key: ${ran.stderr.trim() || `exit ${ran.exitCode}`}`)
  }
}

export async function deleteKey($: EngineInterface): Promise<void> {
  const ran = await $.process.run([SECURITY, 'delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT])
  if (ran.exitCode !== 0 && ran.exitCode !== NOT_FOUND) {
    throw new Error(`The Keychain could not remove the key: ${ran.stderr.trim() || `exit ${ran.exitCode}`}`)
  }
}

/** The key as the pane shows it: enough to recognize it, not enough to use it. */
export function keyHint(key: string): string {
  return `${key.slice(0, 12)}…${key.slice(-4)}`
}

/** Asks OpenRouter about a key: undefined when it is rejected, else what is left to spend and when it expires. */
export async function checkKey($: EngineInterface, key: string): Promise<KeyStatus | undefined> {
  const headers = { Authorization: `Bearer ${key}` }
  const response = await $.http.fetch(`${API_BASE}/key`, { headers })
  if (response.status === 401 || response.status === 403) {
    return undefined
  }
  if (!response.ok) {
    throw new Error(`OpenRouter answered HTTP ${response.status}`)
  }
  const data = (JSON.parse(response.text) as { data?: Record<string, unknown> }).data ?? {}
  const limit = typeof data.limit === 'number' ? data.limit : null
  let remaining = typeof data.limit_remaining === 'number' ? data.limit_remaining : null
  if (limit === null) {
    // A key without its own cap spends the account's credits.
    const credits = await $.http.fetch(`${API_BASE}/credits`, { headers }).catch(() => undefined)
    if (credits?.ok) {
      const total = (JSON.parse(credits.text) as { data?: { total_credits?: unknown; total_usage?: unknown } }).data
      if (typeof total?.total_credits === 'number' && typeof total.total_usage === 'number') {
        remaining = total.total_credits - total.total_usage
      }
    }
  }

  return {
    hint: keyHint(key),
    remaining,
    limit,
    expiresAt: typeof data.expires_at === 'string' ? data.expires_at : null,
  }
}
