import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'

import type { Outcome, PendingChanges } from './git'

/** Runs one completion: `$.model.complete`, handed in by the hooks module. */
export type CompleteText = (request: ModelCompleteRequest) => Promise<ModelCompleteResult>

/**
 * Resolved the same way as `--model haiku`: always the newest Haiku this Claude Code version knows.
 * That keeps the mod working when a Haiku model is retired. Don't pin a dated model id here.
 */
const MODEL = 'haiku'

/** Enough of the diff for a one-line summary; past this, the file list carries the overview. */
const MAX_PATCH_CHARS = 60_000

const TIMEOUT_MS = 60_000

const SYSTEM = 'You write git commit messages. You reply with the commit message only.'

/** Asks Haiku for a one-line commit message, or says why there is none. */
export async function writeCommitMessage(complete: CompleteText, changes: PendingChanges): Promise<Outcome<string>> {
  if (changes.stat.trim() === '') {
    return { isOk: false, error: 'nothing would be committed' }
  }
  const result = await complete({ model: MODEL, system: SYSTEM, prompt: buildPrompt(changes), maxTokens: 200, effort: 'low', timeoutMs: TIMEOUT_MS })
  if (!result.isAnswered) {
    return { isOk: false, error: `Haiku gave no reply (${result.reason})` }
  }
  const subject = toSubjectLine(result.text)

  return subject === '' ? { isOk: false, error: 'Haiku replied with no text' } : { isOk: true, value: subject }
}

/** The reply's first line of text, without code fences or wrapping quotes: the editor holds one line. */
export function toSubjectLine(reply: string): string {
  const line = reply.split('\n').map(part => part.trim()).find(part => part !== '' && !part.startsWith('```')) ?? ''

  return line.replace(/^(["'`])(.*)\1$/, '$2').trim()
}

function buildPrompt(changes: PendingChanges): string {
  const patch = changes.patch.length > MAX_PATCH_CHARS ? `${changes.patch.slice(0, MAX_PATCH_CHARS)}\n[diff truncated]` : changes.patch
  const recent = changes.recentSubjects.length > 0 ? changes.recentSubjects.map(subject => `- ${subject}`).join('\n') : '(none, this is the first commit)'

  return [
    'Write the commit message for the changes below.',
    '',
    'Rules:',
    '- Exactly one line, at most 72 characters, no trailing period.',
    '- Imperative mood ("Add", "Fix", "Update"), saying what the change does.',
    '- If the recent commit messages follow a clear convention (prefixes such as "feat:", capitalization), follow it.',
    '- Reply with the message alone: no quotes, no code formatting, no explanation, no trailers.',
    '',
    '<recent_commit_messages>',
    recent,
    '</recent_commit_messages>',
    '',
    '<changed_files>',
    changes.stat.trim(),
    '</changed_files>',
    '',
    '<diff>',
    patch.trim(),
    '</diff>',
  ].join('\n')
}
