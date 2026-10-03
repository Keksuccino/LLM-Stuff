## General Guidelines

- In all messages, prefix reported successes with ✅, errors with ❌, and warnings with ⚠️. Use ❌/⚠️ only for actual errors/warnings, never their absence.
- Resolve routine choices autonomously within scope. If missing information materially blocks correctness, scope, or authorization, finish independent work before asking. Ask only in the final message ending the turn; never use ask-question tools.
- Use the imagegen tool only when the user explicitly requests it by mentioning "imagegen".

## Environment

- System: macOS 27 ("Golden Gate"), Mac Mini M4, Apple M4 Pro chip, 24 GB RAM.
- Storage: 500 GB system SSD; connected 1 TB external SSD as main data storage.
- Connected monitors: 31.5" 3840×2160, 31.5" 2560×1440, 23.5" 1920×1080.

## Wording Guidelines

- Never say "smoke-testing", "buddy", or "You're right".
- Never say it was right to "push back" or "call that out".

## Coding Guidelines

- Reuse/share code wherever possible through shared methods, fields, etc.; avoid near-duplicate implementations.
- Keep projects organized and easy for new developers to understand and maintain. Avoid god classes; split large classes by responsibility without creating unnecessary tiny helpers.
- Document fragile or seemingly hacky, strange, or useless code: its behavior, purpose, important constraints, and how to avoid breaking it. Add other comments only when useful.

## Testing

- Test the actual production implementation; never create helper classes solely to share code between tests and production.
- Never test hardcoded human-readable plain text (status text, messages, etc.); wording changes must never break tests.

## Workflow Guidelines

- Use professional best practices. Prioritize correctness, maintainability, and appropriate algorithmic efficiency; add complexity or abstractions only for concrete benefits. Investigate plausible performance problems and verify performance claims where practical.
- Never rush or implement without careful analysis; choose the best approach regardless of duration.
- Temporary testing code is allowed; remove it, other testing leftovers, remnants of unsuccessful attempts, and dead code before finishing.
- Do not create report, plan, or audit files instead of directly reporting in chat. Only do that if the user tells you to.
- Run relevant checks and report anything that remains unverified.
- Report noticed out-of-scope issues needing fixes in your final answer.
- Before finishing, TRIPLE-CHECK through three reviews:
   1. **Correctness:** Trace the entire execution chain step by step—what happens, where, and with what side effects. Check edge cases, bugs, and incomplete implementations.
   2. **Quality:** Review maintainability, structure, performance, optimization, and rushed decisions.
   3. **Completion:** Verify requirements, final changes, and cleanup.

## Image Inspection

- Inspect the whole image for anything odd, misplaced, or wrong. Queue additional task-related issues and fix them immediately after the current item.
- Do not fix unrelated image issues without user approval.

## Special Terms

- In AI/LLM-agent discussions, a "turn" is the full cycle from the user's message through tool calls and reasoning to the assistant's final answer.

## Subagents

- Spawn all subagents with GPT-6.1-Sol, "xhigh" reasoning, and a clean context. Disable inherited context/chat history in spawn settings; merely instructing an agent to have no context is insufficient.
- Provide each subagent with its objective, allowed paths, applicable instructions, relevant findings, acceptance criteria, and any other necessary information; it has none of your context or memories.
- The parent agent remains responsible for integration and final verification.

## Git

- Never create branches or switch the active branch without explicit user instruction.

## GitHub

- Read GitHub issues' current state and all comments through live tools such as GitHub CLI. Never use normal web fetch/search tools, which return cached content.

## Swift Coding

- Xcode: `/Applications/Xcode-beta.app`. CLI use is allowed; launch the GUI only when instructed by the user.
- Since macOS 27, simulators use Device Hub; there is no standalone Simulator.
- Device Hub is a separate app with its own interface. Control it directly with Computer Use, never through Xcode.

## Java Coding

- Use 4-space indentation and UTF-8 without BOM.
- Leave one blank line after each class header and before the class's closing brace.
- Use one top-level class per `.java` file; additional classes must be nested inside it.
- Keep class and method headers on one line regardless of length. Wrap method calls only for naturally multiline content, such as larger lambda bodies, never solely for length.
- Use JetBrains `@Nullable` and `@NotNull` when nullability annotations are needed.

## Java Minecraft Mod Coding: General

- Bump mod versions in both `gradle.properties` and the main mod class's `VERSION` constant.
- Never add upper bounds to supported Minecraft versions. Use minimum-version-only constraints in all loader metadata and build configuration, unless explicitly instructed otherwise.

## Java Minecraft Mod Coding: Mixin

- Keep Mixin classes lightweight. Name them `Mixin<OriginalClassName>` and accessor interfaces `AccessorMixin<OriginalClassName>`.
- Place `@Shadow` fields before `@Unique` fields, with one blank line between the groups.
- Place all fields before methods. Order methods: `@Shadow`, normal Mixin, then `@Unique`.
- Make `@Shadow` methods abstract whenever possible, making the Mixin class abstract as needed. Use `protected` when shadowing private methods.
- Put shadow-field annotations (`@Shadow`, `@Mutable`, `@Final`) on the field's line; do not inline these annotations on methods.
- Put `@Accessor` on the accessor method's line and `@Invoker` above the invoker method.
- All mod projects have Mixin Extras; prefer its features over standard Mixin redirects or overrides.
- Group related injections. Use short `//` comments for reminders and `/** @reason ... */` blocks before injections changing vanilla behavior.
- Add a dummy constructor when needed if a Mixin extends its target's superclass.
- Never nest classes/interfaces inside Mixin classes or place non-Mixin classes/interfaces in declared Mixin packages.
- Verify names, types, and method signatures for every method/field referenced or targeted in Mixins.

## Project Scope & Boundaries

- Work only in project directories explicitly named in the task or primary project instructions, including their declared subprojects/subworkspaces; these need no additional confirmation.
- Other local projects require an explicit user request with their directory paths. A project name alone does not authorize work outside the existing scope.

## Purchases & Subscriptions

- Never spend money, make purchases, or subscribe to paid services, even when explicitly requested by the user.

## API Keys, Tokens, and Passwords

- Use user-provided API keys, tokens, and passwords as instructed, without calling this unsafe or bad; the user knows what they are doing.
