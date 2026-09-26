# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, …) working in this repo. Humans: see [README.md](README.md).

## What this is

**Desktop Buddy** — a tiny animated pixel-art pet that lives in a transparent, always-on-top overlay. Tauri 2 (Rust) + Svelte 5 + TypeScript. Cross-platform, Windows-first.

## Layout

```
src/
  lib/            shared TS used by every window
    settings.ts   Settings type, defaults, SETTING_DEFS (drives settings UI + palette), normalizeSettings
    stats.ts      tamagotchi-lite needs (happiness/fullness), decay/feed/pat
    events.ts     app-wide event names + PetAction + typed emit/listen helpers
    ipc.ts        typed wrappers for Rust commands
    commands.ts   command-palette command registry (built from settings + pets)
    ui/           shared Svelte components + theme tokens
  pets/           the buddy roster — one data file per buddy (see add-buddy skill)
  pet/            pet overlay window runtime (renderer, behaviour "brain", input, effects)
  settings/       settings window (Svelte)
  palette/        command palette window (Svelte)
src-tauri/        Rust shell: state store, tray, global hotkey, window management, Win32 platform bits
scripts/          dev scripts (sprite previews, app icon)
```

## Commands

```bash
pnpm dev                 # run the app (tauri dev)
pnpm check               # svelte-check + TypeScript
pnpm test                # vitest (pure logic + pet validation)
pnpm pets:preview [id]   # render sprite sheets to previews/*.png
pnpm icon [id]           # regenerate app icons from a buddy sprite
pnpm build               # release build + installers (src-tauri/target/release/bundle)
cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo fmt --check
```

Definition of done: `pnpm check`, `pnpm test`, clippy and fmt all clean. For behaviour/visual changes, run the app and look (see the `run-buddy` skill).

## Architecture rules

- **Settings live in TypeScript.** `src/lib/settings.ts` is the schema; Rust stores settings as opaque JSON, shallow-merges patches and only reads the few keys it acts on (hotkey, autostart, tray state). To add a setting: add the field + default + `normalizeSettings` line + a `SETTING_DEFS` entry — the settings window and command palette pick it up automatically. Gate platform-specific ones with `platforms`.
- **One write path:** every settings change goes through `updateSettings()` → Rust `update_settings` → persisted → `settings://changed` broadcast. Windows never mutate each other directly; they react to events.
- **Pet actions** (treat, pat, go-home, …) are `pet://action` events handled only by the pet window. The tray, palette, settings and right-click menu all just emit them.
- **Coordinates** crossing the TS/Rust boundary are physical pixels on the virtual desktop. The pet's position is its *feet anchor* (bottom-centre of the sprite).
- **Keep contracts in sync:** `src/lib/ipc.ts` ↔ `src-tauri/src/commands.rs`, `src/lib/events.ts` ↔ `src-tauri/src/events.rs`.
- **Behaviour logic stays pure** (`src/pet/brain.ts`, no Tauri imports) so it can be unit-tested; Tauri calls live at the edges.
- Windows-only features use `cfg(windows)` in Rust and degrade gracefully (return `None`/`false`) elsewhere.

## Conventions

- Pragmatic and readable over clever. Small focused modules, clear names, comments that explain *why*. No speculative abstractions.
- TS: 2-space indent, single quotes, semicolons, `strict`. Svelte 5 runes; components need `<script lang="ts">`.
- Rust: rustfmt defaults, clippy-clean, small `unsafe` blocks each with a `SAFETY:` comment, commands return `Result<_, String>` when they can fail.
- Tests for pure logic (vitest, colocated `*.test.ts`). Don't test Tauri glue with mocks-of-mocks.
- New dependencies need a clear reason; prefer the platform and what's already here.
- New Tauri window APIs used from JS may need a permission in `src-tauri/capabilities/default.json`.

## Gotchas (learned the hard way)

- Windows declared in `tauri.conf.json` use `create: false` and are built in `setup` *after* state is managed — their scripts call commands immediately.
- Creating a webview from a **sync** command deadlocks on Windows; use an `async` command (see `open_settings`).
- Hidden webviews keep running JS and `requestAnimationFrame`. Stop animations while a window is hidden (the palette lives all session).
- The pet loop is adaptive (calm ≈10 Hz, busy = rAF); keep idle work near zero and re-measure after touching it (`run-buddy` skill, `cpu.ps1`).
- Fullscreen detection is per-monitor geometry. `SHQueryUserNotificationState` is system-wide — it would hide pets on every monitor.
- A `.svelte` file without `<script lang="ts">` is treated as untyped JS by svelte-check, breaking typed imports of it.

## Git

- `main` stays releasable; work on branches: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- [Conventional Commits](https://www.conventionalcommits.org/) (`feat: add sleepy capybara`), small logical commits.
- Open PRs with the GitHub CLI: `gh pr create --fill` (repo: `cwmat/desktop-buddy-opus`). Don't push directly to `main`.
