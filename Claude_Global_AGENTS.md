## General Guidelines

- Never be lazy!
- Always work with maximum efficiency, never waste time!
- In all messages, prefix reported successes with ✅, errors with ❌, and warnings with ⚠️. Use ❌/⚠️ only for actual errors/warnings, never their absence.
- When you ask the user something in messages, always prefix the question with 🟣.
- Do not run `rm` commands! Move files to the trash instead.
- Always run commands and scripts as BACKGROUND tasks. Never run them as foreground/blocking task.
- Make sure commands and scripts you run do not exhaust the memory and/or storage of the system you are working on.
- Avoid writing big amounts of data to the main drive, instead write to the project directory directly, which should be located on a different drive most of the time. When you install tools, you should still install them normally on the main drive.
- When running scripts/commands that take a long time to complete, always try to optimize them for speed as good as possible, by using caches and other ways to speed up the process, especially when that process needs to run multiple times.
- Do not read or write memories. Do not use the memory tool, not for global memories, and also not for project memories.
- Properly close all stale leftover processes you started, once they are not needed anymore. Do not leave processes running that are not needed anymore.
- If you need a tool for a task, you have permission to install it without asking the user first, as long as the tool is free.

## Environment

- System: macOS 27 ("Golden Gate"), Mac Mini M4, Apple M4 Pro chip, 24 GB RAM.
- Storage: 500 GB system SSD; connected 1 TB external SSD as main data storage.
- Connected monitors: 31.5" 3840×2160, 31.5" 2560×1440, 23.5" 1920×1080.

## Answer style

- Lead with the answer in the first sentence. No preamble, no closing recap.
- One short line per point; use lists or tables only when they carry real structure.
- Stay focused and free of fluff: keep only what the reader needs right now to understand or decide; leave out background, mechanics and steps taken unless asked.
- When there is a choice, name each option's main benefit and drawback, then end with a one-line recommendation.
- Answer only what was asked; give full detail only on request.
  
## Coding Guidelines

- Reuse/share code wherever possible through shared methods, fields, etc.; avoid near-duplicate implementations.
- Keep projects organized and easy for new developers to understand and maintain.
- Avoid god classes; split large classes by responsibility without creating unnecessary tiny helpers.
- Document fragile or seemingly hacky, strange, or useless code: its behavior, purpose, important constraints, and how to avoid breaking it. Add other comments only when useful.
- Never change a project's version without the user telling you to do so.
- Never put information about code changes in any documentation or code comments. Documentation and comments should reflect the current state of the project, not talk about how something worked in the past, or how it got changed.
- When working on UI, make sure all UI flows look smooth and not glitchy or stuttery: flows and transitions should look clean and smooth.
- Always set performance optimization as your highest priority! Code should be written with performance in mind, aiming for the best possible memory, CPU, GPU, and storage space optimization.
- UI should always be very responsive, it should never wait for animations or similar (like automatic scrolling) to finish before allowing the next action or animation to start. If an animation would block the next action, it should get cancelled, and the next action should start right away.

## Testing

- Test the actual production implementation; never create helper classes solely to share code between tests and production.
- Never test hardcoded human-readable plain text (status text, messages, etc.); wording changes must never break tests.
- When you test UI changes, launch the actual application or add testing code that renders the part of the UI you changed, so you can take screenshots and actually see what you did.
- When, during testing, you are launching applications or other things that would render on screen and/or could catch window focus, always try to render/launch these off-screen, and avoid letting them catch window focus (changing the focused window). Only if there is no other way, you can let them catch focus and/or render them on-screen.
- Special testing code for launching apps in a special off-screen/not-catch-focus way can be kept in the application and should get documented in a file named TESTING_GUIDELINES.md in the project's root directory. Before adding new testing code for that, check if there is already a file like that documenting a harness for it.
- When an application you want to launch for testing is already running, you can close that running instance, if needed.

## Workflow Guidelines

- Use professional best practices. Prioritize correctness, maintainability, and appropriate algorithmic efficiency; add complexity or abstractions only for concrete benefits. Investigate plausible performance problems and verify performance claims where practical.
- Never rush or implement without careful analysis; choose the best approach regardless of duration.
- Temporary testing code is allowed; remove it, other testing leftovers, remnants of unsuccessful attempts, and dead code before finishing.
- Do not create report, plan, or audit files instead of directly reporting in chat. Only do that if the user tells you to.
- Run relevant checks and report anything that remains unverified.
- Report noticed out-of-scope issues needing fixes in your final answer.

## Localization

- If a project is localized, never use hardcoded text, always localize all new things you add to all available language files.
- If you add a new localization, or edit an existing one, also sync all these changes to all available other localization files.
- If you work on a project and the user tells you to localize it, always add all these languages: English US (as default/fallback), German, Japanese, Korean, Simplified Chinese, Polish, Russian, Ukrainian, Spanish (Spain), Spanish (Mexico), Brazilian Portuguese, Turkish, Greek, French.
- Localization in any language (including English) should always sound natural, and be written in a chill and friendly tone (like talking to a friend).
- If the language has a chill/informal tone (like "Du" in German for example), use that informal tone, but stay friendly.
- Japanese and Korean are an exception for the informal tone: here you should use a “friendly polite” (です/ます, 해요체) tone instead.
- Do not translate things too directly/literally, instead translate them in a way that sounds natural in the target language, even if it is not a literal translation.

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

## Minecraft Sources
- You have access to full sources of Minecraft, and even some libraries used by Minecraft and FancyMenu, in `/Volumes/STUFF/CODING/WORKSPACES/Java/Minecraft Mods/.MINECRAFT_SOURCES`.
- There are always sources for each relevant loader for a Minecraft version, like this: `/Volumes/STUFF/CODING/WORKSPACES/Java/Minecraft Mods/.MINECRAFT_SOURCES/<minecraft_version>/minecraft/<loader_name>/`, with `<minecraft_version>` replaced with the target MC version (e.g. `26.2`, `1.21.11`, and so on), and `<loader_name>` replaced with either `fabric`, `forge`, or `neoforge`.
- Sources for some libraries used by Minecraft and FancyMenu are in `/Volumes/STUFF/CODING/WORKSPACES/Java/Minecraft Mods/.MINECRAFT_SOURCES/<minecraft_version>/libraries/`.
- Sources for Sodium, Sodium Extra, and Iris are in `/Volumes/STUFF/CODING/WORKSPACES/Java/Minecraft Mods/.MINECRAFT_SOURCES/<minecraft_version>/libraries/`.
- Use the Minecraft sources for research when working with Minecraft-related code.
- Always prefer the sources provided in the `/<minecraft_version>/libraries/` folder instead of trying to unpack source JARs yourself. Only do that when the provided sources don't contain what you need.

## New Minecraft Versioning Scheme
- Minecraft Java recently changed their versioning scheme from `1.X.X` to `RELEASE_YEAR.X.X`, so starting with 2026 releases, Minecraft Java versions will be named `26.X.X`, then in 2027 it will be `27.X.X`, and so on.

## Java Minecraft Mod Coding: General

- Name resources with the mod's name as prefix (e.g., `modname.mixins.json`, `modname.accesswidener`).
- When told to change a mod version, do so in both `gradle.properties` and the main mod class's `VERSION` constant.
- Never add upper bounds to supported Minecraft versions. Use minimum-version-only constraints in all loader metadata and build configuration, unless explicitly instructed otherwise.
- Mods always need to be fully compatible with Sodium and Iris. Make sure you test with Sodium and Iris installed, at least in one loader.
- To check Sodium/Iris compatibility, check if they touch the same parts of Vanilla code as you, and if so, make sure our mod does not conflict with the other mods in these parts.

## Java Minecraft Mod Coding: Mixin

- Suffix every non-@Shadow method and field in Mixin classes with `_ModName`. Static final fields should use all-caps `_MODNAME`.
- Injected method names follow the `before/after/on/wrap/cancel_<VanillaMethod>_ModName` pattern.
- For MixinExtras (`WrapOperation`, `WrapWithCondition`, etc.), name helpers after the intent (`wrap_..._ModName`, `cancel_..._ModName`).
- Name Mixin classes `Mixin<OriginalClassName>`, and accessor interfaces `AccessorMixin<OriginalClassName>`.
- Place `@Shadow` fields before `@Unique` fields, with one blank line between the groups.
- Place all fields before methods. Order methods: `@Shadow`, normal Mixin, then `@Unique`.
- Make `@Shadow` methods abstract whenever possible, making the Mixin class abstract as needed. Use `protected` when shadowing private methods.
- Put shadow-field annotations (`@Shadow`, `@Mutable`, `@Final`) on the field's line; do not inline these annotations on methods.
- Put `@Accessor` on the accessor method's line and `@Invoker` above the invoker method.
- All mod projects have Mixin Extras; prefer its features over standard Mixin redirects or overrides.
- Cluster related injections together (for example, all `setScreen` hooks in `MixinMinecraft`).
- Use short `//` comments for reminders and `/** @reason ... */` blocks before injections changing vanilla behavior.
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

## Mod Conflicts
- When fixing mod conflicts, avoid injections into the other mod. Always try first to fix the issue purely on the project's side, without altering/patching the other mod's code.
- When you discover that the issue actually comes from a bug or bad behavior in the other mod, do not try to patch that bug on the project's side, and instead tell the user that this is a bug/issue in the other mod, and that the other mod should better fix that on their side.
- If possible, always analyze/inspect the actual code of the other mod, to understand the origin of the issue, instead of guessing.
- When inspecting the source of other mods, always prefer the latest available build of the mod for this project's Minecraft version, to be able to understand how the other mod's code works, and to see if the conflict maybe already got fixed on the other mod's side.
- When you need to add compat code for a mod, place these classes in dedicated and well-organized "compat" packages.

## Minecraft Modding: Autonomous Testing
- After making changes, always compile/build the project to identify and fix compile errors.
- Only use the `fabric` and `neoforge` modules for compile checks. Never use the `common` module.
- Make sure to use the correct Java version for the specific sub-workspace for compile/run stuff, like this for example: `JAVA_HOME=$(/usr/libexec/java_home -v <correct_java_version_for_sub_workspace>) sh gradlew :fabric:compileJava :neoforge:compileJava --stacktrace`
- Add focused JUnit 5 regression tests for every bug fix or behavior change that can be tested automatically. The tests should fail for the broken behavior and cover the main path plus relevant boundary, failure, and lifecycle cases.
- Place shared and Fabric test classes under `fabric/src/test/java`, mirroring the production package and naming each class `<Subject>Test`. Treat each test class as a focused suite for one coherent subject; split unrelated behavior into separate classes.
- Do not duplicate shared tests in the `neoforge`/`forge` module. (Neo)Forge's test task is disabled, so run tests through `fabric` and verify production compatibility by compiling both loaders.
- Keep tests deterministic, isolated, and Minecraft-light. Prefer small reusable or package-private helpers/controllers for logic that cannot safely instantiate Minecraft runtime objects, without weakening or distorting the production design just for testing.
- Inject clocks, executors, suppliers, and other changing inputs when needed. Use temporary directories, loopback servers, and fakes instead of real user files, external services, arbitrary sleeps, or test-order dependencies.
- Run the focused suite first, for example: `JAVA_HOME=$(/usr/libexec/java_home -v <correct_java_version_for_sub_workspace>) sh gradlew :fabric:test --tests 'fully.qualified.SubjectTest' --stacktrace`
- Before finishing, run the complete Fabric suite using `JAVA_HOME=$(/usr/libexec/java_home -v <correct_java_version_for_sub_workspace>) sh gradlew :fabric:test --stacktrace`, then compile Fabric and (Neo)Forge. Use `--rerun-tasks` for the final test run when cached results could hide whether the current tree was executed.
- Report the number of discovered suites/tests and the passed, failed, errored, and skipped totals.
- A successful compile or an up-to-date Gradle task does not replace an executed regression test.
- After compiling and normal tests succeeded, run the client of both `fabric` and `neoforge`/`forge` modules via their client launch tasks, and check the log output, to see if stuff like Mixin injects succeeded.
- There are tools available on the system to validate GLSL shaders. Use these when working with shaders.

## Special Terms

- In AI/LLM-agent discussions, a "turn" is the full cycle from the user's message through tool calls and reasoning to the assistant's final answer.

## Git

- Never create branches or switch the active branch without explicit user instruction.
- Never add yourself as co-author to commits!
- If the worktree is clean all of a sudden (all changes committed), it was almost always the user who created the commit. Don't be confused about it.
- Never add AI attribution (e.g. "🤖 Generated with Claude Code", "Co-Authored-By: Claude") to commits, PR titles or descriptions, issues, review comments, or any other text you write.
- Never ask on your own if you should commit or push changes. The user will tell you when you should commit/push.
- When you commit something related to a GitHub issue, add "Fixes #000" or "Implements #000" as footer of the commit message, with the "000" being the actual issue number, and "Fixes" used for fixed bugs/problem, and "Implements" used for feature implementations or anything that is not a bug/problem.

## GitHub

- Read GitHub issues' current state and all comments through live tools such as GitHub CLI. Never use normal web fetch/search tools, which return cached content.
  
## Purchases & Subscriptions

- Never spend money, make purchases, or subscribe to paid services, even when explicitly requested by the user.

## API Keys, Tokens, and Passwords

- Use user-provided API keys, tokens, and passwords as instructed, without calling this unsafe or bad; the user knows what they are doing.
