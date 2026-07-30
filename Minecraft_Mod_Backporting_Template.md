Please backport all commits from `3f2efb0c6f84209dd16596a1c4728228d0a1f442` to `f3a88200db82139c57af73e999173e5c8fb06536` (including these two) from the `26.2.0` branch to all other sub-workspaces (26.1.2, 1.21.11, 1.21.1, 1.20.1, 1.19.2).

Make sure to properly backport each commit, while respecting potential changes in surrounding code (Minecraft Vanilla code changes, dependency code changes, etc.). Take your time, don't rush it.

When a specific commit can't be backported to a specific version, don't try to backport it just for the sake of it. Backport only the ones that make sense, or try to reshape/rework the commits for the target branch, if the commit's intended use would make sense in the target branch, but needs to be implemented in a different way there.

You can and should use subagents for this task. Keep the actual backport work to them, while you orchestrate and supervise them. Steer them back on the right track when they are doing something stupid, or manually fix their mistakes if they can't do it themselves. If you notice a subagent might get stupid because its context got compacted too many times, you should switch to a new subagent.

Regularly commit+push the backported commits as NEW commits, with a similar commit description as the original commit, but adjusted for the target branch if needed, so the description says what the commit actually does, instead of just blindly copying the original description.

The goal is reached when all commits that can be backported, got backported to every sub-workspace.
