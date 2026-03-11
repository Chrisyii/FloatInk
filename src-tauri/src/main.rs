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

            // 初始时隐藏窗口，避免启动时抢占桌面
            let _ = window.hide();
            let _ = window.set_ignore_cursor_events(true);

            // 注册全局快捷键 Cmd+Shift+D
            let shortcut = Shortcut::new(
                Some(Modifiers::SUPER | Modifiers::SHIFT),
                Code::KeyD,
            );

            let window_clone = window.clone();
            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                // 按一次快捷键就调出工具栏，不管当前状态
                let _ = window_clone.show();
                let _ = window_clone.set_focus();
                let _ = window_clone.set_ignore_cursor_events(false);
            })?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
