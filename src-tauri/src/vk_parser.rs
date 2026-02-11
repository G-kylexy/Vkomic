use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};

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

lazy_static! {
    static ref RE_BBCODE_TITLE: Regex = Regex::new(r"\[topic-\d+(?:_\d+)?\|([^\]]+)\]").unwrap();
    static ref RE_CLEAN_1: Regex = Regex::new(r"\s*[-–—=]+[>→»]\s*.*$").unwrap();
    static ref RE_CLEAN_2: Regex = Regex::new(r"https?://.*$").unwrap();
    static ref RE_CLEAN_3: Regex = Regex::new(r"[:\-–—]+$").unwrap();
    static ref RE_CLEAN_4: Regex = Regex::new(r"^\s*[-–—'»«•*·]+\s*").unwrap();
    static ref RE_CLEAN_5: Regex = Regex::new(r"\s*[-–—'»«•*·]+\s*$").unwrap();
    // Case-insensitive cleanup for (lien) - mobile compatible
    static ref RE_CLEAN_LIEN: Regex = Regex::new(r"\(lien\)").unwrap();

    static ref RE_BBCODE: Regex = Regex::new(r"\[topic-(\d+)_(\d+)\|([^\]]+)\]").unwrap();
    static ref RE_MENTION: Regex = Regex::new(r"@topic-(\d+)_(\d+)(?:\?post=(\d+))?(?:\s*\(([^)]+)\))?").unwrap();
    // Support m.vk.com, w.vk.com, new.vk.com, etc. - Also capture post_id for mentions
    static ref RE_URL: Regex = Regex::new(r"https?://(?:[a-z0-9]+\.)?vk\.com/topic-(\d+)_(\d+)(?:\?post=(\d+))?").unwrap();
    // Inverted format: https://vk.com/topic-XXX|Titre] - BBCode malformed
    static ref RE_URL_INVERTED: Regex = Regex::new(r"https?://(?:[a-z0-9]+\.)?vk\.com/topic-(\d+)_(\d+)\|([^\]]+)\]").unwrap();
    // Support documents in text: https://vk.com/doc-123_456
    static ref RE_DOC_URL: Regex = Regex::new(r"https?://(?:[a-z0-9]+\.)?vk\.com/doc(-?\d+)_(\d+)").unwrap();
}

pub fn clean_title(text: &str) -> String {
    let mut cleaned = text.to_string();

    // BBCode [topic-xxx|Titre]
    if let Some(caps) = RE_BBCODE_TITLE.captures(text) {
        cleaned = caps[1].to_string();
    }

    cleaned = RE_CLEAN_1.replace_all(&cleaned, "").to_string();
    cleaned = RE_CLEAN_2.replace_all(&cleaned, "").to_string();
    cleaned = RE_CLEAN_3.replace_all(&cleaned, "").to_string();
    cleaned = RE_CLEAN_4.replace_all(&cleaned, "").to_string();
    cleaned = RE_CLEAN_5.replace_all(&cleaned, "").to_string();
    // Mobile-compatible: case-insensitive (lien) removal
    cleaned = RE_CLEAN_LIEN.replace_all(&cleaned, "").to_string();

    cleaned.trim().to_string()
}

pub fn parse_topic_body(text: &str, exclude_topic_id: Option<&str>) -> Vec<VkNode> {
    let mut nodes = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    // 1. BBCode
    for caps in RE_BBCODE.captures_iter(text) {
        let group_id = &caps[1];
        let topic_id = &caps[2];
        let link_text = &caps[3];

        if let Some(ex) = exclude_topic_id {
            if topic_id == ex {
                continue;
            }
        }

        let unique_id = format!("topic_{}", topic_id);
        if seen_ids.contains(&unique_id) {
            continue;
        }

        let mut title = clean_title(link_text);
        if title.len() < 2 {
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

    // 2. Mentions @topic-XXX_YYY
    for caps in RE_MENTION.captures_iter(text) {
        let group_id = &caps[1];
        let topic_id = &caps[2];
        let post_id = caps.get(3).map(|m| m.as_str());
        let link_text = caps.get(4).map(|m| m.as_str());

        if let Some(ex) = exclude_topic_id {
            if topic_id == ex {
                continue;
            }
        }

        let unique_id = match post_id {
            Some(pid) => format!("topic_{}_post{}", topic_id, pid),
            None => format!("topic_{}", topic_id),
        };

        if seen_ids.contains(&unique_id) {
            continue;
        }

        let mut title = match link_text {
            Some(t) => clean_title(t),
            None => format!("Topic {}", topic_id),
        };
        if title.len() < 2 {
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

    // 3. Plain URLs (Topics & Docs) - Mobile-compatible parsing
    let lines: Vec<&str> = text.lines().collect();

    for (i, line) in lines.iter().enumerate() {
        // 3a. Inverted format: https://vk.com/topic-XXX|Titre] (malformed BBCode)
        // Mobile finds ~150 extra BD with this format
        for caps in RE_URL_INVERTED.captures_iter(line) {
            let group_id = &caps[1];
            let topic_id = &caps[2];
            let link_text = &caps[3];

            if let Some(ex) = exclude_topic_id {
                if topic_id == ex {
                    continue;
                }
            }

            let unique_id = format!("topic_{}", topic_id);
            if seen_ids.contains(&unique_id) {
                continue;
            }

            let mut title = clean_title(link_text);
            if title.len() < 2 {
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

        // 3b. Standard URLs with improved title detection (mobile logic)
        for caps in RE_URL.captures_iter(line) {
            let group_id = &caps[1];
            let topic_id = &caps[2];
            let post_id = caps.get(3).map(|m| m.as_str());

            // Skip if already processed via inverted format
            if let Some(ex) = exclude_topic_id {
                if topic_id == ex {
                    continue;
                }
            }

            let unique_id = match post_id {
                Some(pid) => format!("topic_{}_post{}", topic_id, pid),
                None => format!("topic_{}", topic_id),
            };

            if seen_ids.contains(&unique_id) {
                continue;
            }

            // Find URL position in line for title extraction
            let url_match = caps.get(0).unwrap();
            let url_start = url_match.start();
            let url_end = url_match.end();

            // Mobile title extraction priority:
            // 1. Text before URL on same line
            // 2. Previous line (if not a URL)
            // 3. Text after URL on same line (fallback)
            let mut title = String::new();

            // Try text before URL
            let before_text = &line[..url_start].trim();
            if !before_text.is_empty() && before_text.len() > 1 {
                title = clean_title(before_text);
            }

            // Try previous line if no title found
            if (title.is_empty() || title.len() < 2) && i > 0 {
                let prev_line = lines[i - 1].trim();
                if !prev_line.contains("vk.com") && prev_line.len() > 2 {
                    title = clean_title(prev_line);
                }
            }

            // Try text after URL as fallback (mobile behavior)
            if (title.is_empty() || title.len() < 2) && url_end < line.len() {
                let after_text = &line[url_end..].trim();
                if !after_text.is_empty() && after_text.len() > 2 && !after_text.contains("vk.com")
                {
                    title = clean_title(after_text);
                }
            }

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

        // 3c. Documents in text (keep for compatibility but avoid duplicates with extract_documents)
        // Only parse if the document is not also in attachments (will be filtered by seen_ids)
        for caps in RE_DOC_URL.captures_iter(line) {
            let owner_id = &caps[1];
            let doc_id = &caps[2];

            let unique_id = format!("doc_{}_{}", owner_id, doc_id);
            if seen_ids.contains(&unique_id) {
                continue;
            }

            // Find URL position for title extraction
            let url_match = caps.get(0).unwrap();
            let url_start = url_match.start();

            // Title detection (mobile logic)
            let mut title = String::new();

            // Text before document URL
            let before_text = &line[..url_start].trim();
            if !before_text.is_empty() && before_text.len() > 1 {
                title = clean_title(before_text);
            }

            // Previous line if needed
            if (title.is_empty() || title.len() < 2) && i > 0 {
                let prev_line = lines[i - 1].trim();
                if !prev_line.contains("vk.com") && prev_line.len() > 2 {
                    title = clean_title(prev_line);
                }
            }

            // Heuristic: if title contains "telecharger" or "download", use previous line
            if title.to_lowercase().contains("telecharger")
                || title.to_lowercase().contains("download")
            {
                if i > 0 {
                    let prev_line = lines[i - 1].trim();
                    if !prev_line.contains("vk.com") && prev_line.len() > 2 {
                        title = clean_title(prev_line);
                    }
                }
            }

            if title.is_empty() || title.len() < 2 {
                title = format!("Document {}", doc_id);
            }

            seen_ids.insert(unique_id.clone());
            nodes.push(VkNode {
                id: unique_id,
                title,
                node_type: "file".to_string(),
                url: Some(format!("https://vk.com/doc{}_{}", owner_id, doc_id)),
                extension: Some("FILE".to_string()),
                vk_owner_id: Some(owner_id.to_string()),
                vk_doc_id: Some(doc_id.to_string()),
                vk_group_id: None,
                vk_topic_id: None,
                children: None,
                is_loaded: Some(true),
                count: None,
                structure_only: None,
                vk_access_key: None,
                size_bytes: None,
            });
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
                    let title = doc
                        .get("title")
                        .and_then(|t| t.as_str())
                        .unwrap_or("Document");
                    let ext = doc
                        .get("ext")
                        .and_then(|e| e.as_str())
                        .map(|e| e.to_uppercase());
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
