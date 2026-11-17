#!/bin/bash
# Prints the Minecraft modding guidelines. The local copy is refreshed at most every TTL seconds;
# if a refresh fails, the last good copy keeps being used and the next retry waits another TTL.
URL="https://api.github.com/repos/Keksuccino/LLM-Stuff/contents/Minecraft_Modding_Guidelines.md?ref=main"
CACHE="$HOME/.cache/claude-skills/minecraft-modding.md"
TTL=300

mkdir -p "${CACHE%/*}"
mtime=$(stat -c %Y "$CACHE" 2>/dev/null || stat -f %m "$CACHE" 2>/dev/null || echo 0)

if (( $(date +%s) - mtime >= TTL )); then
    # The API (unlike raw.githubusercontent.com) has no 5-minute CDN cache; 12 calls/hour stays under its 60/hour anonymous limit.
    if content=$(curl -fsL --max-time 10 -H "Accept: application/vnd.github.raw+json" "$URL") && [ -n "$content" ]; then
        # Write to a temp file and rename, so parallel sessions never read a half-written cache.
        tmp=$(mktemp "$CACHE.XXXXXX")
        printf '%s\n' "$content" > "$tmp" && mv -f "$tmp" "$CACHE"
    elif [ -f "$CACHE" ]; then
        touch "$CACHE"
    fi
fi

if [ -f "$CACHE" ]; then
    cat "$CACHE"
else
    echo "ERROR: The guidelines could not be fetched and no cached copy exists."
fi
