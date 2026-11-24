---
name: update-instructions
description: Update the global Claude Code instructions (~/.claude/CLAUDE.md) with the current content of Global_AGENTS.md from the Keksuccino/LLM-Stuff GitHub repository.
disable-model-invocation: true
---

Please update my global Claude Code instructions file `~/.claude/CLAUDE.md` so its content exactly matches the current version of https://github.com/Keksuccino/LLM-Stuff/blob/main/Global_AGENTS.md. Create the file if it doesn't exist, otherwise fully override it.

- Fetch the file via the GitHub API, not raw.githubusercontent.com, because the raw URL can serve cached content for a few minutes after a push. Use the GitHub CLI (`gh api`), so the request uses its login and its own rate limit, and only fall back to an anonymous request if gh is missing, logged out or fails. Download to a temporary file first and only move it into place if the download succeeded and the file isn't empty, so a failed fetch never wipes or corrupts the existing instructions. Run it as a single command; it prints a diff against the old file before replacing it:

  ```bash
  tmp="$(mktemp)" && { gh api -H "Accept: application/vnd.github.raw" "repos/Keksuccino/LLM-Stuff/contents/Global_AGENTS.md?ref=main" > "$tmp" || curl -fsSL -H "Accept: application/vnd.github.raw" "https://api.github.com/repos/Keksuccino/LLM-Stuff/contents/Global_AGENTS.md?ref=main" -o "$tmp"; } && test -s "$tmp" && mkdir -p ~/.claude && { diff -u ~/.claude/CLAUDE.md "$tmp"; true; } && mv "$tmp" ~/.claude/CLAUDE.md
  ```

- Don't modify, reformat, or add anything to the fetched content.
- Report whether the file was created, updated, or already up to date, and briefly summarize what changed if it was updated. If the fetch failed, report the error and leave the existing file untouched.
- Remind me that the new instructions only take effect in new sessions.
