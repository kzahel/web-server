use std::path::PathBuf;

pub fn get_config_dir() -> Option<PathBuf> {
    if let Ok(env_dir) = std::env::var("OK200_CONFIG_DIR") {
        return Some(PathBuf::from(env_dir));
    }
    dirs::config_dir()
}

const CFU_ID_FILENAME: &str = "cfu-id";

/// Get or create a persistent check-for-update ID.
/// Stored as a plain UUID in `~/.config/ok200-native/cfu-id`.
/// This ID is sent with update check requests to help estimate unique active installs.
pub fn get_or_create_cfu_id() -> Option<String> {
    let dir = get_config_dir()?.join("ok200-native");
    let path = dir.join(CFU_ID_FILENAME);

    if let Ok(id) = std::fs::read_to_string(&path) {
        let id = id.trim().to_string();
        if !id.is_empty() {
            return Some(id);
        }
    }

    // Generate and persist a new UUID
    std::fs::create_dir_all(&dir).ok()?;
    let id = uuid::Uuid::new_v4().to_string();
    std::fs::write(&path, &id).ok()?;
    Some(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    #[serial]
    fn test_get_config_dir_env_override() {
        let key = "OK200_CONFIG_DIR";
        let original = std::env::var(key).ok();

        std::env::set_var(key, "/tmp/test-ok200-config");
        let dir = get_config_dir().unwrap();
        assert_eq!(dir, PathBuf::from("/tmp/test-ok200-config"));

        match original {
            Some(val) => std::env::set_var(key, val),
            None => std::env::remove_var(key),
        }
    }

    #[test]
    #[serial]
    fn test_get_or_create_cfu_id_persistence() {
        let tmp = tempfile::tempdir().unwrap();
        let key = "OK200_CONFIG_DIR";
        let original = std::env::var(key).ok();

        std::env::set_var(key, tmp.path());

        let id1 = get_or_create_cfu_id().expect("should create cfu-id");
        assert!(!id1.is_empty());
        assert_eq!(id1.len(), 36, "should be a UUID with hyphens");

        let id2 = get_or_create_cfu_id().expect("should read existing cfu-id");
        assert_eq!(id1, id2, "cfu-id must be stable across calls");

        match original {
            Some(val) => std::env::set_var(key, val),
            None => std::env::remove_var(key),
        }
    }
}
