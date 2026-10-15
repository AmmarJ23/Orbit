use crate::{
    model::{OrbitState, Preferences, Snapshot},
    service::Service,
};
use std::sync::Arc;
pub struct LiveState(pub Result<Arc<Service>, String>);
fn service(state: &tauri::State<'_, LiveState>) -> Result<Arc<Service>, String> {
    state.0.clone()
}
async fn blocking<T: Send + 'static>(
    action: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(action)
        .await
        .map_err(|_| "Orbit could not finish this operation. Relaunch and try again.".to_string())?
}
#[tauri::command]
pub async fn get_snapshot(state: tauri::State<'_, LiveState>) -> Result<Snapshot, String> {
    let s = service(&state)?;
    blocking(move || Ok(s.snapshot())).await
}
#[tauri::command]
pub async fn set_orbit_state(
    id: String,
    orbit_state: OrbitState,
    state: tauri::State<'_, LiveState>,
) -> Result<Snapshot, String> {
    let s = service(&state)?;
    blocking(move || s.set_state(&id, orbit_state)).await
}
#[tauri::command]
pub async fn save_preferences(
    preferences: Preferences,
    state: tauri::State<'_, LiveState>,
) -> Result<Snapshot, String> {
    let s = service(&state)?;
    blocking(move || s.save_preferences(preferences)).await
}
#[tauri::command]
pub async fn connect_redmine(
    base_url: String,
    api_key: String,
    state: tauri::State<'_, LiveState>,
) -> Result<Snapshot, String> {
    let s = service(&state)?;
    blocking(move || s.connect(&base_url, &api_key)).await
}
#[tauri::command]
pub async fn refresh_redmine(state: tauri::State<'_, LiveState>) -> Result<(), String> {
    service(&state)?.refresh()
}
#[tauri::command]
pub async fn disconnect_redmine(state: tauri::State<'_, LiveState>) -> Result<Snapshot, String> {
    let s = service(&state)?;
    blocking(move || s.disconnect()).await
}
#[tauri::command]
pub async fn open_source_task(
    id: String,
    state: tauri::State<'_, LiveState>,
) -> Result<(), String> {
    let s = service(&state)?;
    blocking(move || {
        let url = s.source_url(&id)?;
        // Invoke the native URL opener with one argument, never a shell command.
        let status = std::process::Command::new("/usr/bin/open")
            .arg(url)
            .status()
            .map_err(|_| "Could not open the source ticket.".to_string())?;
        if !status.success() {
            return Err("Could not open the source ticket.".into());
        }
        Ok(())
    })
    .await
}
