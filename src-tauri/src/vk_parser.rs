use serde::{Deserialize, Serialize};
use regex::Regex;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VkNode {
    pub id: String,
    pub title: String,
    pub url: Option<String>,
    #[serde(rename = "type")]
    pub node_type: String, // category | genre | series | topic | file
    pub children: Option<Vec<VkNode>>,
    pub count: Option<i32>,
    pub extension: Option<String>,
    pub is_loaded: Option<bool>,
    pub structure_only: Option<bool>,
    pub vk_group_id: Option<String>,
    pub vk_topic_id: Option<String>,
    pub vk_owner_id: Option<String>,
    pub vk_doc_id: Option<String>,
    pub vk_access_key: Option<String>,
    pub size_bytes: Option<u64>,
}

pub fn clean_title(text: &str) -> String {
    let mut cleaned = text.to_string();

    // BBCode [topic-xxx|Titre]
    let re_bbcode = Regex::new(r"\[topic-\d+(?:_\d+)?\|([^\]]+)\]").unwrap();
    if let Some(caps) = re_bbcode.captures(text) {
        cleaned = caps[1].to_string();
    }

    cleaned = Regex::new(r"\s*[-–—=]+[>→»]\s*.*$").unwrap().replace_all(&cleaned, "").to_string();
    cleaned = Regex::new(r"https?://.*$").unwrap().replace_all(&cleaned, "").to_string();
    cleaned = Regex::new(r"[:\-–—]+$").unwrap().replace_all(&cleaned, "").to_string();
    cleaned = Regex::new(r"^\s*[-–—'»«•*·]+\s*").unwrap().replace_all(&cleaned, "").to_string();
    cleaned = Regex::new(r"\s*[-–—'»«•*·]+\s*$").unwrap().replace_all(&cleaned, "").to_string();
    cleaned = cleaned.replace("(lien)", "").replace("(Lien)", "");

    cleaned.trim().to_string()
}

pub fn parse_topic_body(text: &str, exclude_topic_id: Option<&str>) -> Vec<VkNode> {
    let mut nodes = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    // 1. BBCode
    let re_bbcode = Regex::new(r"\[topic-(\d+)_(\d+)\|([^\]]+)\]").unwrap();
    for caps in re_bbcode.captures_iter(text) {
        let group_id = &caps[1];
        let topic_id = &caps[2];
        let link_text = &caps[3];

        if let Some(ex) = exclude_topic_id {
            if topic_id == ex { continue; }
        }

        let unique_id = format!("topic_{}", topic_id);
        if seen_ids.contains(&unique_id) { continue; }

        let mut title = clean_title(link_text);
        if title.len() < 2 { title = format!("Topic {}", topic_id); }

        if title.len() < 200 {
            seen_ids.insert(unique_id.clone());
            nodes.push(VkNode {
                id: unique_id,
                title,
                node_type: "genre".to_string(),
                url: Some(format!("https://vk.com/topic-{}_{}", group_id, topic_id)),
                vk_group_id: Some(group_id.to_string()),
                vk_topic_id: Some(topic_id.to_string()),
                children: Some(Vec::new()),
                is_loaded: Some(false),
                count: None,
                extension: None,
                structure_only: None,
                vk_owner_id: None,
                vk_doc_id: None,
                vk_access_key: None,
                size_bytes: None,
            });
        }
    }

    // 2. Mentions @topic-XXX_YYY
    let re_mention = Regex::new(r"@topic-(\d+)_(\d+)(?:\?post=(\d+))?(?:\s*\(([^)]+)\))?").unwrap();
    for caps in re_mention.captures_iter(text) {
        let group_id = &caps[1];
        let topic_id = &caps[2];
        let post_id = caps.get(3).map(|m| m.as_str());
        let link_text = caps.get(4).map(|m| m.as_str());

        if let Some(ex) = exclude_topic_id {
            if topic_id == ex { continue; }
        }

        let unique_id = match post_id {
            Some(pid) => format!("topic_{}_post{}", topic_id, pid),
            None => format!("topic_{}", topic_id),
        };

        if seen_ids.contains(&unique_id) { continue; }

        let mut title = match link_text {
            Some(t) => clean_title(t),
            None => format!("Topic {}", topic_id),
        };
        if title.len() < 2 { title = format!("Topic {}", topic_id); }

        if title.len() < 200 {
            seen_ids.insert(unique_id.clone());
            nodes.push(VkNode {
                id: unique_id,
                title,
                node_type: "genre".to_string(),
                url: Some(format!("https://vk.com/topic-{}_{}", group_id, topic_id)),
                vk_group_id: Some(group_id.to_string()),
                vk_topic_id: Some(topic_id.to_string()),
                children: Some(Vec::new()),
                is_loaded: Some(false),
                count: None,
                extension: None,
                structure_only: None,
                vk_owner_id: None,
                vk_doc_id: None,
                vk_access_key: None,
                size_bytes: None,
            });
        }
    }

    // 3. Plain URLs https://vk.com/topic-203785966_47386771
    let re_url = Regex::new(r"(.*?)(https?://vk\.com/topic-(\d+)_(\d+))").unwrap();
    let lines: Vec<&str> = text.lines().collect();
    
    for (i, line) in lines.iter().enumerate() {
        for caps in re_url.captures_iter(line) {
            let before_text = caps[1].trim();
            let group_id = &caps[3];
            let topic_id = &caps[4];
            
            if let Some(ex) = exclude_topic_id {
                if topic_id == ex { continue; }
            }

            let unique_id = format!("topic_{}", topic_id);
            if seen_ids.contains(&unique_id) { continue; }

            // Try to find a title: same line first, then previous line
            let mut title = if !before_text.is_empty() && before_text.len() > 1 {
                clean_title(before_text)
            } else if i > 0 {
                clean_title(lines[i-1])
            } else {
                format!("Topic {}", topic_id)
            };
            
            if title.is_empty() || title.len() < 2 {
                title = format!("Topic {}", topic_id);
            }

            if title.len() < 200 {
                seen_ids.insert(unique_id.clone());
                nodes.push(VkNode {
                    id: unique_id,
                    title,
                    node_type: "genre".to_string(),
                    url: Some(format!("https://vk.com/topic-{}_{}", group_id, topic_id)),
                    vk_group_id: Some(group_id.to_string()),
                    vk_topic_id: Some(topic_id.to_string()),
                    children: Some(Vec::new()),
                    is_loaded: Some(false),
                    count: None,
                    extension: None,
                    structure_only: None,
                    vk_owner_id: None,
                    vk_doc_id: None,
                    vk_access_key: None,
                    size_bytes: None,
                });
            }
        }
    }

    nodes
}

/// Extract documents (PDF, CBZ, CBR, ZIP...) from VK comment attachments
pub fn extract_documents(items: &[serde_json::Value]) -> Vec<VkNode> {
    let mut nodes = Vec::new();
    let mut seen_urls = std::collections::HashSet::new();

    for item in items {
        if let Some(attachments) = item.get("attachments").and_then(|a| a.as_array()) {
            for att in attachments {
                if att.get("type").and_then(|t| t.as_str()) != Some("doc") {
                    continue;
                }

                if let Some(doc) = att.get("doc") {
                    let url = doc.get("url").and_then(|u| u.as_str()).unwrap_or("");
                    if url.is_empty() || seen_urls.contains(url) {
                        continue;
                    }
                    seen_urls.insert(url.to_string());

                    let doc_id = doc.get("id").and_then(|i| i.as_u64()).unwrap_or(0);
                    let title = doc.get("title").and_then(|t| t.as_str()).unwrap_or("Document");
                    let ext = doc.get("ext").and_then(|e| e.as_str()).map(|e| e.to_uppercase());
                    let size = doc.get("size").and_then(|s| s.as_u64());
                    let owner_id = doc.get("owner_id").and_then(|o| o.as_i64());
                    let access_key = doc.get("access_key").and_then(|a| a.as_str());

                    nodes.push(VkNode {
                        id: format!("doc_{}", doc_id),
                        title: title.to_string(),
                        node_type: "file".to_string(),
                        url: Some(url.to_string()),
                        extension: ext,
                        size_bytes: size,
                        vk_owner_id: owner_id.map(|o| o.to_string()),
                        vk_doc_id: Some(doc_id.to_string()),
                        vk_access_key: access_key.map(|a| a.to_string()),
                        is_loaded: Some(true),
                        children: None,
                        count: None,
                        structure_only: None,
                        vk_group_id: None,
                        vk_topic_id: None,
                    });
                }
            }
        }
    }

    nodes
}
