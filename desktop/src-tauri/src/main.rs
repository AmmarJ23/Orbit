#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

#[cfg(not(feature = "demo"))]
mod commands;
#[cfg(not(feature = "demo"))]
mod credentials;
#[cfg(not(feature = "demo"))]
mod model;
#[cfg(not(feature = "demo"))]
mod redmine;
#[cfg(not(feature = "demo"))]
mod repository;
#[cfg(not(feature = "demo"))]
mod service;

#[tauri::command]
fn get_app_mode() -> &'static str {
    if cfg!(feature = "demo") {
        "demo"
    } else {
        "live"
    }
}

#[derive(Default)]
struct RenderState {
    allowed: AtomicBool,
    stopped: AtomicBool,
}

fn placement_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN
}

fn save_placement(app: &tauri::AppHandle) {
    if let Err(error) = app.save_window_state(placement_flags()) {
        eprintln!("Could not save Orbit window placement: {error}");
    }
}

fn publish_visibility(app: &tauri::AppHandle, allowed: bool) {
    let state = app.state::<RenderState>();
    if state.allowed.swap(allowed, Ordering::Relaxed) != allowed {
        if let Err(error) = app.emit_to("main", "orbit://render-visibility", allowed) {
            eprintln!("Could not notify Orbit renderer: {error}");
        }
        if std::env::var_os("ORBIT_DIAGNOSTICS").as_deref() == Some(std::ffi::OsStr::new("1")) {
            eprintln!("orbit-visibility allowed={allowed}");
        }
    }
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let result = window
            .unminimize()
            .and_then(|_| window.show())
            .and_then(|_| window.set_focus());
        if let Err(error) = result {
            eprintln!("Could not show Orbit: {error}");
        } else {
            publish_visibility(app, true);
        }
    }
}

#[tauri::command]
fn rendering_allowed(state: tauri::State<'_, RenderState>) -> bool {
    state.allowed.load(Ordering::Relaxed)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenderSample {
    frames: u64,
    seconds: f64,
    document_visible: bool,
    frame_limit: u32,
    resolution: f64,
}

#[tauri::command]
fn report_rendering(sample: RenderSample, state: tauri::State<'_, RenderState>) {
    if std::env::var_os("ORBIT_DIAGNOSTICS").as_deref() == Some(std::ffi::OsStr::new("1")) {
        eprintln!(
            "orbit-render seconds={:.1} frames={} native={} document={} limit={} resolution={}",
            sample.seconds,
            sample.frames,
            state.allowed.load(Ordering::Relaxed),
            sample.document_visible,
            sample.frame_limit,
            sample.resolution,
        );
    }
}

fn main() {
    let builder = tauri::Builder::default()
        .manage(RenderState::default())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(placement_flags())
                .build(),
        );
    #[cfg(feature = "demo")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        get_app_mode,
        rendering_allowed,
        report_rendering
    ]);
    #[cfg(not(feature = "demo"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        get_app_mode,
        rendering_allowed,
        report_rendering,
        commands::get_snapshot,
        commands::set_orbit_state,
        commands::save_preferences,
        commands::connect_redmine,
        commands::refresh_redmine,
        commands::disconnect_redmine,
        commands::open_source_task
    ]);
    builder
        .setup(|app| {
            #[cfg(not(feature = "demo"))]
            {
                let handle = app.handle().clone();
                let live = (|| -> Result<std::sync::Arc<service::Service>, String> {
                    let directory = app
                        .path()
                        .app_data_dir()
                        .map_err(|_| "Could not locate Orbit's application data directory.")?;
                    std::fs::create_dir_all(&directory)
                        .map_err(|_| "Could not create Orbit's application data directory.")?;
                    let (repository, saved) =
                        repository::Repository::open(&directory.join("orbit.sqlite"))?;
                    let remote = redmine::Redmine(redmine::NativeHttp::new()?);
                    Ok(service::Service::new(
                        repository,
                        saved,
                        std::sync::Arc::new(credentials::Keychain),
                        std::sync::Arc::new(remote),
                        std::sync::Arc::new(move |mut event| {
                            event.animate &= handle
                                .state::<RenderState>()
                                .allowed
                                .load(Ordering::Relaxed);
                            let _ = handle.emit_to("main", "orbit://snapshot", event);
                        }),
                    ))
                })();
                if let Ok(service) = &live {
                    service.start();
                }
                app.manage(commands::LiveState(live));
            }
            let show =
                MenuItem::with_id(app, "show-orbit", "Show Orbit", true, Some("CmdOrCtrl+1"))?;
            let app_menu = Submenu::with_items(
                app,
                "Orbit",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About Orbit"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &show,
                    &PredefinedMenuItem::hide(app, Some("Hide Orbit"))?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, Some("Quit Orbit"))?,
                ],
            )?;
            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;
            let window_menu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &PredefinedMenuItem::fullscreen(app, None)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;
            app.set_menu(Menu::with_items(
                app,
                &[&app_menu, &edit_menu, &window_menu],
            )?)?;
            // The plugin restores placement before setup; never persist hiddenness.
            // A manual launch must always reveal the window, even after a hidden quit.
            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
                window.set_focus()?;
                publish_visibility(app.handle(), true);
            }

            // Tauri has no desktop Hidden/Minimized event. Query native state at a
            // low cadence, including Cmd+H and Dock minimization. This independent
            // worker never relies on webview timers or focus and leaves room for
            // future background sync. Only state changes cross the IPC boundary.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                while !handle
                    .state::<RenderState>()
                    .stopped
                    .load(Ordering::Relaxed)
                {
                    if let Some(window) = handle.get_webview_window("main") {
                        let visible = window.is_visible().unwrap_or(false)
                            && !window.is_minimized().unwrap_or(true);
                        publish_visibility(&handle, visible);
                    }
                    std::thread::sleep(Duration::from_millis(500));
                }
            });
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "show-orbit" {
                show_main(app);
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                save_placement(window.app_handle());
                if let Err(error) = window.hide() {
                    eprintln!("Could not hide Orbit: {error}");
                } else {
                    publish_visibility(window.app_handle(), false);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Could not build Orbit")
        .run(|app, event| match event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => show_main(app),
            tauri::RunEvent::ExitRequested { .. } => save_placement(app),
            tauri::RunEvent::Exit => {
                app.state::<RenderState>()
                    .stopped
                    .store(true, Ordering::Relaxed);
                #[cfg(not(feature = "demo"))]
                if let Ok(service) = &app.state::<commands::LiveState>().0 {
                    service.stop();
                }
            }
            _ => {}
        });
}
