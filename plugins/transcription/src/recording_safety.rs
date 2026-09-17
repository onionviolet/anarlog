use std::path::Path;

use serde::Serialize;
use sysinfo::Disks;

#[derive(Debug, Serialize, specta::Type)]
pub struct RecordingSafetyStatus {
    pub available_bytes: Option<u64>,
    pub low_power_mode: bool,
}

pub fn status(recording_path: &Path) -> RecordingSafetyStatus {
    RecordingSafetyStatus {
        available_bytes: available_bytes(recording_path),
        low_power_mode: low_power_mode(),
    }
}

fn available_bytes(recording_path: &Path) -> Option<u64> {
    Disks::new_with_refreshed_list()
        .list()
        .iter()
        .filter(|disk| recording_path.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().components().count())
        .map(|disk| disk.available_space())
}

#[cfg(target_os = "macos")]
fn low_power_mode() -> bool {
    use objc2_foundation::NSProcessInfo;

    NSProcessInfo::processInfo().isLowPowerModeEnabled()
}

#[cfg(not(target_os = "macos"))]
fn low_power_mode() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_storage_for_the_current_volume() {
        assert!(available_bytes(Path::new("/")).is_some());
    }
}
