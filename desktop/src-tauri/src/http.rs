use crate::model::{Account, ImportedTask, Source};
use reqwest::{
    blocking::Client,
    header::{HeaderMap, HeaderValue, ACCEPT},
};
use serde_json::Value;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug)]
pub struct RemoteError {
    pub message: String,
    pub auth: bool,
    pub retry_after: Option<u64>,
}
impl RemoteError {
    pub fn invalid(source: Source) -> Self {
        Self::plain(format!(
            "{} returned an incomplete or invalid task list. Cached tasks were kept.",
            source.name()
        ))
    }
    pub fn plain(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            auth: false,
            retry_after: None,
        }
    }
}

// Who a credential belongs to, as confirmed by the source during setup.
pub struct Identity {
    pub base_url: String,
    pub user_id: u64,
    pub user_name: String,
    pub workspace_id: Option<String>,
    pub workspace_name: Option<String>,
}
#[derive(Clone, Debug, serde::Serialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
}
pub trait Remote: Send + Sync {
    // `scope` is the ClickUp workspace; Redmine ignores it.
    fn identify(&self, base: &str, key: &str, scope: Option<&str>)
        -> Result<Identity, RemoteError>;
    // Must return the complete open-assignment list or an error, never a partial list.
    fn tasks(&self, account: &Account, key: &str) -> Result<Vec<ImportedTask>, RemoteError>;
    fn source_url(&self, account: &Account, external_id: &str) -> Result<String, String>;
    // Only ClickUp has workspaces to choose between during setup.
    fn workspaces(&self, _key: &str) -> Result<Vec<Workspace>, RemoteError> {
        Ok(Vec::new())
    }
}

pub struct NativeHttp {
    client: Client,
}
impl NativeHttp {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| "Could not initialize Orbit's network client.".to_string())?;
        Ok(Self { client })
    }
    // GET only; Orbit never writes to a source. The key travels in `auth_header` and is
    // marked sensitive so it never appears in debug output or error messages.
    pub fn get(
        &self,
        source: Source,
        auth_header: &'static str,
        key: &str,
        url: &str,
        query: &[(&str, String)],
    ) -> Result<Value, RemoteError> {
        let name = source.name();
        let mut headers = HeaderMap::new();
        let mut secret = HeaderValue::from_str(key.trim()).map_err(|_| RemoteError {
            message: format!("The {name} key contains invalid characters."),
            auth: true,
            retry_after: None,
        })?;
        secret.set_sensitive(true);
        headers.insert(auth_header, secret);
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        let response = self
            .client
            .get(url)
            .headers(headers)
            .query(query)
            .send()
            .map_err(|_| {
                RemoteError::plain(format!(
                    "Could not reach {name}. Check your connection; cached tasks are still available."
                ))
            })?;
        let status = response.status().as_u16();
        if status == 401 || status == 403 {
            return Err(RemoteError {
                message: format!(
                    "{name} rejected this key or account access. Update the connection to resume syncing."
                ),
                auth: true,
                retry_after: None,
            });
        }
        if status == 429 || status == 503 {
            let headers = response.headers();
            let text = |key: &str| headers.get(key).and_then(|h| h.to_str().ok());
            let retry = text("retry-after")
                .and_then(|v| {
                    v.parse::<u64>().ok().or_else(|| {
                        httpdate::parse_http_date(v).ok().map(|time| {
                            time.duration_since(SystemTime::now())
                                .unwrap_or_default()
                                .as_secs()
                        })
                    })
                })
                // ClickUp sends the Unix time its rate-limit window resets instead.
                .or_else(|| {
                    let reset = text("x-ratelimit-reset")?.parse::<u64>().ok()?;
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    Some(reset.saturating_sub(now))
                });
            return Err(RemoteError {
                message: format!("{name} asked Orbit to wait before syncing again."),
                auth: false,
                retry_after: Some(retry.unwrap_or(20).clamp(1, 3600)),
            });
        }
        if !(200..300).contains(&status) {
            return Err(RemoteError::plain(format!(
                "{name} returned HTTP {status}. Cached tasks were kept."
            )));
        }
        response.json().map_err(|_| RemoteError::invalid(source))
    }
}
