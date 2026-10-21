// macOS VPN services (System Settings → VPN). scutil lists and reports them, but a VPN it starts
// cannot read an L2TP shared secret from the Keychain, so System Events starts and stops them.
// Elsewhere there are no services to list, so a saved VPN is skipped.
#[cfg(not(target_os = "macos"))]
pub fn list() -> Vec<String> {
    Vec::new()
}
#[cfg(not(target_os = "macos"))]
pub fn ensure(_name: &str) -> Result<(), String> {
    Ok(())
}
#[cfg(not(target_os = "macos"))]
pub fn stop_started() {}
#[cfg(target_os = "macos")]
pub use macos::*;
#[cfg(target_os = "macos")]
mod macos {
    use std::{
        process::Command,
        sync::Mutex,
        thread,
        time::{Duration, Instant},
    };

    // Services Orbit started, so quitting Orbit leaves VPNs the user started alone.
    static STARTED: Mutex<Vec<String>> = Mutex::new(Vec::new());

    fn scutil(args: &[&str]) -> Option<String> {
        let output = Command::new("/usr/sbin/scutil").args(args).output().ok()?;
        output
            .status
            .success()
            .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
    }

    pub fn list() -> Vec<String> {
        let mut names: Vec<String> = scutil(&["--nc", "list"])
            .unwrap_or_default()
            .lines()
            .filter_map(|line| line.split('"').nth(1))
            .map(String::from)
            .collect();
        names.sort();
        names.dedup();
        names
    }

    // The name travels as an argument, never as script text.
    fn system_events(verb: &str, name: &str) -> bool {
        Command::new("/usr/bin/osascript")
        .args([
            "-e",
            "on run argv",
            "-e",
            &format!("tell application \"System Events\" to tell current location of network preferences to {verb} service (item 1 of argv)"),
            "-e",
            "end run",
            name,
        ])
        .output()
        .is_ok_and(|output| output.status.success())
    }

    fn status(name: &str) -> String {
        scutil(&["--nc", "status", name])
            .and_then(|out| out.lines().next().map(|l| l.trim().to_string()))
            .unwrap_or_default()
    }

    pub fn ensure(name: &str) -> Result<(), String> {
        if status(name) == "Connected" {
            return Ok(());
        }
        let failed =
            || format!("Could not connect the VPN “{name}”. Check it in System Settings → VPN.");
        if !system_events("connect", name) {
            return Err(format!(
            "Could not start the VPN “{name}”. Allow Orbit to control System Events in System Settings → Privacy & Security → Automation."
        ));
        }
        let deadline = Instant::now() + Duration::from_secs(30);
        let mut attempting = false;
        while Instant::now() < deadline {
            thread::sleep(Duration::from_millis(500));
            match status(name).as_str() {
                "Connected" => {
                    let mut started = STARTED.lock().unwrap();
                    if !started.iter().any(|n| n == name) {
                        started.push(name.to_string());
                    }
                    // Routes and DNS can settle a moment after the link reports connected.
                    thread::sleep(Duration::from_secs(1));
                    return Ok(());
                }
                "Disconnected" if attempting => return Err(failed()),
                "Disconnected" => {}
                _ => attempting = true,
            }
        }
        Err(failed())
    }

    pub fn stop_started() {
        for name in STARTED.lock().unwrap().drain(..) {
            system_events("disconnect", &name);
        }
    }
}
