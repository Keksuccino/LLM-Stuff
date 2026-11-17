import type { ProcessRunInit, ProcessRunResult } from 'claude-code'

import type { RepoStatus } from '../types'

/** Runs a host command: `$.process.run`, handed in by the hooks module. */
export type RunCommand = (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>

/** A step's value, or the text that explains why it failed. */
export type Outcome<T> = { isOk: true; value: T } | { isOk: false; error: string }

/** Where and how the push goes: remote, refspec, and the `-c` options that carry the GitHub CLI login. */
export type PushPlan = {
  remote: string
  refspec: string
  setsUpstream: boolean
  configArgs: string[]
}

/** A remote's host, plus the prefix of an SSH URL that gets rewritten to HTTPS so the push can use the GitHub CLI token. */
export type RemoteEndpoint = { host: string; sshPrefix?: string }

/** What `git add -A` would commit, read so the commit message can be written. */
export type PendingChanges = { stat: string; patch: string; recentSubjects: string[] }

/**
 * Stops git and any credential helper from asking for input. Nothing can type into these commands,
 * so a prompt would just hang until the timeout.
 */
const NON_INTERACTIVE_ENV: Readonly<Record<string, string>> = { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', GCM_INTERACTIVE: 'never' }

/**
 * Where to look for `gh`. The desktop app can start the engine without the login shell's PATH,
 * so Homebrew's install paths are also tried directly.
 */
const GH_CANDIDATES = ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh']

/** Staging, committing and pushing a large repository can take longer than the default 30 seconds. */
const SLOW_TIMEOUT_MS = 5 * 60_000

const PREVIEW_INDEX_NAME = 'commit-push-preview.index'

export async function readRepoStatus(run: RunCommand): Promise<RepoStatus> {
  // --no-optional-locks: a background poll must never take index.lock away from Claude's or the user's own git commands
  const status = await git(run, ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=normal'])
  if (status.exitCode !== 0) {
    return { isRepo: false }
  }
  const remotes = await git(run, ['remote'])

  return { isRepo: true, hasRemote: lines(remotes.stdout).length > 0, hasChanges: status.stdout.trim() !== '' }
}

/**
 * Stages everything into a temporary copy of the index and diffs that, so the commit message
 * describes exactly what `git add -A` will commit while the real index stays untouched until
 * the person confirms.
 */
export async function readPendingChanges(run: RunCommand): Promise<PendingChanges> {
  const indexPath = await gitValue(run, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])
  const previewIndex = await gitValue(run, ['rev-parse', '--path-format=absolute', '--git-path', PREVIEW_INDEX_NAME])
  if (indexPath === undefined || previewIndex === undefined) {
    throw new Error('the git directory could not be read')
  }
  try {
    // A copy keeps the index's stat cache, so only changed files are rehashed. A repository without commits may have no index yet; git then starts from an empty one
    await runSafely(run, ['cp', indexPath, previewIndex])
    const env = { GIT_INDEX_FILE: previewIndex }
    const staged = await git(run, ['add', '-A'], { env, timeoutMs: SLOW_TIMEOUT_MS })
    if (staged.exitCode !== 0) {
      throw new Error(describeFailure(staged))
    }
    const stat = await git(run, ['diff', '--cached', '--stat', '--no-color'], { env })
    const patch = await git(run, ['diff', '--cached', '--no-color', '--no-ext-diff', '--find-renames'], { env })
    const log = await git(run, ['log', '-n', '10', '--format=%s'])

    return { stat: stat.stdout, patch: patch.stdout, recentSubjects: log.exitCode === 0 ? lines(log.stdout) : [] }
  } finally {
    await runSafely(run, ['rm', '-f', previewIndex])
  }
}

/**
 * Picks the remote and refspec git itself would push the current branch to, and wires the
 * GitHub CLI in as the only credential helper for that push. Fails with a readable error when
 * gh is missing or not logged in to the remote's host.
 */
export async function preparePush(run: RunCommand): Promise<Outcome<PushPlan>> {
  const branch = await gitValue(run, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  if (branch === undefined) {
    return failure('HEAD is detached. Check out a branch to push.')
  }
  const remotes = lines((await git(run, ['remote'])).stdout)
  const trackedRemote = await configValue(run, `branch.${branch}.remote`)
  const trackedRef = await configValue(run, `branch.${branch}.merge`)
  // git's own order: the branch's pushRemote, then remote.pushDefault, then the remote of its upstream
  const remote = (await configValue(run, `branch.${branch}.pushRemote`)) ?? (await configValue(run, 'remote.pushDefault')) ?? trackedRemote ?? (remotes.includes('origin') ? 'origin' : remotes[0])
  if (remote === undefined || remote === '.') {
    return failure('This repository has no remote to push to.')
  }
  const pushesToUpstream = remote === trackedRemote && trackedRef !== undefined
  const plan: PushPlan = {
    remote,
    refspec: pushesToUpstream ? `HEAD:${trackedRef}` : `HEAD:refs/heads/${branch}`,
    setsUpstream: trackedRef === undefined,
    configArgs: [],
  }
  const url = await gitValue(run, ['remote', 'get-url', '--push', remote])
  const endpoint = url === undefined ? undefined : parseRemoteUrl(url)
  if (endpoint === undefined) {
    // A local path or file:// remote: there is nothing to log in to
    return { isOk: true, value: plan }
  }
  const gh = await findGh(run)
  if (gh === undefined) {
    return failure(`GitHub CLI auth is needed to push to ${endpoint.host}, but the GitHub CLI (gh) was not found. Install it and run "gh auth login".`)
  }
  const auth = await runSafely(run, [gh, 'auth', 'token', '--hostname', endpoint.host])
  if (auth.exitCode !== 0) {
    return failure(`GitHub CLI auth is needed to push to ${endpoint.host}. Run "gh auth login" in a terminal.`)
  }
  // An empty credential.helper clears every configured helper (Keychain, Git Credential Manager), so only gh answers for this push
  plan.configArgs = ['-c', 'credential.helper=', '-c', `credential.helper=!${shellQuote(gh)} auth git-credential`]
  if (endpoint.sshPrefix !== undefined) {
    plan.configArgs.push('-c', `url.https://${endpoint.host}/.insteadOf=${endpoint.sshPrefix}`)
  }

  return { isOk: true, value: plan }
}

/** Stages everything and commits it with the person's own git identity; resolves the new commit's short hash. */
export async function commitAll(run: RunCommand, message: string): Promise<Outcome<string>> {
  const staged = await git(run, ['add', '-A'], { timeoutMs: SLOW_TIMEOUT_MS })
  if (staged.exitCode !== 0) {
    return failure(describeFailure(staged))
  }
  const committed = await git(run, ['commit', '--quiet', '--file=-'], { stdin: message, timeoutMs: SLOW_TIMEOUT_MS })
  if (committed.exitCode !== 0) {
    return failure(describeFailure(committed))
  }

  return { isOk: true, value: (await gitValue(run, ['rev-parse', '--short', 'HEAD'])) ?? '' }
}

export async function push(run: RunCommand, plan: PushPlan): Promise<Outcome<void>> {
  const pushed = await git(run, [...plan.configArgs, 'push', ...(plan.setsUpstream ? ['--set-upstream'] : []), plan.remote, plan.refspec], { timeoutMs: SLOW_TIMEOUT_MS })

  return pushed.exitCode === 0 ? { isOk: true, value: undefined } : failure(describeFailure(pushed))
}

/**
 * Reads the host out of a remote URL. Returns undefined for remotes that need no login:
 * local paths, file:// and git://.
 */
export function parseRemoteUrl(url: string): RemoteEndpoint | undefined {
  const web = /^https?:\/\/(?:[^@/]*@)?([^:/]+)(?::\d+)?\//i.exec(url)
  if (web !== null) {
    return { host: web[1]! }
  }
  const ssh = /^((?:git\+)?ssh:\/\/(?:[^@/]*@)?([^:/]+)(?::\d+)?\/)/i.exec(url)
  if (ssh !== null) {
    return { host: ssh[2]!, sshPrefix: ssh[1]! }
  }
  // scp-like `user@host:path`; a colon followed by `//` is a URL scheme, and a path with a slash before its first colon is local
  const scp = /^((?:[^@/:]+@)?([^:/]+):)(?!\/\/)/.exec(url)
  if (scp !== null) {
    return { host: scp[2]!, sshPrefix: scp[1]! }
  }

  return undefined
}

/** Quotes a word for the POSIX shell git runs `!`-prefixed credential helpers in. */
export function shellQuote(word: string): string {
  return `'${word.replaceAll("'", `'\\''`)}'`
}

async function findGh(run: RunCommand): Promise<string | undefined> {
  for (const candidate of GH_CANDIDATES) {
    if ((await runSafely(run, [candidate, '--version'])).exitCode === 0) {
      return candidate
    }
  }

  return undefined
}

async function configValue(run: RunCommand, key: string): Promise<string | undefined> {
  return gitValue(run, ['config', '--get', key])
}

/** A git command's trimmed output, or undefined when it failed or printed nothing. */
async function gitValue(run: RunCommand, args: string[]): Promise<string | undefined> {
  const result = await git(run, args)
  const value = result.stdout.trim()

  return result.exitCode === 0 && value !== '' ? value : undefined
}

function git(run: RunCommand, args: string[], options: { env?: Record<string, string>; stdin?: string; timeoutMs?: number } = {}): Promise<ProcessRunResult> {
  const init: ProcessRunInit = { env: { ...NON_INTERACTIVE_ENV, ...options.env } }
  if (options.stdin !== undefined) {
    init.stdin = options.stdin
  }
  if (options.timeoutMs !== undefined) {
    init.timeoutMs = options.timeoutMs
  }

  return runSafely(run, ['git', ...args], init)
}

/** Runs a command; one that could not start or timed out becomes a failed result instead of a rejection. */
async function runSafely(run: RunCommand, argv: string[], init?: ProcessRunInit): Promise<ProcessRunResult> {
  try {
    return await run(argv, init)
  } catch (error) {
    return { exitCode: -1, stdout: '', stderr: error instanceof Error ? error.message : String(error), isStdoutTruncated: false, isStderrTruncated: false }
  }
}

function describeFailure(result: ProcessRunResult): string {
  const meaningful = lines(result.stderr.trim() || result.stdout.trim()).filter(line => !line.startsWith('hint:'))

  return (meaningful.join(' ') || `git exited with code ${result.exitCode}`).slice(0, 400)
}

function failure(error: string): { isOk: false; error: string } {
  return { isOk: false, error }
}

function lines(text: string): string[] {
  return text.split('\n').map(line => line.trim()).filter(line => line !== '')
}
