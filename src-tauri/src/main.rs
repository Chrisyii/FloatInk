use std::{fs, path::PathBuf, str::FromStr, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg(target_os = "macos")]
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, TrackingAreaOptions,
    WebviewWindowExt,
};

mod metal_overlay;

const DEFAULT_TOGGLE_SHORTCUT: &str = "CommandOrControl+Shift+D";
const SETTINGS_FILE_NAME: &str = "settings.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppSettings {
    toggle_shortcut: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            toggle_shortcut: DEFAULT_TOGGLE_SHORTCUT.to_string(),
        }
    }
}

struct AppState {
    toggle_shortcut: Mutex<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            toggle_shortcut: Mutex::new(DEFAULT_TOGGLE_SHORTCUT.to_string()),
        }
    }
}

fn log_result<T, E: std::fmt::Display>(context: &str, result: Result<T, E>) -> Option<T> {
    match result {
        Ok(value) => Some(value),
        Err(err) => {
            eprintln!("[floatink] {context}: {err}");
            None
        }
    }
}

fn settings_file_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("resolve app config dir failed: {e}"))?;

    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("create app config dir failed: {e}"))?;

    Ok(config_dir.join(SETTINGS_FILE_NAME))
}

fn load_settings(app_handle: &tauri::AppHandle) -> AppSettings {
    let path = match settings_file_path(app_handle) {
        Ok(path) => path,
        Err(e) => {
            eprintln!("[floatink] load settings path failed: {e}");
            return AppSettings::default();
        }
    };

    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(_) => return AppSettings::default(),
    };

    serde_json::from_str(&content).unwrap_or_else(|e| {
        eprintln!("[floatink] parse settings failed: {e}");
        AppSettings::default()
    })
}

fn save_settings(app_handle: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_file_path(app_handle)?;
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("serialize settings failed: {e}"))?;

    fs::write(path, content).map_err(|e| format!("write settings failed: {e}"))
}

fn parse_shortcut(input: &str) -> Result<Shortcut, String> {
    let shortcut = Shortcut::from_str(input.trim())
        .map_err(|e| format!("invalid shortcut \"{input}\": {e}"))?;

    if shortcut.mods.is_empty() {
        return Err("shortcut must include at least one modifier key".to_string());
    }

    Ok(shortcut)
}

fn register_toggle_shortcut(app_handle: &tauri::AppHandle, shortcut: Shortcut) -> Result<(), String> {
    let global_shortcut = app_handle.global_shortcut();

    global_shortcut
        .unregister_all()
        .map_err(|e| format!("unregister existing shortcut failed: {e}"))?;

    global_shortcut
        .on_shortcut(shortcut, move |app_handle, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            let app_handle = app_handle.clone();
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let app_handle_for_main = app_handle.clone();
                let _ = log_result(
                    "shortcut: dispatch handler to main thread",
                    app_handle.run_on_main_thread(move || {
                        let result =
                            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                toggle_overlay(&app_handle_for_main);
                            }));
                        if let Err(e) = result {
                            eprintln!("[floatink] shortcut main-thread handler panicked: {e:?}");
                        }
                    }),
                );
            }));

            if let Err(e) = result {
                eprintln!("[floatink] shortcut callback panicked: {e:?}");
            }
        })
        .map_err(|e| format!("register shortcut failed: {e}"))
}

fn apply_toggle_shortcut(
    app_handle: &tauri::AppHandle,
    state: &AppState,
    shortcut_input: &str,
) -> Result<String, String> {
    let parsed = parse_shortcut(shortcut_input)?;
    register_toggle_shortcut(app_handle, parsed)?;

    let normalized = parsed.to_string();

    {
        let mut current = state
            .toggle_shortcut
            .lock()
            .map_err(|_| "failed to lock shortcut state".to_string())?;
        *current = normalized.clone();
    }

    save_settings(
        app_handle,
        &AppSettings {
            toggle_shortcut: normalized.clone(),
        },
    )?;

    Ok(normalized)
}

#[tauri::command]
fn get_toggle_shortcut(state: State<AppState>) -> Result<String, String> {
    state
        .toggle_shortcut
        .lock()
        .map_err(|_| "failed to lock shortcut state".to_string())
        .map(|v| v.clone())
}

#[tauri::command]
fn set_toggle_shortcut(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
    shortcut: String,
) -> Result<String, String> {
    apply_toggle_shortcut(&app_handle, state.inner(), &shortcut)
}

fn open_settings_panel(app_handle: &tauri::AppHandle) {
    show_overlay(app_handle);

    let shortcut = app_handle
        .state::<AppState>()
        .toggle_shortcut
        .lock()
        .map(|v| v.clone())
        .unwrap_or_else(|_| DEFAULT_TOGGLE_SHORTCUT.to_string());

    let shortcut_literal = match serde_json::to_string(&shortcut) {
        Ok(value) => value,
        Err(e) => {
            eprintln!("[floatink] tray: serialize shortcut failed: {e}");
            return;
        }
    };

    if let Some(window) = app_handle.get_webview_window("main") {
        let script = format!(
            "window.__floatinkOpenSettingsFromRust && window.__floatinkOpenSettingsFromRust({shortcut_literal});"
        );
        let _ = log_result("tray: eval open-settings", window.eval(&script));
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState::default());

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            hide_window,
            get_toggle_shortcut,
            set_toggle_shortcut
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // --- System Tray Icon (menu bar) ---
            let settings_item = MenuItemBuilder::with_id("settings", "Settings…").build(app)?;
            let toggle_item = MenuItemBuilder::with_id("toggle", "Toggle Overlay")
                .build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit FloatInk")
                .build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&settings_item)
                .separator()
                .item(&toggle_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(tauri::include_image!("icons/tray.png"))
                .icon_as_template(true)
                .show_menu_on_left_click(true)
                .tooltip("FloatInk")
                .menu(&tray_menu)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let _ = log_result(
                            "tray: ensure left click opens menu",
                            tray.set_show_menu_on_left_click(true),
                        );
                    }
                })
                .on_menu_event(move |app_handle, event| {
                    match event.id().as_ref() {
                        "settings" => {
                            open_settings_panel(app_handle);
                        }
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
                match window.to_panel::<OverlayPanel>() {
                    Ok(panel) => {
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
                    Err(e) => {
                        eprintln!("[floatink] setup: failed to convert window to panel: {e}");
                    }
                }
            }

            #[cfg(not(target_os = "macos"))]
            {
                let _ = window.set_ignore_cursor_events(true);
                let _ = window.hide();
            }

            // --- Global Shortcut (from settings, fallback to default) ---
            let initial = load_settings(app.handle()).toggle_shortcut;
            let state = app.state::<AppState>();

            if let Err(err) = apply_toggle_shortcut(app.handle(), state.inner(), &initial) {
                eprintln!("[floatink] setup: apply saved shortcut failed: {err}");
                let _ = apply_toggle_shortcut(
                    app.handle(),
                    state.inner(),
                    DEFAULT_TOGGLE_SHORTCUT,
                );
            }

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
