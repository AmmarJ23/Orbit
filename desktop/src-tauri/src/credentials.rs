pub trait Credentials: Send + Sync {
    fn get(&self, account: &str) -> Result<String, String>;
    fn set(&self, account: &str, secret: &str) -> Result<(), String>;
    fn delete(&self, account: &str) -> Result<(), String>;
}
pub struct Keychain;
const SERVICE: &str = "my.ammar.orbit.redmine";
const ERROR: &str = "Orbit could not access its Redmine key in macOS Keychain. Allow Keychain access or enter the key again.";
#[cfg(target_os = "macos")]
impl Credentials for Keychain {
    fn get(&self, account: &str) -> Result<String, String> {
        let options =
            security_framework::passwords::PasswordOptions::new_generic_password(SERVICE, account);
        let bytes = security_framework::passwords::generic_password(options)
            .map_err(|_| ERROR.to_string())?;
        String::from_utf8(bytes).map_err(|_| ERROR.to_string())
    }
    fn set(&self, account: &str, secret: &str) -> Result<(), String> {
        security_framework::passwords::set_generic_password(SERVICE, account, secret.as_bytes())
            .map_err(|_| ERROR.to_string())
    }
    fn delete(&self, account: &str) -> Result<(), String> {
        match security_framework::passwords::delete_generic_password(SERVICE, account) {
            Ok(()) => Ok(()),
            Err(error) if error.code() == -25300 => Ok(()), // Already removed from Keychain.
            Err(_) => Err(ERROR.to_string()),
        }
    }
}
