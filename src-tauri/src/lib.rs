//! Desktop Buddy's Rust shell: state store, tray, global hotkey, window management and
//! the Win32 bits the pet runtime polls. All pet behaviour lives in the frontend.

mod commands;
mod events;
mod hotkey;
mod platform;
mod settings;
mod store;
mod tray;
mod windows;

use std::sync::{Mutex, MutexGuard, PoisonError};

use tauri::{AppHandle, Manager, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

use crate::{settings::SettingsView, store::Store};

pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch just opens settings in this instance.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::open_settings_detached(app, None);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(hotkey::plugin())
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::load_state,
            commands::update_settings,
            commands::save_stats,
            commands::register_pets,
            commands::environment_snapshot,
            commands::keep_pet_on_top,
            commands::restore_foreground,
            commands::open_settings,
            commands::show_palette,
            commands::hide_palette,
            commands::quit_app,
        ])
        .on_window_event(|window, event| {
            // The pet and palette live for the whole session: Alt+F4 hides them instead
            // of destroying windows we can't get back.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if matches!(window.label(), windows::PET | windows::PALETTE) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            // A tray/overlay app: no dock icon on macOS.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            setup(app.handle());
            Ok(())
        })
        .manage(hotkey::ActiveHotkey::default())
        .manage(tray::TrayState::default())
        .run(tauri::generate_context!())
        .expect("error while running Desktop Buddy");
}

fn setup(app: &AppHandle) {
    let config_dir = app.path().app_config_dir().unwrap_or_else(|err| {
        eprintln!("[setup] no app config dir ({err}); using the temp dir");
        std::env::temp_dir().join("desktop-buddy")
    });
    app.manage(Store::load(&config_dir));

    hotkey::register_initial(app, &SettingsView::current(app).palette_hotkey);
    // Without a tray the hotkey and pet menu still work, so don't abort over it.
    if let Err(err) = tray::create(app) {
        eprintln!("[setup] couldn't create tray icon: {err}");
    }

    // The pet and palette are declared in tauri.conf.json with `create: false` and built
    // here, after all state is managed: their scripts call commands as soon as they load.
    // The pet window positions and shows itself; the palette waits for the hotkey.
    for config in &app.config().app.windows {
        if let Err(err) = WebviewWindowBuilder::from_config(app, config).and_then(|w| w.build()) {
            eprintln!("[setup] couldn't create the {} window: {err}", config.label);
        }
    }
}

/// Flushes state and exits. Shared by the `quit_app` command and the tray.
pub(crate) fn quit(app: &AppHandle) {
    app.state::<Store>().flush();
    app.exit(0);
}

/// Locks a mutex, recovering from poisoning: our guarded data stays valid even if a
/// holder panicked, and a pet app should never crash over it.
pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}
