use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OrbitState {
    NotStarted,
    InProgress,
    Completed,
}

// Where a task comes from. Serialized as the display names the frontend already uses.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Source {
    #[default]
    Redmine,
    ClickUp,
}
impl Source {
    pub const ALL: [Source; 2] = [Source::Redmine, Source::ClickUp];
    pub fn name(self) -> &'static str {
        match self {
            Source::Redmine => "Redmine",
            Source::ClickUp => "ClickUp",
        }
    }
    pub fn key(self) -> &'static str {
        match self {
            Source::Redmine => "redmine",
            Source::ClickUp => "clickup",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    // Older rows were all Redmine.
    #[serde(default)]
    pub source: Source,
    // ClickUp subtasks keep their parent's id; grouping/hiding builds on this later.
    #[serde(default)]
    pub parent_id: Option<String>,
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

// Camera move between the active and completed systems (desktop/src/travel.js).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Transition {
    #[default]
    Glide,
    Warp,
    Core,
    Map,
    Dip,
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
    // Added after the first stored documents; older rows default to on.
    #[serde(default = "enabled")]
    pub depth: bool,
    // Added later still; older rows default to Glide.
    #[serde(default)]
    pub transition: Transition,
}
fn enabled() -> bool {
    true
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
            depth: true,
            transition: Transition::Glide,
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
    #[serde(default)]
    pub source: Source,
    pub base_url: String,
    // ClickUp workspace the tasks are read from; Redmine has none.
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub workspace_name: Option<String>,
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
    // One active account per source. Older rows stored a single Redmine `activeAccount`;
    // the repository moves it here on load.
    #[serde(default)]
    pub active_accounts: BTreeMap<Source, String>,
    #[serde(default, skip_serializing)]
    pub active_account: Option<String>,
    pub accounts: BTreeMap<String, Account>,
    pub preferences: Preferences,
}
impl SavedData {
    pub fn active(&self, source: Source) -> Option<&Account> {
        self.active_accounts
            .get(&source)
            .and_then(|id| self.accounts.get(id))
    }
    pub fn active_mut(&mut self, source: Source) -> Option<&mut Account> {
        let id = self.active_accounts.get(&source)?;
        self.accounts.get_mut(id)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub base_url: String,
    pub workspace_name: Option<String>,
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
    pub sources: BTreeMap<Source, SourceInfo>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
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
    pub parent_id: Option<String>,
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
    let source = account.source;
    for task in account.tasks.values_mut() {
        task.upstream_present = false;
        task.source = source;
    }
    for item in imported {
        let id = format!("{}|{}", account.id, item.external_id);
        if let Some(task) = account.tasks.get_mut(&id) {
            if previous.get(&id) == Some(&false) {
                task.state = OrbitState::NotStarted;
                task.completed_from = None;
            }
            task.title = item.title;
            task.parent_id = item.parent_id;
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
                    source,
                    parent_id: item.parent_id,
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
