use crate::{
    credentials::Credentials,
    http::{Remote, RemoteError, Workspace},
    model::*,
    repository::Repository,
};
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, SyncSender},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
struct Runtime {
    repository: Repository,
    saved: SavedData,
    revision: u64,
    sync: BTreeMap<Source, SyncInfo>,
}
pub struct Service {
    runtime: Mutex<Runtime>,
    network: Mutex<()>,
    credentials: Arc<dyn Credentials>,
    remotes: BTreeMap<Source, Arc<dyn Remote>>,
    publish: Arc<dyn Fn(SnapshotEvent) + Send + Sync>,
    wake: Mutex<Option<SyncSender<()>>>,
    stopped: AtomicBool,
}
impl Runtime {
    fn sync(&self, source: Source) -> SyncInfo {
        self.sync.get(&source).cloned().unwrap_or_default()
    }
    fn snapshot(&self) -> Snapshot {
        let mut tasks = Vec::new();
        let mut sources = BTreeMap::new();
        for source in Source::ALL {
            let account = self.saved.active(source);
            if let Some(account) = account {
                tasks.extend(account.tasks.values().cloned());
            }
            sources.insert(
                source,
                SourceInfo {
                    connection: account.map(|a| ConnectionInfo {
                        base_url: a.base_url.clone(),
                        workspace_name: a.workspace_name.clone(),
                        user_name: a.user_name.clone(),
                        connected: a.credential_ref.is_some(),
                        last_synced: a.last_synced,
                    }),
                    sync: self.sync(source),
                },
            );
        }
        Snapshot {
            mode: "live",
            revision: self.revision,
            preferences: self.saved.preferences.clone(),
            tasks,
            sources,
        }
    }
}
impl Service {
    pub fn new(
        repository: Repository,
        saved: SavedData,
        credentials: Arc<dyn Credentials>,
        remotes: BTreeMap<Source, Arc<dyn Remote>>,
        publish: Arc<dyn Fn(SnapshotEvent) + Send + Sync>,
    ) -> Arc<Self> {
        Arc::new(Self {
            runtime: Mutex::new(Runtime {
                repository,
                saved,
                revision: 0,
                sync: BTreeMap::new(),
            }),
            network: Mutex::new(()),
            credentials,
            remotes,
            publish,
            wake: Mutex::new(None),
            stopped: AtomicBool::new(false),
        })
    }
    fn remote(&self, source: Source) -> Result<&Arc<dyn Remote>, String> {
        self.remotes
            .get(&source)
            .ok_or_else(|| format!("{} is not available in this build.", source.name()))
    }
    // Redmine may sit behind a VPN; connect the chosen one before any request.
    fn vpn(&self, source: Source) -> Result<(), String> {
        if source != Source::Redmine {
            return Ok(());
        }
        let name = self.runtime.lock().unwrap().saved.preferences.redmine_vpn.clone();
        name.map_or(Ok(()), |name| crate::vpn::ensure(&name))
    }
    pub fn start(self: &Arc<Self>) {
        let (sender, receiver) = mpsc::sync_channel(1);
        *self.wake.lock().unwrap() = Some(sender.clone());
        let service = self.clone();
        std::thread::spawn(move || {
            while !service.stopped.load(Ordering::Relaxed) {
                // Schedule after the previous attempt; never queue missed timer ticks.
                let _ = receiver.recv_timeout(Duration::from_secs(20));
                if service.stopped.load(Ordering::Relaxed) {
                    break;
                }
                while receiver.try_recv().is_ok() {}
                // Sources sync one after another; one failing never blocks the other.
                for source in Source::ALL {
                    service.sync_once(source);
                }
            }
        });
        let _ = sender.try_send(());
    }
    pub fn stop(&self) {
        self.stopped.store(true, Ordering::Relaxed);
        if let Some(sender) = self.wake.lock().unwrap().as_ref() {
            let _ = sender.try_send(());
        }
    }
    pub fn snapshot(&self) -> Snapshot {
        self.runtime.lock().unwrap().snapshot()
    }
    fn emit(&self, runtime: &Runtime, animate: bool) {
        (self.publish)(SnapshotEvent {
            snapshot: runtime.snapshot(),
            animate,
        });
    }
    fn commit(
        &self,
        runtime: &mut Runtime,
        saved: SavedData,
        animate: bool,
    ) -> Result<Snapshot, String> {
        runtime.repository.save(&saved)?;
        runtime.saved = saved;
        runtime.revision += 1;
        self.emit(runtime, animate);
        Ok(runtime.snapshot())
    }
    fn sync_status(&self, source: Source, info: SyncInfo) {
        let mut runtime = self.runtime.lock().unwrap();
        runtime.sync.insert(source, info);
        runtime.revision += 1;
        self.emit(&runtime, false);
    }
    pub fn set_state(&self, id: &str, state: OrbitState) -> Result<Snapshot, String> {
        let mut runtime = self.runtime.lock().unwrap();
        let mut saved = runtime.saved.clone();
        let task = Source::ALL
            .into_iter()
            .filter_map(|source| saved.active_accounts.get(&source).cloned())
            .find(|account| saved.accounts[account].tasks.contains_key(id))
            .and_then(|account| saved.accounts.get_mut(&account))
            .and_then(|a| a.tasks.get_mut(id))
            .ok_or("This task is no longer in an active account.")?;
        if !task.upstream_present && state != OrbitState::Completed {
            return Err(format!(
                "This task is no longer assigned and open in {}. It will return as To do if it reappears.",
                task.source.name()
            ));
        }
        if state == OrbitState::Completed && task.state != OrbitState::Completed {
            task.completed_from = Some(task.state);
        }
        if state != OrbitState::Completed {
            task.completed_from = None;
        }
        task.state = state;
        self.commit(&mut runtime, saved, true)
    }
    // Several ids at once so "hide subtasks" is a single save and a single snapshot.
    pub fn set_hidden(&self, ids: &[String], hidden: bool) -> Result<Snapshot, String> {
        let mut runtime = self.runtime.lock().unwrap();
        let mut saved = runtime.saved.clone();
        let active: Vec<String> = saved.active_accounts.values().cloned().collect();
        let mut found = 0;
        for account in active {
            if let Some(account) = saved.accounts.get_mut(&account) {
                for id in ids {
                    if let Some(task) = account.tasks.get_mut(id) {
                        task.hidden = hidden;
                        found += 1;
                    }
                }
            }
        }
        if found == 0 {
            return Err("These tasks are no longer in an active account.".into());
        }
        self.commit(&mut runtime, saved, true)
    }
    pub fn save_preferences(&self, preferences: Preferences) -> Result<Snapshot, String> {
        preferences.validate()?;
        let mut runtime = self.runtime.lock().unwrap();
        let mut saved = runtime.saved.clone();
        saved.preferences = preferences;
        self.commit(&mut runtime, saved, false)
    }
    // A refresh wakes the shared worker, which syncs every connected source.
    pub fn refresh(&self, source: Source) -> Result<(), String> {
        let name = source.name();
        let snapshot = self.snapshot();
        let info = &snapshot.sources[&source];
        if !info.connection.as_ref().is_some_and(|c| c.connected) {
            return Err(format!("Connect {name} before refreshing."));
        }
        if info.sync.phase == "auth-error" {
            return Err(format!("Update your {name} credentials to resume syncing."));
        }
        if let Some(sender) = self.wake.lock().unwrap().as_ref() {
            let _ = sender.try_send(());
        }
        Ok(())
    }
    pub fn workspaces(&self, source: Source, key: &str) -> Result<Vec<Workspace>, String> {
        let _gate = self.network.lock().unwrap();
        self.remote(source)?.workspaces(key).map_err(|e| e.message)
    }
    pub fn connect(
        &self,
        source: Source,
        base: &str,
        key: &str,
        scope: Option<&str>,
    ) -> Result<Snapshot, String> {
        let remote = self.remote(source)?.clone();
        let _gate = self.network.lock().unwrap();
        self.vpn(source)?;
        // Do not replace the old connection or pause its polling for invalid setup input.
        let identity = remote.identify(base, key, scope).map_err(|e| e.message)?;
        let account_id = format!(
            "{}|{}|{}",
            source.key(),
            identity
                .workspace_id
                .as_deref()
                .unwrap_or(&identity.base_url),
            identity.user_id
        );
        let probe = Account {
            id: account_id.clone(),
            source,
            base_url: identity.base_url.clone(),
            workspace_id: identity.workspace_id.clone(),
            workspace_name: identity.workspace_name.clone(),
            user_id: identity.user_id,
            user_name: identity.user_name.clone(),
            credential_ref: None,
            initialized: false,
            last_synced: None,
            tasks: Default::default(),
        };
        let imported = remote.tasks(&probe, key).map_err(|e| e.message)?;
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let reference = format!(
            "{account_id}|{}|{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        self.credentials.set(&reference, key.trim())?;
        let mut runtime = self.runtime.lock().unwrap();
        let mut saved = runtime.saved.clone();
        let account = saved.accounts.entry(account_id.clone()).or_insert(probe);
        let old_ref = account.credential_ref.replace(reference.clone());
        account.user_name = identity.user_name;
        account.workspace_name = identity.workspace_name;
        reconcile(account, imported, now());
        saved.active_accounts.insert(source, account_id);
        let old_sync = runtime.sync.insert(source, SyncInfo::default());
        match self.commit(&mut runtime, saved, false) {
            Ok(snapshot) => {
                if let Some(old) = old_ref {
                    if self.credentials.delete(&old).is_err() {
                        runtime.sync.entry(source).or_default().message = Some(
                            "Connected, but an older Keychain entry could not be removed.".into(),
                        );
                        runtime.revision += 1;
                        self.emit(&runtime, false);
                        return Ok(runtime.snapshot());
                    }
                }
                Ok(snapshot)
            }
            Err(error) => {
                match old_sync {
                    Some(old) => runtime.sync.insert(source, old),
                    None => runtime.sync.remove(&source),
                };
                let _ = self.credentials.delete(&reference);
                Err(error)
            }
        }
    }
    pub fn disconnect(&self, source: Source) -> Result<Snapshot, String> {
        let _gate = self.network.lock().unwrap();
        let mut runtime = self.runtime.lock().unwrap();
        let mut saved = runtime.saved.clone();
        let account = saved
            .active_mut(source)
            .ok_or_else(|| format!("No {} connection to disconnect.", source.name()))?;
        let reference = account.credential_ref.take();
        let secret = reference
            .as_ref()
            .and_then(|r| self.credentials.get(r).ok());
        if let Some(reference) = reference.as_ref() {
            self.credentials.delete(reference)?;
        }
        let old_sync = runtime.sync.insert(source, SyncInfo::default());
        match self.commit(&mut runtime, saved, false) {
            Ok(snapshot) => Ok(snapshot),
            Err(error) => {
                if let Some(old) = old_sync {
                    runtime.sync.insert(source, old);
                }
                if let (Some(reference), Some(secret)) = (reference, secret) {
                    let _ = self.credentials.set(&reference, &secret);
                }
                Err(error)
            }
        }
    }
    pub fn source_url(&self, id: &str) -> Result<String, String> {
        let runtime = self.runtime.lock().unwrap();
        let (account, task) = Source::ALL
            .into_iter()
            .filter_map(|source| runtime.saved.active(source))
            .find_map(|a| a.tasks.get(id).map(|t| (a, t)))
            .ok_or("Task not found.")?;
        self.remote(account.source)?
            .source_url(account, &task.external_id)
    }
    pub fn sync_once(&self, source: Source) {
        let Ok(remote) = self.remote(source).cloned() else {
            return;
        };
        let _gate = self.network.lock().unwrap();
        let (account, reference) = {
            let runtime = self.runtime.lock().unwrap();
            let sync = runtime.sync(source);
            if sync.phase == "auth-error" || sync.retry_at.is_some_and(|t| t > now()) {
                return;
            }
            let Some(account) = runtime.saved.active(source) else {
                return;
            };
            let Some(reference) = account.credential_ref.clone() else {
                return;
            };
            (account.clone(), reference)
        };
        self.sync_status(
            source,
            SyncInfo {
                phase: "syncing".into(),
                message: None,
                retry_at: None,
            },
        );
        let result = self
            .vpn(source)
            .map_err(|message| RemoteError {
                message,
                auth: false,
                retry_after: None,
            })
            .and_then(|()| {
                self.credentials
                    .get(&reference)
                    .map_err(|message| RemoteError {
                        message,
                        auth: true,
                        retry_after: None,
                    })
            })
            .and_then(|key| remote.tasks(&account, &key));
        match result {
            Ok(imported) => {
                let mut runtime = self.runtime.lock().unwrap();
                // Clone the current state after the fetch, preserving actions made during it.
                let mut saved = runtime.saved.clone();
                let Some(current) = saved.accounts.get_mut(&account.id) else {
                    return;
                };
                let animate = current.initialized;
                reconcile(current, imported, now());
                runtime.sync.insert(source, SyncInfo::default());
                if let Err(message) = self.commit(&mut runtime, saved, animate) {
                    runtime.sync.insert(
                        source,
                        SyncInfo {
                            phase: "storage-error".into(),
                            message: Some(message),
                            retry_at: None,
                        },
                    );
                    runtime.revision += 1;
                    self.emit(&runtime, false);
                }
            }
            Err(error) => self.sync_status(
                source,
                SyncInfo {
                    phase: if error.auth {
                        "auth-error"
                    } else if error.retry_after.is_some() {
                        "rate-limited"
                    } else {
                        "offline"
                    }
                    .into(),
                    message: Some(error.message),
                    retry_at: error.retry_after.map(|delay| now().saturating_add(delay)),
                },
            ),
        }
    }
}
