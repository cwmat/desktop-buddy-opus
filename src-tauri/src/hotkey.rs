//! The global shortcut that toggles the command palette.

use std::sync::Mutex;

use tauri::{plugin::TauriPlugin, AppHandle, Manager, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::{
    lock,
    settings::DEFAULT_HOTKEY,
    store::{JsonObject, Store},
    windows,
};

/// The palette shortcut currently registered with the OS, if any.
#[derive(Default)]
pub struct ActiveHotkey(Mutex<Option<Shortcut>>);

/// We only ever register the palette shortcut, so any press toggles the palette.
pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                windows::toggle_palette(app);
            }
        })
        .build()
}

/// Registers the saved shortcut at startup, falling back to the default if it's unusable
/// (e.g. another app grabbed it first). A working fallback is saved, so the settings
/// show the shortcut that actually opens the palette. Runs before any window exists,
/// so there's no one to broadcast the change to.
pub fn register_initial(app: &AppHandle, accelerator: &str) {
    let Err(err) = set(app, accelerator) else {
        return;
    };
    eprintln!("[hotkey] {err} Falling back to {DEFAULT_HOTKEY}.");
    match set(app, DEFAULT_HOTKEY) {
        Ok(()) => {
            let mut patch = JsonObject::new();
            patch.insert("paletteHotkey".into(), DEFAULT_HOTKEY.into());
            app.state::<Store>().merge_settings(patch);
        }
        Err(err) => eprintln!("[hotkey] {err}"),
    }
}

/// Swaps the palette shortcut. On failure the previous shortcut stays registered.
pub fn set(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let shortcut = parse(accelerator)?;
    let active = &app.state::<ActiveHotkey>().0;
    let previous = *lock(active);
    if previous == Some(shortcut) {
        return Ok(());
    }

    let manager = app.global_shortcut();
    if let Some(previous) = previous {
        if let Err(err) = manager.unregister(previous) {
            eprintln!("[hotkey] couldn't unregister {previous}: {err}");
        }
    }
    if let Err(err) = manager.register(shortcut) {
        eprintln!("[hotkey] couldn't register {accelerator}: {err}");
        let mut restored = None;
        if let Some(previous) = previous {
            match manager.register(previous) {
                Ok(()) => restored = Some(previous),
                Err(err) => eprintln!("[hotkey] couldn't restore {previous}: {err}"),
            }
        }
        *lock(active) = restored;
        return Err(format!(
            "Couldn't use that shortcut: {accelerator} may already be taken by another app."
        ));
    }
    *lock(active) = Some(shortcut);
    Ok(())
}

/// Parses accelerators like `Alt+Shift+B` (as produced by src/lib/ui/hotkey.ts),
/// also accepting `Win`/`Meta` for the Windows key.
fn parse(accelerator: &str) -> Result<Shortcut, String> {
    let normalized = accelerator
        .split('+')
        .map(|token| {
            let token = token.trim();
            match token.to_ascii_lowercase().as_str() {
                "win" | "windows" | "meta" => "Super",
                _ => token,
            }
        })
        .collect::<Vec<_>>()
        .join("+");
    let shortcut: Shortcut = normalized.parse().map_err(|_| {
        format!(
            "Couldn't use that shortcut: \"{accelerator}\" isn't a key combination I recognise."
        )
    })?;
    if hijacks_typing(&shortcut) {
        return Err(
            "Couldn't use that shortcut: hold Ctrl, Alt or Win with your key (or use an F-key) so normal typing still works."
                .into(),
        );
    }
    Ok(shortcut)
}

/// Same rule as the recorder in src/lib/ui/hotkey.ts: the key needs Ctrl, Alt or Win,
/// unless it's F1–F24 (alone or with Shift). Shift alone isn't enough for other keys:
/// Shift+End or Shift+Enter would stop working everywhere else.
fn hijacks_typing(shortcut: &Shortcut) -> bool {
    if shortcut
        .mods
        .intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER)
    {
        return false;
    }
    !is_function_key(shortcut.key)
}

fn is_function_key(key: Code) -> bool {
    // `Code` displays as its name: "F1" … "F24" (and "Fn", which isn't one).
    key.to_string()
        .strip_prefix('F')
        .and_then(|n| n.parse::<u8>().ok())
        .is_some_and(|n| (1..=24).contains(&n))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_common_forms() {
        assert!(parse(DEFAULT_HOTKEY).is_ok());
        assert!(parse("ctrl + space").is_ok());
        assert_eq!(parse("Win+Shift+B"), parse("Super+Shift+B"));
        assert!(parse("CommandOrControl+Shift+P").is_ok());
        assert!(parse("Shift+F9").is_ok());
        assert!(parse("F9").is_ok());
        assert!(parse("F24").is_ok());
        assert!(parse("Ctrl+End").is_ok());
    }

    #[test]
    fn rejects_bad_or_bare_shortcuts() {
        assert!(parse("").is_err());
        assert!(parse("Ctrl+Nope").is_err());
        assert!(parse("Ctrl+Shift").is_err());
        assert!(parse("B").is_err());
        assert!(parse("Shift+B").is_err());
        assert!(parse("Shift+Space").is_err());
        assert!(parse("End").is_err());
        assert!(parse("Shift+End").is_err());
        assert!(parse("Shift+Up").is_err());
        assert!(parse("Shift+Enter").is_err());
        assert!(parse("Shift+Insert").is_err());
        assert!(parse("Shift+Numpad0").is_err());
    }
}
