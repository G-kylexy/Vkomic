use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::{VecDeque, HashMap};
use tauri::{AppHandle, Emitter};
use anyhow::Result;
use futures_util::StreamExt;
use std::io::SeekFrom;
use tokio::io::{AsyncWriteExt, AsyncSeekExt};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadTask {
    pub id: String,
    pub url: String,
    pub directory: String,
    pub file_name: String,
    pub token: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub id: String,
    pub progress: f64,
    pub received_bytes: u64,
    pub total_bytes: Option<u64>,
    pub speed_bytes: f64,
}

pub struct DownloadManager {
    queue: Arc<Mutex<VecDeque<DownloadTask>>>,
    active: Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>,
    cancel_tokens: Arc<Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            queue: Arc::new(Mutex::new(VecDeque::new())),
            active: Arc::new(Mutex::new(HashMap::new())),
            cancel_tokens: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn add_task(&self, app: AppHandle, task: DownloadTask) {
        let mut queue = self.queue.lock().await;
        queue.push_back(task);
        drop(queue);
        self.schedule_next(app).await;
    }

    pub async fn cancel_task(&self, app: AppHandle, task_id: String) -> bool {
        let mut cancel_tokens = self.cancel_tokens.lock().await;
        let mut active = self.active.lock().await;
        
        if let Some(sender) = cancel_tokens.remove(&task_id) {
            let _ = sender.send(true);
            
            if let Some(handle) = active.remove(&task_id) {
                handle.abort();
            }
            
            let _ = app.emit("download-result", serde_json::json!({
                "id": task_id,
                "ok": false,
                "status": "aborted"
            }));
            
            drop(cancel_tokens);
            drop(active);
            self.schedule_next(app).await;
            
            return true;
        }
        
        false
    }

    pub async fn clear_queue(&self, app: AppHandle) -> usize {
        let mut queue = self.queue.lock().await;
        let queue_count = queue.len();
        queue.clear();
        drop(queue);
        
        let mut cancel_tokens = self.cancel_tokens.lock().await;
        let mut active = self.active.lock().await;
        let active_count = active.len();
        
        for (id, sender) in cancel_tokens.drain() {
            let _ = sender.send(true);
            if let Some(handle) = active.remove(&id) {
                handle.abort();
            }
            
            let _ = app.emit("download-result", serde_json::json!({
                "id": id,
                "ok": false,
                "status": "aborted"
            }));
        }
        
        drop(cancel_tokens);
        drop(active);
        
        let total_cancelled = queue_count + active_count;
        
        self.schedule_next(app).await;
        
        total_cancelled
    }

    async fn schedule_next(&self, app: AppHandle) {
        let mut active = self.active.lock().await;
        if active.len() >= 3 { return; }

        let mut queue = self.queue.lock().await;
        if let Some(task) = queue.pop_front() {
            let id = task.id.clone();
            let manager_active = self.active.clone();
            let manager_cancel_tokens = self.cancel_tokens.clone();
            let app_clone = app.clone();
            let id_for_closure = id.clone();
            
            let (cancel_tx, mut cancel_rx) = tokio::sync::watch::channel(false);
            
            let handle = tokio::spawn(async move {
                let result = download_file_worker(app_clone.clone(), task, &mut cancel_rx).await;
                
                let mut active = manager_active.lock().await;
                active.remove(&id_for_closure);
                
                let mut cancel_tokens = manager_cancel_tokens.lock().await;
                cancel_tokens.remove(&id_for_closure);
                
                if let Err(e) = result {
                    let _ = app_clone.emit("download-result", serde_json::json!({
                        "id": id_for_closure,
                        "ok": false,
                        "error": e.to_string()
                    }));
                }
            });
            
            active.insert(id.clone(), handle);
            drop(active);
            drop(queue);
            
            let mut cancel_tokens = self.cancel_tokens.lock().await;
            cancel_tokens.insert(id, cancel_tx);
        }
    }
}

async fn download_file_worker(
    app: AppHandle, 
    task: DownloadTask,
    cancel_rx: &mut tokio::sync::watch::Receiver<bool>
) -> Result<()> {
    let client = reqwest::Client::new();
    let path = std::path::Path::new(&task.directory).join(&task.file_name);
    
    let mut start_byte = 0;
    if path.exists() {
        start_byte = std::fs::metadata(&path)?.len();
    }

    let mut request = client.get(&task.url);
    if start_byte > 0 {
        request = request.header("Range", format!("bytes={}-", start_byte));
    }

    let response = request.send().await?;
    
    if *cancel_rx.borrow() {
        return Err(anyhow::anyhow!("Download cancelled"));
    }
    
    let total_size = response.content_length().map(|l| l + start_byte);
    
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .await?;

    if response.status() == 200 {
        file.set_len(0).await?;
        file.seek(SeekFrom::Start(0)).await?;
        start_byte = 0;
    }

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let start_time = std::time::Instant::now();

    while let Some(item) = stream.next().await {
        if *cancel_rx.borrow() {
            let _ = app.emit("download-result", serde_json::json!({
                "id": task.id.clone(),
                "ok": false,
                "status": "aborted"
            }));
            return Err(anyhow::anyhow!("Download cancelled"));
        }
        
        let chunk = item?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        let total_downloaded = start_byte + downloaded;
        let elapsed = start_time.elapsed().as_secs_f64();
        let speed = if elapsed > 0.0 { downloaded as f64 / elapsed } else { 0.0 };
        let progress = total_size.map(|total| (total_downloaded as f64 / total as f64) * 100.0).unwrap_or(0.0);

        app.emit("download-progress", ProgressPayload {
            id: task.id.clone(),
            progress,
            received_bytes: total_downloaded,
            total_bytes: total_size,
            speed_bytes: speed,
        })?;
    }

    app.emit("download-result", serde_json::json!({
        "id": task.id,
        "ok": true,
        "path": path.to_string_lossy()
    }))?;

    Ok(())
}
