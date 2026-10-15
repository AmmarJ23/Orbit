use crate::model::ImportedTask;
use reqwest::{
    blocking::Client,
    header::{HeaderMap, HeaderValue, ACCEPT},
};
use serde_json::Value;
use std::{
    collections::HashSet,
    time::{Duration, SystemTime},
};

#[derive(Clone, Debug)]
pub struct RemoteError {
    pub message: String,
    pub auth: bool,
    pub retry_after: Option<u64>,
}
impl RemoteError {
    pub fn invalid() -> Self {
        Self {
            message: "Redmine returned an incomplete or invalid task list. Cached tasks were kept."
                .into(),
            auth: false,
            retry_after: None,
        }
    }
}
pub trait Remote: Send + Sync {
    fn identify(&self, server: &str, key: &str) -> Result<(u64, String), RemoteError>;
    fn tasks(&self, server: &str, key: &str) -> Result<Vec<ImportedTask>, RemoteError>;
}
pub trait HttpGet: Send + Sync {
    fn get(
        &self,
        server: &str,
        key: &str,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<Value, RemoteError>;
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
            .map_err(|_| "Could not initialize the Redmine connection.".to_string())?;
        Ok(Self { client })
    }
}
impl HttpGet for NativeHttp {
    fn get(
        &self,
        server: &str,
        key: &str,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<Value, RemoteError> {
        let mut headers = HeaderMap::new();
        let mut secret = HeaderValue::from_str(key).map_err(|_| RemoteError {
            message: "The Redmine API key contains invalid characters.".into(),
            auth: true,
            retry_after: None,
        })?;
        secret.set_sensitive(true);
        headers.insert("x-redmine-api-key", secret);
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        let response = self.client.get(format!("{server}{path}")).headers(headers).query(query).send()
            .map_err(|_| RemoteError { message: "Could not reach Redmine. Check your connection; cached tasks are still available.".into(), auth: false, retry_after: None })?;
        let status = response.status().as_u16();
        if status == 401 || status == 403 {
            return Err(RemoteError { message: "Redmine rejected this key or account access. Update the connection to resume syncing.".into(), auth: true, retry_after: None });
        }
        if status == 429 || status == 503 {
            let retry = response
                .headers()
                .get("retry-after")
                .and_then(|h| h.to_str().ok())
                .and_then(|v| {
                    v.parse::<u64>().ok().or_else(|| {
                        httpdate::parse_http_date(v).ok().map(|time| {
                            time.duration_since(SystemTime::now())
                                .unwrap_or_default()
                                .as_secs()
                        })
                    })
                });
            return Err(RemoteError {
                message: "Redmine asked Orbit to wait before syncing again.".into(),
                auth: false,
                retry_after: Some(retry.unwrap_or(20).max(1)),
            });
        }
        if !(200..300).contains(&status) {
            return Err(RemoteError {
                message: format!("Redmine returned HTTP {status}. Cached tasks were kept."),
                auth: false,
                retry_after: None,
            });
        }
        response.json().map_err(|_| RemoteError::invalid())
    }
}
pub struct Redmine<H: HttpGet>(pub H);
impl<H: HttpGet> Remote for Redmine<H> {
    fn identify(&self, server: &str, key: &str) -> Result<(u64, String), RemoteError> {
        let response = self.0.get(server, key, "/users/current.json", &[])?;
        let user = &response["user"];
        let id = user["id"]
            .as_u64()
            .filter(|n| *n > 0)
            .ok_or_else(RemoteError::invalid)?;
        let name = [
            user["firstname"].as_str().unwrap_or(""),
            user["lastname"].as_str().unwrap_or(""),
        ]
        .join(" ")
        .trim()
        .to_string();
        Ok((
            id,
            if name.is_empty() {
                format!("Redmine user {id}")
            } else {
                name
            },
        ))
    }
    fn tasks(&self, server: &str, key: &str) -> Result<Vec<ImportedTask>, RemoteError> {
        let mut tasks = Vec::new();
        let mut ids = HashSet::new();
        let mut offset = 0;
        let mut expected = None;
        loop {
            let response = self.0.get(
                server,
                key,
                "/issues.json",
                &[
                    ("assigned_to_id", "me".into()),
                    ("status_id", "open".into()),
                    ("sort", "updated_on:desc".into()),
                    ("limit", "100".into()),
                    ("offset", offset.to_string()),
                ],
            )?;
            let total = response["total_count"]
                .as_u64()
                .ok_or_else(RemoteError::invalid)?;
            if expected.is_some_and(|n| n != total)
                || response["offset"].as_u64().is_some_and(|n| n != offset)
            {
                return Err(RemoteError::invalid());
            }
            expected = Some(total);
            let batch = response["issues"]
                .as_array()
                .ok_or_else(RemoteError::invalid)?;
            if batch.is_empty() && offset < total {
                return Err(RemoteError::invalid());
            }
            for issue in batch {
                let id = issue["id"]
                    .as_u64()
                    .filter(|n| *n > 0)
                    .ok_or_else(RemoteError::invalid)?;
                if !ids.insert(id) {
                    return Err(RemoteError::invalid());
                }
                tasks.push(ImportedTask {
                    external_id: id.to_string(),
                    title: issue["subject"]
                        .as_str()
                        .ok_or_else(RemoteError::invalid)?
                        .to_string(),
                    project: issue["project"]["name"].as_str().map(String::from),
                    priority: issue["priority"]["name"].as_str().map(String::from),
                    url: format!("{server}/issues/{id}"),
                });
            }
            offset += batch.len() as u64;
            if offset > total {
                return Err(RemoteError::invalid());
            }
            if offset == total {
                return Ok(tasks);
            }
        }
    }
}

pub fn normalize_server(input: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(input.trim())
        .map_err(|_| "Enter a valid HTTPS Redmine server URL.".to_string())?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "Use an HTTPS server URL without a username, password, query, or fragment.".into(),
        );
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}
