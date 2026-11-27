# Account Sync

A mod for the Claude desktop app that keeps the Code tab's local sessions and saved environments the same in every
Claude account signed in on this Mac, both ways.

## Install

Copy this folder to `~/.claude/mods/account-sync`, then register and install it from a terminal:

```bash
claude plugin marketplace add ~/.claude/mods/account-sync
```

```bash
claude plugin install account-sync@claudeapp-accountsync --scope user
```

It loads in every Code session started afterwards. It needs macOS and the Python 3 at `/usr/bin/python3` that comes
with Xcode or the Command Line Tools.

## Use

Type `/sync-accounts` in any session. A pane shows each account and what a sync would change in it. **Sync & Restart**
quits Claude, syncs, and opens Claude again; sessions that are running at that moment get stopped. After the restart a
toast says how it went. **Undo Last Sync** puts back everything the last sync changed (and restarts Claude the same way).

## What it syncs

- Every local Code session in the sidebar: in environments, in folders and without a folder. Archived and deleted
  sessions follow too. The conversations themselves are already shared on disk (`~/.claude/projects`); the app only
  keeps a separate session list per account, and that list is what gets synced.
- Every saved environment (added, edited, deleted), and the defaults of the built-in Local environment. Environments
  keep their ids, so sessions stay grouped under them and saved environment variables keep applying.

Not synced: cloud sessions and cloud environments (stored on Anthropic's servers per account), Cowork, scheduled tasks
and connectors.

## How conflicts are settled

- A change made in one account since the last sync wins over the unchanged copy.
- When both accounts changed the same session, the newer one wins. For an environment changed in both, the signed-in
  account's version wins.
- A session that was continued in one account after the other account deleted it is kept and comes back.

## Safety

- The app's files are only changed while the app is closed, since it writes over outside changes while it runs.
- Every run backs up what it changes first, to `~/.claude/account-sync/backups` (the newest 10 runs are kept; older ones
  go to the Trash).
- A run that would delete more sessions than the preview showed, or most of an account's sessions, is refused.

## Engine

The pane runs `engine/`, plain Python 3 with no packages, through `/usr/bin/python3`. It also works from a terminal while
Claude is closed:

```bash
/usr/bin/python3 -B ~/.claude/mods/account-sync/engine plan
```

The commands are `plan`, `status`, `run`, `undo` and `launch`. Its state and log live in `~/.claude/account-sync`.

## Tests

```bash
/usr/bin/python3 -B -m unittest discover -s ~/.claude/mods/account-sync/tests
```

The pane's tests run with `claude plugin test ~/.claude/mods/account-sync`.
