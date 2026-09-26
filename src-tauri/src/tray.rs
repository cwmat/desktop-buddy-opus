//! System tray icon and menu. The menu is rebuilt from scratch whenever what it shows
//! changes (settings, roster, visibility) — simpler than patching individual items.

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use serde::Deserialize;
use serde_json::json;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

use crate::{
    events::{self, PetAction},
    lock,
    settings::{self, Movement, SettingsView},
    windows,
};

const TRAY_ID: &str = "main";
/// Menu events are app-global (the pet's JS right-click menu fires them too), so our
/// ids carry a prefix and everything else is ignored.
const PREFIX: &str = "tray:";

/// A buddy as the frontend registers it (`PetSummary` in src/lib/ipc.ts).
#[derive(Deserialize, Clone)]
pub struct PetSummary {
    pub id: String,
    pub name: String,
}

#[derive(Default)]
pub struct TrayState {
    pets: Mutex<Vec<PetSummary>>,
    /// Hidden from the tray by the user. Session-only, deliberately not persisted.
    pet_hidden: AtomicBool,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Desktop Buddy")
        .menu(&build_menu(app)?)
        .show_menu_on_left_click(false)
        .on_menu_event(on_menu_event)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                windows::open_settings_detached(tray.app_handle(), None);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn set_pets(app: &AppHandle, pets: Vec<PetSummary>) {
    *lock(&app.state::<TrayState>().pets) = pets;
    refresh(app);
}

/// Rebuilds the menu so it reflects current settings, roster and visibility.
pub fn refresh(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Err(err) = build_menu(app).and_then(|menu| tray.set_menu(Some(menu))) {
        eprintln!("[tray] couldn't rebuild menu: {err}");
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let settings = SettingsView::current(app);
    let state = app.state::<TrayState>();
    let pets = lock(&state.pets).clone();
    let pet_hidden = state.pet_hidden.load(Ordering::Relaxed);

    let item = |id: &str, text: &str| {
        MenuItem::with_id(app, format!("{PREFIX}{id}"), text, true, None::<&str>)
    };
    let check = |id: &str, text: &str, checked: bool| {
        CheckMenuItem::with_id(
            app,
            format!("{PREFIX}{id}"),
            text,
            true,
            checked,
            None::<&str>,
        )
    };
    let separator = || PredefinedMenuItem::separator(app);

    let buddy = Submenu::with_id(app, format!("{PREFIX}buddy"), "Buddy", true)?;
    for pet in &pets {
        buddy.append(&check(
            &format!("pet:{}", pet.id),
            &pet.name,
            pet.id == settings.pet_id,
        )?)?;
    }
    if pets.is_empty() {
        buddy.append(&MenuItem::with_id(
            app,
            format!("{PREFIX}no-pets"),
            "Waking up…",
            false,
            None::<&str>,
        )?)?;
    }

    let movement = Submenu::with_id(app, format!("{PREFIX}movement"), "Movement", true)?;
    for mode in Movement::ALL {
        movement.append(&check(
            &format!("move:{}", mode.as_str()),
            mode.label(),
            mode == settings.movement,
        )?)?;
    }

    Menu::with_items(
        app,
        &[
            &item("treat", "Give treat")?,
            &item("pat", "Pat")?,
            &item("go-home", "Call home")?,
            &item("summon", "Come here")?,
            &separator()?,
            &buddy,
            &movement,
            &check(
                "ghost",
                "Ghost mode (click-through)",
                settings.click_through,
            )?,
            &item(
                "visibility",
                if pet_hidden {
                    "Show buddy"
                } else {
                    "Hide buddy"
                },
            )?,
            &separator()?,
            &item("palette", "Command palette…")?,
            &item("settings", "Settings…")?,
            &separator()?,
            &item("quit", "Quit Desktop Buddy")?,
        ],
    )
}

fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    let Some(id) = event.id().as_ref().strip_prefix(PREFIX) else {
        return;
    };
    match id {
        "treat" => send_action(app, PetAction::Treat),
        "pat" => send_action(app, PetAction::Pat),
        "go-home" => send_action(app, PetAction::GoHome),
        "summon" => send_action(app, PetAction::Summon),
        "ghost" => {
            let ghost = SettingsView::current(app).click_through;
            apply(app, json!({ "clickThrough": !ghost }));
        }
        "visibility" => toggle_pet_visibility(app),
        "palette" => {
            if let Err(err) = windows::show_palette(app) {
                eprintln!("[tray] couldn't show palette: {err}");
            }
        }
        "settings" => windows::open_settings_detached(app, None),
        "quit" => crate::quit(app),
        other => {
            if let Some(pet_id) = other.strip_prefix("pet:") {
                apply(app, json!({ "petId": pet_id }));
            } else if let Some(mode) = other.strip_prefix("move:").and_then(Movement::parse) {
                apply(app, json!({ "movement": mode.as_str() }));
            }
        }
    }
}

/// Same write path as the settings window.
fn apply(app: &AppHandle, patch: serde_json::Value) {
    if let Err(err) = settings::update(app, patch) {
        eprintln!("[tray] couldn't update settings: {err}");
    }
    // Windows flips a check item as soon as it's clicked, and `settings::update` only
    // rebuilds the menu when a shown setting changed: re-clicking the checked buddy
    // would otherwise leave none checked.
    refresh(app);
}

fn send_action(app: &AppHandle, action: PetAction) {
    if let Err(err) = app.emit(events::PET_ACTION, action) {
        eprintln!("[tray] couldn't send pet action: {err}");
    }
}

fn toggle_pet_visibility(app: &AppHandle) {
    let Some(pet) = app.get_webview_window(windows::PET) else {
        return;
    };
    let state = app.state::<TrayState>();
    let hide = !state.pet_hidden.load(Ordering::Relaxed);
    let result = if hide { pet.hide() } else { pet.show() };
    match result {
        Ok(()) => state.pet_hidden.store(hide, Ordering::Relaxed),
        Err(err) => eprintln!("[tray] couldn't toggle buddy visibility: {err}"),
    }
    refresh(app);
}
