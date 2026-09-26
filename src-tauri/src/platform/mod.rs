//! OS integration the pet runtime polls: idle time, the foreground window and
//! fullscreen detection. Implemented for Windows; elsewhere everything degrades to
//! "unknown" (`None` / `false`) and the pet simply doesn't use those features.

use serde::Serialize;

#[cfg(windows)]
#[path = "windows.rs"]
mod imp;

#[cfg(not(windows))]
#[path = "fallback.rs"]
mod imp;

pub use imp::{
    foreground_window, fullscreen_monitor, idle_seconds, keep_on_top, restore_foreground,
};

/// A rectangle on the virtual desktop in physical pixels (`ScreenRect` in src/lib/ipc.ts).
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// An app window the pet may perch on (`ForegroundWindow` in src/lib/ipc.ts).
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct ForegroundWindow {
    /// Stable for the window's lifetime (the HWND on Windows), so the pet can tell two
    /// windows of the same size apart.
    pub id: i64,
    #[serde(flatten)]
    pub rect: ScreenRect,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn foreground_window_serializes_flat_like_ipc_ts() {
        let rect = ScreenRect {
            x: -10,
            y: 20,
            width: 300,
            height: 200,
        };
        let window = ForegroundWindow { id: 42, rect };
        assert_eq!(
            serde_json::to_value(window).unwrap(),
            json!({ "id": 42, "x": -10, "y": 20, "width": 300, "height": 200 })
        );
    }
}
