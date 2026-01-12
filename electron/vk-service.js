import { app } from "electron";

const API_VERSION = "5.131";
const VK_ID_RE = /^\d+$/;

const IS_DEV = !app.isPackaged;
const logDev = (...args) => {
  if (IS_DEV) console.log(...args);
};
const warnDev = (...args) => {
  if (IS_DEV) console.warn(...args);
};

const normalizeVkIdOrThrow = (value, label) => {
  const raw =
    typeof value === "number" ? String(Math.trunc(value)) : String(value ?? "");
  const trimmed = raw.trim();
  if (!VK_ID_RE.test(trimmed)) {
    throw new Error(`Invalid ${label}`);
  }
  return trimmed;
};

const normalizeVkIdOrDefault = (value, fallback) => {
  try {
    return normalizeVkIdOrThrow(value, "vk id");
  } catch {
    return fallback;
  }
};

const normalizeOffset = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Invalid offset");
  }
  return Math.trunc(n);
};

const MOCK_ROOT_NODES = [
  {
    id: "topic_47386771",
    title: "BDs EN FRANCAIS",
    type: "category",
    vkGroupId: "203785966",
    vkTopicId: "47386771",
    url: "https://vk.com/topic-203785966_47386771",
    children: [],
    isLoaded: false,
  },
  {
    id: "topic_47423270",
    title: "MANGAS EN FRANCAIS",
    type: "category",
    vkGroupId: "203785966",
    vkTopicId: "47423270",
    url: "https://vk.com/topic-203785966_47423270",
    children: [],
    isLoaded: false,
  },
  {
    id: "topic_47543940",
    title: "COMICS EN FRANCAIS",
    type: "category",
    vkGroupId: "203785966",
    vkTopicId: "47543940",
    url: "https://vk.com/topic-203785966_47543940",
    children: [],
    isLoaded: false,
  },
];

const RATE_LIMIT_DELAY_MS = 350; // ~3 req/s
const requestQueue = [];
let processingQueue = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const processQueue = async () => {
  if (processingQueue) return;
  processingQueue = true;
  while (requestQueue.length > 0) {
    const task = requestQueue.shift();
    if (task) await task();
    await sleep(RATE_LIMIT_DELAY_MS);
  }
  processingQueue = false;
};

const executeRequest = (url) =>
  new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": "Vkomic/1.0",
          },
        });

        const json = await res.json();
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };

    requestQueue.push(task);
    processQueue();
  });

const runParallel = async (items, limit, worker) => {
  if (items.length === 0) return [];
  const results = new Array(items.length);
  let currentIndex = 0;

  const runner = async () => {
    while (true) {
      const index = currentIndex++;
      if (index >= items.length) break;
      results[index] = await worker(items[index], index);
    }
  };

  const workers = Array(Math.min(limit, items.length))
    .fill(0)
    .map(() => runner());
  await Promise.all(workers);
  return results;
};

const fetchVkTopicBatch = async (token, groupId, topicId, offsets) => {
  if (!token || token.length < 10) throw new Error("Invalid Token");
  const safeGroupId = normalizeVkIdOrThrow(groupId, "groupId");
  const safeTopicId = normalizeVkIdOrThrow(topicId, "topicId");
  const safeOffsets = Array.isArray(offsets)
    ? offsets.map(normalizeOffset)
    : [];
  const offsetsLiteral = safeOffsets.join(",");
  const code = `
    var offsets = [${offsetsLiteral}];
    var res = [];
    var i = 0;
    while (i < offsets.length) {
      res.push(API.board.getComments({
        group_id: ${safeGroupId},
        topic_id: ${safeTopicId},
        count: 100,
        offset: offsets[i]
      }));
      i = i + 1;
    }
    return res;
  `;

  const url = `https://api.vk.com/method/execute?access_token=${token}&v=${API_VERSION}&code=${encodeURIComponent(code)}`;
  const data = await executeRequest(url);
  if (data?.error) {
    throw new Error(`VK execute error: ${JSON.stringify(data.error)}`);
  }
  if (!data?.response || !Array.isArray(data.response)) {
    return [];
  }
  return data.response;
};

const fetchMultipleTopics = async (token, topics) => {
  if (!token || token.length < 10) throw new Error("Invalid Token");
  if (topics.length === 0) return [];
  if (topics.length > 25) throw new Error("Max 25 topics per execute call");

  const calls = topics
    .map(
      (t) => {
        const safeGroupId = normalizeVkIdOrThrow(t.groupId, "groupId");
        const safeTopicId = normalizeVkIdOrThrow(t.topicId, "topicId");
        return `API.board.getComments({group_id:${safeGroupId},topic_id:${safeTopicId},count:100})`;
      },
    )
    .join(",");

  const code = `return [${calls}];`;
  const url = `https://api.vk.com/method/execute?access_token=${token}&v=${API_VERSION}&code=${encodeURIComponent(code)}`;

  const data = await executeRequest(url);
  if (data?.error) {
    console.error("VK execute error:", data.error);
    return topics.map(() => null);
  }
  return data.response || [];
};

const cleanTitle = (text) => {
  return text
    .replace(/[:\-]+$/, "")
    .replace(/^\s*[-"»«]+\s*/, "")
    .replace(/\s*[-"»«]+\s*$/, "")
    .replace(/\(lien\)/gi, "")
    .trim();
};

const parseTopicBody = (text, excludeTopicId) => {
  const nodes = [];
  const seenIds = new Set();

  // Regex pour BBCode VK: [topic-GROUP_TOPIC|Texte]
  const bbcodeRegex = /\[topic-(\d+)_(\d+)\|([^\]]+)\]/g;

  // Aussi gérer le format avec @ : @topic-GROUP_TOPIC (Texte)
  const mentionRegex = /@topic-(\d+)_(\d+)(?:\s*\(([^)]+)\))?/g;

  // 1. Parser les BBCode VK d'abord (plus fiable car contient le titre)
  let bbMatch;
  while ((bbMatch = bbcodeRegex.exec(text)) !== null) {
    const [, groupId, topicId, linkText] = bbMatch;
    if (excludeTopicId && topicId === excludeTopicId) continue;

    const uniqueId = `topic_${topicId}`;
    if (seenIds.has(uniqueId)) continue;

    let title = cleanTitle(linkText);
    if (!title || title.length < 2) title = `Topic ${topicId}`;

    if (title.length < 200) {
      seenIds.add(uniqueId);
      nodes.push({
        id: uniqueId,
        title,
        type: "genre",
        url: `https://vk.com/topic-${groupId}_${topicId}`,
        vkGroupId: groupId,
        vkTopicId: topicId,
        children: [],
        isLoaded: false,
      });
    }
  }

  // 2. Parser les mentions @topic-XXX
  let mentionMatch;
  while ((mentionMatch = mentionRegex.exec(text)) !== null) {
    const [, groupId, topicId, linkText] = mentionMatch;
    if (excludeTopicId && topicId === excludeTopicId) continue;

    const uniqueId = `topic_${topicId}`;
    if (seenIds.has(uniqueId)) continue;

    let title = linkText ? cleanTitle(linkText) : `Topic ${topicId}`;
    if (!title || title.length < 2) title = `Topic ${topicId}`;

    if (title.length < 200) {
      seenIds.add(uniqueId);
      nodes.push({
        id: uniqueId,
        title,
        type: "genre",
        url: `https://vk.com/topic-${groupId}_${topicId}`,
        vkGroupId: groupId,
        vkTopicId: topicId,
        children: [],
        isLoaded: false,
      });
    }
  }

  // 3. Parser les URLs en clair (fallback)
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("vk.com/topic-")) continue;

    // Reset regex lastIndex for each line
    const lineUrlRegex = /vk\.com\/topic-(\d+)_(\d+)/g;
    let match;

    while ((match = lineUrlRegex.exec(line)) !== null) {
      const [, groupId, topicId] = match;
      if (excludeTopicId && topicId === excludeTopicId) continue;

      const uniqueId = `topic_${topicId}`;
      if (seenIds.has(uniqueId)) continue;

      let title = "";

      // Essayer d'extraire le titre avant l'URL
      const beforeUrl = line.substring(0, match.index);
      const parts = beforeUrl.split(/https?:\/\//);
      const lastPart = parts[parts.length - 1].trim();

      if (lastPart.length > 2) {
        title = lastPart;
      } else if (i > 0) {
        // Chercher dans la ligne précédente
        const prevLine = lines[i - 1];
        if (!prevLine.includes("vk.com") && prevLine.length > 2) {
          title = prevLine;
        }
      }

      if (!title) {
        // Essayer après l'URL
        const afterUrl = line.substring(match.index + match[0].length).trim();
        if (afterUrl.length > 2 && !afterUrl.includes("vk.com")) {
          title = afterUrl;
        }
      }

      title = cleanTitle(title);
      if (!title || title.length < 2) title = `Topic ${topicId}`;

      if (title.length < 200) {
        seenIds.add(uniqueId);
        nodes.push({
          id: uniqueId,
          title,
          type: "genre",
          url: `https://vk.com/topic-${groupId}_${topicId}`,
          vkGroupId: groupId,
          vkTopicId: topicId,
          children: [],
          isLoaded: false,
        });
      }
    }
  }

  return nodes;
};

const extractDocuments = (items) => {
  const nodes = [];
  const seenUrls = new Set();

  items.forEach((item) => {
    if (!item.attachments) return;

    item.attachments.forEach((att) => {
      if (att.type !== "doc") return;

      const doc = att.doc;
      const url = doc.url;
      if (!url || seenUrls.has(url)) return;
      seenUrls.add(url);

      nodes.push({
        id: `doc_${doc.id}`,
        title: doc.title,
        type: "file",
        extension: doc.ext?.toUpperCase?.() || undefined,
        url,
        sizeBytes: typeof doc.size === "number" ? doc.size : undefined,
        isLoaded: true,
      });
    });
  });

  return nodes;
};

const fetchAllComments = async (
  token,
  groupId,
  topicId,
  maxRetries = 3,
  options = {},
) => {
  const startOffset = normalizeOffset(options?.startOffset ?? 0);
  const seedItems = Array.isArray(options?.seedItems) ? options.seedItems : [];

  const allItems = [...seedItems];
  let offset = startOffset;
  const count = 100;
  const BATCH_SIZE = 10;

  while (true) {
    const offsets = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      offsets.push(offset + i * count);
    }

    let responses = [];
    let retries = 0;

    while (retries < maxRetries) {
      try {
        responses = await fetchVkTopicBatch(token, groupId, topicId, offsets);
        const hasError = responses.some((r) => r?.error);
        if (hasError) {
          retries += 1;
          if (retries < maxRetries) {
            await sleep(1000 * retries);
            continue;
          }
        }
        break;
      } catch (error) {
        retries += 1;
        if (retries < maxRetries) {
          await sleep(1000 * retries);
          continue;
        }
        break;
      }
    }

    let reachedEnd = false;
    for (let idx = 0; idx < responses.length; idx++) {
      const resp = responses[idx];
      if (!resp || !resp.items) continue;
      const items = resp.items;
      allItems.push(...items);
      if (items.length < count) {
        reachedEnd = true;
        break;
      }
    }

    offset += count * BATCH_SIZE;
    if (reachedEnd) break;
  }

  return allItems;
};

const fetchNodesStructureBatch = async (token, nodes) => {
  if (nodes.length === 0) return [];

  const batches = [];
  for (let i = 0; i < nodes.length; i += 25) {
    batches.push(nodes.slice(i, i + 25));
  }

  const results = await runParallel(batches, 5, async (batch) => {
    const topicsToFetch = batch.map((n) => ({
      groupId: n.vkGroupId,
      topicId: n.vkTopicId,
    }));

    try {
      const responses = await fetchMultipleTopics(token, topicsToFetch);

      const processedNodes = await Promise.all(
        batch.map(async (node, index) => {
          const resp = responses[index];
          if (resp && resp.items) {
          let items = resp.items;

          if (resp.count > 100) {
            try {
              const allItems = await fetchAllComments(
                token,
                node.vkGroupId,
                node.vkTopicId,
                3,
                { startOffset: 100, seedItems: items },
              );
              if (allItems && allItems.length > 0) {
                items = allItems;
              }
            } catch {
                warnDev(
                  `Failed to fetch full content for ${node.title}, using partial data.`,
                );
              }
            }

            const text = items.map((it) => it.text || "").join("\n");
            const children = parseTopicBody(text, node.vkTopicId);
            return {
              ...node,
              children,
              isLoaded: true,
              structureOnly: true,
            };
          }

          return { ...node, children: [], isLoaded: true, structureOnly: true };
        }),
      );

      return processedNodes;
    } catch (e) {
      console.error("Batch fetch error:", e);
      return batch.map((n) => ({
        ...n,
        children: [],
        isLoaded: true,
        structureOnly: true,
      }));
    }
  });

  return results.flat();
};

export const fetchRootIndex = async (token, groupId, topicId) => {
  try {
    const effectiveGroupId =
      groupId && groupId.trim().length > 0
        ? normalizeVkIdOrDefault(groupId, "203785966")
        : "203785966";
    const effectiveTopicId =
      topicId && topicId.trim().length > 0
        ? normalizeVkIdOrDefault(topicId, "47515406")
        : "47515406";

    const items = await fetchAllComments(token, effectiveGroupId, effectiveTopicId);

    if (!items || items.length === 0) {
      return MOCK_ROOT_NODES;
    }

    const fullText = items.map((i) => i.text).join("\n");
    const nodes = parseTopicBody(fullText);

    if (nodes.length === 0) {
      return MOCK_ROOT_NODES;
    }

    const filteredNodes = nodes.filter((n) =>
      n.title.toUpperCase().includes("EN FRANCAIS"),
    );
    const finalNodes = filteredNodes.length > 0 ? filteredNodes : nodes;

    return finalNodes.map((n) => ({ ...n, type: "category" }));
  } catch (error) {
    console.error("VK API Error (Root):", error);
    return MOCK_ROOT_NODES;
  }
};

export const fetchNodeContent = async (token, node) => {
  if (!node?.vkGroupId || !node?.vkTopicId) {
    return { ...node, isLoaded: true, children: [] };
  }

  try {
    const items = await fetchAllComments(token, node.vkGroupId, node.vkTopicId);

    if (!items) {
      throw new Error("Failed to fetch node content");
    }

    const fullText = items.map((i) => i.text).join("\n");
    const subTopics = parseTopicBody(fullText, node.vkTopicId);
    const documents = extractDocuments(items);

    const allChildren = [...subTopics, ...documents];

    if (allChildren.length > 0) {
      return {
        ...node,
        children: allChildren,
        isLoaded: true,
        type: documents.length > 0 ? "series" : "genre",
      };
    }

    return { ...node, isLoaded: true, children: [] };
  } catch (error) {
    console.error("VK API Error (Node):", error);
    return {
      ...node,
      isLoaded: true,
      children: [
        { id: "err1", title: "Erreur (API)", type: "category", isLoaded: true },
      ],
    };
  }
};

export const fetchFolderTreeUpToDepth = async (
  token,
  groupId,
  topicId,
  maxDepth = 4,
) => {
  logDev("Starting fetchFolderTreeUpToDepth...");

  const rootNodes = await fetchRootIndex(token, groupId, topicId);

  if (maxDepth <= 1) return rootNodes;

  logDev(`Loading Level 2 (Categories) for ${rootNodes.length} roots...`);
  const level1Expanded = await fetchNodesStructureBatch(token, rootNodes);

  if (maxDepth <= 2) return level1Expanded;

  const level2Nodes = [];
  level1Expanded.forEach((root) => {
    (root.children || []).forEach((child) => {
      if (child.vkGroupId && child.vkTopicId) {
        level2Nodes.push(child);
      }
    });
  });

  if (level2Nodes.length === 0) return level1Expanded;

  logDev(
    `Loading Level 3 (Series) for ${level2Nodes.length} sub-categories...`,
  );
  const level2Expanded = await fetchNodesStructureBatch(token, level2Nodes);

  const level2Map = new Map();
  level2Expanded.forEach((node) => level2Map.set(node.id, node));

  level1Expanded.forEach((root) => {
    if (root.children) {
      root.children = root.children.map((child) => level2Map.get(child.id) || child);
    }
  });

  if (maxDepth <= 3) return level1Expanded;

  const level3Nodes = [];

  level1Expanded.forEach((root) => {
    const isTargetTopic = root.vkTopicId === "47543940";

    if (isTargetTopic) {
      (root.children || []).forEach((l2) => {
        const l2Expanded = level2Map.get(l2.id);
        if (l2Expanded && l2Expanded.children) {
          l2Expanded.children.forEach((l3) => {
            if (l3.vkGroupId && l3.vkTopicId) {
              level3Nodes.push(l3);
            }
          });
        }
      });
    }
  });

  if (level3Nodes.length === 0) return level1Expanded;

  logDev(
    `Loading Level 4 (Deep Content) for ${level3Nodes.length} items (Comics only)...`,
  );
  const level3Expanded = await fetchNodesStructureBatch(token, level3Nodes);

  const level3Map = new Map();
  level3Expanded.forEach((node) => level3Map.set(node.id, node));

  level1Expanded.forEach((root) => {
    if (root.children) {
      root.children.forEach((l2) => {
        if (l2.children) {
          l2.children = l2.children.map((l3) => level3Map.get(l3.id) || l3);
        }
      });
    }
  });

  logDev("Done! 4 levels loaded successfully.");
  return level1Expanded;
};
