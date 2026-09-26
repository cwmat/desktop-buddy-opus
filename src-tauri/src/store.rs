//! Persistent app state: `state.json` in the app config dir, shaped
//! `{ "settings": {..}, "stats": {..} }`.
//!
//! Both halves are opaque JSON objects owned by TypeScript (`src/lib/settings.ts`,
//! `src/lib/stats.ts`), which normalizes whatever it reads. Every change is written
//! straight through, atomically (temp file + rename), while holding the lock so
//! writes can never land out of order.

use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::lock;

const FILE_NAME: &str = "state.json";

pub type JsonObject = Map<String, Value>;

#[derive(Default, Serialize, Deserialize)]
struct Data {
    #[serde(default)]
    settings: JsonObject,
    #[serde(default)]
    stats: JsonObject,
}

pub struct Store {
    path: PathBuf,
    data: Mutex<Data>,
}

impl Store {
    /// Loads `state.json` from `dir`. A missing file means a fresh start; a corrupt one
    /// is set aside as `state.json.bak` so nothing is silently lost.
    pub fn load(dir: &Path) -> Self {
        let path = dir.join(FILE_NAME);
        let data = match fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|err| {
                eprintln!(
                    "[store] {} is corrupt ({err}); starting fresh",
                    path.display()
                );
                if let Err(err) = fs::rename(&path, path.with_extension("json.bak")) {
                    eprintln!("[store] couldn't back up corrupt state: {err}");
                }
                Data::default()
            }),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Data::default(),
            Err(err) => {
                eprintln!("[store] couldn't read {}: {err}", path.display());
                Data::default()
            }
        };
        Self {
            path,
            data: Mutex::new(data),
        }
    }

    /// `{ settings, stats }` for `load_state`.
    pub fn snapshot(&self) -> Value {
        let data = lock(&self.data);
        serde_json::json!({ "settings": data.settings, "stats": data.stats })
    }

    pub fn settings(&self) -> JsonObject {
        lock(&self.data).settings.clone()
    }

    /// Shallow-merges `patch` into the stored settings, persists, and returns the result.
    pub fn merge_settings(&self, patch: JsonObject) -> JsonObject {
        let mut data = lock(&self.data);
        data.settings.extend(patch);
        self.write(&data);
        data.settings.clone()
    }

    pub fn set_stats(&self, stats: JsonObject) {
        let mut data = lock(&self.data);
        data.stats = stats;
        self.write(&data);
    }

    /// Re-writes the current state (used on quit as a belt-and-braces flush).
    pub fn flush(&self) {
        self.write(&lock(&self.data));
    }

    /// Persists `data`. Failures are logged rather than returned: the in-memory state
    /// stays authoritative for the session and the next successful write catches up.
    fn write(&self, data: &Data) {
        if let Err(err) = write_atomic(&self.path, data) {
            eprintln!("[store] couldn't save {}: {err}", self.path.display());
        }
    }
}

fn write_atomic(path: &Path, data: &Data) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(data)?)?;
    // `rename` replaces the destination atomically (MoveFileEx on Windows).
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("desktop-buddy-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn missing_file_starts_empty_and_writes_round_trip() {
        let dir = temp_dir("roundtrip");
        let store = Store::load(&dir);
        assert_eq!(store.snapshot(), json!({ "settings": {}, "stats": {} }));

        let patch = json!({ "petId": "glorp", "home": null });
        let merged = store.merge_settings(patch.as_object().unwrap().clone());
        assert_eq!(merged.get("petId"), Some(&json!("glorp")));
        store.set_stats(
            json!({ "glorp": { "treats": 2 } })
                .as_object()
                .unwrap()
                .clone(),
        );

        let reloaded = Store::load(&dir);
        assert_eq!(reloaded.snapshot(), store.snapshot());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_file_is_backed_up() {
        let dir = temp_dir("corrupt");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), "{ not json").unwrap();

        let store = Store::load(&dir);
        assert_eq!(store.settings(), JsonObject::new());
        assert!(dir.join("state.json.bak").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
