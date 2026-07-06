use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct AppSettings {
    #[serde(default)]
    pub vk_token: String,
    #[serde(default)]
    pub vk_group_id: String,
    #[serde(default)]
    pub vk_topic_id: String,
    #[serde(default)]
    pub vk_download_path: String,
}

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    // Uses the Tauri app data dir: e.g. %APPDATA%\com.vkomic.app\
    app.path().app_data_dir().ok().map(|d| d.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> AppSettings {
    let path = match settings_path(app) {
        Some(p) => p,
        None => return AppSettings::default(),
    };

    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> anyhow::Result<()> {
    let path = settings_path(app).ok_or_else(|| anyhow::anyhow!("Cannot resolve app data dir"))?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let json = serde_json::to_string_pretty(settings)?;
    std::fs::write(&path, json)?;
    Ok(())
}
