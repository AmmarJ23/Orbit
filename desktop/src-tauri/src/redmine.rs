use crate::{
    http::{Identity, NativeHttp, Remote, RemoteError},
    model::{Account, ImportedTask, Source},
};
use std::collections::HashSet;

pub struct Redmine(pub NativeHttp);
impl Redmine {
    fn get(
        &self,
        server: &str,
        key: &str,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<serde_json::Value, RemoteError> {
        self.0.get(
            Source::Redmine,
            "x-redmine-api-key",
            key,
            &format!("{server}{path}"),
            query,
        )
    }
}
impl Remote for Redmine {
    fn identify(
        &self,
        input: &str,
        key: &str,
        _scope: Option<&str>,
    ) -> Result<Identity, RemoteError> {
        let server = normalize_server(input).map_err(RemoteError::plain)?;
        if key.trim().is_empty() {
            return Err(RemoteError::plain("Enter your Redmine API key."));
        }
        let response = self.get(&server, key, "/users/current.json", &[])?;
        let user = &response["user"];
        let id = user["id"]
            .as_u64()
            .filter(|n| *n > 0)
            .ok_or_else(|| RemoteError::invalid(Source::Redmine))?;
        let name = [
            user["firstname"].as_str().unwrap_or(""),
            user["lastname"].as_str().unwrap_or(""),
        ]
        .join(" ")
        .trim()
        .to_string();
        Ok(Identity {
            base_url: server,
            user_id: id,
            user_name: if name.is_empty() {
                format!("Redmine user {id}")
            } else {
                name
            },
            workspace_id: None,
            workspace_name: None,
        })
    }
    fn tasks(&self, account: &Account, key: &str) -> Result<Vec<ImportedTask>, RemoteError> {
        let server = account.base_url.as_str();
        let mut tasks = Vec::new();
        let mut ids = HashSet::new();
        let mut offset = 0;
        let mut expected = None;
        loop {
            let response = self.get(
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
                .ok_or_else(|| RemoteError::invalid(Source::Redmine))?;
            if expected.is_some_and(|n| n != total)
                || response["offset"].as_u64().is_some_and(|n| n != offset)
            {
                return Err(RemoteError::invalid(Source::Redmine));
            }
            expected = Some(total);
            let batch = response["issues"]
                .as_array()
                .ok_or_else(|| RemoteError::invalid(Source::Redmine))?;
            if batch.is_empty() && offset < total {
                return Err(RemoteError::invalid(Source::Redmine));
            }
            for issue in batch {
                let id = issue["id"]
                    .as_u64()
                    .filter(|n| *n > 0)
                    .ok_or_else(|| RemoteError::invalid(Source::Redmine))?;
                if !ids.insert(id) {
                    return Err(RemoteError::invalid(Source::Redmine));
                }
                tasks.push(ImportedTask {
                    external_id: id.to_string(),
                    parent_id: None,
                    title: issue["subject"]
                        .as_str()
                        .ok_or_else(|| RemoteError::invalid(Source::Redmine))?
                        .to_string(),
                    project: issue["project"]["name"].as_str().map(String::from),
                    priority: issue["priority"]["name"].as_str().map(String::from),
                    url: format!("{server}/issues/{id}"),
                });
            }
            offset += batch.len() as u64;
            if offset > total {
                return Err(RemoteError::invalid(Source::Redmine));
            }
            if offset == total {
                return Ok(tasks);
            }
        }
    }
    fn source_url(&self, account: &Account, external_id: &str) -> Result<String, String> {
        issue_url(account, external_id)
    }
}

pub fn issue_url(account: &Account, external_id: &str) -> Result<String, String> {
    let number = external_id
        .parse::<u64>()
        .map_err(|_| "Invalid ticket number.")?;
    Ok(format!(
        "{}/issues/{number}",
        normalize_server(&account.base_url)?
    ))
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
