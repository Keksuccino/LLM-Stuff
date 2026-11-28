# Testing

Run everything from the mod's folder. `claude` is the Claude Code CLI; the desktop app's bundled one lives under `~/Library/Application Support/Claude/claude-code/<version>/<build>/claude.app/Contents/MacOS/claude`.

## Checks

| What | Command |
| --- | --- |
| Manifest and hooks module as the engine reads them | `claude plugin validate .` |
| Types (needs `.claude-plugin/types/`, which the engine lays out when it loads the mod from a watched folder) | `tsc -p .` |
| The mod: tool and pane | `claude plugin test .` |
| The engine | `node --test engine/tests/*.test.mjs` |

## The mod's tests

`tests/*.test.ts(x)` run under `claude plugin test` with no network, Keychain or process access. `tests/fakes.ts` stands for everything beneath the mod: the Keychain behind `/usr/bin/security`, OpenRouter behind `$.http.fetch`, the engine behind `$.process.spawn`, and the store. Pane tests mount the pane on the `terminal` and `desktop` surfaces and act on it by element key.

## The engine's tests

`engine/tests/main.test.mjs` runs `engine/main.mjs` as the mod does (a child process, the job on standard input) against a local HTTP stand-in for the Images API. The environment variable `IMAGE_GEN_API_BASE` points the engine at it; nothing else sets it. The tests write only into a temporary folder they remove afterwards.

## Trying it in a session

A session hot-reloads the mod when its folder is a watched plugin folder (`claude --plugin-dir <folder>`, or `CLAUDE_CODE_PLUGIN_DIRS`), so a saved edit is live at the next turn. A real generation costs credits: pick a cheap model (FLUX.2 Klein 4B, or GPT Image 1 Mini at low quality) and an `output_path` in a temporary folder. The pane's state, the settings and the model list live in the mod's store under `~/.claude/plugins/store/`; the key lives in the Keychain under the service "Claude Image Gen (OpenRouter)".
