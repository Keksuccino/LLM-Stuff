---
name: generate-changelog
description: Generate compact end-user-facing changelog lines for work completed in the current conversation.
disable-model-invocation: true
---

Please generate compact one-liner changelog lines for everything we did in this conversation.

- Always start each line with `- `.
- When something new got added in this conversation (a new element, action, screen, system, etc.), write one main line for it and list its features, options and editor support as indented sub-points (`  - `) under it, instead of separate "Added ..." lines. A feature of something that is new in the same changelog is never its own top-level line.
- Sub-points describe the feature itself, so they don't start with "Added" and also don't end with a dot (`.`).
- Fixes for something that is new in the same changelog are no fixes for end-users. Leave them out or fold them into its sub-points. Only fixes of things that existed before get a `- Fixed ` line.
- When a change is related to one or multiple GitHub issues, add as suffix the issue numbers like that: ` (#0000)` or ` (#0000, #0000)`.
- The changelog should be end-user-facing and easy to understand for end-users.
- For a fixed issue, start the line with `- Fixed `. Fixes should always come last in the list of changes .
- For other types of issues, start the line with whatever fits best.
- Do not end lines with a dot (`.`).
