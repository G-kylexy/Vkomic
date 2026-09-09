use anyhow::Result;
use futures_util::StreamExt;
use reqwest::header::{ACCEPT_ENCODING, CONTENT_RANGE, RANGE};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

const MAX_ACTIVE_DOWNLOADS: usize = 2;
const MAX_DOWNLOAD_ATTEMPTS: usize = 5;
const FALLBACK_AFTER_FAILURES: usize = 2;
const FALLBACK_CHUNK_SIZE: u64 = 32 * 1024 * 1024;
const VKOMIC_USER_AGENT: &str =
    "KateMobileAndroid/110.1 lite-x86_64 (Android 11; SDK 30; x86_64; en)";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadTask {
    pub id: String,
    pub url: String,
    pub directory: String,
    pub file_name: String,
    pub expected_size: Option<u64>,
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

#[derive(Clone)]
pub struct DownloadManager {
    queue: Arc<Mutex<VecDeque<DownloadTask>>>,
    active: Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>,
    cancel_tokens: Arc<Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>>,
}

enum DownloadAttemptOutcome {
    Complete,
    MoreData,
}

impl DownloadManager {
    pub fn new() -> Self {
        println!("DEBUG: DownloadManager created");
        Self {
            queue: Arc::new(Mutex::new(VecDeque::new())),
            active: Arc::new(Mutex::new(HashMap::new())),
            cancel_tokens: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn add_task(&self, app: AppHandle, task: DownloadTask) {
        println!("DEBUG: add_task called for {}", task.id);
        let mut queue = self.queue.lock().await;
        queue.push_back(task);
        println!("DEBUG: Task pushed to queue. Queue size: {}", queue.len());
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

            let _ = app.emit(
                "download-result",
                serde_json::json!({
                    "id": task_id,
                    "ok": false,
                    "status": "aborted"
                }),
            );

            drop(cancel_tokens);
            drop(active);
            self.schedule_next(app).await;

            return true;
        }

        false
    }

    pub async fn reset_task(&self, app: AppHandle, task_id: String) -> bool {
        let mut queue = self.queue.lock().await;
        let queued_before = queue.len();
        queue.retain(|task| task.id != task_id);
        let was_queued = queue.len() != queued_before;
        drop(queue);

        let mut cancel_tokens = self.cancel_tokens.lock().await;
        let mut active = self.active.lock().await;
        let was_active = if let Some(sender) = cancel_tokens.remove(&task_id) {
            let _ = sender.send(true);
            if let Some(handle) = active.remove(&task_id) {
                handle.abort();
            }
            true
        } else {
            false
        };
        drop(active);
        drop(cancel_tokens);

        self.schedule_next(app).await;
        was_queued || was_active
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

            let _ = app.emit(
                "download-result",
                serde_json::json!({
                    "id": id,
                    "ok": false,
                    "status": "aborted"
                }),
            );
        }

        drop(cancel_tokens);
        drop(active);

        let total_cancelled = queue_count + active_count;

        self.schedule_next(app).await;

        total_cancelled
    }

    fn trigger_next(&self, app: AppHandle) {
        let manager = self.clone();
        tokio::spawn(async move {
            manager.schedule_next(app).await;
        });
    }

    async fn schedule_next(&self, app: AppHandle) {
        // Lock Queue FIRST to check if there is work
        // This prevents "checking active < 3" then "finding queue empty" waste, or races where queue fills up after check.
        let mut queue = self.queue.lock().await;
        if queue.is_empty() {
            println!("DEBUG: Queue empty, nothing to schedule.");
            return;
        }

        // Lock Active SECOND
        let mut active = self.active.lock().await;
        if active.len() >= MAX_ACTIVE_DOWNLOADS {
            println!(
                "DEBUG: Active slots full ({}/{}). Waiting.",
                active.len(),
                MAX_ACTIVE_DOWNLOADS
            );
            return;
        }

        // We have work AND space.
        // Pop the task (we hold queue lock, so we are unique consumer here)
        if let Some(task) = queue.pop_front() {
            println!("DEBUG: Popped task {} from queue. Starting...", task.id);
            let id = task.id.clone();

            let manager_clone = self.clone();
            let app_clone = app.clone();
            let id_for_closure = id.clone();

            let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

            let handle = tokio::spawn(async move {
                println!("DEBUG: Worker started for task {}", id_for_closure);
                let result = download_file_worker(app_clone.clone(), task, cancel_rx).await;
                println!("DEBUG: Worker finished for task {}", id_for_closure);

                // Cleanup
                let mut active = manager_clone.active.lock().await;
                active.remove(&id_for_closure);
                drop(active);

                let mut cancel_tokens = manager_clone.cancel_tokens.lock().await;
                cancel_tokens.remove(&id_for_closure);
                drop(cancel_tokens);

                if let Err(e) = result {
                    println!("DEBUG: Task {} failed: {}", id_for_closure, e);
                    let _ = app_clone.emit(
                        "download-result",
                        serde_json::json!({
                            "id": id_for_closure,
                            "ok": false,
                            "error": e.to_string()
                        }),
                    );
                } else {
                    println!("DEBUG: Task {} success", id_for_closure);
                }

                // Trigger next loop
                manager_clone.trigger_next(app_clone);
            });

            // Insert handle to active map
            active.insert(id.clone(), handle);

            // Register cancel token
            let mut cancel_tokens = self.cancel_tokens.lock().await;
            cancel_tokens.insert(id, cancel_tx);

            // Drop locks before triggering recursive scheduling to allow parallelism
            drop(active);
            drop(queue);
            drop(cancel_tokens);

            // Try to schedule more immediately if capacity remains
            self.trigger_next(app.clone());
        }
    }
}

async fn download_file_worker(
    app: AppHandle,
    task: DownloadTask,
    cancel_rx: tokio::sync::watch::Receiver<bool>,
) -> Result<()> {
    let client = reqwest::Client::builder()
        .user_agent(VKOMIC_USER_AGENT)
        .build()?;
    let mut failed_attempts = 0usize;
    loop {
        let chunk_size =
            (failed_attempts >= FALLBACK_AFTER_FAILURES).then_some(FALLBACK_CHUNK_SIZE);
        match download_file_attempt(
            app.clone(),
            task.clone(),
            cancel_rx.clone(),
            &client,
            chunk_size,
        )
        .await
        {
            Ok(DownloadAttemptOutcome::Complete) => return Ok(()),
            Ok(DownloadAttemptOutcome::MoreData) => continue,
            Err(error) if *cancel_rx.borrow() => return Err(error),
            Err(error) => {
                failed_attempts += 1;
                if failed_attempts == MAX_DOWNLOAD_ATTEMPTS {
                    return Err(error);
                }
                // VK sometimes closes a ranged response before its declared end.
                // The partial bytes are safely retained; retrying with a new Range
                // request resumes from the current file size.
                println!(
                    "DEBUG: Download attempt {}/{} failed for {}: {:#}. Retrying{}...",
                    failed_attempts,
                    MAX_DOWNLOAD_ATTEMPTS,
                    task.id,
                    error,
                    if failed_attempts == FALLBACK_AFTER_FAILURES {
                        " with 32 MiB chunks"
                    } else {
                        ""
                    }
                );
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn download_file_attempt(
    app: AppHandle,
    task: DownloadTask,
    cancel_rx: tokio::sync::watch::Receiver<bool>,
    client: &reqwest::Client,
    chunk_size: Option<u64>,
) -> Result<DownloadAttemptOutcome> {
    println!("DEBUG: Worker processing task {}", task.id);

    // Sanitization du nom de fichier pour Windows (remplace les caractères interdits par _)
    let safe_file_name: String = task
        .file_name
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();

    let path = std::path::Path::new(&task.directory).join(&safe_file_name);
    println!("DEBUG: Target file path: {:?}", path);

    // Ensure directory exists
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            println!("DEBUG: Creating directory: {:?}", parent);
            tokio::fs::create_dir_all(parent).await?;
        }
    }

    let mut start_byte = 0;
    if path.exists() {
        start_byte = std::fs::metadata(&path)?.len();
    }

    // Keep the UI in sync with the worker even if VK resets the stream before
    // the first chunk reaches the throttled progress reporter.
    let _ = app.emit(
        "download-progress",
        ProgressPayload {
            id: task.id.clone(),
            progress: task
                .expected_size
                .map(|total| (start_byte as f64 / total as f64) * 100.0)
                .unwrap_or(0.0),
            received_bytes: start_byte,
            total_bytes: task.expected_size,
            speed_bytes: 0.0,
        },
    );

    // Normal downloads keep the original single response. After two failed
    // attempts, request bounded ranges with identity encoding so one unstable
    // CDN response cannot discard the already-written prefix.
    let mut request = client.get(&task.url);
    if let Some(chunk_size) = chunk_size {
        let range_end = start_byte.saturating_add(chunk_size - 1);
        println!(
            "DEBUG: Fallback request bytes {}-{} for {}",
            start_byte, range_end, task.id
        );
        request = request
            .header(ACCEPT_ENCODING, "identity")
            .header(RANGE, format!("bytes={start_byte}-{range_end}"));
    } else if start_byte > 0 {
        request = request.header(RANGE, format!("bytes={start_byte}-"));
    }
    let response = request.send().await?;

    if *cancel_rx.borrow() {
        return Err(anyhow::anyhow!("Download cancelled"));
    }

    let content_range_total = response
        .headers()
        .get(CONTENT_RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(parse_content_range_total);

    if response.status() == StatusCode::RANGE_NOT_SATISFIABLE
        && content_range_total.is_some_and(|total| start_byte >= total)
    {
        app.emit(
            "download-result",
            serde_json::json!({
                "id": task.id,
                "ok": true,
                "path": path.to_string_lossy()
            }),
        )?;
        return Ok(DownloadAttemptOutcome::Complete);
    }

    if !response.status().is_success() {
        return Err(anyhow::anyhow!(
            "VK returned HTTP {} for the requested byte range",
            response.status()
        ));
    }

    let response_content_length = response.content_length();

    // Détermine le mode d'ouverture selon le code HTTP
    let mut file = if response.status() == 206 {
        // Contenu partiel (Resume) : On ouvre en append pour ne pas pèter le début
        println!("DEBUG: Status 206 (Partial) - Resuming download");
        tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .await?
    } else {
        // Contenu complet (200) : On écrase le fichier (Truncate)
        // C'est plus sûr que d'ouvrir en append puis set_len(0), ce qui peut causer Error 5
        println!(
            "DEBUG: Status {} - Overwriting/Creating file",
            response.status()
        );
        start_byte = 0; // On repart de zéro puisque le serveur renvoie tout
        tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&path)
            .await?
    };

    let total_size = content_range_total
        .or(task.expected_size)
        .or_else(|| response_content_length.map(|l| l + start_byte));

    // Plus besoin de seek/set_len manuel car géré par les flags OpenOptions

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let start_time = std::time::Instant::now();
    let mut last_emit = std::time::Instant::now();

    while let Some(item) = stream.next().await {
        if *cancel_rx.borrow() {
            let _ = app.emit(
                "download-result",
                serde_json::json!({
                    "id": task.id.clone(),
                    "ok": false,
                    "status": "aborted"
                }),
            );
            return Err(anyhow::anyhow!("Download cancelled"));
        }

        let chunk = match item {
            Ok(chunk) => chunk,
            Err(error) => {
                println!(
                    "DEBUG: Stream interrupted after {} new bytes (resume offset {}).",
                    downloaded, start_byte
                );
                // Only fallback chunks resume immediately after a partial
                // response. A normal stream failure counts toward the two
                // failures required before enabling bounded ranges.
                if chunk_size.is_some() && downloaded > 0 {
                    return Ok(DownloadAttemptOutcome::MoreData);
                }
                return Err(error.into());
            }
        };
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        let total_downloaded = start_byte + downloaded;

        // Throttle updates to avoid flooding frontend
        if last_emit.elapsed().as_millis() > 100 {
            let elapsed = start_time.elapsed().as_secs_f64();
            let speed = if elapsed > 0.0 {
                downloaded as f64 / elapsed
            } else {
                0.0
            };
            let progress = total_size
                .map(|total| (total_downloaded as f64 / total as f64) * 100.0)
                .unwrap_or(0.0);

            app.emit(
                "download-progress",
                ProgressPayload {
                    id: task.id.clone(),
                    progress,
                    received_bytes: total_downloaded,
                    total_bytes: total_size,
                    speed_bytes: speed,
                },
            )?;
            last_emit = std::time::Instant::now();
        }
    }

    let total_downloaded = start_byte + downloaded;
    let progress = total_size
        .map(|total| (total_downloaded as f64 / total as f64) * 100.0)
        .unwrap_or(0.0);
    app.emit(
        "download-progress",
        ProgressPayload {
            id: task.id.clone(),
            progress,
            received_bytes: total_downloaded,
            total_bytes: total_size,
            speed_bytes: if start_time.elapsed().is_zero() {
                0.0
            } else {
                downloaded as f64 / start_time.elapsed().as_secs_f64()
            },
        },
    )?;

    if chunk_size.is_some() && total_size.is_some_and(|total| total_downloaded < total) {
        return Ok(DownloadAttemptOutcome::MoreData);
    }

    app.emit(
        "download-result",
        serde_json::json!({
            "id": task.id,
            "ok": true,
            "path": path.to_string_lossy()
        }),
    )?;

    Ok(DownloadAttemptOutcome::Complete)
}

fn parse_content_range_total(value: &str) -> Option<u64> {
    value.rsplit('/').next()?.parse().ok()
}

pub async fn reset_partial_download(directory: &str, file_name: &str) -> Result<()> {
    let safe_file_name: String = file_name
        .chars()
        .map(|c| if "<>:\"/\\\\|?*".contains(c) { '_' } else { c })
        .collect();
    let path = std::path::Path::new(directory).join(&safe_file_name);
    if path.exists() {
        preserve_partial(&path, &safe_file_name, "reset").await?;
    }
    Ok(())
}

async fn preserve_partial(path: &std::path::Path, file_name: &str, reason: &str) -> Result<()> {
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let backup_path = path.with_file_name(format!("{file_name}.{reason}-backup-{suffix}"));

    tokio::fs::rename(path, &backup_path).await?;
    println!(
        "DEBUG: Preserved partial download at {:?} ({reason} backup)",
        backup_path,
    );
    Ok(())
}
