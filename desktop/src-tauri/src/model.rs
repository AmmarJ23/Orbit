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
    // Private display choice: off the scene until revealed. Syncs never change it.
    #[serde(default)]
    pub hidden: bool,
}

// A personal note. Each link is a probe orbiting that task's planet; an unlinked note
// has one probe resting at the station or on the outer belt.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    // Markdown is the stored form; the Rich editor reads and writes it.
    pub body: String,
    #[serde(default)]
    pub links: Vec<String>,
    #[serde(default)]
    pub pinned: bool,
    // Palette slot, kept whichever colour mode is shown so switching back restores it.
    pub palette: u8,
    // Milliseconds since the epoch.
    pub created: u64,
    pub edited: u64,
    // When the note last became unlinked; station docks go first come, first served.
    pub rested: u64,
}
pub const PALETTE_SIZE: u8 = 8;
// Pinned notes always dock at the station, so pins cannot outnumber its slots.
pub const DOCK_SLOTS: usize = 10;

// How note colours are shown: the stored palette slot, or a hue hashed from the note id.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NoteColors {
    #[default]
    Palette,
    Hashed,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NotesLayout {
    #[default]
    List,
    Grid,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NotesSort {
    #[default]
    Edited,
    Created,
    Title,
    Colour,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NoteEditor {
    #[default]
    Rich,
    Markdown,
}
// The Notes tab's remembered view.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotesView {
    pub layout: NotesLayout,
    pub sort: NotesSort,
    pub descending: bool,
    pub editor: NoteEditor,
}
impl Default for NotesView {
    fn default() -> Self {
        Self {
            layout: NotesLayout::List,
            sort: NotesSort::Edited,
            descending: true,
            editor: NoteEditor::Rich,
        }
    }
}

// Probe body drawn in the scene (desktop/src/probes.js).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProbeStyle {
    #[default]
    Dish,
    Satellite,
}
// Where docked probes rest: around the habitat ring, up the mast, or on a tender tethered below.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DockStyle {
    #[default]
    Ring,
    Rack,
    Tug,
    Pier,
    Urchin,
    Carrier,
}
// How the line between the station and its tender hangs.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TenderTether {
    #[default]
    Slack,
    Taut,
    Beads,
}
// How a probe crosses between the completed and active systems.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProbeReturn {
    #[default]
    Flight,
    Jump,
    Core,
}
// How the planet callout lists the notes orbiting it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PlanetNotes {
    #[default]
    Chips,
    Dots,
    List,
    Tabs,
}
// What a collapsed side card keeps showing: just the source icon, or the icon with its name and count.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CollapsedCards {
    #[default]
    Icon,
    Label,
}
// How the selected planet's callout lays out its details and actions (desktop/src/scene.js).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PlanetCard {
    Classic,
    Tidy,
    Hinted,
    #[default]
    Compact,
}
const fn on() -> bool {
    true
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
#[serde(rename_all = "camelCase", from = "StoredPreferences")]
pub struct Preferences {
    pub labels: bool,
    pub stars: bool,
    pub speed: f64,
    pub paused: bool,
    pub frame_limit: u32,
    pub resolution: f64,
    pub nebula: bool,
    pub rocks: bool,
    // The glimpse of the completed system shown while a planet completes.
    pub completion_preview: bool,
    // Pure black space instead of the navy tinge.
    pub black_sky: bool,
    pub transition: Transition,
    // macOS VPN service to connect before each Redmine sync.
    pub redmine_vpn: Option<String>,
    pub note_colors: NoteColors,
    pub notes_view: NotesView,
    pub probe_style: ProbeStyle,
    pub dock_style: DockStyle,
    pub tender_tether: TenderTether,
    pub probe_return: ProbeReturn,
    pub probe_blink: bool,
    pub planet_notes: PlanetNotes,
    pub collapsed_cards: CollapsedCards,
    // The status key beside the scene controls.
    pub legend: bool,
    pub planet_card: PlanetCard,
}
// What a stored document may hold, including fields from older versions.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredPreferences {
    labels: bool,
    stars: bool,
    speed: f64,
    paused: bool,
    frame_limit: u32,
    resolution: f64,
    // Nebula and rocks once shared one `depth` switch; older rows default to on.
    depth: Option<bool>,
    nebula: Option<bool>,
    rocks: Option<bool>,
    completion_preview: Option<bool>,
    #[serde(default)]
    black_sky: bool,
    // Added later still; older rows default to Glide.
    #[serde(default)]
    transition: Transition,
    #[serde(default)]
    redmine_vpn: Option<String>,
    #[serde(default)]
    note_colors: NoteColors,
    #[serde(default)]
    notes_view: NotesView,
    #[serde(default)]
    probe_style: ProbeStyle,
    #[serde(default)]
    dock_style: DockStyle,
    #[serde(default)]
    tender_tether: TenderTether,
    #[serde(default)]
    probe_return: ProbeReturn,
    #[serde(default = "on")]
    probe_blink: bool,
    #[serde(default)]
    planet_notes: PlanetNotes,
    #[serde(default)]
    collapsed_cards: CollapsedCards,
    #[serde(default = "on")]
    legend: bool,
    #[serde(default)]
    planet_card: PlanetCard,
}
impl From<StoredPreferences> for Preferences {
    fn from(stored: StoredPreferences) -> Self {
        let depth = stored.depth.unwrap_or(true);
        Self {
            labels: stored.labels,
            stars: stored.stars,
            speed: stored.speed,
            paused: stored.paused,
            frame_limit: stored.frame_limit,
            resolution: stored.resolution,
            nebula: stored.nebula.unwrap_or(depth),
            rocks: stored.rocks.unwrap_or(depth),
            completion_preview: stored.completion_preview.unwrap_or(true),
            black_sky: stored.black_sky,
            transition: stored.transition,
            redmine_vpn: stored.redmine_vpn,
            note_colors: stored.note_colors,
            notes_view: stored.notes_view,
            probe_style: stored.probe_style,
            dock_style: stored.dock_style,
            tender_tether: stored.tender_tether,
            probe_return: stored.probe_return,
            probe_blink: stored.probe_blink,
            planet_notes: stored.planet_notes,
            collapsed_cards: stored.collapsed_cards,
            legend: stored.legend,
            planet_card: stored.planet_card,
        }
    }
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
            nebula: true,
            rocks: true,
            completion_preview: true,
            black_sky: false,
            transition: Transition::Glide,
            redmine_vpn: None,
            note_colors: NoteColors::Palette,
            notes_view: NotesView::default(),
            probe_style: ProbeStyle::Dish,
            dock_style: DockStyle::Ring,
            tender_tether: TenderTether::Slack,
            probe_return: ProbeReturn::Flight,
            probe_blink: true,
            planet_notes: PlanetNotes::Chips,
            collapsed_cards: CollapsedCards::Icon,
            legend: true,
            planet_card: PlanetCard::Compact,
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
        if self
            .redmine_vpn
            .as_ref()
            .is_some_and(|name| name.trim().is_empty() || name.len() > 256 || name.contains('"'))
        {
            return Err("Invalid VPN setting.".into());
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
    #[serde(default)]
    pub notes: BTreeMap<String, Note>,
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
    pub notes: Vec<Note>,
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
                    hidden: false,
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
