import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { ModelCompleteResult, On, ProcessRunInit, ProcessRunResult } from 'claude-code'

import { toSubjectLine } from '../hooks/commit-message'
import { parseRemoteUrl, shellQuote } from '../hooks/git'

/** The fake folder beneath the mod: what git and gh answer. */
type Setup = {
  isRepo?: boolean
  remoteUrl?: string
  changes?: string
  hasUpstream?: boolean
  isGhFound?: boolean
  isGhLoggedIn?: boolean
  doesPushFail?: boolean
  /** What Haiku replies; null makes the completion fail. */
  reply?: string | null
}

type Call = { argv: string[]; init: ProcessRunInit | undefined }

const SURFACES = ['terminal', 'desktop'] as const
const SSH_REMOTE = 'git@github.com:Keksuccino/example.git'
const REPLY = 'Add the greeting file'

function result(stdout = '', exitCode = 0, stderr = ''): ProcessRunResult {
  return { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false }
}

/** Strips git's global options (`-c key=value`, `--no-optional-locks`) so the subcommand comes first. */
function subcommand(argv: readonly string[]): string[] {
  const rest = argv.slice(1)
  while (rest[0] === '-c' || rest[0] === '--no-optional-locks') {
    rest.splice(0, rest[0] === '-c' ? 2 : 1)
  }

  return rest
}

function answer(setup: Setup, argv: readonly string[]): ProcessRunResult {
  const command = argv[0] ?? ''
  if (command === 'cp' || command === 'rm') {
    return result()
  }
  if (command.endsWith('gh')) {
    if (setup.isGhFound === false) {
      return result('', 127, 'command not found')
    }
    if (argv[1] === 'auth') {
      return setup.isGhLoggedIn === false ? result('', 1, 'no oauth token') : result('gho_test\n')
    }

    return result('gh version 2.96.0\n')
  }
  if (command !== 'git') {
    return result('', 127, 'unexpected command')
  }
  if (setup.isRepo === false) {
    return result('', 128, 'fatal: not a git repository')
  }
  const args = subcommand(argv)
  switch (args[0]) {
    case 'status':
      return result(setup.changes ?? '?? hello.txt\n')
    case 'remote':
      if (args[1] === 'get-url') {
        return result(`${setup.remoteUrl}\n`)
      }

      return result(setup.remoteUrl === undefined ? '' : 'origin\n')
    case 'rev-parse':
      return args.includes('--git-path') ? result(`/repo/.git/${args.at(-1)}\n`) : result('abc1234\n')
    case 'symbolic-ref':
      return result('main\n')
    case 'config':
      if (setup.hasUpstream === true && args.at(-1) === 'branch.main.remote') {
        return result('origin\n')
      }
      if (setup.hasUpstream === true && args.at(-1) === 'branch.main.merge') {
        return result('refs/heads/main\n')
      }

      return result('', 1)
    case 'diff':
      return result(args.includes('--stat') ? ' hello.txt | 1 +\n 1 file changed, 1 insertion(+)\n' : 'diff --git a/hello.txt b/hello.txt\n+hello\n')
    case 'log':
      return result('Initial commit\n')
    case 'add':
    case 'commit':
      return result()
    case 'push':
      return setup.doesPushFail === true ? result('', 1, 'error: failed to push some refs') : result()
  }

  return result('', 1, 'unexpected git command')
}

/** Answers everything beneath the mod: git and gh, Haiku, and the engine events it calls. */
function fakeHost(on: On, setup: Setup) {
  const host = { calls: [] as Call[], prompts: 0, toasts: 0, clock: mock.clock(on) }
  on('process.run', ($, e) => {
    host.calls.push({ argv: [...e.argv], init: e.init })

    return { value: answer(setup, e.argv) }
  })
  on('model.complete', () => {
    host.prompts += 1
    const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

    const reply: ModelCompleteResult = setup.reply === null ? { isAnswered: false, reason: 'empty-reply', usage } : { isAnswered: true, text: setup.reply ?? REPLY, usage }

    return { value: reply }
  })
  on('ui.toast', () => {
    host.toasts += 1

    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.focus', () => ({}))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }))

  return host
}

async function mountBand($: Engine, clock: MockClock, surface: (typeof SURFACES)[number], isWorking = false) {
  await $.session.start({ cwd: '/repo', surface, isInteractive: true })
  await clock.settle()

  return $.ui.mount({ plugin: 'commit-push', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} } })
}

function gitCalls(calls: readonly Call[], name: string): Call[] {
  return calls.filter(call => call.argv[0] === 'git' && subcommand(call.argv)[0] === name)
}

describe('band', () => {
  test('draws nothing of its own outside a git repository', async ($, on) => {
    const host = fakeHost(on, { isRepo: false })
    for (const surface of SURFACES) {
      const ui = await mountBand($, host.clock, surface)
      expect(await ui.find({ key: 'commit' })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('dims the button and ignores presses when there are no changes', async ($, on) => {
    const host = fakeHost(on, { remoteUrl: SSH_REMOTE, changes: '' })
    for (const surface of SURFACES) {
      const ui = await mountBand($, host.clock, surface)
      expect((await ui.find({ key: 'commit' }))?.props.dimColor).toBe(true)
      await ui.press({ key: 'commit' })
      expect(host.prompts).toBe(0)
      expect(await ui.find({ key: 'message' })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('dims the button and ignores presses during a turn', async ($, on) => {
    const host = fakeHost(on, { remoteUrl: SSH_REMOTE })
    for (const surface of SURFACES) {
      const ui = await mountBand($, host.clock, surface, true)
      expect((await ui.find({ key: 'commit' }))?.props.dimColor).toBe(true)
      await ui.press({ key: 'commit' })
      expect(host.prompts).toBe(0)
      await ui.unmount()
    }
  })
})

describe('commit flow', () => {
  test('writes the message, lets it be edited, then commits and pushes through the GitHub CLI login', async ($, on) => {
    const host = fakeHost(on, { remoteUrl: SSH_REMOTE })
    for (const surface of SURFACES) {
      host.calls.length = 0
      const ui = await mountBand($, host.clock, surface)
      expect((await ui.find({ key: 'commit' }))?.props.dimColor).toBe(false)

      await ui.press({ key: 'commit' })
      expect((await ui.find({ key: 'message' }))?.props.value).toBe(REPLY)
      // The message is written from a staged copy of the index: the real index is untouched until the person confirms
      expect(gitCalls(host.calls, 'add').every(call => call.init?.env?.GIT_INDEX_FILE !== undefined)).toBe(true)
      expect(gitCalls(host.calls, 'commit')).toHaveLength(0)

      await ui.input({ key: 'message', text: 'Add the greeting file for new users', kind: 'change' })
      await ui.press({ key: 'confirm' })

      const commits = gitCalls(host.calls, 'commit')
      expect(commits).toHaveLength(1)
      expect(commits[0]?.init?.stdin).toBe('Add the greeting file for new users')
      expect(gitCalls(host.calls, 'add').some(call => call.init?.env?.GIT_INDEX_FILE === undefined)).toBe(true)
      expect(gitCalls(host.calls, 'push')[0]?.argv).toEqual([
        'git',
        '-c',
        'credential.helper=',
        '-c',
        `credential.helper=!${shellQuote('gh')} auth git-credential`,
        '-c',
        'url.https://github.com/.insteadOf=git@github.com:',
        'push',
        '--set-upstream',
        'origin',
        'HEAD:refs/heads/main',
      ])
      expect(await ui.find({ key: 'message' })).toBeUndefined()
      expect(await ui.find({ key: 'dismiss-error' })).toBeUndefined()
      await ui.unmount()
    }
    expect(host.toasts).toBe(SURFACES.length)
  })

  test('pushes to the upstream branch without changing it', async ($, on) => {
    const host = fakeHost(on, { remoteUrl: 'https://github.com/Keksuccino/example.git', hasUpstream: true })
    const ui = await mountBand($, host.clock, 'desktop')
    await ui.press({ key: 'commit' })
    await ui.press({ key: 'confirm' })
    expect(subcommand(gitCalls(host.calls, 'push')[0]?.argv ?? [])).toEqual(['push', 'origin', 'HEAD:refs/heads/main'])
  })

  test('commits without pushing when there is no remote', async ($, on) => {
    const host = fakeHost(on, {})
    for (const surface of SURFACES) {
      host.calls.length = 0
      const ui = await mountBand($, host.clock, surface)
      await ui.press({ key: 'commit' })
      await ui.press({ key: 'confirm' })
      expect(gitCalls(host.calls, 'commit')).toHaveLength(1)
      expect(gitCalls(host.calls, 'push')).toHaveLength(0)
      expect(host.calls.some(call => call.argv[0]?.endsWith('gh'))).toBe(false)
      await ui.unmount()
    }
  })

  test('cancel closes the editor without committing', async ($, on) => {
    const host = fakeHost(on, { remoteUrl: SSH_REMOTE })
    const ui = await mountBand($, host.clock, 'terminal')
    await ui.press({ key: 'commit' })
    await ui.press({ key: 'cancel' })
    expect(await ui.find({ key: 'message' })).toBeUndefined()
    expect(await ui.find({ key: 'commit' })).toBeDefined()
    expect(gitCalls(host.calls, 'commit')).toHaveLength(0)
  })
})

describe('failures', () => {
  test('shows an error and skips Haiku when the GitHub CLI is not logged in', async ($, on) => {
    const host = fakeHost(on, { remoteUrl: SSH_REMOTE, isGhLoggedIn: false })
    for (const surface of SURFACES) {
      const ui = await mountBand($, host.clock, surface)
      await ui.press({ key: 'commit' })
      expect(await ui.find({ key: 'dismiss-error' })).toBeDefined()
      expect(await ui.find({ key: 'message' })).toBeUndefined()
      expect(host.prompts).toBe(0)
      await ui.press({ key: 'dismiss-error' })
      expect(await ui.find({ key: 'dismiss-error' })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('shows an error when the GitHub CLI is missing', async ($, on) => {
    const host = fakeHost(on, { remoteUrl: SSH_REMOTE, isGhFound: false })
    const ui = await mountBand($, host.clock, 'desktop')
    await ui.press({ key: 'commit' })
    expect(await ui.find({ key: 'dismiss-error' })).toBeDefined()
    expect(host.prompts).toBe(0)
  })

  test('opens an empty editor when Haiku fails, and commits only once a message is written', async ($, on) => {
    const host = fakeHost(on, { remoteUrl: SSH_REMOTE, reply: null })
    for (const surface of SURFACES) {
      host.calls.length = 0
      const ui = await mountBand($, host.clock, surface)
      await ui.press({ key: 'commit' })
      expect((await ui.find({ key: 'message' }))?.props.value).toBe('')
      expect((await ui.find({ key: 'confirm' }))?.props.dimColor).toBe(true)
      await ui.press({ key: 'confirm' })
      expect(gitCalls(host.calls, 'commit')).toHaveLength(0)

      await ui.input({ key: 'message', text: 'Add greeting', kind: 'change' })
      expect((await ui.find({ key: 'confirm' }))?.props.dimColor).toBe(false)
      await ui.press({ key: 'confirm' })
      expect(gitCalls(host.calls, 'commit')).toHaveLength(1)
      await ui.unmount()
    }
  })

  test('keeps the commit and reports a failed push', async ($, on) => {
    const host = fakeHost(on, { remoteUrl: SSH_REMOTE, doesPushFail: true })
    const ui = await mountBand($, host.clock, 'terminal')
    await ui.press({ key: 'commit' })
    await ui.press({ key: 'confirm' })
    expect(gitCalls(host.calls, 'commit')).toHaveLength(1)
    expect(await ui.find({ key: 'message' })).toBeUndefined()
    expect(await ui.find({ key: 'dismiss-error' })).toBeDefined()
    expect(host.toasts).toBe(0)
  })
})

describe('helpers', () => {
  test('reads the host and SSH prefix out of remote URLs', async () => {
    expect(parseRemoteUrl('https://github.com/Keksuccino/example.git')).toEqual({ host: 'github.com' })
    expect(parseRemoteUrl('https://user@github.example.com:8443/team/repo.git')).toEqual({ host: 'github.example.com' })
    expect(parseRemoteUrl('git@github.com:Keksuccino/example.git')).toEqual({ host: 'github.com', sshPrefix: 'git@github.com:' })
    expect(parseRemoteUrl('ssh://git@github.com:22/Keksuccino/example.git')).toEqual({ host: 'github.com', sshPrefix: 'ssh://git@github.com:22/' })
    expect(parseRemoteUrl('/Volumes/backup/example.git')).toBeUndefined()
    expect(parseRemoteUrl('../example.git')).toBeUndefined()
    expect(parseRemoteUrl('file:///tmp/example.git')).toBeUndefined()
  })

  test('keeps the first line of a reply, without fences or quotes', async () => {
    expect(toSubjectLine('"Fix crash on empty config"\n\nMore detail')).toBe('Fix crash on empty config')
    expect(toSubjectLine('```\nFix crash on empty config\n```')).toBe('Fix crash on empty config')
    expect(toSubjectLine('  \n')).toBe('')
  })

  test('quotes a path for the shell', async () => {
    expect(shellQuote("/opt/it's/gh")).toBe(`'/opt/it'\\''s/gh'`)
  })
})
