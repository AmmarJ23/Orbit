use crate::{
    http::Workspace,
    model::{OrbitState, Preferences, Snapshot, Source},
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
pub async fn set_hidden(
    ids: Vec<String>,
    hidden: bool,
    state: tauri::State<'_, LiveState>,
) -> Result<Snapshot, String> {
    let s = service(&state)?;
    blocking(move || s.set_hidden(&ids, hidden)).await
}
#[tauri::command]
pub async fn save_preferences(
    preferences: Preferences,
    state: tauri::State<'_, LiveState>,
) -> Result<Snapshot, String> {
    let s = service(&state)?;
    blocking(move || s.save_preferences(preferences)).await
}
// `base_url` is the Redmine server; ClickUp ignores it and uses `workspace_id` instead.
#[tauri::command]
pub async fn connect_source(
    source: Source,
    base_url: Option<String>,
    api_key: String,
    workspace_id: Option<String>,
    state: tauri::State<'_, LiveState>,
) -> Result<Snapshot, String> {
    let s = service(&state)?;
    blocking(move || {
        s.connect(
            source,
            base_url.as_deref().unwrap_or(""),
            &api_key,
            workspace_id.as_deref(),
        )
    })
    .await
}
#[tauri::command]
pub async fn list_workspaces(
    source: Source,
    api_key: String,
    state: tauri::State<'_, LiveState>,
) -> Result<Vec<Workspace>, String> {
    let s = service(&state)?;
    blocking(move || s.workspaces(source, &api_key)).await
}
#[tauri::command]
pub async fn refresh_source(
    source: Source,
    state: tauri::State<'_, LiveState>,
) -> Result<(), String> {
    service(&state)?.refresh(source)
}
#[tauri::command]
pub async fn disconnect_source(
    source: Source,
    state: tauri::State<'_, LiveState>,
) -> Result<Snapshot, String> {
    let s = service(&state)?;
    blocking(move || s.disconnect(source)).await
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
            .map_err(|_| "Could not open the source task.".to_string())?;
        if !status.success() {
            return Err("Could not open the source task.".into());
        }
        Ok(())
    })
    .await
}
