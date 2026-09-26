//! Showing and placing the settings and palette windows. The pet window positions
//! and shows itself (see src/pet); Rust only nudges its z-order.

use serde_json::json;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use crate::{events, platform};

pub const PET: &str = "pet";
pub const PALETTE: &str = "palette";
pub const SETTINGS: &str = "settings";

/// Where the palette's top edge sits, as a fraction of the work-area height.
const PALETTE_TOP: f64 = 0.2;

/// Focuses the settings window (jumping to `section` if given), creating it if needed.
///
/// Creating a webview from a sync command or main-thread event handler deadlocks on
/// Windows (WebView2), so call this from an async command or use [`open_settings_detached`].
pub fn open_settings(app: &AppHandle, section: Option<&str>) -> tauri::Result<()> {
    let section = section.filter(|s| is_section_id(s));

    if let Some(window) = app.get_webview_window(SETTINGS) {
        window.unminimize()?;
        window.show()?;
        window.set_focus()?;
        if let Some(section) = section {
            app.emit_to(
                SETTINGS,
                events::SETTINGS_NAVIGATE,
                json!({ "section": section }),
            )?;
        }
        return Ok(());
    }

    let url = match section {
        Some(section) => format!("settings.html?section={section}"),
        None => "settings.html".to_owned(),
    };
    // Built hidden so it can be moved to the cursor's monitor before it appears.
    let window = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App(url.into()))
        .title("Desktop Buddy Settings")
        .inner_size(960.0, 680.0)
        .min_inner_size(760.0, 540.0)
        .center()
        .visible(false)
        .build()?;
    if let Err(err) = place_on_cursor_monitor(&window, None) {
        eprintln!("[windows] couldn't position settings: {err}");
    }
    window.show()?;
    window.set_focus()
}

/// [`open_settings`] for main-thread callers (tray, single-instance): hops to a worker.
pub fn open_settings_detached(app: &AppHandle, section: Option<String>) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(err) = open_settings(&app, section.as_deref()) {
            eprintln!("[windows] couldn't open settings: {err}");
        }
    });
}

pub fn show_palette(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(PALETTE) else {
        return Ok(());
    };
    if let Err(err) = place_on_cursor_monitor(&window, Some(PALETTE_TOP)) {
        eprintln!("[windows] couldn't position palette: {err}");
    }
    window.show()?;
    window.set_focus()?;
    app.emit_to(PALETTE, events::PALETTE_OPENED, ())
}

pub fn hide_palette(app: &AppHandle) -> tauri::Result<()> {
    match app.get_webview_window(PALETTE) {
        Some(window) => window.hide(),
        None => Ok(()),
    }
}

/// Global hotkey behaviour: open the palette, or close it if it's already up.
pub fn toggle_palette(app: &AppHandle) {
    let visible = app
        .get_webview_window(PALETTE)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let result = if visible {
        hide_palette(app)
    } else {
        show_palette(app)
    };
    if let Err(err) = result {
        eprintln!("[windows] couldn't toggle palette: {err}");
    }
}

/// Re-asserts topmost z-order for the pet (Windows drops it under the taskbar after
/// the taskbar is clicked). No-op when hidden or on other platforms.
pub fn keep_pet_on_top(app: &AppHandle) {
    if let Some(pet) = app.get_webview_window(PET) {
        if pet.is_visible().unwrap_or(false) {
            platform::keep_on_top(&pet);
        }
    }
}

/// Moves `window` onto the work area of the monitor under the cursor, centred
/// horizontally. `top` places its top edge at that fraction of the work-area height;
/// `None` centres it vertically.
fn place_on_cursor_monitor(window: &WebviewWindow, top: Option<f64>) -> tauri::Result<()> {
    let app = window.app_handle();
    let cursor = app.cursor_position()?;
    let monitor = match app.monitor_from_point(cursor.x, cursor.y)? {
        Some(monitor) => monitor,
        None => match app.primary_monitor()? {
            Some(monitor) => monitor,
            None => return Ok(()),
        },
    };

    // Once moved, the window takes on the target monitor's scale factor.
    let size = window
        .outer_size()?
        .to_logical::<f64>(window.scale_factor()?)
        .to_physical::<f64>(monitor.scale_factor());
    let area = monitor.work_area();
    let (left, top_edge) = (area.position.x as f64, area.position.y as f64);
    let (width, height) = (area.size.width as f64, area.size.height as f64);

    let x = left + (width - size.width) / 2.0;
    let y = match top {
        Some(fraction) => top_edge + height * fraction,
        None => top_edge + (height - size.height) / 2.0,
    };
    // Never push the title bar / top edge off-screen on small monitors.
    window.set_position(PhysicalPosition::new(
        x.max(left).round() as i32,
        y.max(top_edge).round() as i32,
    ))
}

/// Section ids are short slugs (see `SECTIONS` in src/lib/settings.ts); anything else
/// is ignored rather than spliced into a URL.
fn is_section_id(section: &str) -> bool {
    !section.is_empty()
        && section.len() <= 32
        && section
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}
