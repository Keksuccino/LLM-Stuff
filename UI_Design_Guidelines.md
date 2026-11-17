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
