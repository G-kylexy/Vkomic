use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use anyhow::Result;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub modified_at: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirList {
    pub path: String,
    pub entries: Vec<DirEntry>,
}

pub fn list_directory(target_path: &str) -> Result<DirList> {
    let path = Path::new(target_path);
    if !path.is_dir() {
        return Err(anyhow::anyhow!("Path is not a directory"));
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        let file_type = entry.file_type()?;
        
        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_directory: file_type.is_dir(),
            size: if file_type.is_file() { Some(metadata.len()) } else { None },
            modified_at: metadata.modified()?.duration_since(std::time::UNIX_EPOCH)?.as_millis() as f64,
        });
    }

    // Sort: directories first, then by name
    entries.sort_by(|a, b| {
        if a.is_directory && !b.is_directory { return std::cmp::Ordering::Less; }
        if !a.is_directory && b.is_directory { return std::cmp::Ordering::Greater; }
        a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });

    Ok(DirList {
        path: target_path.to_string(),
        entries,
    })
}

pub fn open_path(target_path: &str) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(target_path).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(target_path).spawn()?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(target_path).spawn()?;
    }
    Ok(())
}

pub fn reveal_path(target_path: &str) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        // Sur Windows, explorer /select,chemin ouvre le dossier et sélectionne le fichier
        // On remplace les / par des \ pour être sûr que l'explorateur comprenne le chemin
        let normalized = target_path.replace("/", "\\");
        
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(normalized)
            .spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        // Sur macOS, -R ouvre dans le Finder et sélectionne
        std::process::Command::new("open")
            .arg("-R")
            .arg(target_path)
            .spawn()?;
    }
    #[cfg(target_os = "linux")]
    {
        // Sur Linux, xdg-open ne supporte pas nativement la sélection. 
        // On se contente d'ouvrir le dossier parent ou le fichier.
        std::process::Command::new("xdg-open").arg(target_path).spawn()?;
    }
    Ok(())
}

