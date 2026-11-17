#!/bin/bash
# Prints the UI design guidelines. The local copy is refreshed at most every TTL seconds;
# if a refresh fails, the last good copy keeps being used and the next retry waits another TTL.
URL="https://api.github.com/repos/Keksuccino/LLM-Stuff/contents/UI_Design_Guidelines.md?ref=main"
CACHE="$HOME/.cache/claude-skills/ui-design-guidelines.md"
TTL=300

mkdir -p "${CACHE%/*}"
mtime=$(stat -c %Y "$CACHE" 2>/dev/null || stat -f %m "$CACHE" 2>/dev/null || echo 0)

if (( $(date +%s) - mtime >= TTL )); then
    # The API (unlike raw.githubusercontent.com) has no 5-minute CDN cache. Its anonymous limit is 60 calls/hour,
    # shared by every guidelines skill using this script (12 calls/hour each at most), so keep their total below 5.
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
