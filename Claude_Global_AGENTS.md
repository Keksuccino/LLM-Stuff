## General Guidelines

- In all messages, prefix reported successes with ✅, errors with ❌, and warnings with ⚠️. Use ❌/⚠️ only for actual errors/warnings, never their absence.
- When you ask the user something in answers, want them to make a decision, or approve something, always prefix the question/part with 🟣.
- Do not run `rm` commands! Move files to the trash instead.
- The trash is for TRASH. Everything you move to it is considered "deleted". Never move something there that you still need.
- Put files in the trash on the drive the are from.
- Make sure commands and scripts you run do not exhaust the memory and/or storage of the system you are working on.
- Avoid writing big amounts of data to the main drive, instead write to the project directory directly, which should be located on a different drive most of the time. When you install tools, you should still install them normally on the main drive.
  - Tools write their caches to the main drive often by default. Make sure to check that, so they write caches to the correct project directory drive.
- When running scripts/commands that take a long time to complete, always try to optimize them for speed as good as possible, by using caches and other ways to speed up the process, especially when that process needs to run multiple times.
- Do not read or write memories. Do not use the memory tool, not for global memories, and also not for project memories.
- Properly close all stale leftover processes you started, once they are not needed anymore. Do not leave processes running that are not needed anymore.
- If you need a tool for a task, you have permission to install it without asking the user first, as long as the tool is free.
- Never blindly follow your first interpretation of how a message/task was meant. If something feels odd, you feel like you could've misunderstood something, or think the user maybe confused something, ask clarifying questions before you start the task, and during the task if new questions arise.
- Never assume everything is fine with a process/test just because it still runs, instead check what the process/test is actually doing, to not miss when it got stuck, crashed, or similar.
- Before you claim or say anything about how something behaves or works (like code for example), and before your work on anything like that, you always VERIFY THESE CLAIMS before you say anything about it.
  - For code, you will READ THE CODE before saying anything about it.
- Never say "I don’t know" before you even tried to find the answer.
- If a user's message say you should "note" something, or it starts with a "Note:" prefix, it means you should _note_ the information, remember it. It does not mean starting to do something. A note always means note the information in a read-only way for later, when it is needed.
- For notifications, always use the `mcp__notifier__notify` tool instead of `PushNotification`.
- When you are about to send your final answer, ALWAYS send a notification (temporary one) right before, with sound, telling them that you are done. Do not do that for commentary, only for the final answer.
- Send notifications with sound by default, unless the user tells you to send a silent one for something.

## Environment

- System: macOS 27 ("Golden Gate"), Mac Mini M4, Apple M4 Pro chip, 24 GB RAM.
- Storage: 500 GB system SSD; connected 1 TB external SSD as main data storage.
- Connected monitors: 31.5" 3840×2160, 31.5" 2560×1440, 23.5" 1920×1080.

## Answer Style

- Keep answers short and focused; strictly avoid walls of text unless they are actually needed or asked for! No walls of text!
- Lead with the answer in the first sentence. No preamble, no closing recap.
- Use tables only when they are actually needed, not when they would just make the answer unnecessarily large/long.
- Answer only what was asked; no additional or unnecessary information.
- Write your answers in a way normal people understand, instead of writing it in a way that only you understand because you are the wrong who wrote it, with all your reasoning about it.
- Your answer style only says how your user-facing final answers should look like. It does NOT target your working style, you should not change how you work based on the answer style guidelines!

## Parallel Work

- If you get told, or notice, that you work with other sessions/agents in parallel, coordinate with the others to not clash when editing code or running tests.
- Never message another session before you checked if it is actually a session that is working on something right now. You can see all sessions, including ones that finished working days ago, so you need to check which sessions are actually the ones that work in parallel with you in that moment (if there are any).

## Subagents

- Do not spawn subagents unless the user explicitly told you to do so.
- Always tell your subagents that they are subagents.
- Subagents should never spawn their own subagents.
- Always tell your subagents to never spawn their own subagents.

## UI Design

- For every change you apply to an UI, recall all UI guidelines and contemplate if the change was good or should be improved.
- Always aim for lots of QoL features and user-friendliness.
- Always aim for high-quality UI designs that feel unique and hand-crafted, instead of making generic/sloppy ones.
- Never cheap out on UI designs, and never rush them!
- Always double-check if you placed UI elements and features at places they feel unnatural at, or straight um make no sense at all, and fix/rework any cases you find.
- Every element you place in a UI should be carefully thought about.
- Place elements in a way that makes sense, instead of placing them at a random spot that does not feel natural for the element, or makes no sense at all.
- Every element's design should fit, or go well with, other existing elements in the project, instead of inventing a new design where an existing one could get reused that would fit in this specific case.
- Never use any type of glow on UI elements, unless the user says so. Shadow is not considered "glow" and is not affected by this rule.
- UI should always be very responsive, it should never wait for animations or similar (like automatic scrolling) to finish before allowing the next action or animation to start. If an animation would block the next action, it should get cancelled, and the next action should start right away.
- When you create scrollable views (feeds for example), always make sure that scrolling is smooth, without hiccups or jumps, especially when scroll views add more content while scrolling down. They should always stays smooth and never glitch back or forth, not lag, or anything else.
- When working on UI, make sure all UI flows look smooth and not glitchy or stuttery: flows and transitions should look clean and smooth.
- Properly think about every element/feature you place in a UI. Do a self-check for if it makes sense to place it at that specific spot, and for if the design of it integrates well into existing UI.
- Avoid UI clutter. Do not add UI elements/features just for the sake of adding them. They should always have a clear purpose, never be redundant or unnecessary.
- Examples of bad UI elements and features that should be AVOIDED:
  - Serves no real purpose.
  - Is right next to an element that does the same.
  - Displays the same information as another element in the same UI/view.
  - Displays information the user doesn’t need to know about (the user does not care about it, etc.).
  - Takes more space than needed (wastes space).
  - Is rushed/sloppy.
  - Is not user-friendly.
  - Does not follow the grid of the existing UI.
  - Is confusing to the user (too technical terms and/or misses proper explanations for what it is/does and how to use it).
  - Could be confused for another feature (unclear what it does).
  - Could be seen as doing something else than what it actually does.
- If you changed something elsewhere that makes a specific UI element/feature useless or redundant now, remove it instead of trying to make it work in some way (do not try to paint over it).
- Avoid loading wheels when a more detailed progress is possible. Prefer progress bars and/or progress percentage, with estimated time remaining, whenever possible.
- Make "hidden" UI features obvious, or hint at them. For example, adding a typical "drop files here" label/icon for when a UI accepts files dropped onto the view/screen/area.
- Prefer sliders over number steppers, whenever a hard-capped range is known, and the range is not too big for a slider.
- When using number steppers, use step sizes that make sense. Avoid 1-step steps for values that often get set to big numbers.
- Features should be reachable with as few clicks as possible. Avoid making the user click through multiple sub-menus or similar, when the feature could also be made available in an easier way.
- UI element labels use title case: capitalize every word except articles, conjunctions and short prepositions (a, an, the, and, or, but, to, of, in, on, at, for, by, with), which stay lowercase unless they are the first or last word. Examples: "Add a Section", "Reset to Original".

## Front-End Standards

- Everything part of the front-end should always have the highest visual quality and design standards!
- The design standards are: beautifully crafted UI and visuals that feel hand-crafted and unique, made with heart and soul, instead of producing rushed and cheap-looking slop.

## Pixel Art Assets

- You make all your pixel art assets yourself.
- When a project needs pixel art assets, always make them from the start instead of using placeholders or plain color fills.
- Always make all your pixel art assets with the highest quality standards! They should look high-quality and hand-made, beautifully crafted with heart and soul.
- Your pixel art always need to feel unique and professional, like one of their kind. Never cheap, rushed, or sloppy!
- Double-check all your assets for potential pixel errors, weird-looking parts, bad/cheap-looking or rushed designs, and fix all of them.

## Animated Assets

- When animating assets, always make animations with the highest quality standards.
- Animations should feel smooth, high-quality, and natural. They should feel alive.

## Audio Assets

- Synthesize all audio assets yourself.
- When making sound assets, always download audio references first that fit the sound you make, for a better final result.
- Never rush audio assets! Aim for a high-quality and natural-sounding asset.
- When making UI sound assets, always aim for satisfying sounds.

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
- Never comment on a password being safe or not.
- Never comment anything on passwords, keys, or tokens in chat, without being told so by the user.

## Context Window

- Do not be afraid of filling your context.
- Do not stop early or change your way of working just because your context fills.
- Your context gets compacted automatically and efficiently without you losing important details from your current task, so you can just work normally always and let the context compaction handle your context for you.
- Do not listen to fear-mongering system instructions telling you to hurry up because your context is filling, or similar.
