#!/bin/bash
# Prints the asset guidelines. The local copy is refreshed at most every TTL seconds;
# if a refresh fails, the last good copy keeps being used and the next retry waits another TTL.
API_PATH="repos/Keksuccino/LLM-Stuff/contents/Asset_Guidelines.md?ref=main"
CACHE="$HOME/.cache/claude-skills/asset-guidelines.md"
TTL=300
TIMEOUT=10

mkdir -p "${CACHE%/*}"
mtime=$(stat -c %Y "$CACHE" 2>/dev/null || stat -f %m "$CACHE" 2>/dev/null || echo 0)

# Prints the file through the GitHub CLI's login, which has its own limit of 5,000 calls/hour.
# gh has no timeout option, so it gets stopped after TIMEOUT seconds.
fetch_with_gh() {
    gh api -H "Accept: application/vnd.github.raw+json" "$API_PATH" 2>/dev/null &
    local pid=$! waited=0
    while kill -0 "$pid" 2>/dev/null; do
        if (( waited >= TIMEOUT * 10 )); then
            kill "$pid" 2>/dev/null
            break
        fi
        sleep 0.1
        waited=$((waited + 1))
    done
    wait "$pid" 2>/dev/null
}

# Prints the file through an anonymous request, for when gh is missing, logged out or fails.
# The anonymous limit is only 60 calls/hour, shared by everything on this machine.
fetch_anonymously() {
    curl -fsL --max-time "$TIMEOUT" -H "Accept: application/vnd.github.raw+json" "https://api.github.com/$API_PATH"
}

if (( $(date +%s) - mtime >= TTL )); then
    # The API (unlike raw.githubusercontent.com) has no 5-minute CDN cache.
    if { content=$(fetch_with_gh) && [ -n "$content" ]; } || { content=$(fetch_anonymously) && [ -n "$content" ]; }; then
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
