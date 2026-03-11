use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

mod metal_overlay;

#[tauri::command]
fn hide_window(window: tauri::Window) {
    let _ = window.hide();
    let _ = window.set_ignore_cursor_events(true);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![hide_window])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            metal_overlay::attach(&window)?;
            let _ = window.set_visible_on_all_workspaces(true);
            let _ = metal_overlay::reinforce_level(&window);

            // Hide window initially to avoid preempting desktop on startup
            let _ = window.hide();
            let _ = window.set_ignore_cursor_events(true);

            // Register global shortcut Cmd+Shift+D
            let shortcut = Shortcut::new(
                Some(Modifiers::SUPER | Modifiers::SHIFT),
                Code::KeyD,
            );

            let window_clone = window.clone();
            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                // Press shortcut once to bring up toolbar, regardless of current state
                let _ = metal_overlay::reinforce_level(&window_clone);
                let _ = window_clone.show();
                let _ = window_clone.set_focus();
                let _ = window_clone.set_ignore_cursor_events(false);
            })?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
