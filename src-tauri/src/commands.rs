//! Commands invoked from the frontend. Mirror of `src/lib/ipc.ts` — keep the two in sync.
//!
//! Sync commands run on the main thread, which also serializes every settings write
//! with the tray and hotkey handlers. `open_settings` must stay `async`: creating a
//! webview from a sync command deadlocks on Windows.

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::{
    platform::{self, ForegroundWindow, ScreenRect},
    settings,
    store::Store,
    tray::{self, PetSummary},
    windows,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    platform: &'static str,
    version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSnapshot {
    idle_seconds: Option<f64>,
    foreground_window: Option<ForegroundWindow>,
    fullscreen_monitor: Option<ScreenRect>,
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        platform: platform_name(),
        version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
pub fn load_state(store: State<'_, Store>) -> Value {
    store.snapshot()
}

#[tauri::command]
pub fn update_settings(app: AppHandle, patch: Value) -> Result<Value, String> {
    settings::update(&app, patch)
}

/// Async so the file write stays off the UI thread; the pet saves stats often.
#[tauri::command]
pub async fn save_stats(store: State<'_, Store>, stats: Value) -> Result<(), String> {
    let Value::Object(stats) = stats else {
        return Err("Stats must be a JSON object.".into());
    };
    store.set_stats(stats);
    Ok(())
}

#[tauri::command]
pub fn register_pets(app: AppHandle, pets: Vec<PetSummary>) {
    tray::set_pets(&app, pets);
}

#[tauri::command]
pub fn environment_snapshot() -> EnvironmentSnapshot {
    EnvironmentSnapshot {
        idle_seconds: platform::idle_seconds(),
        foreground_window: platform::foreground_window(),
        fullscreen_monitor: platform::fullscreen_monitor(),
    }
}

#[tauri::command]
pub fn keep_pet_on_top(app: AppHandle) {
    windows::keep_pet_on_top(&app);
}

#[tauri::command]
pub fn restore_foreground(app: AppHandle) {
    windows::restore_foreground(&app);
}

#[tauri::command]
pub async fn open_settings(app: AppHandle, section: Option<String>) -> Result<(), String> {
    windows::open_settings(&app, section.as_deref()).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn show_palette(app: AppHandle) -> Result<(), String> {
    windows::show_palette(&app).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn hide_palette(app: AppHandle) -> Result<(), String> {
    windows::hide_palette(&app).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    crate::quit(&app);
}
