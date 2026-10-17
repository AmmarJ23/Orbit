use crate::model::{SavedData, Source};
use rusqlite::{Connection, OptionalExtension};
use std::path::Path;

pub struct Repository {
    connection: Connection,
}
const STORAGE_ERROR: &str = "Orbit could not read or save its local database. Your existing data has been left in place. Check available disk space and file permissions, then relaunch.";

impl Repository {
    pub fn open(path: &Path) -> Result<(Self, SavedData), String> {
        let connection = Connection::open(path).map_err(|_| STORAGE_ERROR.to_string())?;
        Self::initialize(connection)
    }
    fn initialize(connection: Connection) -> Result<(Self, SavedData), String> {
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|_| STORAGE_ERROR.to_string())?;
        let version: u32 = connection
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|_| STORAGE_ERROR.to_string())?;
        if version > 1 {
            return Err("This database was created by a newer Orbit version. Update Orbit; the database has not been reset.".into());
        }
        if version == 0 {
            connection.execute_batch("BEGIN IMMEDIATE;
                CREATE TABLE orbit_state (id INTEGER PRIMARY KEY CHECK(id = 1), document TEXT NOT NULL);
                PRAGMA user_version = 1; COMMIT;")
                .map_err(|_| STORAGE_ERROR.to_string())?;
        }
        // A single typed document makes all account/task/preference changes atomic.
        // SQLite owns durability; records remain independent of rendering objects.
        let document: Option<String> = connection
            .query_row("SELECT document FROM orbit_state WHERE id=1", [], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|_| STORAGE_ERROR.to_string())?;
        let mut data: SavedData = match document {
            Some(json) => serde_json::from_str(&json).map_err(|_| STORAGE_ERROR.to_string())?,
            None => SavedData::default(),
        };
        data.preferences
            .validate()
            .map_err(|_| STORAGE_ERROR.to_string())?;
        // Documents from before ClickUp held one Redmine account; it stays active.
        if let Some(id) = data.active_account.take() {
            data.active_accounts.entry(Source::Redmine).or_insert(id);
        }
        if data.active_accounts.iter().any(|(source, id)| {
            !data
                .accounts
                .get(id)
                .is_some_and(|account| account.source == *source)
        }) {
            return Err(STORAGE_ERROR.into());
        }
        Ok((Self { connection }, data))
    }
    pub fn save(&mut self, data: &SavedData) -> Result<(), String> {
        let json = serde_json::to_string(data).map_err(|_| STORAGE_ERROR.to_string())?;
        let transaction = self
            .connection
            .transaction()
            .map_err(|_| STORAGE_ERROR.to_string())?;
        transaction
            .execute(
                "INSERT INTO orbit_state(id, document) VALUES(1, ?1)
            ON CONFLICT(id) DO UPDATE SET document=excluded.document",
                [json],
            )
            .map_err(|_| STORAGE_ERROR.to_string())?;
        transaction.commit().map_err(|_| STORAGE_ERROR.to_string())
    }
}
