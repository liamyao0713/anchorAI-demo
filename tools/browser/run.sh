#!/usr/bin/env bash
# Drive the workspace in a real browser and capture what it looks like.
#
# Static checks cannot see layout. Every defect that reached the site during the
# 2026-09-13 work -- a deploy to a file the page never loads, a stale bundle, a
# corrected panel rendering literal "**" -- was found by looking at a screenshot,
# and none of them by an assertion. So this runs before any frontend change is
# called done.
#
#   ./run.sh [api-base] [question]
#
# Writes shot.png next to itself and prints the computed styles it measured.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
API="${1:-http://127.0.0.1:8000}"
Q="${2:-目前 nerandomilast 治疗特发性肺纤维化（IPF）的证据如何？}"
PORT=8899
DEBUG_PORT=9222
PROFILE="$(mktemp -d)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

cleanup() {
  [[ -n "${HTTP_PID:-}" ]] && kill "$HTTP_PID" 2>/dev/null || true
  [[ -n "${CHROME_PID:-}" ]] && kill "$CHROME_PID" 2>/dev/null || true
  rm -rf "$PROFILE" 2>/dev/null || true
}
trap cleanup EXIT

[[ -x "$CHROME" ]] || { echo "Chrome not found at $CHROME" >&2; exit 1; }

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
HTTP_PID=$!

# CORS on the API allows :8000 and the Pages origin only, and this page is served
# from :8899 -- disabled here, in a throwaway profile, for the check alone.
"$CHROME" --headless=new --remote-debugging-port="$DEBUG_PORT" \
  --user-data-dir="$PROFILE" --disable-web-security --disk-cache-size=1 \
  --window-size=1600,3000 --hide-scrollbars about:blank >/dev/null 2>&1 &
CHROME_PID=$!

for _ in $(seq 1 30); do
  curl -sf -m 1 "http://127.0.0.1:$DEBUG_PORT/json/version" >/dev/null && break
  sleep 0.5
done

node verify.mjs "http://127.0.0.1:$PORT/index.html?api=$API" "$Q" "$PWD/shot.png"
echo
echo "Now LOOK at $PWD/shot.png. A passing script is not the check."
