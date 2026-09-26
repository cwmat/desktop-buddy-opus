//! Commands invoked from the frontend. Mirror of `src/lib/ipc.ts`.
//! SKELETON: stubs only — real implementations to follow.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    platform: &'static str,
    version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSnapshot {
    idle_seconds: Option<f64>,
    foreground_window: Option<ScreenRect>,
    fullscreen_active: bool,
}

#[derive(Deserialize)]
pub struct PetSummary {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    name: String,
}

fn platform() -> &'static str {
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
    AppInfo { platform: platform(), version: app.package_info().version.to_string() }
}

#[tauri::command]
pub fn load_state() -> Value {
    json!({ "settings": {}, "stats": {} })
}

#[tauri::command]
pub fn update_settings(patch: Value) -> Result<Value, String> {
    Ok(patch)
}

#[tauri::command]
pub fn save_stats(stats: Value) {
    let _ = stats;
}

#[tauri::command]
pub fn register_pets(pets: Vec<PetSummary>) {
    let _ = pets;
}

#[tauri::command]
pub fn environment_snapshot() -> EnvironmentSnapshot {
    EnvironmentSnapshot { idle_seconds: None, foreground_window: None, fullscreen_active: false }
}

#[tauri::command]
pub fn keep_pet_on_top() {}

#[tauri::command]
pub fn open_settings(section: Option<String>) {
    let _ = section;
}

#[tauri::command]
pub fn show_palette() {}

#[tauri::command]
pub fn hide_palette() {}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
