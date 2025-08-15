## UI Review — instructions for agents

## Purpose

This file explains how `scripts/ui-review.js` works and how to run, extend, and
troubleshoot it. Give this to a future agent who needs to run Puppeteer against
the local site, collect a screenshot and a JSON report, or modify the checks.

Quick checklist (what I'll do)

- Install dependencies (npm install).
- Set `URL` environment variable if testing a non-default host.
- Run the script from the repo root or via npm script.
- Inspect artifacts in `artifacts/` for `homepage.png` and `report.json`.

Contract (inputs / outputs / exit codes)

- Inputs: optional environment variable `URL` (default:
  `http://localhost:3000/`).
- Outputs: `artifacts/report.json` (report object) and `artifacts/homepage.png`
  (full-page screenshot).
- Exit codes: `0` on success; `2` on an unhandled failure (as the script calls
  `process.exit(2)` on fatal errors).

How `scripts/ui-review.js` works (summary)

- Launches Puppeteer in headless mode.
- Opens a new page and sets viewport to 1280×800.
- Listens for page console messages and page errors and collects them.
- Navigates to `URL` with `waitUntil: 'networkidle2'` and a 30s timeout.
- Captures page title, HTML, a screenshot (`artifacts/homepage.png`), and runs a
  couple of checks:
  - whether a `meta[name="viewport"]` tag is present
  - count of `<img>` elements missing an `alt` attribute
- Writes a JSON report (timestamped object) to `artifacts/report.json`.

Where artifacts land

- `artifacts/report.json` — contains: url, status (HTTP status or
  `no-response`), title, missingMetaViewport (boolean), imagesWithoutAlt
  (number), consoleMessages (array), pageErrors (array of strings), screenshot
  (path), timestamp.
- `artifacts/homepage.png` — full-page screenshot taken after navigation.

How to run (PowerShell, repo root)

Important: the agent MUST assume the target server is already running and
reachable (for example, the dev server at `http://localhost:3000/`). The agent
should NOT start, launch, or attempt to manage the server process itself. If the
server is not running, the agent must report that requirement and stop; do not
start services or modify the host to bring the server up.

1. Install deps (once):

```powershell
npm install
```

2. Run the script directly (PowerShell):

```powershell
$env:URL = 'http://localhost:3000/'; node .\scripts\ui-review.js
```

Or run for a remote URL:

```powershell
$env:URL = 'https://example.com'; node .\scripts\ui-review.js
```

If you prefer npm script entries, add a script in `package.json` such as:

```json
"scripts": {
  "ui-review": "node ./scripts/ui-review.js"
}
```

Then run:

```powershell
$env:URL='http://localhost:3000/'; npm run ui-review
```

Common modifications agents will want

- Toggle headless: change `puppeteer.launch({ headless: true })` to
  `headless: false` to watch the browser.
- Change viewport: edit `await page.setViewport({ width: 1280, height: 800 })`.
- Add checks: use `page.$`, `page.$$eval`, or `page.evaluate` to collect DOM
  metrics, accessibility checks, or performance timings.
- Capture additional artifacts: use `page.pdf()` or `page.metrics()` and write
  to the `artifacts/` folder.

Troubleshooting

- Puppeteer installation issues: Puppeteer downloads Chromium during
  `npm install`. If your environment blocks that, either allow the download, use
  `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` and install a system Chromium/Chrome, or
  switch to `puppeteer-core` and provide an executable path. See Puppeteer docs.
- Navigation timeout / no response: Increase the timeout in
  `page.goto(..., { timeout: 30000 })` or verify the `URL` is reachable. If
  running against a dev server, ensure the server is started before running this
  script.
- Permissions/Headless on CI: Some CI environments need Chromium flags (e.g.,
  `--no-sandbox`, `--disable-setuid-sandbox`). Launch with
  `puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] })` when
  required.
- Large pages / memory: Use a narrower viewport or disable `fullPage`
  screenshots when memory is limited.

Edge cases to consider

- App returns a redirect or 3xx — `status` will reflect the final response
  received by Puppeteer.
- Pages that continuously load resources (no network idle) —
  `waitUntil: 'networkidle2'` may never resolve; consider `load` or a fixed
  `waitForTimeout` after navigation.
- Pages heavy on client JS may throw runtime exceptions — check `report.json`'s
  `pageErrors` and `consoleMessages`.

Quality gates & verification steps for agents

1. Ensure `node` and `npm` are installed and `npm install` finishes without
   errors. (PASS/FAIL)
2. Run the script once against a known-good URL. Confirm `artifacts/report.json`
   and `artifacts/homepage.png` exist. (PASS/FAIL)
3. Open `artifacts/report.json` and verify the `status`, `title`, and that
   `timestamp` is recent. (PASS/FAIL)

Example `report.json` fields to check when triaging

- `status`: should be 200 for a successful GET.
- `missingMetaViewport`: true/false depending on presence.
- `imagesWithoutAlt`: 0 indicates good alt coverage.
- `consoleMessages` and `pageErrors`: inspect these for runtime problems.

Suggested small improvements (low risk)

- Add an npm script `ui-review` to `package.json` for discoverability.
- Make `OUT_DIR` configurable via env var (e.g., `OUT_DIR` or `ARTIFACTS_DIR`)
  so CI can collect artifacts easily.
- Add a small unit/integration test that runs the script against a lightweight
  test page and asserts the report exists.

Where to look for related files

- Script: `scripts/ui-review.js`
- Artifacts: `artifacts/` (created by the script)

If you need me to also add an npm script, make `OUT_DIR` configurable, or wire a
small test, tell me which one and I'll implement it.

---

Generated by inspection of `scripts/ui-review.js` on the repository; follow the
PowerShell commands above when running on Windows.
