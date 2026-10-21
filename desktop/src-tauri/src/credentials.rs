pub trait Credentials: Send + Sync {
    fn get(&self, account: &str) -> Result<String, String>;
    fn set(&self, account: &str, secret: &str) -> Result<(), String>;
    fn delete(&self, account: &str) -> Result<(), String>;
}
pub struct Keychain;
// References start with the source key (see Service::connect), so each source keeps
// its own Keychain service; existing Redmine items keep their original name.
fn service(account: &str) -> &'static str {
    if account.starts_with("clickup|") {
        "my.ammar.orbit.clickup"
    } else {
        "my.ammar.orbit.redmine"
    }
}
#[cfg(target_os = "macos")]
const ERROR: &str = "Orbit could not access its saved key in macOS Keychain. Allow Keychain access or enter the key again.";
#[cfg(target_os = "macos")]
impl Credentials for Keychain {
    fn get(&self, account: &str) -> Result<String, String> {
        let options = security_framework::passwords::PasswordOptions::new_generic_password(
            service(account),
            account,
        );
        let bytes = security_framework::passwords::generic_password(options)
            .map_err(|_| ERROR.to_string())?;
        String::from_utf8(bytes).map_err(|_| ERROR.to_string())
    }
    fn set(&self, account: &str, secret: &str) -> Result<(), String> {
        security_framework::passwords::set_generic_password(
            service(account),
            account,
            secret.as_bytes(),
        )
        .map_err(|_| ERROR.to_string())
    }
    fn delete(&self, account: &str) -> Result<(), String> {
        match security_framework::passwords::delete_generic_password(service(account), account) {
            Ok(()) => Ok(()),
            Err(error) if error.code() == -25300 => Ok(()), // Already removed from Keychain.
            Err(_) => Err(ERROR.to_string()),
        }
    }
}
// Windows keeps the same service/account pairs in Credential Manager.
#[cfg(target_os = "windows")]
const ERROR: &str =
    "Orbit could not access its saved key in Windows Credential Manager. Enter the key again.";
#[cfg(target_os = "windows")]
fn entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(service(account), account).map_err(|_| ERROR.to_string())
}
#[cfg(target_os = "windows")]
impl Credentials for Keychain {
    fn get(&self, account: &str) -> Result<String, String> {
        entry(account)?
            .get_password()
            .map_err(|_| ERROR.to_string())
    }
    fn set(&self, account: &str, secret: &str) -> Result<(), String> {
        entry(account)?
            .set_password(secret)
            .map_err(|_| ERROR.to_string())
    }
    fn delete(&self, account: &str) -> Result<(), String> {
        match entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(ERROR.to_string()),
        }
    }
}
