use crate::vk_parser::{VkNode, parse_topic_body, extract_documents};
use serde_json::Value;
use reqwest::Client;
use anyhow::Result;
use log::info;

pub struct VkApi {
    client: Client,
    token: String,
}

impl VkApi {
    pub fn new(token: String) -> Self {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::USER_AGENT,
            reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
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
        let url = format!("https://api.vk.com/method/utils.getServerTime?access_token={}&v=5.131", self.token);
        let res = self.client.get(url).send().await?.json::<Value>().await?;
        
        if let Some(err) = res.get("error") {
            return Err(anyhow::anyhow!("VK API error: {}", err));
        }
        
        Ok(start.elapsed().as_millis() as u64)
    }

    pub async fn fetch_root_index(&self, group_id: &str, topic_id: &str) -> Result<Vec<VkNode>> {
        info!("Fetching root index for group {} topic {}", group_id, topic_id);
        let items = self.fetch_all_comments(group_id, topic_id).await?;
        info!("Fetched {} comments", items.len());
        
        let full_text = items.iter()
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
        let filtered: Vec<VkNode> = nodes.iter()
            .filter(|n| n.title.to_uppercase().contains("EN FRANCAIS"))
            .cloned()
            .collect();

        let final_nodes = if filtered.is_empty() { nodes } else { filtered };
        
        for node in &final_nodes {
            info!("Found node: {} (ID: {}, Type: {})", node.title, node.id, node.node_type);
        }
        
        Ok(final_nodes)
    }

    /// Fetch the full content of a VK topic node: sub-topics + attached documents
    pub async fn fetch_node_content(&self, group_id: &str, topic_id: &str) -> Result<VkNode> {
        info!("Fetching node content for group {} topic {}", group_id, topic_id);
        
        let items = self.fetch_all_comments(group_id, topic_id).await?;
        info!("Fetched {} comments for node content", items.len());

        // 1. Extract sub-topics from text
        let full_text = items.iter()
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
    pub async fn fetch_folder_tree_recursive(&self, group_id: &str, topic_id: &str, max_depth: u32) -> Result<Vec<VkNode>> {
        info!("Starting level-by-level sync (max_depth={})", max_depth);
        
        // Level 1: Root categories
        let mut root_nodes = self.fetch_root_index(group_id, topic_id).await?;
        if root_nodes.is_empty() || max_depth <= 1 {
            return Ok(root_nodes);
        }

        // Level 2: Batch fetch all children of root nodes
        info!("Level 2: Fetching children of {} root nodes...", root_nodes.len());
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
            info!("Level 3: Fetching children of {} level-2 nodes...", level2_refs.len());
            
            // Extract nodes to expand
            let mut l2_nodes: Vec<VkNode> = level2_refs.iter()
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
            info!("Level 4: Fetching {} items (Comics only)...", level3_nodes.len());
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

    /// Batch-expand a list of nodes by fetching their children 25 at a time using VK execute.
    /// Runs up to 5 batches in parallel for speed.
    /// Batch-expand a list of nodes by fetching their children.
    /// IMPLEMENTATION "GRAIL" (Mobile Style):
    /// 1. Fetch first 100 items for 25 topics at once (Head/Preview).
    /// 2. If a topic has > 100 items, trigger a specific full fetch for it.
    async fn batch_expand_nodes(&self, nodes: &mut [VkNode]) -> Result<()> {
        // Filter to only expandable nodes
        let target_indices: Vec<usize> = nodes.iter().enumerate()
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
        
        let batch_requests: Vec<(Vec<usize>, String, Vec<Option<String>>)> = chunks.iter().map(|chunk| {
            let calls: Vec<String> = chunk.iter().map(|&idx| {
                let node = &nodes[idx];
                let gid = node.vk_group_id.as_ref().unwrap().replace('-', "");
                let tid = node.vk_topic_id.as_ref().unwrap();
                // Just fetch the head (first 100) and the count
                format!("API.board.getComments({{\"group_id\":{},\"topic_id\":{},\"count\":100,\"extended\":1}})", gid, tid)
            }).collect();
            
            let topic_ids: Vec<Option<String>> = chunk.iter()
                .map(|&idx| nodes[idx].vk_topic_id.clone())
                .collect();
            
            let code = format!("return [{}];", calls.join(","));
            (chunk.clone(), code, topic_ids)
        }).collect();

        // Concurrency: Run up to 25 batches in parallel (Mobile uses high concurrency for structure batch)
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(25));
        let client = self.client.clone();
        let token = self.token.clone();

        let handles: Vec<_> = batch_requests.into_iter().map(|(chunk_indices, code, topic_ids)| {
            let sem = semaphore.clone();
            let cli = client.clone();
            let tok = token.clone();
            
            tokio::spawn(async move {
                let _permit = sem.acquire().await.unwrap();
                let url = "https://api.vk.com/method/execute";
                let params = [
                    ("access_token", tok),
                    ("v", "5.131".to_string()),
                    ("code", code),
                ];
                
                let res = cli.post(url).form(&params).send().await.ok()?.json::<Value>().await.ok()?;
                Some((chunk_indices, res, topic_ids))
            })
        }).collect();

        let results = futures::future::join_all(handles).await;

        // Process results
        let mut large_topics_to_fetch: Vec<(usize, String, String)> = Vec::new();

        for result in results {
            if let Ok(Some((chunk_indices, res_val, topic_ids))) = result {
                let res_obj = res_val.as_object();
                if let Some(res_map) = res_obj {
                    if let Some(responses) = res_map.get("response").and_then(|r| r.as_array()) {
                        for (i, &idx) in chunk_indices.iter().enumerate() {
                            let node = &mut nodes[idx];
                            let topic_id = topic_ids.get(i).cloned().flatten();

                            if let Some(resp) = responses.get(i) {
                                let resp_obj = resp.as_object();
                                if let Some(r_map) = resp_obj {
                                    let count = r_map.get("count").and_then(|c: &serde_json::Value| c.as_u64()).unwrap_or(0);
                                    node.count = Some(count as i32);
                                    
                                    if let Some(it_val) = r_map.get("items") {
                                        if let Some(preview_items) = it_val.as_array() {
                                            let mut full_text = String::new();
                                            for item in preview_items {
                                                if let Some(t) = item.get("text").and_then(|v: &serde_json::Value| v.as_str()) {
                                                    full_text.push_str(t);
                                                    full_text.push('\n');
                                                }
                                            }

                                            let exclude_tid = topic_id.as_deref();
                                            let mut children = parse_topic_body(&full_text, exclude_tid);
                                            let docs = extract_documents(preview_items);
                                            children.extend(docs);

                                            node.children = Some(children);
                                            node.is_loaded = Some(true);
                                            node.structure_only = Some(true);

                                            if count > 100 {
                                                if let (Some(gid), Some(tid)) = (&node.vk_group_id, &node.vk_topic_id) {
                                                    large_topics_to_fetch.push((idx, gid.clone(), tid.clone()));
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
        }

        // Parallel Fetch for Large Topics
        if !large_topics_to_fetch.is_empty() {
            info!("Triggering parallel full fetch for {} large topics...", large_topics_to_fetch.len());
            
            // Re-use semaphore or create a new one. Let's be aggressive but safe.
            // 50 concurrent fetches is fine for `execute` calls usually.
            let sem_large = std::sync::Arc::new(tokio::sync::Semaphore::new(50));
            
            let fetch_futures: Vec<_> = large_topics_to_fetch.into_iter().map(|(idx, gid, tid)| {
                let sem = sem_large.clone();
                // We need to clone self.client/token again, but we can't capture `self` in `spawn` easily if not static?
                // `batch_expand_nodes` is async, so `self` is borrowed.
                // We typically need to clone the client/token before spawning.
                let client = self.client.clone();
                let token = self.token.clone();
                
                tokio::spawn(async move {
                    let _permit = sem.acquire().await.unwrap();
                    // fetch_all_comments is on `self`. We can't call it easily without `self`.
                    // We need to replicate the call or make `fetch_all_comments` static/method of a cloneable struct?
                    // Actually, `fetch_all_comments` is just using client & token. 
                    // Let's create a temporary VkApi or just call a static helper?
                    // Easiest is to make a temporary clean instance or just verify logic.
                    // `fetch_all_comments` logic is complex (the execute loop). 
                    // Let's refactor `fetch_all_comments` to be callable or duplicate logic? 
                    // Refactoring is cleaner. But for now, let's just Instantiate a new VkApi or make helper.
                    let api = VkApi { client, token }; 
                    let items = api.fetch_all_comments(&gid, &tid).await;
                    (idx, items)
                })
            }).collect();

            let fetched_results = futures::future::join_all(fetch_futures).await;

            for res in fetched_results {
                match res {
                    Ok((idx, Ok(items))) => {
                        let node = &mut nodes[idx];
                        
                        // Re-parse with full items
                        let full_text = items.iter()
                            .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                            .collect::<Vec<_>>()
                            .join("\n");
                        
                        let exclude_tid = node.vk_topic_id.as_deref();
                        let mut children = parse_topic_body(&full_text, exclude_tid);
                        let docs = extract_documents(&items);
                        children.extend(docs); // Merge docs
                        
                        // Update node
                        node.children = Some(children);
                        // node.count is already set
                        info!("Expanded large topic {} with {} items", node.title, items.len());
                    },
                    Ok((idx, Err(e))) => {
                        log::error!("Failed to expand large topic {}: {}", nodes[idx].title, e);
                    },
                    Err(e) => {
                         log::error!("JoinError in parallel fetch: {}", e);
                    }
                }
            }
        }

        Ok(())
    }

    async fn fetch_all_comments(&self, group_id: &str, topic_id: &str) -> Result<Vec<Value>> {
        let start = std::time::Instant::now();
        info!("Fetching all comments for group {} topic {}", group_id, topic_id);

        let mut all_items = Vec::new();
        let limit = 100;

        // 1. Initial request to get total count and first batch
        let url = format!(
            "https://api.vk.com/method/board.getComments?group_id={}&topic_id={}&count={}&offset=0&access_token={}&v=5.131",
            group_id.replace('-', ""), topic_id, limit, self.token
        );

        let res = self.client.get(&url).send().await?.json::<Value>().await?;

        if let Some(err) = res.get("error") {
            return Err(anyhow::anyhow!("VK error: {}", err));
        }

        let response = res.get("response").ok_or_else(|| anyhow::anyhow!("No response body"))?;
        let count = response.get("count").and_then(|c| c.as_u64()).unwrap_or(0);
        let items = response.get("items")
            .and_then(|i| i.as_array())
            .ok_or_else(|| anyhow::anyhow!("No items array in response"))?;

        all_items.extend(items.iter().cloned());

        info!("Initial fetch: {} items. Total count: {}", items.len(), count);

        if count <= limit as u64 {
            return Ok(all_items);
        }

        // 2. Calculate remaining offsets
        let mut offsets = Vec::new();
        let mut current_offset = limit;
        while current_offset < count as usize {
            offsets.push(current_offset);
            current_offset += limit;
        }

        info!("Remaining items to fetch: {}. Batches needed: {}", count as usize - items.len(), offsets.len());

        // 3. Prepare batches for execute (10 calls per execute, safe for 5-10MB limit)
        let batch_size = 10;
        let chunks: Vec<Vec<usize>> = offsets.chunks(batch_size).map(|c| c.to_vec()).collect();

        // 4. Parallel execution
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(3)); // Limit concurrency to 3
        let client = self.client.clone();
        let token = self.token.clone();
        let gid = group_id.replace('-', "");
        let tid = topic_id.to_string();

        let handles: Vec<_> = chunks.into_iter().enumerate().map(|(chunk_idx, chunk_offsets)| {
        let gid = group_id.replace('-', "");
        
        // 1. Fetch first batch (Head) to get total count
        info!("Fetching head for topic {}...", topic_id);
        let head_url = format!("https://api.vk.com/method/board.getComments?access_token={}&v=5.131&group_id={}&topic_id={}&count=100&extended=1", 
            self.token, gid, topic_id);
        
        let head_res = self.client.get(head_url).send().await?.json::<Value>().await?;
        if let Some(err) = head_res.get("error") {
            return Err(anyhow::anyhow!("VK API error (head): {}", err));
        }

        let response = head_res.get("response").ok_or_else(|| anyhow::anyhow!("No response body in head"))?;
        let total_count = response.get("count").and_then(|c| c.as_u64()).unwrap_or(0);
        let mut all_items = response.get("items").and_then(|i| i.as_array()).cloned().unwrap_or_default();

        if total_count <= 100 || all_items.is_empty() {
            info!("Fetched {} items (all) for topic {}", all_items.len(), topic_id);
            return Ok(all_items);
        }

        info!("Topic {} has {} items total. Fetching remaining in parallel...", topic_id, total_count);

        // 2. Prepare offsets for remaining items
        let mut offsets = Vec::new();
        let mut current_offset = 100;
        while current_offset < total_count {
            offsets.push(current_offset);
            current_offset += 100;
        }

        // 3. Batch offsets into execute calls (10 offsets per execute = 1000 items)
        let batch_size = 10;
        let chunks: Vec<Vec<u64>> = offsets.chunks(batch_size).map(|c| c.to_vec()).collect();
        
        // 4. Run execute calls in parallel with a semaphore
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(5)); 
        let client = self.client.clone();
        let token = self.token.clone();
        let tid = topic_id.to_string();

        let mut handles = Vec::new();
        for chunk in chunks {
            let sem = semaphore.clone();
            let cli = client.clone();
            let tok = token.clone();
            let g = gid.clone();
            let t = tid.clone();
            
            tokio::spawn(async move {
                let _permit = sem.acquire().await.unwrap();

                // Build VKScript code
                let calls: Vec<String> = chunk_offsets.iter().map(|&off| {
                    format!("API.board.getComments({{\"group_id\":{},\"topic_id\":{},\"count\":{},\"offset\":{}}})", g, t, limit, off)
                }).collect();

                let code = format!("return [{}];", calls.join(","));

            handles.push(tokio::spawn(async move {
                let _permit = sem.acquire().await.unwrap();
                
                let calls: Vec<String> = chunk.iter().map(|&off| {
                    format!("API.board.getComments({{\"group_id\":{},\"topic_id\":{},\"count\":100,\"offset\":{}}})", g, t, off)
                }).collect();
                
                let code = format!("return [{}];", calls.join(","));
                
                let url = "https://api.vk.com/method/execute";
                let params = [
                    ("access_token", tok),
                    ("v", "5.131".to_string()),
                    ("code", code),
                ];

                let start_batch = std::time::Instant::now();
                let res = cli.post(url).form(&params).send().await;

                match res {
                    Ok(r) => {
                        match r.json::<Value>().await {
                            Ok(v) => {
                                // Check for execute errors
                                if let Some(err) = v.get("execute_errors") {
                                    info!("Batch {} execute errors: {:?}", chunk_idx, err);
                                }
                                Ok((chunk_idx, v, start_batch.elapsed()))
                            },
                            Err(e) => Err(anyhow::anyhow!("JSON error in batch {}: {}", chunk_idx, e))
                        }
                    },
                    Err(e) => Err(anyhow::anyhow!("Network error in batch {}: {}", chunk_idx, e))
                }
            })
        }).collect();

        let results = futures::future::join_all(handles).await;

        // 5. Collect results
        let mut first_error = None;

        for result in results {
            match result {
                Ok(Ok((idx, val, dur))) => {
                    if let Some(responses) = val.get("response").and_then(|r| r.as_array()) {
                        let mut batch_count = 0;
                        for resp in responses {
                            if let Some(items) = resp.get("items").and_then(|i| i.as_array()) {
                                all_items.extend(items.iter().cloned());
                                batch_count += items.len();
                            }
                        }
                        info!("Batch {} finished in {:?}: fetched {} items", idx, dur, batch_count);
                    } else {
                        info!("Batch {} returned no response array: {:?}", idx, val);
                        if first_error.is_none() {
                             first_error = Some(anyhow::anyhow!("Batch {} returned no response array", idx));
                        }
                    }
                },
                Ok(Err(e)) => {
                    info!("Error in batch task: {}", e);
                    if first_error.is_none() {
                        first_error = Some(e);
                    }
                },
                Err(e) => {
                    info!("Join error: {}", e);
                    if first_error.is_none() {
                        first_error = Some(anyhow::anyhow!("Join error: {}", e));
                    }
                }
            }
        }

        if let Some(err) = first_error {
            return Err(err);
        }

        info!("Total fetch time: {:?}. Total items: {}", start.elapsed(), all_items.len());
                
                // Retry logic for each batch
                let mut attempts = 0;
                while attempts < 3 {
                    if let Ok(res) = cli.post(url).form(&params).send().await {
                        if let Ok(json) = res.json::<Value>().await {
                            if let Some(resp_list) = json.get("response").and_then(|r| r.as_array()) {
                                let mut chunk_items = Vec::new();
                                for r in resp_list {
                                    if let Some(items) = r.get("items").and_then(|i| i.as_array()) {
                                        chunk_items.extend(items.iter().cloned());
                                    }
                                }
                                return Some(chunk_items);
                            }
                        }
                    }
                    attempts += 1;
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                }
                None
            }));
        }

        let results = futures::future::join_all(handles).await;
        for res in results {
            if let Ok(Some(items)) = res {
                all_items.extend(items);
            }
        }

        info!("Fetch complete for topic {}: {} items total", topic_id, all_items.len());
        Ok(all_items)
    }
}

