import type { EngineInterface } from 'claude-code'

/** The engine is plain Python 3 with no packages, run by the copy macOS ships with the developer tools. */
const PYTHON = '/usr/bin/python3'

export const LAUNCH_TIMEOUT_MS = 30_000

/** Runs one engine command and returns its JSON answer, or throws the engine's own reason. */
export async function runEngine($: EngineInterface, args: string[], timeoutMs: number): Promise<Record<string, unknown>> {
  const result = await $.process.run([PYTHON, '-B', `${$.plugin.root}/engine`, ...args], { timeoutMs })
  const lastLine = result.stdout.trim().split('\n').pop() ?? ''
  let answer: unknown
  try {
    answer = JSON.parse(lastLine)
  } catch {
    answer = undefined
  }
  if (typeof answer !== 'object' || answer === null) {
    const reason = result.stderr.trim().split('\n').pop()
    throw new Error(reason || `The sync engine stopped with exit code ${result.exitCode}.`)
  }
  const fields = answer as Record<string, unknown>
  if (fields.ok !== true) {
    throw new Error(typeof fields.error === 'string' ? fields.error : 'The sync engine failed.')
  }

  return fields
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export function ago(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000)
  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes} min ago`
  }
  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `${hours} h ago`
  }

  return new Date(at).toLocaleDateString()
}
