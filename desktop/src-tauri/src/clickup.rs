use crate::{
    http::{Identity, NativeHttp, Remote, RemoteError, Workspace},
    model::{Account, ImportedTask, Source},
};
use serde_json::Value;
use std::collections::HashSet;

const API: &str = "https://api.clickup.com/api/v2";
// 100 tasks a page; a ceiling keeps a misbehaving response from looping forever.
const MAX_PAGES: u32 = 50;

pub struct ClickUp(pub NativeHttp);
impl ClickUp {
    fn get(&self, key: &str, path: &str, query: &[(&str, String)]) -> Result<Value, RemoteError> {
        // Personal tokens (pk_…) go in Authorization as-is, without a scheme.
        self.0.get(
            Source::ClickUp,
            "authorization",
            key,
            &format!("{API}{path}"),
            query,
        )
    }
}
fn invalid() -> RemoteError {
    RemoteError::invalid(Source::ClickUp)
}
// ClickUp ids are short alphanumerics; anything else is not used in a path or URL.
fn task_id(value: &Value) -> Option<String> {
    let id = value.as_str()?;
    (!id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric()))
        .then(|| id.to_string())
}
fn capitalize(value: &str) -> String {
    let mut chars = value.chars();
    chars
        .next()
        .map(|first| first.to_uppercase().chain(chars).collect())
        .unwrap_or_default()
}

impl Remote for ClickUp {
    fn identify(
        &self,
        _base: &str,
        key: &str,
        scope: Option<&str>,
    ) -> Result<Identity, RemoteError> {
        if key.trim().is_empty() {
            return Err(RemoteError::plain("Enter your ClickUp API token."));
        }
        let user = &self.get(key, "/user", &[])?["user"];
        let user_id = user["id"].as_u64().filter(|n| *n > 0).ok_or_else(invalid)?;
        let workspaces = self.workspaces(key)?;
        let workspace = match scope {
            Some(id) => workspaces.into_iter().find(|w| w.id == id).ok_or_else(|| {
                RemoteError::plain("This token cannot see the chosen ClickUp workspace.")
            })?,
            None if workspaces.len() == 1 => workspaces.into_iter().next().unwrap(),
            None if workspaces.is_empty() => {
                return Err(RemoteError::plain("This token has no ClickUp workspaces."))
            }
            None => return Err(RemoteError::plain("Choose a ClickUp workspace.")),
        };
        let name = user["username"]
            .as_str()
            .or_else(|| user["email"].as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        Ok(Identity {
            base_url: API.into(),
            user_id,
            user_name: if name.is_empty() {
                format!("ClickUp user {user_id}")
            } else {
                name
            },
            workspace_id: Some(workspace.id),
            workspace_name: Some(workspace.name),
        })
    }
    fn workspaces(&self, key: &str) -> Result<Vec<Workspace>, RemoteError> {
        if key.trim().is_empty() {
            return Err(RemoteError::plain("Enter your ClickUp API token."));
        }
        self.get(key, "/team", &[])?["teams"]
            .as_array()
            .ok_or_else(invalid)?
            .iter()
            .map(|team| {
                let id = match &team["id"] {
                    Value::String(id) => id.clone(),
                    Value::Number(id) => id.to_string(),
                    _ => return Err(invalid()),
                };
                if !id.bytes().all(|b| b.is_ascii_digit()) || id.is_empty() {
                    return Err(invalid());
                }
                let name = team["name"].as_str().unwrap_or("").trim();
                Ok(Workspace {
                    name: if name.is_empty() {
                        format!("Workspace {id}")
                    } else {
                        name.into()
                    },
                    id,
                })
            })
            .collect()
    }
    // Open tasks (closed are excluded by default) assigned to the user, subtasks included.
    fn tasks(&self, account: &Account, key: &str) -> Result<Vec<ImportedTask>, RemoteError> {
        let workspace = account.workspace_id.as_deref().ok_or_else(invalid)?;
        let mut tasks = Vec::new();
        let mut ids = HashSet::new();
        for page in 0..MAX_PAGES {
            let response = self.get(
                key,
                &format!("/team/{workspace}/task"),
                &[
                    ("assignees[]", account.user_id.to_string()),
                    ("subtasks", "true".into()),
                    ("include_closed", "false".into()),
                    ("order_by", "updated".into()),
                    ("page", page.to_string()),
                ],
            )?;
            let batch = response["tasks"].as_array().ok_or_else(invalid)?;
            for task in batch {
                let id = task_id(&task["id"]).ok_or_else(invalid)?;
                if !ids.insert(id.clone()) {
                    return Err(invalid());
                }
                tasks.push(ImportedTask {
                    title: task["name"].as_str().ok_or_else(invalid)?.to_string(),
                    project: task["list"]["name"].as_str().map(String::from),
                    priority: task["priority"]["priority"].as_str().map(capitalize),
                    parent_id: task_id(&task["parent"]),
                    url: format!("https://app.clickup.com/t/{id}"),
                    external_id: id,
                });
            }
            let last = response["last_page"].as_bool().unwrap_or(batch.len() < 100);
            if last {
                return Ok(tasks);
            }
        }
        Err(invalid())
    }
    fn source_url(&self, _account: &Account, external_id: &str) -> Result<String, String> {
        let id = task_id(&Value::String(external_id.into())).ok_or("Invalid ClickUp task id.")?;
        Ok(format!("https://app.clickup.com/t/{id}"))
    }
}
