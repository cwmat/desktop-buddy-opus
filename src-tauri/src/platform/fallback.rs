//! Non-Windows stand-ins: report "unknown" so the pet skips these features.

use tauri::WebviewWindow;

use super::{ForegroundWindow, ScreenRect};

pub fn idle_seconds() -> Option<f64> {
    None
}

pub fn foreground_window() -> Option<ForegroundWindow> {
    None
}

pub fn fullscreen_monitor() -> Option<ScreenRect> {
    None
}

/// Only Windows needs topmost re-asserted; `alwaysOnTop` suffices elsewhere.
pub fn keep_on_top(_window: &WebviewWindow) {}

/// Handing focus back after the pet's menu is only implemented on Windows.
pub fn restore_foreground(_pet: &WebviewWindow) {}
