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

        // Prepare batch data: (chunk_indices, VKScript code, topic_ids for parsing)
        let chunks: Vec<Vec<usize>> = target_indices.chunks(25).map(|c| c.to_vec()).collect();
        
        let batch_requests: Vec<(Vec<usize>, String, Vec<Option<String>>)> = chunks.iter().map(|chunk| {
            let calls: Vec<String> = chunk.iter().map(|&idx| {
                let node = &nodes[idx];
                let gid = node.vk_group_id.as_ref().unwrap().replace('-', "");
                let tid = node.vk_topic_id.as_ref().unwrap();
                format!("API.board.getComments({{\"group_id\":{},\"topic_id\":{},\"count\":100}})", gid, tid)
            }).collect();
            let topic_ids: Vec<Option<String>> = chunk.iter()
                .map(|&idx| nodes[idx].vk_topic_id.clone())
                .collect();
            let code = format!("return [{}];", calls.join(","));
            (chunk.clone(), code, topic_ids)
        }).collect();

        // Parallélisation plus agressive (10 batches à la fois)
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(10));
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
        for result in results {
            if let Ok(Some((chunk_indices, res, topic_ids))) = result {
                if let Some(responses) = res.get("response").and_then(|r| r.as_array()) {
                    for (i, &idx) in chunk_indices.iter().enumerate() {
                        if let Some(resp) = responses.get(i) {
                            if let Some(items) = resp.get("items").and_then(|it| it.as_array()) {
                                let full_text = items.iter()
                                    .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                                    .collect::<Vec<_>>()
                                    .join("\n");

                                let exclude_tid = topic_ids.get(i).and_then(|t| t.as_deref());
                                let children = parse_topic_body(&full_text, exclude_tid);
                                nodes[idx].children = Some(children);
                                nodes[idx].is_loaded = Some(true);
                                nodes[idx].structure_only = Some(true);
                            }
                        }
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
        Ok(all_items)
    }
}

