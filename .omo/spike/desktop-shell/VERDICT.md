# T3-3 Spike Verdict: Web export inside a minimal Electron shell

## Verdict: GO

The Web export (produced by the repo's own `WebComposer` pipeline) runs correctly
inside a minimal Electron shell with all assets served via a custom privileged
protocol (`galgame://`). All spike assertions passed on the first clean run
(shell exit code 0).

Date: 2026-07-19. Platform: macOS (darwin arm64), Electron 35 (repo's installed
binary, no new deps added).

## What was built (all under `.omo/spike/`, no repo code touched)

| Artifact | Purpose |
|---|---|
| `fixture-project/scripts/main.gal` | Fixture gal script (3 scenes, 背景/BGM metadata, 2 sprites, choice) |
| `fixture-project/gen-assets.mjs` | Zero-dep solid-color PNG generator → `assets/backgrounds/classroom.png`, `assets/sprites/*.png` |
| `vitest.spike.config.ts` + `export.spike.test.ts` | Drives the repo's own export pipeline (`parseProjectScripts` → `WebComposer` → `runComposer`) with real fs, producing `export/` |
| `export/index.html` + `export/assets/**` | The actual Web export under test |
| `desktop-shell/main.cjs` | Minimal Electron shell (the spike subject) |
| `desktop-shell/results.json` | Machine-readable assertion results |
| `../screenshot.png` | Visual evidence (blue background, pink sprite left, dialogue box, save bar) |

## Mechanism that worked

1. **Privileged scheme registration** (before `app.whenReady`):
   ```js
   protocol.registerSchemesAsPrivileged([{
     scheme: 'galgame',
     privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
   }])
   ```
2. **URL mapping** (Electron 35 `protocol.handle`, not the deprecated
   `registerFileProtocol`): `galgame://app/<path>` → `<exportDir>/<path>` via
   `net.fetch(pathToFileURL(file))`, wrapped in try/catch → `404 Response`
   (an uncaught `ERR_FILE_NOT_FOUND` rejection surfaces to the renderer as
   `net::ERR_UNEXPECTED` — the handler MUST catch).
3. **Entry**: `win.loadURL('galgame://app/index.html')`.
4. **webPreferences**: `nodeIntegration: false`, `contextIsolation: true` (default sandbox) — no preload needed; the export is a self-contained static page.
5. The web player references assets as **relative URLs** (`assets/...`) from
   `index.html`, which resolve to `galgame://app/assets/...` and are served by
   the protocol handler. No `file://`, no CORS issues.

## Measured results (from `results.json`, shell run 16:41 local)

- **(a) Load**: `didFailLoad: []` — zero load failures. `did-finish-load` fired.
- **(b) DOM content**: first dialogue rendered —
  `dialogueText = "SPIKE_OK: 今天的樱花,真漂亮呢。"`, `character = "小雪"`,
  `bodyHasMarker = true`. Background CSS applied
  (`bgImage = url("assets/backgrounds/classroom.png")`), sprite `<img>` mounted
  (`spriteCount = 1`). Screenshot visually confirms all layers + save bar.
- **(c) Failed asset requests**: `failedRequests: []` — zero. Additionally an
  in-page `fetch('assets/sprites/yuki_smile.png')` probe returned **HTTP 200,
  ok=true** (proves `supportFetchAPI` works under the custom scheme — relevant
  if a future PixiJS-based desktop player uses `fetch`/`Assets.load`).
  Only console "error" is Electron's dev-mode CSP security warning (benign,
  disappears when packaged; MVP can set a CSP meta tag).
- **(d) Screenshot**: captured via `webContents.capturePage()` after
  `did-finish-load` + 1.5 s → `.omo/spike/screenshot.png`.
- **Cleanup**: shell self-exits via `app.exit()`; `ps aux | grep -i
  "galide/node_modules\|desktop-shell\|Electron.*galide"` → no processes.
  (Remaining `Electron` processes on the machine are pre-existing unrelated
  apps: OpenCode, Trae CN, Cursor.)

### Bonus findings

- **localStorage works under the custom scheme**: write/read probe passed
  (`localStorageProbe = true`). The web player's 3 save slots
  (`galide-save-<projectId>-slot-N`) will persist per `galgame://app` origin.
  Caveat for MVP: storage is keyed by the partition of `session.defaultSession`;
  to isolate games or control persistence location, use a named
  `session.fromPartition('persist:galgame')`.
- **Asset-path gotcha (export-side, not shell-side)**: the DSL requires
  project-root-relative asset paths. A bare `立绘:yuki_smile.png` makes the
  player request `assets/yuki_smile.png` (missing subdir) → 404. First spike
  run caught exactly this (`net::ERR_UNEXPECTED` before the handler learned to
  return 404). Fixture fixed to `立绘:assets/sprites/yuki_smile.png` per DSL
  conventions. MVP shell should surface 404s visibly.

## Remaining risks / open questions for MVP

1. **Window size / scaling**: stage is fixed 1280×720 with `max-width/max-height: 100vw/vh`; letterboxing on non-16:9 windows is CSS-only. MVP shell should default to 1280×720 (+chrome) and decide on resizable/fullscreen policy.
2. **BGM autoplay**: the current Web export **does not play BGM at all** (no `<audio>` element in `web-composer.ts` output) — so autoplay policy is untested. If desktop export later adds audio, Chromium's autoplay policy applies; inside Electron the shell can set `webPreferences: { autoplayPolicy: 'no-user-gesture-required' }` to sidestep it. **Not validated in this spike.**
3. **CSP**: no Content-Security-Policy in export HTML (Electron warns in dev). MVP should add `<meta http-equiv="Content-Security-Policy">` (e.g. `default-src 'self'; img-src 'self' data:`) — note the inline `<script>` in the export would require `'unsafe-inline'` or a hash; prefer extracting the inline script or using a CSP hash.
4. **Save-slot isolation**: multiple games in one shell share the `galgame://app` origin → localStorage keys include projectId, so collisions are unlikely, but storage location/quota is default. Consider `partition` per game.
5. **Path traversal**: handler guards `filePath.startsWith(EXPORT_DIR)`; keep this (or use `path.normalize` + explicit check) in the MVP template.
6. **Chinese/CJK text**: rendered correctly in screenshot (no font fallback issues observed on macOS).
7. **PixiJS desktop player**: this spike validated the DOM-based Web export. The IDE's PixiJS preview runtime is a different renderer; if the desktop export switches to PixiJS, `supportFetchAPI: true` + the fetch probe result here are the relevant evidence, but texture loading via `Assets.load` should be re-spiked.

## Recommended shell template shape (for MVP)

```
desktop-shell/
  main.cjs            # ~80 LOC, this spike's file is the template
    - registerSchemesAsPrivileged (galgame, standard/secure/supportFetchAPI/stream)
    - protocol.handle('galgame') → exportDir mapping, 404 catch, traversal guard
    - BrowserWindow 1280x720, nodeIntegration:false, contextIsolation:true
    - session.fromPartition('persist:galgame')  ← MVP addition
    - autoplayPolicy: 'no-user-gesture-required' ← if BGM is added
    - win.loadURL('galgame://app/index.html')
  export/             # copied Web export (index.html + assets/)
```

Launch: `electron desktop-shell/main.cjs` (dev) — packaging/signing/
auto-updater are deliberately out of scope (electron-builder MVP concern).
