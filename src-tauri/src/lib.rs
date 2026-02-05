mod vk_api;
mod vk_parser;
mod fs_ops;
mod download;

use tauri::{AppHandle, State};
use crate::vk_api::VkApi;
use crate::vk_parser::VkNode;
use crate::download::{DownloadManager, DownloadTask};
use crate::fs_ops::{DirList, open_path, reveal_path, list_directory};

struct AppState {
    download_manager: DownloadManager,
}

#[tauri::command]
async fn vk_ping(token: String) -> Result<u64, String> {
    let api = VkApi::new(token);
    api.ping().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn vk_fetch_root_index(token: String, group_id: String, topic_id: String) -> Result<Vec<VkNode>, String> {
    let api = VkApi::new(token);
    api.fetch_root_index(&group_id, &topic_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn vk_fetch_full_index(token: String, group_id: String, topic_id: String) -> Result<Vec<VkNode>, String> {
    let api = VkApi::new(token);
    api.fetch_folder_tree_recursive(&group_id, &topic_id, 3).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn vk_fetch_node_content(token: String, group_id: String, topic_id: String) -> Result<VkNode, String> {
    let api = VkApi::new(token);
    api.fetch_node_content(&group_id, &topic_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fs_list_directory(path: String) -> Result<DirList, String> {
    list_directory(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn fs_open_path(path: String) -> Result<(), String> {
    open_path(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn fs_reveal_path(path: String) -> Result<(), String> {
    reveal_path(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn fs_queue_download(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    url: String,
    directory: String,
    file_name: String,
    token: Option<String>,
) -> Result<(), String> {
    let task = DownloadTask { id, url, directory, file_name, token };
    state.download_manager.add_task(app, task).await;
    Ok(())
}

#[tauri::command]
async fn fs_cancel_download(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let cancelled = state.download_manager.cancel_task(app, id).await;
    Ok(cancelled)
}

#[tauri::command]
async fn fs_clear_download_queue(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let count = state.download_manager.clear_queue(app).await;
    Ok(count)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            download_manager: DownloadManager::new(),
        })
.plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
.invoke_handler(tauri::generate_handler![
            vk_ping,
            vk_fetch_root_index,
            vk_fetch_full_index,
            vk_fetch_node_content,
            fs_list_directory,
            fs_open_path,
            fs_reveal_path,
            fs_queue_download,
            fs_cancel_download,
            fs_clear_download_queue
        ])
        .setup(|app| {
            // Plugin HTTP pour les requêtes sans CORS
            app.handle().plugin(tauri_plugin_http::init())?;
            
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
