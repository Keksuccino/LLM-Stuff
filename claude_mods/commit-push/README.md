# commit-push
Small mod that adds "Commit &amp; Push" and "Ask for Push" buttons to the Claude app.

The buttons sit in the row directly above the prompt input, in the Claude desktop app's Code tab and in the Claude Code terminal. Click **Commit & Push** and Haiku writes a commit message for your changes. You check or edit the message, then commit, and push if the repository has a remote. Click **Ask for Push** to have Claude commit and push the changes itself instead.

## Features

- **Commit & Push** when the repository has a remote, **Commit** when it has none. Hidden in folders that aren't git repositories.
- The button dims and ignores clicks when there's nothing to commit, while Claude is working on a turn, and while the message is being written. A spinner shows while Haiku works.
- Haiku writes a one-line commit message in the style of your recent commits. The mod uses the `haiku` alias, so it always gets the newest Haiku your Claude Code version knows.
- The message opens in a small editor in the same row, with **Commit & Push Now** / **Commit Now** and **Cancel**. If Haiku can't write a message, the editor starts empty and says so.
- Commits use your own git identity (`user.name` / `user.email`) and include every change (`git add -A`). Your index isn't touched until you confirm.
- Pushes go through your **GitHub CLI login** (`gh auth`), including for SSH remotes, and no other credential helper is used. If gh is missing or not logged in to the remote's host, you get an error asking you to run `gh auth login`.
- **Ask for Push** sits right after it and sends "Please commit and push your changes." to Claude as your own message. It dims and ignores clicks while Claude is working on a turn and while the commit message is being written. It stays clickable when there's nothing to commit, so Claude can still push commits that haven't been pushed yet.

## Requirements

- A Claude Code version with mod support (function hooks, early access).
- `git`.
- The [GitHub CLI](https://cli.github.com) logged in with `gh auth login`, for pushing. Local-folder remotes (`/path/to/repo.git`, `file://`) push without it.

## Install

Copy this folder to `~/.claude/mods/commit-push`, then register and install it from a terminal:

```bash
claude plugin marketplace add ~/.claude/mods/commit-push
```

```bash
claude plugin install commit-push@claudeapp-commitpush --scope user
```

It loads in every Code session started afterwards, in the desktop app's Code tab and in the terminal.

## Good to know

- The message is a single line. Mod text fields can't hold line breaks.
- Mods have no real disabled state for buttons. A dimmed button still brightens under the pointer, but clicks do nothing.
- Repository git hooks (pre-commit, commit-msg, pre-push) don't run. The mod API runs git with repo hooks turned off.
- The mod pushes the branch the session is on. In a worktree session, that's the worktree's branch, which is created on the remote and tracked if it doesn't exist there yet.
- The diff of your changes is sent to Haiku to write the message, as with any other Claude request.

## Development

```bash
claude plugin validate .
claude plugin test .
```

`hooks/register.tsx` draws the button and editor and runs the flow. `hooks/git.ts` runs git and gh, and `hooks/commit-message.ts` asks Haiku. The tests in `tests/` replace git, gh and Haiku with fakes. To get editor typings and hot reload while working on it, start a session with `claude --plugin-dir .`. The engine then writes the API typings to `.claude-plugin/types/`, which `tsconfig.json` extends.
