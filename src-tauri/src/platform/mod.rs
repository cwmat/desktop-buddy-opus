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

pub use imp::{foreground_window, fullscreen_monitor, idle_seconds, keep_on_top};

/// A rectangle on the virtual desktop in physical pixels (`ScreenRect` in src/lib/ipc.ts).
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}
