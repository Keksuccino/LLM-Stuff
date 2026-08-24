## General Guidelines
- NEVER use the IMAGEGEN tool! When you are told to generate textures for something, use Python, unless the user explicitly tells you to use the image gen tool. 
- When you write messages (both final/stop messages, and also in updates/commentary during tasks), make sure to structure it in a way that highlights successes, errors, and warnings when you talk about them. You do that by prefixing successes with "✅", errors with "❌", and warnings with "⚠️".

## Environment
- You are operating on macOS 27 Beta.

## Wording Guidelines
- Never say you are "smoke-testing" something. Do not use that term.
- Never say "buddy".
- NEVER say "You're right", like "You're right to call that out.", etc..
- NEVER say it was right to "push back", or to "call that out" at all.

## Coding Guidelines
- Code should be made reusable/shareable whenever possible. Avoid copy-pasting nearly identical code to multiple places when you could make it a shared method/field/etc. instead.
- Projects (code, classes, packages, etc.) should always be well-structured and organized, with great focus on easy maintainability. The project should be easy to understand and maintain for new devs later.
- Avoid god classes. Split large classes into organized and well-structured smaller classes.
- Do not create new helper classes just to share code between tests and normal code. If you would need to do that, simply make it a temporary test that copies the exact code you want to test, and then remove the test after.
- Split classes in a way that makes sense. Do not split them just for the sake of splitting them. Don't create 20 new helper classes with one method each, split them in a reasonable and logical way.
- Always document fragile parts of the code that could break easily when handled wrong. Explain what they do and what is important for them.
- Always document code that could look a bit hacky, weird, or even useless at first look. Explain what the code does, why it is there, and what is important to note for it.
- Do not mindlessly comment/document everything in code. Do not spam documentation. Add docs/comments when useful, not just for the sake of adding it.

## Workflow Guidelines
- Do not simply implement things without a second thought. Simulate in your reasoning STEP-BY-STEP what each step of the execution chain of the code you implemented does, where it does something, and what could be side effects of it. Chase the whole code execution chain step-by-step, to notice edge cases, incomplete implementations, bugs, etc.
- Always implement everything in the best way possible. Implement everything in the most optimized, performance-friendly, and professional way, following best practices for everything.
- Never rush tasks. It doesn't matter how long a task will take, you always take the best possible route instead of the fastest.
- Always clean up after yourself! When finishing a task, remove leftover code from testing, code from earlier unsuccessful implementation attempts, and dead code.
- You can add temporary testing code to projects. Make sure to remove that testing code after.
- You always TRIPLE-CHECK EVERYTHING! When you are finishing a task, you triple-check everything for completeness, possible bad implementations, rushed implementations, performance, optimization, structurization, and so on.

## Subagents
- Always spawn ALL your subagents with the gpt-5.6 (Sol) model on "xhigh" reasoning effort.
- Always spawn ALL your subagents with a CLEAN context (do not give them your context), so they have a clean context for doing their task in the best possible way.
- Since you spawn subagents without context, make sure to properly explain everything important to them, because they do not have your memories.
- You don't tell the agent to have no context. You define in its settings when you create/spawn it to not inherit your context/the chat history.

## Git
- NEVER create new branches unless the user explicitly tells you to do so!
- NEVER switch the active branch unless the user explicitly tells you to do so!

## Swift Coding
- Never launch the Xcode GUI on your own, unless the user tells you to do so. Using Xcode command line stuff is fine.
- The installed Xcode on this system is `/Applications/Xcode-beta.app`.
- Since macOS 27 there is no standalone "Simulator" anymore. Simulators are now accessed via "Device Hub".
- Device Hub is a separate app with its own interface, and is NOT controlled via Xcode.
- If you want to interact with Device Hub, use Computer Use to control the Device Hub app directly.

## Java Coding
- Always add one empty line after a class header line (e.g. `public final class SomeClass {` and then an empty line.
- Always add one empty line before the closing bracket of a class (top-level `}`).
- Never place multiple top-level classes in the same `.java` file. If you want to add more than one class in a `.java` file, make one top-level class and the other classes should be inner/nested classes of that top-level class.
- Never span method or class heads across multiple lines, no matter how long they are.
- Do not span method calls across multiple lines if you would only do it because they are long. Only span them across multiple lines if they contain things that should naturally get written on multiple ones, like lambdas with a bigger body.
- Always use @Nullable and @NotNull annotations from Jetbrains when you need to mark something as not-null/nullable.
- Java code should be written with 4-space indentation and UTF-8 encoding (WITHOUT BOM).

## Java Minecraft Mod Coding: Mixin
- Make @Shadow methods abstract whenever possible (including making the Mixin class abstract in that case).
- Place @Shadow methods at the top before normal Mixin methods and @Unique methods, but after all kinds of fields.
- Place @Shadow fields before @Unique fields, with an empty line between the two groups of shadow and unique ones.
- Place @Unique methods after all Mixin methods.
- For @Shadow fields, place the @Shadow, @Mutable, and @Final annotations on the same line as the actual field. Do that only for fields, not for methods.
- For @Accessor fields, place the annotation on the same line as the actual field, but don't do the same for @Invoker methods.
- If a method is private in the original class and you want to @Shadow it, make the @Shadow method protected.
- All mod projects always have access to Mixin Extras.
- Prefer using features from Mixin Extras instead of using normal Mixin redirects or overrides.
- Use short `//` comments for quick reminders and `/** @reason ... */` blocks ahead of injections that change vanilla behavior.
- Cluster related injections together (for example, all `setScreen` hooks in `MixinGui`).
- When creating normal Mixin classes, call them `Mixin<OriginalClassName>`, so for the `Minecraft` class that would be `MixinMinecraft`.
- When creating Mixin accessor interfaces, name them `AccessorMixin<OriginalClassName>`, so for the `Minecraft` class that would be `AccessorMixinMinecraft`.
- When you make Mixin classes extend the superclass of the target class, add a dummy constructor if needed.
- Keep Mixin classes lightweight.
- You can't nest classes or interfaces in Mixin classes. You need to place them outside Mixin classes.
- You can't place non-Mixin classes/interfaces in packages declared as "Mixin packages". You need to place them outside these packages.
- Always check all methods and fields you reference/target in Mixin classes, to get their type, name, and method signature right.
