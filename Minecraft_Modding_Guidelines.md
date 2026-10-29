# Minecraft Java Modding Guidelines

- The following guidelines should be strictly followed whenever working on a Minecraft Java mod project.

## General

- These guidelines use `modname`, `ModName`, and `MODNAME` as placeholders for the actual mod name of the current mod you work on.
- Name resources with the mod's name as prefix (e.g., `modname.mixins.json`, `modname.accesswidener`).
- When told to change a mod version, do so in both `gradle.properties` and the main mod class's `VERSION` constant.
- Never add upper bounds to supported Minecraft versions. Use minimum-version-only constraints in all loader metadata and build configuration, unless explicitly instructed otherwise.
- Mods always need to be fully compatible with Sodium and Iris. Make sure you test with Sodium and Iris installed, at least in one loader.
- To check Sodium/Iris compatibility, check if they touch the same parts of Vanilla code as you, and if so, make sure our mod does not conflict with the other mods in these parts.

## Mixin

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

## Mod Conflicts

- When fixing mod conflicts, avoid injections into the other mod. Always try first to fix the issue purely on the project's side, without altering/patching the other mod's code.
- When you discover that the issue actually comes from a bug or bad behavior in the other mod, do not try to patch that bug on the project's side, and instead tell the user that this is a bug/issue in the other mod, and that the other mod should better fix that on their side.
- If possible, always analyze/inspect the actual code of the other mod, to understand the origin of the issue, instead of guessing.
- When inspecting the source of other mods, always prefer the latest available build of the mod for this project's Minecraft version, to be able to understand how the other mod's code works, and to see if the conflict maybe already got fixed on the other mod's side.
- When you need to add compat code for a mod, place these classes in dedicated and well-organized "compat" packages.

## General Testing

- After making changes, always compile/build the project to identify and fix compile errors.
- Only use the `fabric` and `forge`/`neoforge` modules for compile checks, never `common`.
- For compiling/running, use the correct Java version for the specific workspace you work in, like this for example: `JAVA_HOME=$(/usr/libexec/java_home -v <correct_java_version>) sh gradlew :fabric:compileJava :neoforge:compileJava --stacktrace`
- Add focused JUnit 5 regression tests for every bug fix or behavior change that can be tested automatically. The tests should fail for the broken behavior and cover the main path plus relevant boundary, failure, and lifecycle cases.
- Keep tests deterministic, isolated, and Minecraft-light. Prefer small reusable or package-private helpers/controllers for logic that cannot safely instantiate Minecraft runtime objects, without weakening or distorting the production design just for testing.
- Inject clocks, executors, suppliers, and other changing inputs when needed. Use temporary directories, loopback servers, and fakes instead of real user files, external services, arbitrary sleeps, or test-order dependencies.
- Run the focused suite first, for example: `JAVA_HOME=$(/usr/libexec/java_home -v <correct_java_version>) sh gradlew :fabric:test --tests 'fully.qualified.SubjectTest' --stacktrace`
- Before finishing, run the complete suite using `JAVA_HOME=$(/usr/libexec/java_home -v <correct_java_version>) sh gradlew :fabric:test --stacktrace`. Use `--rerun-tasks` for the final test run when cached results could hide whether the current tree was executed.
- After compiling and normal tests succeeded, run the client of both `fabric` and `forge`/`neoforge` modules via their client launch tasks, and check the log output, to see if stuff like Mixin injects succeeded.
- There are tools available on the system to validate GLSL shaders. Use these when working with shaders.

## In-Game Feature Testing

- Whenever you add or change world features (blocks, plants, trees, worldgen, structures, entities, interactions, models, textures, HUD), test them in the running game on both loaders. Unit tests and compiling are not enough.
- Write a temporary harness hooked into the client/server tick. It opens a dev world, sets up test platforms far from spawn, runs scripted steps and closes the game. Log every check as `[CHECK] name: PASS/FAIL details` with real measurements.
- Trigger features through real game paths: real random ticks, tree growers, item use, entities acting on their own. Every mixin needs an in-game check.
- Check worldgen and structure changes only in freshly generated chunks, in a different far-away region per run, and verify the result piece by piece.
- Simulate player input through real key mappings, never Computer Use.
- Screenshot every visual feature from several angles, by day and by night. Look at the shots critically and iterate until it looks right.
- When something misbehaves, log the relevant state and find the root cause. Turn found bugs into JUnit tests where possible.
- For multiplayer-relevant features, also test on each loader's dedicated server with a real client connected. You may set `eula=true` in the dev server's `eula.txt`, plus `online-mode=false` and `white-list=false` in its `server.properties`, to do so.
- Afterwards, remove all harness code, hooks, screenshots and test worlds you created. Report each check's result and what stays unverified.

## Minecraft Versioning Scheme

- Minecraft Java recently changed their versioning scheme from `1.X.X` to `RELEASE_YEAR.X.X`, so starting with 2026 releases, Minecraft Java versions will be named `26.X.X`, then in 2027 it will be `27.X.X`, and so on.
- The last version with the old `1.X.X` scheme is `1.21.11`, after which `26.0.0` followed.

## Minecraft Sources

- You have access to full sources of Minecraft, and even some libraries used by Minecraft and FancyMenu, in `/Volumes/STUFF/CODING/WORKSPACES/Java/Minecraft Mods/.MINECRAFT_SOURCES`.
- There are always sources for each relevant loader for a Minecraft version, like this: `/Volumes/STUFF/CODING/WORKSPACES/Java/Minecraft Mods/.MINECRAFT_SOURCES/<minecraft_version>/minecraft/<loader_name>/`, with `<minecraft_version>` replaced with the target MC version (e.g. `26.2`, `1.21.11`, and so on), and `<loader_name>` replaced with either `fabric`, `forge`, or `neoforge`.
- Sources for some libraries used by Minecraft and FancyMenu are in `/Volumes/STUFF/CODING/WORKSPACES/Java/Minecraft Mods/.MINECRAFT_SOURCES/<minecraft_version>/libraries/`.
- Sources for Sodium, Sodium Extra, and Iris are in `/Volumes/STUFF/CODING/WORKSPACES/Java/Minecraft Mods/.MINECRAFT_SOURCES/<minecraft_version>/libraries/`.
- Use the Minecraft sources for research when working with Minecraft-related code.
- Always prefer the sources provided in the `/<minecraft_version>/libraries/` folder instead of trying to unpack source JARs yourself. Only do that when the provided sources don't contain what you need.
