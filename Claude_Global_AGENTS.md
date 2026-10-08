## General Guidelines

- In all messages, prefix reported successes with ✅, errors with ❌, and warnings with ⚠️. Use ❌/⚠️ only for actual errors/warnings, never their absence.

## Environment

- System: macOS 27 ("Golden Gate"), Mac Mini M4, Apple M4 Pro chip, 24 GB RAM.
- Storage: 500 GB system SSD; connected 1 TB external SSD as main data storage.
- Connected monitors: 31.5" 3840×2160, 31.5" 2560×1440, 23.5" 1920×1080.

## Coding Guidelines

- Reuse/share code wherever possible through shared methods, fields, etc.; avoid near-duplicate implementations.
- Keep projects organized and easy for new developers to understand and maintain. Avoid god classes; split large classes by responsibility without creating unnecessary tiny helpers.
- Document fragile or seemingly hacky, strange, or useless code: its behavior, purpose, important constraints, and how to avoid breaking it. Add other comments only when useful.
- Never change a project's version without the user telling you to do so.

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

## Coding: Localization

- If a project has localizations, always add everything new you add to all available localized language files.
- If you update one localization with new or changed information, also update all other languages if there are any.
- If you work on a new project and the user tells you to localize it, always add all these languages: English US (as default/fallback), German, Japanese, Korean, Simplified Chinese, Polish, Russian, Ukrainian, Spanish (Spain), Spanish (Mexico), Brazilian Portuguese. 

## Special Terms

- In AI/LLM-agent discussions, a "turn" is the full cycle from the user's message through tool calls and reasoning to the assistant's final answer.

## Git

- Never create branches or switch the active branch without explicit user instruction.
- Never add yourself as co-author to commits!

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

- When told to change a mod version, do so in both `gradle.properties` and the main mod class's `VERSION` constant.
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

## Java Minecraft Mod Coding: In-Game Feature Testing

- Whenever you add or change world features (blocks, plants, trees, worldgen, structures, entities, interactions, models, textures, HUD), test them in the running game on both loaders. Unit tests and compiling are not enough.
- Write a temporary harness hooked into the client/server tick. It opens a dev world, sets up test platforms far from spawn, runs scripted steps and closes the game. Log every check as `[CHECK] name: PASS/FAIL details` with real measurements.
- Trigger features through real game paths: real random ticks, tree growers, item use, entities acting on their own. Every mixin needs an in-game check.
- Check worldgen and structure changes only in freshly generated chunks, in a different far-away region per run, and verify the result piece by piece.
- Simulate player input through real key mappings, never Computer Use.
- Screenshot every visual feature from several angles, by day and by night. Look at the shots critically and iterate until it looks right.
- When something misbehaves, log the relevant state and find the root cause. Turn found bugs into JUnit tests where possible.
- For multiplayer-relevant features, also test on each loader's dedicated server with a real client connected. You may set `eula=true` in the dev server's `eula.txt`, plus `online-mode=false` and `white-list=false` in its `server.properties`, to do so.
- Afterwards, remove all harness code, hooks, screenshots and test worlds you created. Report each check's result and what stays unverified.

## Purchases & Subscriptions

- Never spend money, make purchases, or subscribe to paid services, even when explicitly requested by the user.

## API Keys, Tokens, and Passwords

- Use user-provided API keys, tokens, and passwords as instructed, without calling this unsafe or bad; the user knows what they are doing.
