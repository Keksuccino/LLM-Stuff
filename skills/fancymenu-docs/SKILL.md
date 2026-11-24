---
name: fancymenu-docs
description: Workflow, writing style and image tools for FancyMenu's END-USER-FACING documentation (the Keksuccino/docs_fancymenu repo, shown on docs.fancymenu.net). Invoke this skill FIRST, before reading or changing anything, whenever you update, rewrite, add, remove, review or plan pages of the FancyMenu docs, or make screenshots or GIFs for them. Do NOT invoke it for FancyMenu code, code comments, Javadoc, developer docs, changelogs or Markdown files inside the mod workspaces (like TESTING_GUIDELINES.md).
---

# FancyMenu Docs

Follow this for the whole docs task.

# Where Things Are

- Repo: `Keksuccino/docs_fancymenu`, branch `wiki-2026`. Local clone: `/Volumes/STUFF/CODING/WORKSPACES/Java/Minecraft Mods/docs_fancymenu`.
  - `docs/`: the pages. The only text you edit.
  - `assets/`: images and GIFs of the pages.
  - `localizations/`: automated translations. Never edit them.
- Pages get read from GitHub but shown on docs.fancymenu.net, so images need full URLs.
- Source of truth: the FancyMenu workspaces (`fancymenu-<mc version>`, newest first). UI texts: `common/src/main/resources/assets/fancymenu/lang/en_us.json`.
- Tools for images and page checks: `/Volumes/STUFF/CODING/WORKSPACES/Java/Minecraft Mods/fancymenu_agent_root/docs_tools/`. Read its `README.md` before making images. Commit and push changes to them right away (branch `agent_root`).
- This skill: installed in `~/.claude/skills/fancymenu-docs/`, kept in `Keksuccino/LLM-Stuff` at `skills/fancymenu-docs/SKILL.md`. When you change it, change both and push.

# Workflow

1. Update the clone: `git fetch` and `git merge --ff-only origin/wiki-2026` (clean tree only).
2. Find out what's true now, in the code. Commits, changelogs and old pages are hints, not proof.
   - For a release: read the commit range of the newest workspace and diff `en_us.json` for new and changed UI texts.
   - Verify every label, default, identifier, path and behavior you write. Identifiers are in the constructors (`super("...")`).
3. Read the whole page, and grep `docs/` for links into it. Keep headings that other pages link to.
   - Change other pages too whenever the work needs it, like links or statements that contradict your page.
   - Merging or deleting a page: keep the file name of the page that stays, so its URL stays. Move removed pages to the trash, fix every link into them, and leave their `localizations/` copies alone.
4. Write the page (see below).
5. Add screenshots or GIFs where they help. Look at every image before using it.
6. Run `docs_tools/checks/check_page.py` on every page you changed. Every link, anchor and image path has to resolve, and every UI label has to match `en_us.json`. It also lists bold text that isn't a label, so read the list.
7. Commit and push every change to `wiki-2026` right away, without being asked: the pages go live from GitHub. Commit messages: `docs: <what changed>`. Then check that every new image URL returns 200. The site (Vicky) only picks up changes on its refresh interval, or when the user clicks **Refresh docs** in its admin panel, so the live site can lag behind.
8. In your report, list every place where the page mentions something its target page doesn't document yet (actions, placeholders, requirements, listeners, shortcuts, settings).

# Writing Style

- Readers are players and modpack makers, not developers. Write for someone who isn't tech-savvy.
- Compact, direct and friendly. Only what's needed: no filler, no marketing, no repeating.
- Keep this style even when older pages don't have it.
- Describe how things work, not how they changed. Never write "new", "now" or "since 3.x". Old-layout behavior is a plain fact: "Elements from older layouts have them off."
- UI labels exactly as in the game, in bold and without their value, but with suffixes like `[HEX]`: **Text Content**, **Show Background**, **Scroll Grabber Color [HEX]**. Menu paths with `->`: **menu bar -> Customization -> Profiles**.
- Bold isn't limited to UI labels. The page checker lists other bold text only so you can read it over, not as errors.
- Shortcuts in code style: `Ctrl + B`, with "(`Cmd` on macOS)" where it applies.
- Everything with `$$` is a variable: the user's own, `$$value` of sliders and checkboxes, `$$list_entry` of For Each loops and the ones listeners give. Never call them values or placeholders, and don't mention that the mod calls them values in some places.
- Short sections and paragraphs. Lists for steps and options. Tables only for real reference data (settings with explanations, syntax overviews).
- Code blocks for everything users type, with realistic examples a modpack maker would write.
  - Element IDs of custom elements are long random strings, so never make up readable ones like `join_button`. Use Vanilla IDs like `mc_titlescreen_multiplayer_button` and point to **Copy Element ID**.
- Admonitions, sparingly: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`.
- Link related pages with `/`: `[Placeholders](/placeholders)`. Anchors are GitHub-style slugs: `/listeners#on-markdown-text-clicked`. Never `./page`: the site only keeps links that start with `/`, `#`, `http(s):` or `mailto:`, and turns the rest into `#`.
- Keep guide pages (how to use a feature) apart from reference pages (syntax, lists), and link both ways with a TIP near the top.

# Page Format

- Front matter: only `title` and `description`.
- `# Title` first, then `#` for main sections and `##`/`###` below.
- List pages (actions, requirements, placeholders, listeners, elements, decoration overlays) all use the same structure: `# All <Things>` with one intro sentence, then `##` categories, then `###` entries named like in the game. Entries with an identifier say it right below their heading, as `**Identifier:** `show_toast``. Never put identifiers into headings.
- Images: `<img width="<native width, max 800>" alt="<what it shows>" src="https://raw.githubusercontent.com/Keksuccino/docs_fancymenu/refs/heads/wiki-2026/assets/<file>?raw=true">`
- Asset names: lowercase with underscores, by topic, like `markdown_lists.png` or `text_editor_showcase.gif`.

# Screenshots and GIFs

- Always real in-game renders from an off-screen test client, made with `docs_tools`. Never mockups of the game. Only things outside of the game, like the Alice chat on the Export for AI page, get drawn, and only when the user asks for them.
- Screenshots: crop to the feature with a bit of background around it, at GUI scale 2. Optimize with `oxipng`.
- GIFs: one workflow each, about 20 to 30 seconds and about 1 MB.
  - Show the cursor, a ripple for every click and a badge for every key combination.
  - Readable at 800 px width: FancyMenu UI scale **colossal**.
  - Hide distractions (editor grid, editor widgets) and hold the result for a few seconds at the end.
- Use the Pixel look and the defaults of new elements, unless the page is about something else.
- Example texts must make sense to readers, like patch notes, welcome texts or rules. Text elements replace placeholders everywhere, even in code, so don't put placeholders in examples that should show as text.
- The harness only gets copied into a workspace while recording. Never commit it there.
