use crate::{
    credentials::Credentials,
    model::*,
    redmine::{normalize_server, Remote, RemoteError},
    repository::Repository,
};
use std::{
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
    sync: SyncInfo,
}
pub struct Service {
    runtime: Mutex<Runtime>,
    network: Mutex<()>,
    credentials: Arc<dyn Credentials>,
    remote: Arc<dyn Remote>,
    publish: Arc<dyn Fn(SnapshotEvent) + Send + Sync>,
    wake: Mutex<Option<SyncSender<()>>>,
    stopped: AtomicBool,
}
impl Runtime {
    fn snapshot(&self) -> Snapshot {
        let account = self
            .saved
            .active_account
            .as_ref()
            .and_then(|id| self.saved.accounts.get(id));
        Snapshot {
            mode: "live",
            revision: self.revision,
            preferences: self.saved.preferences.clone(),
            sync: self.sync.clone(),
            tasks: account
                .map(|a| a.tasks.values().cloned().collect())
                .unwrap_or_default(),
            connection: account.map(|a| ConnectionInfo {
                base_url: a.base_url.clone(),
                user_name: a.user_name.clone(),
                connected: a.credential_ref.is_some(),
                last_synced: a.last_synced,
            }),
        }
    }
}
impl Service {
    pub fn new(
        repository: Repository,
        saved: SavedData,
        credentials: Arc<dyn Credentials>,
        remote: Arc<dyn Remote>,
        publish: Arc<dyn Fn(SnapshotEvent) + Send + Sync>,
    ) -> Arc<Self> {
        Arc::new(Self {
            runtime: Mutex::new(Runtime {
                repository,
                saved,
                revision: 0,
                sync: SyncInfo::default(),
            }),
            network: Mutex::new(()),
            credentials,
            remote,
            publish,
            wake: Mutex::new(None),
            stopped: AtomicBool::new(false),
        })
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
                service.sync_once();
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
    fn sync_status(&self, info: SyncInfo) {
        let mut runtime = self.runtime.lock().unwrap();
        runtime.sync = info;
        runtime.revision += 1;
        self.emit(&runtime, false);
    }
    pub fn set_state(&self, id: &str, state: OrbitState) -> Result<Snapshot, String> {
        let mut runtime = self.runtime.lock().unwrap();
        let mut saved = runtime.saved.clone();
        let task = saved
            .active_account
            .as_ref()
            .and_then(|id| saved.accounts.get_mut(id))
            .and_then(|a| a.tasks.get_mut(id))
            .ok_or("This task is no longer in the active account.")?;
        if !task.upstream_present && state != OrbitState::Completed {
            return Err("This ticket is no longer assigned and open in Redmine. It will return as To do if it reappears.".into());
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
    pub fn save_preferences(&self, preferences: Preferences) -> Result<Snapshot, String> {
        preferences.validate()?;
        let mut runtime = self.runtime.lock().unwrap();
        let mut saved = runtime.saved.clone();
        saved.preferences = preferences;
        self.commit(&mut runtime, saved, false)
    }
    pub fn refresh(&self) -> Result<(), String> {
        let snapshot = self.snapshot();
        if !snapshot.connection.is_some_and(|c| c.connected) {
            return Err("Connect Redmine before refreshing.".into());
        }
        if snapshot.sync.phase == "auth-error" {
            return Err("Update your Redmine credentials to resume syncing.".into());
        }
        if let Some(sender) = self.wake.lock().unwrap().as_ref() {
            let _ = sender.try_send(());
        }
        Ok(())
    }
    pub fn connect(&self, input: &str, key: &str) -> Result<Snapshot, String> {
        let server = normalize_server(input)?;
        if key.trim().is_empty() {
            return Err("Enter your Redmine API key.".into());
        }
        let _gate = self.network.lock().unwrap();
        // Do not replace the old connection or pause its polling for invalid setup input.
        let (user_id, user_name) = self.remote.identify(&server, key).map_err(|e| e.message)?;
        let imported = self.remote.tasks(&server, key).map_err(|e| e.message)?;
        let account_id = format!("redmine|{server}|{user_id}");
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let reference = format!(
            "{account_id}|{}|{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        self.credentials.set(&reference, key)?;
        let mut runtime = self.runtime.lock().unwrap();
        let mut saved = runtime.saved.clone();
        let account = saved
            .accounts
            .entry(account_id.clone())
            .or_insert_with(|| Account {
                id: account_id.clone(),
                base_url: server,
                user_id,
                user_name: user_name.clone(),
                credential_ref: None,
                initialized: false,
                last_synced: None,
                tasks: Default::default(),
            });
        let old_ref = account.credential_ref.replace(reference.clone());
        account.user_name = user_name;
        reconcile(account, imported, now());
        saved.active_account = Some(account_id);
        let old_sync = runtime.sync.clone();
        runtime.sync = SyncInfo::default();
        match self.commit(&mut runtime, saved, false) {
            Ok(snapshot) => {
                if let Some(old) = old_ref {
                    if self.credentials.delete(&old).is_err() {
                        runtime.sync.message = Some(
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
                runtime.sync = old_sync;
                let _ = self.credentials.delete(&reference);
                Err(error)
            }
        }
    }
    pub fn disconnect(&self) -> Result<Snapshot, String> {
        let _gate = self.network.lock().unwrap();
        let mut runtime = self.runtime.lock().unwrap();
        let mut saved = runtime.saved.clone();
        let account = saved
            .active_account
            .as_ref()
            .and_then(|id| saved.accounts.get_mut(id))
            .ok_or("No Redmine connection to disconnect.")?;
        let reference = account.credential_ref.take();
        let secret = reference
            .as_ref()
            .and_then(|r| self.credentials.get(r).ok());
        if let Some(reference) = reference.as_ref() {
            self.credentials.delete(reference)?;
        }
        let old_sync = runtime.sync.clone();
        runtime.sync = SyncInfo::default();
        match self.commit(&mut runtime, saved, false) {
            Ok(snapshot) => Ok(snapshot),
            Err(error) => {
                runtime.sync = old_sync;
                if let (Some(reference), Some(secret)) = (reference, secret) {
                    let _ = self.credentials.set(&reference, &secret);
                }
                Err(error)
            }
        }
    }
    pub fn source_url(&self, id: &str) -> Result<String, String> {
        let runtime = self.runtime.lock().unwrap();
        let account = runtime
            .saved
            .active_account
            .as_ref()
            .and_then(|id| runtime.saved.accounts.get(id))
            .ok_or("No active Redmine account.")?;
        let task = account.tasks.get(id).ok_or("Task not found.")?;
        let number = task
            .external_id
            .parse::<u64>()
            .map_err(|_| "Invalid ticket number.")?;
        Ok(format!(
            "{}/issues/{number}",
            normalize_server(&account.base_url)?
        ))
    }
    pub fn sync_once(&self) {
        let _gate = self.network.lock().unwrap();
        let (account_id, server, reference) = {
            let runtime = self.runtime.lock().unwrap();
            if runtime.sync.phase == "auth-error"
                || runtime.sync.retry_at.is_some_and(|t| t > now())
            {
                return;
            }
            let Some(account) = runtime
                .saved
                .active_account
                .as_ref()
                .and_then(|id| runtime.saved.accounts.get(id))
            else {
                return;
            };
            let Some(reference) = account.credential_ref.as_ref() else {
                return;
            };
            (
                account.id.clone(),
                account.base_url.clone(),
                reference.clone(),
            )
        };
        self.sync_status(SyncInfo {
            phase: "syncing".into(),
            message: None,
            retry_at: None,
        });
        let result = self
            .credentials
            .get(&reference)
            .map_err(|message| RemoteError {
                message,
                auth: true,
                retry_after: None,
            })
            .and_then(|key| self.remote.tasks(&server, &key));
        match result {
            Ok(imported) => {
                let mut runtime = self.runtime.lock().unwrap();
                // Clone the current state after the fetch, preserving actions made during it.
                let mut saved = runtime.saved.clone();
                let Some(account) = saved.accounts.get_mut(&account_id) else {
                    return;
                };
                let animate = account.initialized;
                reconcile(account, imported, now());
                runtime.sync = SyncInfo::default();
                if let Err(message) = self.commit(&mut runtime, saved, animate) {
                    runtime.sync = SyncInfo {
                        phase: "storage-error".into(),
                        message: Some(message),
                        retry_at: None,
                    };
                    runtime.revision += 1;
                    self.emit(&runtime, false);
                }
            }
            Err(error) => self.sync_status(SyncInfo {
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
            }),
        }
    }
}
