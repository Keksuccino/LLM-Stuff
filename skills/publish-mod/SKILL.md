---
name: publish-mod
description: Publish mod builds of all sub-workspaces to CurseForge and Modrinth.
disable-model-invocation: true
---

Please publish the mod builds of all sub-workspaces with their `mod_upload.py` scripts. You have permission to run the uploads by yourself, don't ask for permission for that again.

The script only shows its prompts (the final "Type 'upload'" confirmation, missing config, ambiguous JAR choices) when stdin is a real terminal. Otherwise it stops with an error before anything gets uploaded. So don't pipe input into it, and don't wrap it in `expect` or a pseudo-terminal. Use this two-step flow instead, run from each sub-workspace's root:

1. **Dry run:** `python3 mod_upload.py --dry-run --color never < /dev/null`
   This builds all loaders, picks the upload JARs, validates everything against Modrinth and CurseForge and prints the upload plan, without uploading anything. Gradle builds can take several minutes, so give the command a long timeout and wait until it's done.
   Check that it exits with code 0 and that the upload plan looks right: the expected mod version, Minecraft version and release type, and one plausible JAR per loader.
2. **Upload:** `python3 mod_upload.py --skip-build --yes --color never < /dev/null`
   `--skip-build` uploads exactly the JARs the dry run just built and checked. `--yes` is safe here, because a dry run without a terminal already fails on ambiguous JARs and missing config, so after a clean dry run, `--yes` only answers the final upload confirmation. Never use `--yes` for a sub-workspace without a clean dry run of it first, and don't rebuild or change it between its dry run and its upload.
   Check that it exits with code 0 and reports a Modrinth version and a CurseForge file for every loader.

Do the dry runs of all sub-workspaces first, one after another. Then do the uploads, from the oldest Minecraft version first to the newest Minecraft version last.

- If a dry run fails or reports errors (for example missing config for a mod that was never uploaded before, an ambiguous JAR, or a build error), don't upload that sub-workspace and tell the user what the script reported. Still upload the others.
- If an upload fails partway, don't run it again, because the files that already went through would get uploaded twice. Tell the user exactly which loaders and platforms got uploaded and which didn't.
- Only use `--release-type beta` or `--release-type alpha` when the user asks for it. The default is a normal release.
- Tell the user about all errors and warnings the script reported during the dry runs and uploads.
