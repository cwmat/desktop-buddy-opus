mod commands;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::load_state,
            commands::update_settings,
            commands::save_stats,
            commands::register_pets,
            commands::environment_snapshot,
            commands::keep_pet_on_top,
            commands::open_settings,
            commands::show_palette,
            commands::hide_palette,
            commands::quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Desktop Buddy");
}
