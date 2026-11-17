---
name: commit-push
description: Commit and push the agent's changes in the affected workspace and affected sub-workspaces, using focused commits and GitHub issue closing footers.
disable-model-invocation: true
---

Please now commit and push all the changes you made in this conversation in the affected workspace and/or affected sub-workspaces, if there are any in this project. Handle each affected Git repository on its current branch.

- Try your best to commit only your own changes from this conversation and avoid including changes you did not make, as far as possible. Inspect the diffs and selectively stage files or hunks as needed. Preserve unrelated changes; their presence must not block committing and pushing your own changes. If some changes cannot be cleanly separated, commit the changes you can isolate and report any remaining overlap.
- If multiple things were fixed, split the fixes into focused smaller commits, with only one fix per commit. Include the implementation and related tests for that fix together.
- Give each commit a clear title and a description of what it does in 1–3 focused sentences, with a maximum of 3 sentences. GitHub issue footer lines are separate from this sentence limit.
- If a commit fixes a GitHub issue, end its description with a footer in the form `Fixes #0000`, replacing `0000` with the actual issue number. If one fix resolves multiple issues, use a separate `Fixes #0000` footer line for each resolved issue.
- Review the staged changes for each commit to ensure they match its scope, then commit and push to the appropriate remote branch. For Git submodules, commit and push the affected submodule before committing and pushing its updated reference in the parent repository.
- Report the commits and push results, including any errors or changes that could not be committed or pushed.
