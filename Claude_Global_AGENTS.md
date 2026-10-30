## General Guidelines

- Never be lazy!
- Always work with maximum efficiency, never waste time!
- In all messages, prefix reported successes with ✅, errors with ❌, and warnings with ⚠️. Use ❌/⚠️ only for actual errors/warnings, never their absence.
- When you ask the user something in answers, always prefix the question with 🟣.
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

## Answer Style

- Keep answers short and focused; avoid walls of text unless they are actually needed or asked for.
- Lead with the answer in the first sentence. No preamble, no closing recap.
- Use tables only when they are actually needed, not when they would just make the answer unnecessarily large/long.
- Answer only what was asked; no additional or unnecessary information.
  
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
- When you create scrollable views (feeds for example), always make sure that scrolling is smooth, without hiccups or jumps, especially when scroll views add more content while scrolling down. They should always stays smooth and never glitch back or forth, not lag, or anything else.

## Testing

- Test the actual production implementation; never create helper classes solely to share code between tests and production.
- Never test hardcoded human-readable plain text (status text, messages, etc.); wording changes must never break tests.
- When you test UI changes, launch the actual application or add testing code that renders the part of the UI you changed, so you can take screenshots and actually see what you did.
- When, during testing, you are launching applications or other things that would render on screen and/or could catch window focus, always try to render/launch these off-screen, and avoid letting them catch window focus (changing the focused window). Only if there is no other way, you can let them catch focus and/or render them on-screen.
- Special testing code for launching apps in a special off-screen/not-catch-focus way can be kept in the application and should get documented in a file named TESTING_GUIDELINES.md in the project's root directory. Before adding new testing code for that, check if there is already a file like that documenting a harness for it.
- Improve the offscreen testing harness whenever you miss a feature in there, instead of ditching it.
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
- When you start building a completely new project, always localize it from the start, with the default languages mentioned above.
- Do not translate things too directly/literally, instead translate them in a way that sounds natural in the target language, even if it is not a literal translation.
- Never use translation APIs for localization unless the user tells you to use one. Manually translate text instead.

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
