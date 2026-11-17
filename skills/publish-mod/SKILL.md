---
name: publish-mod
description: Publish mod builds of all sub-workspaces to CurseForge and Modrinth.
disable-model-invocation: true
---

Please run the `mod_upload.py` script of all sub-workspaces. Make sure you run them in a way that makes you be able to type in "upload" at the end, because that is needed to confirm the upload. Since the shell is non-interactive, pipe the confirmation in via stdin, e.g. `printf 'upload\n' | python3 mod_upload.py`, run from that sub-workspace's root. Don't use `--yes`, because that would also auto-accept ambiguous JAR choices. If the script stops because it needs other interactive input (missing config, ambiguous JAR), don't upload that one and tell the user. You have permission to do that by yourself, don't ask for permission for that again.

Upload the builds from the oldest Minecraft version first, to the newest Minecraft version last.

Don't upload if the script reports errors or something. Also make sure to tell the user about errors during upload, if any get reported.
