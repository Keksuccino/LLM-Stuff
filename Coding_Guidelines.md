## Coding Guidelines

- Reuse/share code wherever possible through shared methods, fields, etc.; avoid near-duplicate implementations.
- Keep projects organized and easy for new developers to understand and maintain.
- Strictly avoid god classes; split large classes by responsibility without creating unnecessary tiny helpers!
- Document fragile or seemingly hacky, strange, or useless code: its behavior, purpose, important constraints, and how to avoid breaking it. Add other comments only when useful.
- Never change a project's version without the user telling you to do so.
- Never put information about code changes in any documentation or code comments. Documentation and comments should reflect the current state of the project, not talk about how something worked in the past, or how it got changed.
- Always set performance optimization as your highest priority! Code should be written with performance in mind, aiming for the best possible memory, CPU, GPU, and storage space optimization.

## Testing

- Test the actual production implementation; never create helper classes solely to share code between tests and production.
- Never test hardcoded human-readable plain text (status text, messages, etc.); wording changes must never break tests.
- When you test UI changes, launch the actual application or add testing code that renders the part of the UI you changed, so you can take screenshots and actually see what you did.
- When, during testing, you are launching applications or other things that would render on screen and/or could catch window focus, always try to render/launch these off-screen, and avoid letting them catch window focus (changing the focused window). Only if there is no other way, you can let them catch focus and/or render them on-screen.
- Special testing code for launching apps in a special off-screen/not-catch-focus way can be kept in the application and should get documented in a file named TESTING_GUIDELINES.md in the project's root directory. Before adding new testing code for that, check if there is already a file like that documenting a harness for it.
- Improve the offscreen testing harness whenever you miss a feature in there, instead of ditching it.
- If there is no offscreen testing harness yet, it automatically becomes your job to add one. If you work with multiple agents in parallel, coordinate each other for which agent adds the harness.
- The offscreen harness should allow you to do everything that is needed for testing, including simulated inputs of any type you need (key presses, touch taps, etc.).
- The offscreen harness should launch the application muted.
- Never play any unmuted sounds in testing. You can play them if needed, but they need to be muted for the user, so they never hear any sounds during testing!
- When an application you want to launch for testing is already running, you can close that running instance, if needed.
- Make sure automated tests do not play unmuted sounds either. If you find test like that, fix them, even if not part of your task.
- Sending notifications to the user is never considered part of testing, so the sound rules do not apply to it.
- Make sure automated tests never put any programs in the dock or open visible windows. If you find a test like that, fix it, even if not part of your task.

## Workflow Guidelines

- Use professional best practices. Prioritize correctness, maintainability, and appropriate algorithmic efficiency; add complexity or abstractions only for concrete benefits. Investigate plausible performance problems and verify performance claims where practical.
- Never rush or implement without careful analysis; choose the best approach regardless of duration.
- Temporary testing code is allowed; remove it, other testing leftovers, remnants of unsuccessful attempts, and dead code before finishing.
- Do not create report, plan, or audit files instead of directly reporting in chat. Only do that if the user tells you to.
- Run relevant checks and report anything that remains unverified.
- Report noticed out-of-scope issues needing fixes in your final answer.
- When bugs, or missing logic or features, are in your way of implementing something, fix/add them properly, instead of working around them.

## Localization

- If a project is localized, never use hardcoded text, always localize all new things you add to all available language files.
- If you add a new localization, or edit an existing one, also sync all these changes to all available other localization files.
- If you work on a project and the user tells you to localize it, always add all these languages: English US (as default/fallback), German, Japanese, Korean, Simplified Chinese, Polish, Russian, Ukrainian, Spanish (Spain), Spanish (Mexico), Brazilian Portuguese, Turkish, Greek, French.
- Localization in any language (including English) should always sound natural, and be written in a chill and friendly tone (like talking to a friend).
- If the language has a neutral-friendly informal tone (like "Du" in German for example), use that informal tone, but stay professional and neutral-friendly still.
- Japanese and Korean are an exception for the informal tone: here you should use a “friendly polite” (です/ます, 해요체) tone instead.
- When you start building a completely new project, always localize it from the start, with the default languages mentioned above.
- Do not translate things too directly/literally, instead translate them in a way that sounds natural in the target language, even if it is not a literal translation.
- Never use translation APIs for localization unless the user tells you to use one. Manually translate text instead.

## Swift Coding

- Xcode: `/Applications/Xcode-beta.app`. CLI use is allowed; launch the GUI only when instructed by the user.
- Since macOS 27, simulators use Device Hub; there is no standalone Simulator.
- Device Hub is a separate app with its own interface. Control it directly with Computer Use, never through Xcode.
- Instead of using your built-in iOS simulator tool, always prefer existing background/offscreen testing harnesses.

## Java Coding

- Use 4-space indentation and UTF-8 without BOM.
- Leave one blank line after each class header and before the class's closing brace.
- Use one top-level class per `.java` file; additional classes must be nested inside it.
- Keep class and method headers on one line regardless of length. Wrap method calls only for naturally multiline content, such as larger lambda bodies, never solely for length.
- Use JetBrains `@Nullable` and `@NotNull` when nullability annotations are needed.
