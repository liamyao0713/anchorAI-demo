# Browser check

Static checks assert against source text. They cannot see that a heading was torn
in half, that a bundle is stale, or that ten `**` pairs reached the screen — all
of which shipped during the 2026-09-13 work and were caught by looking at a
screenshot instead.

    ./run.sh                                  # against http://127.0.0.1:8000
    ./run.sh https://your-api.example "问题"

It serves the repo on :8899, drives a throwaway headless Chrome over the DevTools
protocol, submits the question, waits for panel B, prints the computed styles it
measured, toggles the Track/Clean switch both ways, and writes `shot.png`.

**Open `shot.png` and look at it.** The script passing is not the check; the
screenshot is. Bump the shared `?v=` stamp in `index.html` first, or the browser
serves the bundle from before your change.
