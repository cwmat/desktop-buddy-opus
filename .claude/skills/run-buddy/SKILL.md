---
name: run-buddy
description: Launch Desktop Buddy locally and verify changes visually (pet overlay, settings, palette). Use when asked to run, start, screenshot, or check the app works.
---

# Run & verify Desktop Buddy

## Launch

```bash
pnpm dev          # tauri dev: Vite on :1420 + the Rust app, hot-reloads the frontend
```

Run it in the background; the first Rust build takes ~1–2 min, later ones seconds. Only one instance can run (single-instance plugin) and port 1420 must be free.

- The buddy appears on the taskbar edge of the primary monitor (or at its saved `home`).
- Tray icon: left-click opens Settings, right-click shows the menu.
- Command palette: the global hotkey (default `Alt+Shift+B`).

Stop it (PowerShell):

```powershell
Stop-Process -Name desktop-buddy -Force; Get-NetTCPConnection -LocalPort 1420 -State Listen -EA SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force }
```

## See what's on screen (Windows)

The overlay is transparent, so verify with real screenshots, cropped to the app's windows — never capture the whole desktop (it's the user's screen).

```powershell
powershell -File .claude/skills/run-buddy/windows.ps1              # list app windows + physical bounds
powershell -File .claude/skills/run-buddy/shot.ps1 -Window pet      # screenshot one window's bounds → shot.png
```

Then read the PNG. Window labels: `pet` (title "Desktop Buddy"), `settings`, `palette`.

## Drive it without touching the user's mouse or keyboard

Launch with WebView2's debug port, then evaluate JS inside a window — trigger actions, change settings, inspect state — instead of synthesizing input (which would fight whatever the user is doing):

```bash
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223" pnpm dev
node .claude/skills/run-buddy/cdp.mjs pet.html "await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'pet://action', payload: { type: 'treat' } })"
node .claude/skills/run-buddy/cdp.mjs pet.html "return await window.__TAURI_INTERNALS__.invoke('update_settings', { patch: { petId: 'ember' } })"
```

Prefer showing windows *without* focus (`plugin:window|show`) over commands that steal focus while the user is working. If the user is active (`environment_snapshot` → `idleSeconds` near 0), keep tests on a monitor they aren't using.

## Idle cost

The pet runs all day, so check CPU after touching the frame loop, polling or animations:

```powershell
powershell -File .claude/skills/run-buddy/cpu.ps1 -Seconds 10   # per-process CPU + memory for the app and its WebView2 processes
```

Measure release builds for real numbers (debug Rust + dev server roughly double it). A hidden window should show ~0 ms.

## UI without the Rust app

`pnpm web:dev` then open `http://localhost:1420/settings.html` or `/palette.html` in a browser: outside Tauri the dev build installs IPC mocks (`src/lib/dev-mock.ts`), so the settings and palette UIs render with sample data. The pet window needs the real app.

## Saved state

`%APPDATA%\com.cwmat.desktopbuddy\state.json` holds `{ settings, stats }`. Delete it (app stopped) to get a first-run experience.

## Before calling it done

```bash
pnpm check && pnpm test
cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo fmt --check
```
