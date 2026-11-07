# Phrase Replacer — Chrome extension

Finds phrases you choose on any web page and replaces them with your own text.

## Install (unpacked)
1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select the `extension/` folder.
3. Pin the extension and click its icon to add rules.

## Using it
- **Add rule** → type the phrase to find and the replacement. Changes save automatically and apply to open tabs immediately.
- **Match case** — only match the exact capitalization.
- **Whole word** — `cat` won't match inside `concatenate`.
- Per-rule checkbox turns a single rule on/off; the header switch turns the whole extension off (pages revert to their original text).
- **Export / Import** — copy your rules as JSON, or paste JSON to add rules.

Notes: replacement text is inserted literally and never re-scanned (so `cat → cats` won't loop, and rules don't chain). Text in inputs, textareas, editable areas, scripts and styles is left alone. Content added later (infinite scroll, SPAs) is handled too. A phrase split across separate elements (e.g. `New <b>York</b>`) is not matched.

## Development
```
npm test            # lint + unit tests + end-to-end tests in real Chromium
npm run test:unit   # matching logic (node:test)
npm run test:e2e    # loads the extension in headless Chromium via Playwright
npm run package     # zip extension/ for the Chrome Web Store
```
The end-to-end tests need Playwright with Chromium available (`PLAYWRIGHT_PATH` can point at it).
