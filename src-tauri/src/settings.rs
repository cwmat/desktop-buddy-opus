//! Rust's view of the handful of settings it acts on, and the single write path for
//! settings changes (used by the `update_settings` command and the tray menu alike).
//!
//! The schema and the real defaults live in `src/lib/settings.ts`; Rust stores the
//! object opaquely and only reads the keys below.

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;

use crate::{
    events, hotkey,
    store::{JsonObject, Store},
    tray,
};

// Defaults mirror `DEFAULT_SETTINGS` in src/lib/settings.ts — keep them in sync.
pub const DEFAULT_PET_ID: &str = "quackers";
pub const DEFAULT_MOVEMENT: Movement = Movement::Roam;
pub const DEFAULT_CLICK_THROUGH: bool = false;
pub const DEFAULT_LAUNCH_AT_LOGIN: bool = false;
pub const DEFAULT_HOTKEY: &str = "Alt+Shift+B";

/// Mirror of the TS `MovementMode`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Movement {
    Stay,
    Roam,
    RoamWhenIdle,
}

impl Movement {
    pub const ALL: [Movement; 3] = [Movement::Stay, Movement::Roam, Movement::RoamWhenIdle];

    pub fn as_str(self) -> &'static str {
        match self {
            Movement::Stay => "stay",
            Movement::Roam => "roam",
            Movement::RoamWhenIdle => "roam-when-idle",
        }
    }

    /// Menu label; matches the option labels in `SETTING_DEFS`.
    pub fn label(self) -> &'static str {
        match self {
            Movement::Stay => "Stay put",
            Movement::Roam => "Roam freely",
            Movement::RoamWhenIdle => "Roam when idle",
        }
    }

    pub fn parse(value: &str) -> Option<Movement> {
        Movement::ALL.into_iter().find(|m| m.as_str() == value)
    }
}

#[derive(Debug)]
pub struct SettingsView {
    pub pet_id: String,
    pub movement: Movement,
    pub click_through: bool,
    pub launch_at_login: bool,
    pub palette_hotkey: String,
}

impl SettingsView {
    pub fn from_map(map: &JsonObject) -> Self {
        let string = |key: &str| {
            map.get(key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
        };
        let boolean =
            |key: &str, default: bool| map.get(key).and_then(Value::as_bool).unwrap_or(default);
        Self {
            pet_id: string("petId").unwrap_or(DEFAULT_PET_ID).to_owned(),
            movement: string("movement")
                .and_then(Movement::parse)
                .unwrap_or(DEFAULT_MOVEMENT),
            click_through: boolean("clickThrough", DEFAULT_CLICK_THROUGH),
            launch_at_login: boolean("launchAtLogin", DEFAULT_LAUNCH_AT_LOGIN),
            palette_hotkey: string("paletteHotkey").unwrap_or(DEFAULT_HOTKEY).to_owned(),
        }
    }

    pub fn current(app: &AppHandle) -> Self {
        Self::from_map(&app.state::<Store>().settings())
    }
}

/// Shallow-merges `patch` into the settings, applies OS side effects, persists, and
/// broadcasts `settings://changed`. Side effects run first so a failure (bad hotkey,
/// autostart error) changes nothing and is reported to the caller.
pub fn update(app: &AppHandle, patch: Value) -> Result<Value, String> {
    let Value::Object(patch) = patch else {
        return Err("Settings patch must be a JSON object.".into());
    };

    let store = app.state::<Store>();
    let mut preview = store.settings();
    let before = SettingsView::from_map(&preview);
    preview.extend(patch.clone());
    let after = SettingsView::from_map(&preview);

    let autostart_changed = after.launch_at_login != before.launch_at_login;
    if autostart_changed {
        set_launch_at_login(app, after.launch_at_login)?;
    }
    // Not "if it changed": the stored hotkey may not be the registered one (another app
    // held it at login), so re-sending the same one retries it and reports any conflict.
    // `hotkey::set` is a no-op when it's already registered.
    if patch.contains_key("paletteHotkey") {
        if let Err(err) = hotkey::set(app, &after.palette_hotkey) {
            if autostart_changed {
                if let Err(undo) = set_launch_at_login(app, before.launch_at_login) {
                    eprintln!("[settings] couldn't roll back launch at login: {undo}");
                }
            }
            return Err(err);
        }
    }

    let merged = Value::Object(store.merge_settings(patch));
    if let Err(err) = app.emit(events::SETTINGS_CHANGED, &merged) {
        eprintln!("[settings] couldn't broadcast change: {err}");
    }
    // Rebuilding the tray menu is only worth it when something it shows changed; sliders
    // write on every tick.
    if after.pet_id != before.pet_id
        || after.movement != before.movement
        || after.click_through != before.click_through
    {
        tray::refresh(app);
    }
    Ok(merged)
}

fn set_launch_at_login(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let autostart = app.autolaunch();
    let result = if enabled {
        autostart.enable()
    } else if autostart.is_enabled().unwrap_or(true) {
        // `disable` errors when there is no entry to remove, so only call it when needed.
        autostart.disable()
    } else {
        Ok(())
    };
    result.map_err(|err| format!("Couldn't update launch at login: {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn view(value: Value) -> SettingsView {
        SettingsView::from_map(value.as_object().unwrap())
    }

    #[test]
    fn defaults_apply_to_missing_or_invalid_keys() {
        let v =
            view(json!({ "movement": "teleport", "clickThrough": "yes", "paletteHotkey": "  " }));
        assert_eq!(v.pet_id, DEFAULT_PET_ID);
        assert_eq!(v.movement, DEFAULT_MOVEMENT);
        assert!(!v.click_through);
        assert_eq!(v.palette_hotkey, DEFAULT_HOTKEY);
    }

    #[test]
    fn reads_known_keys() {
        let v = view(json!({
            "petId": "glorp",
            "movement": "roam-when-idle",
            "clickThrough": true,
            "launchAtLogin": true,
            "paletteHotkey": "Ctrl+Space",
        }));
        assert_eq!(v.pet_id, "glorp");
        assert_eq!(v.movement, Movement::RoamWhenIdle);
        assert!(v.click_through && v.launch_at_login);
        assert_eq!(v.palette_hotkey, "Ctrl+Space");
    }
}
