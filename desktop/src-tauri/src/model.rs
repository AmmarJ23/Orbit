use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OrbitState {
    NotStarted,
    InProgress,
    Completed,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub external_id: String,
    pub title: String,
    pub project: Option<String>,
    pub priority: Option<String>,
    pub url: String,
    pub state: OrbitState,
    #[serde(default)]
    pub completed_from: Option<OrbitState>,
    pub upstream_present: bool,
    pub seed: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub labels: bool,
    pub stars: bool,
    pub speed: f64,
    pub paused: bool,
    pub frame_limit: u32,
    pub resolution: f64,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            labels: true,
            stars: true,
            speed: 1.,
            paused: false,
            frame_limit: 60,
            resolution: 1.5,
        }
    }
}
impl Preferences {
    pub fn validate(&self) -> Result<(), String> {
        if !self.speed.is_finite()
            || !(0.0..=3.0).contains(&self.speed)
            || ![0, 30, 60].contains(&self.frame_limit)
            || ![1., 1.5, 2.].contains(&self.resolution)
        {
            return Err("Invalid motion or quality setting.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub base_url: String,
    pub user_id: u64,
    pub user_name: String,
    pub credential_ref: Option<String>,
    pub initialized: bool,
    pub last_synced: Option<u64>,
    pub tasks: BTreeMap<String, Task>,
}

#[derive(Clone, Default, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedData {
    pub active_account: Option<String>,
    pub accounts: BTreeMap<String, Account>,
    pub preferences: Preferences,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub base_url: String,
    pub user_name: String,
    pub connected: bool,
    pub last_synced: Option<u64>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncInfo {
    pub phase: String,
    pub message: Option<String>,
    pub retry_at: Option<u64>,
}
impl Default for SyncInfo {
    fn default() -> Self {
        Self {
            phase: "idle".into(),
            message: None,
            retry_at: None,
        }
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub mode: &'static str,
    pub revision: u64,
    pub tasks: Vec<Task>,
    pub preferences: Preferences,
    pub connection: Option<ConnectionInfo>,
    pub sync: SyncInfo,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotEvent {
    pub snapshot: Snapshot,
    pub animate: bool,
}

#[derive(Clone, Debug)]
pub struct ImportedTask {
    pub external_id: String,
    pub title: String,
    pub project: Option<String>,
    pub priority: Option<String>,
    pub url: String,
}
pub fn stable_seed(value: &str) -> u32 {
    value
        .bytes()
        .fold(2166136261u32, |hash, b| {
            (hash ^ b as u32).wrapping_mul(16777619)
        })
        .max(1)
}

// Reconcile only a fully fetched snapshot. Presence and private workflow are independent.
pub fn reconcile(account: &mut Account, imported: Vec<ImportedTask>, now: u64) {
    let previous: BTreeMap<_, _> = account
        .tasks
        .iter()
        .map(|(k, t)| (k.clone(), t.upstream_present))
        .collect();
    for task in account.tasks.values_mut() {
        task.upstream_present = false;
    }
    for item in imported {
        let id = format!("{}|{}", account.id, item.external_id);
        if let Some(task) = account.tasks.get_mut(&id) {
            if previous.get(&id) == Some(&false) {
                task.state = OrbitState::NotStarted;
                task.completed_from = None;
            }
            task.title = item.title;
            task.project = item.project;
            task.priority = item.priority;
            task.url = item.url;
            task.upstream_present = true;
        } else {
            account.tasks.insert(
                id.clone(),
                Task {
                    seed: stable_seed(&id),
                    id,
                    external_id: item.external_id,
                    title: item.title,
                    project: item.project,
                    priority: item.priority,
                    url: item.url,
                    state: OrbitState::NotStarted,
                    completed_from: None,
                    upstream_present: true,
                },
            );
        }
    }
    for task in account.tasks.values_mut() {
        if !task.upstream_present {
            if task.state != OrbitState::Completed {
                task.completed_from = Some(task.state);
            }
            task.state = OrbitState::Completed;
        }
    }
    account.initialized = true;
    account.last_synced = Some(now);
}
