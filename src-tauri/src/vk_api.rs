use crate::vk_parser::{VkNode, parse_topic_body};
use serde_json::Value;
use reqwest::Client;
use anyhow::Result;
use log::{info, error};

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
        info!("Pinging VK API...");
        let start = std::time::Instant::now();
        let url = format!("https://api.vk.com/method/utils.getServerTime?access_token={}&v=5.131", self.token);
        let res = self.client.get(url).send().await?.json::<Value>().await?;
        
        if let Some(err) = res.get("error") {
            error!("VK Ping error: {:?}", err);
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
        
        for node in &nodes {
            info!("Found node: {} (ID: {}, Type: {})", node.title, node.id, node.node_type);
        }
        
        Ok(nodes)
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

        info!("Sync complete!");
        Ok(root_nodes)
    }

    /// Batch-expand a list of nodes by fetching their children 25 at a time using VK execute.
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

        // Process in batches of 25
        for chunk in target_indices.chunks(25) {
            let mut calls = Vec::new();
            for &idx in chunk {
                let node = &nodes[idx];
                let gid = node.vk_group_id.as_ref().unwrap().replace('-', "");
                let tid = node.vk_topic_id.as_ref().unwrap();
                calls.push(format!("API.board.getComments({{\"group_id\":{},\"topic_id\":{},\"count\":100}})", gid, tid));
            }

            let code = format!("return [{}];", calls.join(","));
            let url = format!(
                "https://api.vk.com/method/execute?access_token={}&v=5.131&code={}",
                self.token, urlencoding::encode(&code)
            );

            let res = self.client.get(&url).send().await?.json::<Value>().await?;

            if let Some(responses) = res.get("response").and_then(|r| r.as_array()) {
                for (i, &idx) in chunk.iter().enumerate() {
                    if let Some(resp) = responses.get(i) {
                        if let Some(items) = resp.get("items").and_then(|it| it.as_array()) {
                            let full_text = items.iter()
                                .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                                .collect::<Vec<_>>()
                                .join("\n");

                            let children = parse_topic_body(&full_text, nodes[idx].vk_topic_id.as_deref());
                            nodes[idx].children = Some(children);
                            nodes[idx].is_loaded = Some(true);
                            nodes[idx].structure_only = Some(true);
                        }
                    }
                }
            }
        }

        Ok(())
    }

    async fn fetch_all_comments(&self, group_id: &str, topic_id: &str) -> Result<Vec<Value>> {
        let mut all_items = Vec::new();
        let mut offset = 0;
        let count = 100;

        loop {
            let url = format!(
                "https://api.vk.com/method/board.getComments?group_id={}&topic_id={}&count={}&offset={}&access_token={}&v=5.131",
                group_id.replace('-', ""), topic_id, count, offset, self.token
            );
            
            info!("Requesting comments offset {}", offset);
            let res = self.client.get(url).send().await?.json::<Value>().await?;
            
            if let Some(err) = res.get("error") {
                error!("VK API Error in fetch_all_comments: {:?}", err);
                return Err(anyhow::anyhow!("VK error: {}", err));
            }

            let response = res.get("response").ok_or_else(|| anyhow::anyhow!("No response body"))?;
            let items = response.get("items")
                .and_then(|i| i.as_array())
                .ok_or_else(|| anyhow::anyhow!("No items array in response"))?;
            
            if items.is_empty() {
                break;
            }

            all_items.extend(items.iter().cloned());
            
            if items.len() < count {
                break;
            }
            offset += count;
            
            tokio::time::sleep(std::time::Duration::from_millis(350)).await;
        }

        Ok(all_items)
    }
}
