//! Event names shared with the frontend. Mirror of `EVENTS` in `src/lib/events.ts`.
//!
//! Only the events Rust emits live here; `pet://stats` travels window-to-window.

use serde::Serialize;

/// Rust → all windows after every settings write. Payload: the full settings object.
pub const SETTINGS_CHANGED: &str = "settings://changed";
/// Anyone → pet window. Payload: [`PetAction`].
pub const PET_ACTION: &str = "pet://action";
/// Rust → settings window: jump to a section. Payload: `{ section }`.
pub const SETTINGS_NAVIGATE: &str = "settings://navigate";
/// Rust → palette window each time it is shown. No payload.
pub const PALETTE_OPENED: &str = "palette://opened";

/// The subset of the TS `PetAction` union the tray menu sends.
/// Serializes as `{ "type": "go-home" }` etc.
#[derive(Serialize, Clone, Copy)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum PetAction {
    Treat,
    Pat,
    GoHome,
    Summon,
}
