//! The global shortcut that toggles the command palette.

use std::sync::Mutex;

use tauri::{plugin::TauriPlugin, AppHandle, Manager, Wry};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::{lock, settings::DEFAULT_HOTKEY, windows};

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

/// Registers the saved shortcut at startup, falling back to the default if it's unusable.
pub fn register_initial(app: &AppHandle, accelerator: &str) {
    if let Err(err) = set(app, accelerator) {
        eprintln!("[hotkey] {err} Falling back to {DEFAULT_HOTKEY}.");
        if let Err(err) = set(app, DEFAULT_HOTKEY) {
            eprintln!("[hotkey] {err}");
        }
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
            "Couldn't use that shortcut: hold Ctrl, Alt or Win with your key so normal typing still works."
                .into(),
        );
    }
    Ok(shortcut)
}

/// Same rule as the recorder in src/lib/ui/hotkey.ts: a modifier is required, and
/// Shift alone only counts for keys that don't type a character (F-keys, arrows, ...).
fn hijacks_typing(shortcut: &Shortcut) -> bool {
    if shortcut
        .mods
        .intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER)
    {
        return false;
    }
    shortcut.mods.is_empty() || types_character(shortcut.key)
}

fn types_character(key: Code) -> bool {
    let name = key.to_string();
    (name.len() == 4 && name.starts_with("Key"))
        || (name.len() == 6 && name.starts_with("Digit"))
        || matches!(
            name.as_str(),
            "Space"
                | "Minus"
                | "Equal"
                | "BracketLeft"
                | "BracketRight"
                | "Backslash"
                | "Semicolon"
                | "Quote"
                | "Backquote"
                | "Comma"
                | "Period"
                | "Slash"
        )
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
    }

    #[test]
    fn rejects_bad_or_bare_shortcuts() {
        assert!(parse("").is_err());
        assert!(parse("Ctrl+Nope").is_err());
        assert!(parse("B").is_err());
        assert!(parse("Shift+B").is_err());
        assert!(parse("Shift+Space").is_err());
        assert!(parse("F9").is_err());
    }
}
