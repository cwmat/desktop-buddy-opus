//! Non-Windows stand-ins: report "unknown" so the pet skips these features.

use tauri::WebviewWindow;

use super::ScreenRect;

pub fn idle_seconds() -> Option<f64> {
    None
}

pub fn foreground_window() -> Option<ScreenRect> {
    None
}

pub fn fullscreen_monitor() -> Option<ScreenRect> {
    None
}

/// Only Windows needs topmost re-asserted; `alwaysOnTop` suffices elsewhere.
pub fn keep_on_top(_window: &WebviewWindow) {}
