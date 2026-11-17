---
name: generate-changelog
description: Generate compact end-user-facing changelog lines for work completed in the current conversation.
disable-model-invocation: true
---

Please generate compact one-liner changelog lines for everything we did in this conversation.

- Always start each line with `- `.
- When a change is related to one or multiple GitHub issues, add as suffix the issue numbers like that: ` (#0000)` or ` (#0000, #0000)`.
- The changelog should be end-user-facing and easy to understand for end-users.
- For a fixed issue, start the line with `- Fixed `. Fixes should always come last in the list of changes .
- For other types of issues, start the line with whatever fits best.
- Do not end lines with a dot (`.`).
