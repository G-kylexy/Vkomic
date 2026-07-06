use crate::vk_parser::{extract_documents, parse_topic_body, VkNode};
use anyhow::Result;
use log::info;
use reqwest::Client;
use serde_json::Value;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

const VK_API_MIN_INTERVAL: Duration = Duration::from_millis(500);
const VK_API_RETRY_BACKOFF: Duration = Duration::from_millis(1_500);
const VKOMIC_USER_AGENT: &str = "KateMobileAndroid/110.1 lite-x86_64 (Android 11; SDK 30; x86_64; en)";

static VK_API_LAST_REQUEST: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();

async fn wait_for_vk_api_slot() {
    let limiter = VK_API_LAST_REQUEST.get_or_init(|| Mutex::new(None));
    let mut last_request = limiter.lock().await;

    if let Some(last) = *last_request {
        let elapsed = last.elapsed();
        if elapsed < VK_API_MIN_INTERVAL {
            tokio::time::sleep(VK_API_MIN_INTERVAL - elapsed).await;
        }
    }

    *last_request = Some(Instant::now());
}

fn board_get_comments_call(
    group_id: &str,
    topic_id: &str,
    count: usize,
    offset: Option<usize>,
) -> String {
    let offset_arg = offset
        .map(|value| format!(", \"offset\":{}", value))
        .unwrap_or_default();

    format!(
        "API.board.getComments({{\"group_id\":{}, \"topic_id\":{}, \"count\":{}, \"extended\":1{}}})",
        group_id, topic_id, count, offset_arg
    )
}

fn redact_access_tokens(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, child) in map.iter_mut() {
                if key == "access_token" {
                    *child = Value::String("[redacted]".to_string());
                    continue;
                }

                redact_access_tokens(child);
            }

            if map
                .get("key")
                .and_then(Value::as_str)
                .is_some_and(|key| key == "access_token")
            {
                if let Some(token_value) = map.get_mut("value") {
                    *token_value = Value::String("[redacted]".to_string());
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                redact_access_tokens(item);
            }
        }
        _ => {}
    }
}

fn format_vk_error(err: &Value) -> String {
    let mut redacted = err.clone();
    redact_access_tokens(&mut redacted);
    redacted.to_string()
}

pub struct VkApi {
    client: Client,
    token: String,
}

impl VkApi {
    pub fn new(token: String) -> Self {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::USER_AGENT,
            reqwest::header::HeaderValue::from_static(VKOMIC_USER_AGENT),
        );

        Self {
            client: Client::builder()
                .default_headers(headers)
                .build()
                .unwrap_or_else(|_| Client::new()),
            token,
        }
    }

    pub async fn ping(&self) -> Result<u64> {
        let start = std::time::Instant::now();
        let url = format!(
            "https://api.vk.ru/method/utils.getServerTime?access_token={}&v=5.199",
            self.token
        );
        wait_for_vk_api_slot().await;
        let res = self.client.get(url).send().await?.json::<Value>().await?;

        if let Some(err) = res.get("error") {
            return Err(anyhow::anyhow!("VK API error: {}", format_vk_error(err)));
        }

        Ok(start.elapsed().as_millis() as u64)
    }

    pub async fn fetch_root_index(&self, group_id: &str, topic_id: &str) -> Result<Vec<VkNode>> {
        info!(
            "Fetching root index for group {} topic {}",
            group_id, topic_id
        );
        let items = self.fetch_all_comments(group_id, topic_id).await?;
        info!("Fetched {} comments", items.len());

        let full_text = items
            .iter()
            .filter_map(|i| i.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("\n");

        if full_text.is_empty() {
            info!("Full text is empty!");
            return Ok(Vec::new());
        }

        let nodes = parse_topic_body(&full_text, None);
        info!("Parsed {} nodes from topic body", nodes.len());

        // Filtrage heuristique comme dans la version classique pour éviter le bruit
        let filtered: Vec<VkNode> = nodes
            .iter()
            .filter(|n| n.title.to_uppercase().contains("EN FRANCAIS"))
            .cloned()
            .collect();

        let final_nodes = if filtered.is_empty() { nodes } else { filtered };

        for node in &final_nodes {
            info!(
                "Found node: {} (ID: {}, Type: {})",
                node.title, node.id, node.node_type
            );
        }

        Ok(final_nodes)
    }

    /// Fetch the full content of a VK topic node: sub-topics + attached documents
    pub async fn fetch_node_content(&self, group_id: &str, topic_id: &str) -> Result<VkNode> {
        info!(
            "Fetching node content for group {} topic {}",
            group_id, topic_id
        );

        let items = self.fetch_all_comments(group_id, topic_id).await?;
        info!("Fetched {} comments for node content", items.len());

        // 1. Extract sub-topics from text
        let full_text = items
            .iter()
            .filter_map(|i| i.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("\n");

        let sub_topics = parse_topic_body(&full_text, Some(topic_id));
        info!("Found {} sub-topics", sub_topics.len());

        // 2. Extract documents from attachments
        let documents = extract_documents(&items);
        info!("Found {} documents", documents.len());

        // 3. Combine children
        let mut children = sub_topics;
        children.extend(documents);

        // 4. Determine node type based on content
        let node_type = if children.iter().any(|c| c.node_type == "file") {
            "series".to_string()
        } else {
            "genre".to_string()
        };

        Ok(VkNode {
            id: format!("topic_{}", topic_id),
            title: format!("Topic {}", topic_id),
            node_type,
            url: Some(format!("https://vk.com/topic-{}_{}", group_id, topic_id)),
            vk_group_id: Some(group_id.to_string()),
            vk_topic_id: Some(topic_id.to_string()),
            children: Some(children),
            is_loaded: Some(true),
            count: None,
            extension: None,
            structure_only: Some(false),
            vk_owner_id: None,
            vk_doc_id: None,
            vk_access_key: None,
            size_bytes: None,
        })
    }

    /// Fetch folder tree level-by-level (like the old app), not recursively per-node.
    /// This is MUCH faster because we batch all nodes at each depth.
    pub async fn fetch_folder_tree_recursive(
        &self,
        group_id: &str,
        topic_id: &str,
        max_depth: u32,
    ) -> Result<Vec<VkNode>> {
        info!("Starting level-by-level sync (max_depth={})", max_depth);

        // Level 1: Root categories
        let mut root_nodes = self.fetch_root_index(group_id, topic_id).await?;
        if root_nodes.is_empty() || max_depth <= 1 {
            return Ok(root_nodes);
        }

        // Level 2: Batch fetch all children of root nodes
        info!(
            "Level 2: Fetching children of {} root nodes...",
            root_nodes.len()
        );
        self.batch_expand_nodes(&mut root_nodes).await?;

        if max_depth <= 2 {
            return Ok(root_nodes);
        }

        // Level 3: Collect all level-2 nodes and batch fetch their children
        let mut level2_refs: Vec<(usize, usize)> = Vec::new(); // (root_idx, child_idx)
        for (ri, root) in root_nodes.iter().enumerate() {
            if let Some(children) = &root.children {
                for (ci, _) in children.iter().enumerate() {
                    level2_refs.push((ri, ci));
                }
            }
        }

        if !level2_refs.is_empty() {
            info!(
                "Level 3: Fetching children of {} level-2 nodes...",
                level2_refs.len()
            );

            // Extract nodes to expand
            let mut l2_nodes: Vec<VkNode> = level2_refs
                .iter()
                .filter_map(|&(ri, ci)| root_nodes.get(ri)?.children.as_ref()?.get(ci).cloned())
                .collect();

            self.batch_expand_nodes(&mut l2_nodes).await?;

            // Put them back
            let mut l2_iter = l2_nodes.into_iter();
            for &(ri, ci) in &level2_refs {
                if let Some(root) = root_nodes.get_mut(ri) {
                    if let Some(children) = root.children.as_mut() {
                        if let Some(expanded) = l2_iter.next() {
                            children[ci] = expanded;
                        }
                    }
                }
            }
        }

        if max_depth <= 3 {
            return Ok(root_nodes);
        }

        // Level 4: Only for Comics (topic 47543940) which uses alphabetical ranges (A-C, D-F, etc.)
        // BDs Européennes have their series directly at level 3, no need to go deeper
        let mut level3_nodes: Vec<VkNode> = Vec::new();
        let mut level3_refs: Vec<(usize, usize, usize)> = Vec::new(); // (root_idx, l2_idx, l3_idx)

        for (ri, root) in root_nodes.iter().enumerate() {
            // Only process Comics topic (47543940)
            let is_comics = root.vk_topic_id.as_deref() == Some("47543940");
            if !is_comics {
                continue;
            }

            if let Some(l2_children) = &root.children {
                for (l2i, l2) in l2_children.iter().enumerate() {
                    if let Some(l3_children) = &l2.children {
                        for (l3i, l3) in l3_children.iter().enumerate() {
                            // Only folders (not files) go to level 4
                            if l3.vk_group_id.is_some() && l3.vk_topic_id.is_some() {
                                level3_nodes.push(l3.clone());
                                level3_refs.push((ri, l2i, l3i));
                            }
                        }
                    }
                }
            }
        }

        if !level3_nodes.is_empty() {
            info!(
                "Level 4: Fetching {} items (Comics only)...",
                level3_nodes.len()
            );
            self.batch_expand_nodes(&mut level3_nodes).await?;

            // Put them back into the tree
            let mut l3_iter = level3_nodes.into_iter();
            for &(ri, l2i, l3i) in &level3_refs {
                if let Some(root) = root_nodes.get_mut(ri) {
                    if let Some(l2_children) = root.children.as_mut() {
                        if let Some(l2) = l2_children.get_mut(l2i) {
                            if let Some(l3_children) = l2.children.as_mut() {
                                if let Some(expanded) = l3_iter.next() {
                                    l3_children[l3i] = expanded;
                                }
                            }
                        }
                    }
                }
            }
        }

        info!("Sync complete! {} levels loaded.", max_depth);
        Ok(root_nodes)
    }

    /// Batch-expand nodes with VK execute while keeping requests sequential per user token.
    /// Each execute request can fetch the first 100 comments for up to 25 topics.
    async fn batch_expand_nodes(&self, nodes: &mut [VkNode]) -> Result<()> {
        // Filter to only expandable nodes
        let target_indices: Vec<usize> = nodes
            .iter()
            .enumerate()
            .filter(|(_, n)| {
                (n.node_type == "genre" || n.node_type == "category")
                    && n.vk_group_id.is_some()
                    && n.vk_topic_id.is_some()
            })
            .map(|(i, _)| i)
            .collect();

        if target_indices.is_empty() {
            return Ok(());
        }

        info!("Batch expanding {} nodes", target_indices.len());

        // Chunk size 25 (VK API Limit for execute calls)
        let chunks: Vec<Vec<usize>> = target_indices.chunks(25).map(|c| c.to_vec()).collect();

        let batch_requests: Vec<(Vec<usize>, String, Vec<Option<String>>)> = chunks
            .iter()
            .map(|chunk| {
                let calls: Vec<String> = chunk
                    .iter()
                    .map(|&idx| {
                        let node = &nodes[idx];
                        let gid = node.vk_group_id.as_ref().unwrap().replace('-', "");
                        let tid = node.vk_topic_id.as_ref().unwrap();
                        // Fetch the head (first 100), including attachments.
                        board_get_comments_call(&gid, tid, 100, None)
                    })
                    .collect();

                let topic_ids: Vec<Option<String>> = chunk
                    .iter()
                    .map(|&idx| nodes[idx].vk_topic_id.clone())
                    .collect();

                let code = format!("return [{}];", calls.join(","));
                (chunk.clone(), code, topic_ids)
            })
            .collect();

        let mut results = Vec::new();
        for (chunk_indices, code, topic_ids) in batch_requests {
            let res = self.execute_with_retry(&code).await?;
            results.push((chunk_indices, res, topic_ids));
        }

        // Process results
        let mut large_topics_to_fetch: Vec<(usize, String, String)> = Vec::new();

        for (chunk_indices, res_val, topic_ids) in results {
            let res_obj = res_val.as_object();
            if let Some(res_map) = res_obj {
                if let Some(responses) = res_map.get("response").and_then(|r| r.as_array()) {
                    for (i, &idx) in chunk_indices.iter().enumerate() {
                        let node = &mut nodes[idx];
                        let topic_id = topic_ids.get(i).cloned().flatten();

                        if let Some(resp) = responses.get(i) {
                            let resp_obj = resp.as_object();
                            if let Some(r_map) = resp_obj {
                                let count = r_map
                                    .get("count")
                                    .and_then(|c: &serde_json::Value| c.as_u64())
                                    .unwrap_or(0);
                                node.count = Some(count as i32);

                                if let Some(it_val) = r_map.get("items") {
                                    if let Some(preview_items) = it_val.as_array() {
                                        let mut full_text = String::new();
                                        for item in preview_items {
                                            if let Some(t) = item
                                                .get("text")
                                                .and_then(|v: &serde_json::Value| v.as_str())
                                            {
                                                full_text.push_str(t);
                                                full_text.push('\n');
                                            }
                                        }

                                        let exclude_tid = topic_id.as_deref();
                                        let mut children =
                                            parse_topic_body(&full_text, exclude_tid);
                                        let docs = extract_documents(preview_items);
                                        children.extend(docs);

                                        node.children = Some(children);
                                        node.is_loaded = Some(true);
                                        node.structure_only = Some(true);

                                        if count > 100 {
                                            if let (Some(gid), Some(tid)) =
                                                (&node.vk_group_id, &node.vk_topic_id)
                                            {
                                                large_topics_to_fetch.push((
                                                    idx,
                                                    gid.clone(),
                                                    tid.clone(),
                                                ));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Fetch large topics sequentially so one user token never creates API bursts.
        if !large_topics_to_fetch.is_empty() {
            info!(
                "Fetching {} large topics sequentially...",
                large_topics_to_fetch.len()
            );

            for (idx, gid, tid) in large_topics_to_fetch {
                let items = self.fetch_all_comments(&gid, &tid).await?;
                let node = &mut nodes[idx];

                let full_text = items
                    .iter()
                    .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n");

                let exclude_tid = node.vk_topic_id.as_deref();
                let mut children = parse_topic_body(&full_text, exclude_tid);
                let docs = extract_documents(&items);
                children.extend(docs);

                node.children = Some(children);
                info!(
                    "Expanded large topic {} with {} items",
                    node.title,
                    items.len()
                );
            }
        }

        Ok(())
    }

    async fn fetch_all_comments(&self, group_id: &str, topic_id: &str) -> Result<Vec<Value>> {
        let batch_size = 10; // 10 API calls per execute = 1000 items per batch
        let gid = group_id.replace('-', "");

        info!("Starting fetch_all_comments for topic {}", topic_id);

        // --- Step 1: First call to get total count + first 1000 items ---
        let first_code = format!(
            r#"
            var g = {};
            var t = {};
            var off = 0;
            var i = 0;
            var items = [];
            while (i < {}) {{
                var r = API.board.getComments({{"group_id":g, "topic_id":t, "count":100, "offset":off, "extended":1}});
                if (r.items) {{
                    items = items + r.items;
                }}
                off = off + 100;
                if (!r.items || r.items.length < 100) {{ i = 30; }}
                i = i + 1;
            }}
            return {{ "items": items, "next_offset": off, "total": {}.count }};
        "#,
            gid,
            topic_id,
            batch_size,
            board_get_comments_call(&gid, topic_id, 1, None)
        );

        let first_res = self.execute_with_retry(&first_code).await?;
        let response = first_res
            .get("response")
            .ok_or_else(|| anyhow::anyhow!("No response body"))?;

        let first_items = response
            .get("items")
            .and_then(|i| i.as_array())
            .ok_or_else(|| anyhow::anyhow!("No items in first response"))?;

        let mut all_items: Vec<Value> = first_items.iter().cloned().collect();
        let total_count = response
            .get("total")
            .and_then(|t| t.as_u64())
            .unwrap_or(all_items.len() as u64) as usize;

        info!(
            "First batch: {} items. Total: {}",
            all_items.len(),
            total_count
        );

        // --- Step 2: If more items remain, fetch remaining batches sequentially ---
        if all_items.len() < total_count {
            let items_per_batch = batch_size * 100; // 1000
            let mut remaining_offsets: Vec<usize> = Vec::new();
            let mut off = all_items.len();
            while off < total_count {
                remaining_offsets.push(off);
                off += items_per_batch;
            }

            info!(
                "Fetching {} remaining batches for {} items",
                remaining_offsets.len(),
                total_count - all_items.len()
            );

            for batch_offset in remaining_offsets {
                let code = format!(
                    r#"
                    var g = {};
                    var t = {};
                    var off = {};
                    var i = 0;
                    var items = [];
                    while (i < {}) {{
                        var r = API.board.getComments({{"group_id":g, "topic_id":t, "count":100, "offset":off, "extended":1}});
                        if (r.items) {{
                            items = items + r.items;
                        }}
                        off = off + 100;
                        if (!r.items || r.items.length < 100) {{ i = 30; }}
                        i = i + 1;
                    }}
                    return {{ "items": items, "next_offset": off, "count": items.length }};
                "#,
                    gid, topic_id, batch_offset, batch_size
                );

                let val = self.execute_with_retry(&code).await?;
                if let Some(resp) = val.get("response") {
                    if let Some(items) = resp.get("items").and_then(|i| i.as_array()) {
                        all_items.extend(items.iter().cloned());
                    }
                }
            }
        }

        info!("fetch_all_comments done: {} items total", all_items.len());
        Ok(all_items)
    }

    /// Helper: execute VKScript with retry
    async fn execute_with_retry(&self, code: &str) -> Result<Value> {
        let url = "https://api.vk.ru/method/execute";
        let params = [
            ("access_token", self.token.as_str()),
            ("v", "5.199"),
            ("code", code),
        ];
        let mut attempts = 0;
        loop {
            wait_for_vk_api_slot().await;
            match self.client.post(url).form(&params).send().await {
                Ok(r) => match r.json::<Value>().await {
                    Ok(json) => {
                        if let Some(err) = json.get("error") {
                            return Err(anyhow::anyhow!("VK API error: {}", format_vk_error(err)));
                        }
                        return Ok(json);
                    }
                    Err(e) => {
                        if attempts >= 3 {
                            return Err(anyhow::anyhow!("JSON parse error: {}", e));
                        }
                    }
                },
                Err(e) => {
                    if attempts >= 3 {
                        return Err(anyhow::anyhow!("Request error: {}", e));
                    }
                }
            }
            attempts += 1;
            tokio::time::sleep(VK_API_RETRY_BACKOFF).await;
        }
    }

    /// Passive sync helper: Get the total comment count for a list of topics
    pub async fn get_topic_counts(
        &self,
        group_id: &str,
        topic_ids: Vec<String>,
    ) -> Result<std::collections::HashMap<String, i32>> {
        let mut results = std::collections::HashMap::new();
        if topic_ids.is_empty() {
            return Ok(results);
        }

        let chunks: Vec<&[String]> = topic_ids.chunks(25).collect();
        let gid = group_id.replace('-', "");

        let batch_requests: Vec<_> = chunks.iter().map(|chunk| {
            let calls: Vec<String> = chunk.iter().map(|tid| {
                format!("API.board.getComments({{\"group_id\":{},\"topic_id\":{},\"count\":1}}).count", gid, tid)
            }).collect();
            let code = format!("return [{}];", calls.join(","));
            (chunk.to_vec(), code)
        }).collect();

        for (chunk, code) in batch_requests {
            let res_val = self.execute_with_retry(&code).await?;
            if let Some(responses) = res_val.get("response").and_then(|r| r.as_array()) {
                for (i, tid) in chunk.iter().enumerate() {
                    if let Some(count_val) = responses.get(i).and_then(|v| v.as_i64()) {
                        results.insert(tid.clone(), count_val as i32);
                    } else if let Some(count_val) = responses
                        .get(i)
                        .and_then(|v| v.as_bool())
                        .map(|b| if b { 1 } else { 0 })
                    {
                        // Sometimes VK returns false/boolean if the topic is deleted/banned
                        if count_val == 0 {
                            results.insert(tid.clone(), 0);
                        }
                    }
                }
            }
        }
        Ok(results)
    }
}
