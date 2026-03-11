use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(target_os = "macos")]
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, TrackingAreaOptions,
    WebviewWindowExt,
};

mod metal_overlay;

fn log_result<T, E: std::fmt::Display>(context: &str, result: Result<T, E>) -> Option<T> {
    match result {
        Ok(value) => Some(value),
        Err(err) => {
            eprintln!("[floatink] {context}: {err}");
            None
        }
    }
}

// Define NSPanel subclass for the overlay
#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(OverlayPanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true,
            hides_on_deactivate: false
        }
        with: {
            tracking_area: {
                options: TrackingAreaOptions::new()
                    .active_always()
                    .mouse_entered_and_exited()
                    .mouse_moved(),
                auto_resize: true
            }
        }
    })
}

#[cfg(target_os = "macos")]
fn hide_overlay(app_handle: &tauri::AppHandle) {
    if let Ok(panel) = app_handle.get_webview_panel("main") {
        panel.set_ignores_mouse_events(true);
        panel.hide();
    }
}

#[cfg(target_os = "macos")]
fn show_overlay(app_handle: &tauri::AppHandle) {
    if let Ok(panel) = app_handle.get_webview_panel("main") {
        panel.set_ignores_mouse_events(false);
        panel.show_and_make_key();

        // Activate the application so the panel receives mouse events
        // immediately, without requiring an extra click.
        if let Some(mtm) = objc2::MainThreadMarker::new() {
            let app = objc2_app_kit::NSApplication::sharedApplication(mtm);
            app.activate();
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn hide_overlay(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.hide();
    }
}

#[cfg(not(target_os = "macos"))]
fn show_overlay(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_ignore_cursor_events(false);
    }
}

#[tauri::command]
fn hide_window(app_handle: tauri::AppHandle) {
    hide_overlay(&app_handle);
}

fn main() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![hide_window])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // --- System Tray Icon (menu bar) ---
            let toggle_item = MenuItemBuilder::with_id("toggle", "Toggle (⌘⇧D)")
                .build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit FloatInk")
                .build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&toggle_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("FloatInk — ⌘⇧D to toggle")
                .menu(&tray_menu)
                .on_menu_event(move |app_handle, event| {
                    match event.id().as_ref() {
                        "toggle" => {
                            toggle_overlay(app_handle);
                        }
                        "quit" => {
                            app_handle.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // --- Window Setup ---
            let Some(window) = app.get_webview_window("main") else {
                eprintln!("[floatink] setup: main window not found");
                return Ok(());
            };

            // Attach Metal layer to prevent white flash
            let _ = log_result(
                "setup: attach metal overlay",
                metal_overlay::attach(&window),
            );

            // Convert the window to an NSPanel for full-screen overlay support
            #[cfg(target_os = "macos")]
            {
                let panel = window.to_panel::<OverlayPanel>().unwrap();

                // ScreenSaver level (1000) to appear above full-screen apps
                panel.set_level(PanelLevel::ScreenSaver.value());

                // Non-activating panel: won't steal focus from other apps
                panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());

                // Cross-Space and full-screen visibility
                panel.set_collection_behavior(
                    CollectionBehavior::new()
                        .full_screen_auxiliary()
                        .can_join_all_spaces()
                        .stationary()
                        .ignores_cycle()
                        .into(),
                );

                panel.set_hides_on_deactivate(false);
                panel.set_has_shadow(false);

                // Hide initially
                panel.set_ignores_mouse_events(true);
                panel.hide();
            }

            #[cfg(not(target_os = "macos"))]
            {
                let _ = window.set_ignore_cursor_events(true);
                let _ = window.hide();
            }

            // --- Global Shortcut Cmd+Shift+D ---
            let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyD);

            let _ = log_result(
                "setup: register global shortcut",
                app.global_shortcut().on_shortcut(
                    shortcut,
                    move |app_handle, _shortcut, event| {
                        if event.state != ShortcutState::Pressed {
                            return;
                        }
                        let app_handle = app_handle.clone();
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            let app_handle_for_main = app_handle.clone();
                            let _ = log_result(
                                "shortcut: dispatch handler to main thread",
                                app_handle.run_on_main_thread(move || {
                                    let result = std::panic::catch_unwind(
                                        std::panic::AssertUnwindSafe(|| {
                                            toggle_overlay(&app_handle_for_main);
                                        }),
                                    );
                                    if let Err(e) = result {
                                        eprintln!("[floatink] shortcut main-thread handler panicked: {e:?}");
                                    }
                                }),
                            );
                        }));
                        if let Err(e) = result {
                            eprintln!("[floatink] shortcut callback panicked: {e:?}");
                        }
                    },
                ),
            );

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn toggle_overlay(app_handle: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        if let Ok(panel) = app_handle.get_webview_panel("main") {
            if panel.is_visible() {
                hide_overlay(app_handle);
            } else {
                show_overlay(app_handle);
            }
            return;
        }
    }

    // Fallback for non-macOS or if panel not found
    if let Some(window) = app_handle.get_webview_window("main") {
        let is_visible = log_result("toggle: read visibility", window.is_visible())
            .unwrap_or(false);
        if is_visible {
            hide_overlay(app_handle);
        } else {
            show_overlay(app_handle);
        }
    }
}
