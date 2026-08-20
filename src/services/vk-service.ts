import { VkNode } from "../types";
import { VK_API } from "./constants";
import { logSync, logWarn, logError } from "./logger";

const API_VERSION = VK_API.VERSION;

// --- LIMITEUR DE REQUÊTES ---
const RATE_LIMIT_DELAY_MS = 350; // ~3 req/s
const REQUEST_TIMEOUT_MS = 20_000;
const requestQueue: Array<() => Promise<void>> = [];
let processingQueue = false;

const processQueue = async () => {
  if (processingQueue) return;
  processingQueue = true;
  while (requestQueue.length > 0) {
    const task = requestQueue.shift();
    if (task) await task();
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
  }
  processingQueue = false;
};

// Wrapper qui met la requête en file d'attente (fetch)
const executeRequest = <T>(url: string): Promise<T> => {
  return new Promise((resolve, reject) => {
    const task = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "KateMobileAndroid/110.1 lite-x86_64 (Android 11; SDK 30; x86_64; en)",
            Accept: "application/json",
          },
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`VK API HTTP error: ${res.status}`);
        }
        const json = await res.json();
        resolve(json);
      } catch (err) {
        reject(err);
      } finally {
        clearTimeout(timeoutId);
      }
    };
    requestQueue.push(task);
    processQueue();
  });
};

// Helper générique pour paralléliser des tâches avec une limite de concurrence
const runParallel = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  const runner = async (): Promise<void> => {
    while (true) {
      const index = currentIndex++;
      if (index >= items.length) break;
      results[index] = await worker(items[index], index);
    }
  };
  const workers = Array(Math.min(limit, items.length)).fill(0).map(() => runner());
  await Promise.all(workers);
  return results;
};

// --- API Calls ---

// Récupère une page de commentaires d'un topic
export const fetchVkTopic = async (
  token: string,
  groupId: string,
  topicId: string
): Promise<any> => {
  if (!token || token.length < 10) throw new Error("Invalid Token");
  const url = `https://api.vk.ru/method/board.getComments?access_token=${token}&group_id=${groupId}&topic_id=${topicId}&count=100&extended=1&v=${API_VERSION}`;
  return executeRequest(url);
};

// Version batch via VK execute pour plusieurs offsets
const fetchVkTopicBatch = async (
  token: string,
  groupId: string,
  topicId: string,
  offsets: number[]
): Promise<any[]> => {
  if (!token || token.length < 10) throw new Error("Invalid Token");
  const offsetsLiteral = offsets.join(",");
  const code = `
    var offsets = [${offsetsLiteral}];
    var res = [];
    var i = 0;
    while (i < offsets.length) {
      res.push(API.board.getComments({
        group_id: ${groupId},
        topic_id: ${topicId},
        count: 100,
        offset: offsets[i],
        extended: 1
      }));
      i = i + 1;
    }
    return res;
  `;
  const url = `https://api.vk.ru/method/execute?access_token=${token}&v=${API_VERSION}&code=${encodeURIComponent(code)}`;
  const data = await executeRequest<any>(url);
  if (data.error) {
    throw new Error(`VK execute error: ${JSON.stringify(data.error)}`);
  }
  if (!data.response || !Array.isArray(data.response)) {
    return [];
  }
  return data.response;
};

// Récupère les premiers commentaires de plusieurs topics en un seul appel execute
const fetchMultipleTopics = async (
  token: string,
  topics: { groupId: string; topicId: string }[]
): Promise<any[]> => {
  if (!token || token.length < 10) throw new Error("Invalid Token");
  if (topics.length === 0) return [];
  if (topics.length > 25) throw new Error("Max 25 topics per execute call");

  const calls = topics
    .map(
      (t) =>
        `API.board.getComments({group_id:${t.groupId},topic_id:${t.topicId},count:100,extended:1})`
    )
    .join(",");

  const code = `return [${calls}];`;
  const url = `https://api.vk.ru/method/execute?access_token=${token}&v=${API_VERSION}&code=${encodeURIComponent(code)}`;

  const data = await executeRequest<any>(url);
  if (data.error) {
    throw new Error(`VK execute error: ${JSON.stringify(data.error)}`);
  }
  if (!Array.isArray(data.response) || data.response.length !== topics.length) {
    throw new Error("VK returned an incomplete multi-topic response");
  }
  if (data.response.some((response: any) => !response || !Array.isArray(response.items))) {
    throw new Error("VK returned an invalid multi-topic response");
  }
  return data.response;
};

/**
 * Récupère la structure de plusieurs nœuds en parallèle par lots de 25.
 */
const fetchNodesStructureBatch = async (token: string, nodes: VkNode[]): Promise<VkNode[]> => {
  if (nodes.length === 0) return [];

  const batches: VkNode[][] = [];
  for (let i = 0; i < nodes.length; i += 25) {
    batches.push(nodes.slice(i, i + 25));
  }

  const results = await runParallel(batches, 5, async (batch) => {
    const topicsToFetch = batch.map((n) => ({
      groupId: n.vkGroupId as string,
      topicId: n.vkTopicId as string,
    }));

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
                  node.vkGroupId as string,
                  node.vkTopicId as string
                );
                if (allItems && allItems.length > 0) {
                  items = allItems;
                }
              } catch (err) {
                logWarn(`Failed to fetch full content for ${node.title}.`);
                throw err;
              }
            }

            const text = items.map((it: any) => it.text || "").join("\n");
            let children = parseTopicBodyEnhanced(text, node.vkTopicId);
            const documents = extractDocuments(items);
            if (documents.length > 0) {
              // Les liens "nus" vk.com/doc... (sans hash/dl) font renvoyer la page HTML.
              // On les remplace par les URLs signées des pièces jointes quand elles existent.
              const attachmentMap = new Map<string, VkNode>();
              for (const d of documents) {
                if (d.vkOwnerId && d.vkDocId) {
                  attachmentMap.set(`${d.vkOwnerId}_${d.vkDocId}`, d);
                }
              }
              children = children
                .filter((c: VkNode) => {
                  if (c.type !== "file" || !c.vkOwnerId || !c.vkDocId) return true;
                  return !attachmentMap.has(`${c.vkOwnerId}_${c.vkDocId}`);
                })
                .concat(documents);
            } else {
              children = children.concat(documents);
            }
            return {
              ...node,
              count: typeof resp.count === "number" ? resp.count : node.count,
              children,
              isLoaded: true,
              structureOnly: true,
            };
          }
          return node;
        })
    );

    return processedNodes;
  });

  return results.flat();
};

// Expose un helper léger pour le préchargement (utilisé par le mobile)
export const expandNodesStructure = async (token: string, nodes: VkNode[]): Promise<VkNode[]> => {
  if (!nodes || nodes.length === 0) return [];
  return fetchNodesStructureBatch(token, nodes);
};

// Recherche globale dans les topics du groupe
export const searchVkBoard = async (
  token: string,
  query: string,
  groupId?: string
): Promise<VkNode[]> => {
  if (!token) return [];
  const effectiveGroupId =
    groupId && groupId.trim().length > 0 ? groupId.trim() : "203785966";

  const url = `https://api.vk.ru/method/board.getTopics?access_token=${token}&group_id=${effectiveGroupId}&count=100&order=1&preview=1&v=${API_VERSION}`;

  try {
    const data = await executeRequest<any>(url);
    if (data.response && data.response.items) {
      const items = data.response.items;
      const lowerQuery = query.toLowerCase();

      return items
        .filter((item: any) => item.title.toLowerCase().includes(lowerQuery))
        .map((item: any) => ({
          id: `topic_${item.id}`,
          title: item.title,
          type: "genre",
          vkGroupId: effectiveGroupId,
          vkTopicId: item.id.toString(),
          url: `https://vk.com/topic-${effectiveGroupId}_${item.id}`,
          children: [],
          isLoaded: false,
        }));
    }
    return [];
  } catch (e) {
    logError("Search Error", e);
    return [];
  }
};

// --- LOGIQUE DE PARSING ---

const cleanTitle = (text: string) => {
  let cleaned = text || "";
  const embeddedTitle = cleaned.match(/\[topic-\d+(?:_\d+)?\|([^\]]+)\]/i);
  if (embeddedTitle) {
    cleaned = embeddedTitle[1];
  }

  return cleaned
    .replace(/\s*[-–—=]+[>→»]\s*.*$/i, '') // Flèches et séparateurs
    .replace(/https?:\/\/.*$/i, '') // Supprime les liens restants à la fin
    .replace(/[:\->]+$/, '')
    .replace(/^\s*[-"«»•*·]+\s*/, '') // Puces et guillemets au début
    .replace(/\s*[-"«»•*·]+\s*$/, '') // Puces et guillemets à la fin
    .replace(/\(lien\)/gi, '')
    .trim();
};

const parseTopicBody = (text: string, excludeTopicId?: string): VkNode[] => {
  const nodes: VkNode[] = [];
  const seenIds = new Set<string>();

  // === 1. Parser les BBCode VK: [topic-GROUP_TOPIC|Texte] ===
  // Format le plus fiable car le titre est inclus dans le lien
  const bbcodeRegex = /\[topic-(\d+)_(\d+)\|([^\]]+)\]/g;
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

  // === 2. Parser les mentions: @topic-GROUP_TOPIC (Titre) ===
  const mentionRegex = /@topic-(\d+)_(\d+)(?:\?post=(\d+))?(?:\s*\(([^)]+)\))?/g;
  let mentionMatch;
  while ((mentionMatch = mentionRegex.exec(text)) !== null) {
    const [, groupId, topicId, postId, linkText] = mentionMatch;
    if (excludeTopicId && topicId === excludeTopicId) continue;

    const uniqueId = postId ? `topic_${topicId}_post${postId}` : `topic_${topicId}`;
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

  // === 3. Parser les URLs en clair (fallback) ===
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("vk.com/topic-")) continue;

    const lineUrlRegex = /vk\.com\/topic-(\d+)_(\d+)(?:\?post=(\d+))?/g;
    let match;

    while ((match = lineUrlRegex.exec(line)) !== null) {
      const [, groupId, topicId, postId] = match;
      if (excludeTopicId && topicId === excludeTopicId) continue;

      const uniqueId = postId ? `topic_${topicId}_post${postId}` : `topic_${topicId}`;
      if (seenIds.has(uniqueId)) continue;

      // Extraction du titre
      let title = "";

      // NOUVEAU: Format VK inversé "https://vk.com/topic-XXX|Titre]"
      // Le titre est APRÈS l'URL, séparé par un pipe | (souvent reste de BBCode mal fermé ou format specifique)
      const afterMatch = line.substring(match.index + match[0].length);
      const pipeMatch = afterMatch.match(/^\|([^\]]+)\]/);
      if (pipeMatch) {
        title = pipeMatch[1].trim();
      }

      // Fallback: Extraction avant l'URL standard "Titre : URL"
      if (!title) {
        const beforeMatch = line.substring(0, match.index);
        const rawTitle = beforeMatch.replace(/https?:\/\/$/, "").trim();

        // Cas 1: "Naruto -> https://vk.com..." (sur la meme ligne)
        if (rawTitle.length > 2) {
          title = rawTitle;
        } else if (i > 0) {
          // Cas 2: "Naruto" (ligne precedente)
          const prevLine = lines[i - 1];
          if (!prevLine.includes("vk.com") && prevLine.length > 2) {
            title = prevLine;
          }
        }
      }

      if (!title) {
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

    // 3c. Documents in text
    const docUrlRegex = /vk\.(?:com|ru)\/doc(-?\d+)_(\d+)/g;
    let docMatch;
    while ((docMatch = docUrlRegex.exec(line)) !== null) {
      const [, ownerId, docId] = docMatch;
      const uniqueId = `doc_${ownerId}_${docId}`;
      if (seenIds.has(uniqueId)) continue;

      let title = "";
      const beforeMatch = line.substring(0, docMatch.index);
      if (beforeMatch.trim().length > 1) {
        title = cleanTitle(beforeMatch);
      } else if (i > 0) {
        const prevLine = lines[i - 1].trim();
        if (!prevLine.includes("vk.com") && prevLine.length > 2) {
          title = cleanTitle(prevLine);
        }
      }

      if (!title) title = `Document ${docId}`;
      seenIds.add(uniqueId);
      nodes.push({
        id: uniqueId,
        title,
        type: "file",
        url: `https://vk.com/doc${ownerId}_${docId}`,
        vkOwnerId: ownerId,
        vkDocId: docId,
        isLoaded: true,
      });
    }
  }

  return nodes;
};

const upsertTopicNode = (nodes: VkNode[], nextNode: VkNode) => {
  const existing = nodes.find((node) => node.id === nextNode.id);
  if (existing) {
    if (nextNode.title && !existing.title.includes(nextNode.title)) {
      existing.title = `${existing.title} - ${nextNode.title}`;
    }
    return;
  }

  nodes.push(nextNode);
};

const parseTopicBodyEnhanced = (text: string, excludeTopicId?: string): VkNode[] => {
  const nodes: VkNode[] = [];
  const seenIds = new Set<string>();

  const bbcodeRegex = /\[topic-(\d+)_(\d+)\|([^\]]+)\]/g;
  let bbMatch;
  while ((bbMatch = bbcodeRegex.exec(text)) !== null) {
    const [, groupId, topicId, linkText] = bbMatch;
    if (excludeTopicId && topicId === excludeTopicId) continue;

    let title = cleanTitle(linkText);
    if (!title || title.length < 2) title = `Topic ${topicId}`;

    if (title.length < 200) {
      upsertTopicNode(nodes, {
        id: `topic_${topicId}`,
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

  const mentionRegex = /@topic-(\d+)_(\d+)(?:\?post=(\d+))?(?:\s*\(([^)]+)\))?/g;
  let mentionMatch;
  while ((mentionMatch = mentionRegex.exec(text)) !== null) {
    const [, groupId, topicId, _postId, linkText] = mentionMatch;
    if (excludeTopicId && topicId === excludeTopicId) continue;

    let title = linkText ? cleanTitle(linkText) : `Topic ${topicId}`;
    if (!title || title.length < 2) title = `Topic ${topicId}`;

    if (title.length < 200) {
      upsertTopicNode(nodes, {
        id: `topic_${topicId}`,
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

  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const invertedTopicUrlRegex =
    /(?:https?:\/\/)?(?:[a-z0-9]+\.)?vk\.com\/topic-(\d+)_(\d+)\|([^\]]+)\]/gi;
  const topicUrlRegex =
    /(?:https?:\/\/)?(?:[a-z0-9]+\.)?vk\.com\/topic-(\d+)_(\d+)(?:\?post=(\d+))?/gi;
  const docUrlRegex =
    /(?:https?:\/\/)?(?:[a-z0-9]+\.)?vk\.(?:com|ru)\/doc(-?\d+)_(\d+)/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    let invertedMatch;
    while ((invertedMatch = invertedTopicUrlRegex.exec(line)) !== null) {
      const [, groupId, topicId, linkText] = invertedMatch;
      if (excludeTopicId && topicId === excludeTopicId) continue;

      let title = cleanTitle(linkText);
      if (!title || title.length < 2) title = `Topic ${topicId}`;

      if (title.length < 200) {
        upsertTopicNode(nodes, {
          id: `topic_${topicId}`,
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

    let topicMatch;
    while ((topicMatch = topicUrlRegex.exec(line)) !== null) {
      const [, groupId, topicId] = topicMatch;
      if (excludeTopicId && topicId === excludeTopicId) continue;

      const urlStart = topicMatch.index;
      const urlEnd = urlStart + topicMatch[0].length;
      let title = "";

      const beforeText = line.substring(0, urlStart).trim();
      if (beforeText.length > 1) {
        title = cleanTitle(beforeText);
      }

      if ((!title || title.length < 2) && i > 0) {
        const prevLine = lines[i - 1].trim();
        if (!prevLine.includes("vk.com") && prevLine.length > 2) {
          title = cleanTitle(prevLine);
        }
      }

      if ((!title || title.length < 2) && urlEnd < line.length) {
        const afterText = line.substring(urlEnd).trim();
        if (afterText.length > 2 && !afterText.includes("vk.com")) {
          title = cleanTitle(afterText);
        }
      }

      if (!title || title.length < 2) title = `Topic ${topicId}`;

      if (title.length < 200) {
        upsertTopicNode(nodes, {
          id: `topic_${topicId}`,
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

    let docMatch;
    while ((docMatch = docUrlRegex.exec(line)) !== null) {
      const [, ownerId, docId] = docMatch;
      const uniqueId = `doc_${ownerId}_${docId}`;
      if (seenIds.has(uniqueId)) continue;

      let title = "";
      const beforeText = line.substring(0, docMatch.index).trim();
      if (beforeText.length > 1) {
        title = cleanTitle(beforeText);
      } else if (i > 0) {
        const prevLine = lines[i - 1].trim();
        if (!prevLine.includes("vk.com") && prevLine.length > 2) {
          title = cleanTitle(prevLine);
        }
      }

      const titleLower = title.toLowerCase();
      if ((titleLower.includes("telecharger") || titleLower.includes("download")) && i > 0) {
        const prevLine = lines[i - 1].trim();
        if (!prevLine.includes("vk.com") && prevLine.length > 2) {
          title = cleanTitle(prevLine);
        }
      }

      if (!title) title = `Document ${docId}`;
      seenIds.add(uniqueId);
      nodes.push({
        id: uniqueId,
        title,
        type: "file",
        url: `https://vk.com/doc${ownerId}_${docId}`,
        vkOwnerId: ownerId,
        vkDocId: docId,
        isLoaded: true,
      });
    }
  }

  return nodes;
};

const extractDocuments = (items: any[]): VkNode[] => {
  const nodes: VkNode[] = [];
  const seenDocuments = new Set<string>();

  items.forEach((item: any) => {
    if (!item.attachments) return;

    item.attachments.forEach((att: any) => {
      if (att.type !== "doc") return;

      const doc = att.doc;
      if (!doc || doc.owner_id === undefined || doc.id === undefined) return;

      const ownerId = String(doc.owner_id);
      const docId = String(doc.id);
      const documentKey = `${ownerId}_${docId}`;
      if (seenDocuments.has(documentKey)) return;
      seenDocuments.add(documentKey);

      const url = typeof doc.url === "string" && doc.url.length > 0
        ? doc.url
        : `https://vk.com/doc${ownerId}_${docId}`;

      nodes.push({
        id: `doc_${documentKey}`,
        title: doc.title,
        type: "file",
        extension: doc.ext?.toLowerCase?.() || undefined,
        url,
        sizeBytes: typeof doc.size === "number" ? doc.size : undefined,
        vkOwnerId: ownerId,
        vkDocId: docId,
        vkAccessKey: doc.access_key,
        isLoaded: true,
      });
    });
  });

  return nodes;
};

// --- SERVICES PRINCIPAUX ---

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchAllComments = async (
  token: string,
  groupId: string,
  topicId: string,
  maxRetries: number = 3
): Promise<any[]> => {
  const allItems: any[] = [];
  let offset = 0;
  const count = 100;
  const BATCH_SIZE = 10;
  const MAX_BATCHES = 100;
  let batchNumber = 0;

  while (batchNumber < MAX_BATCHES) {
    batchNumber++;
    const offsets: number[] = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      offsets.push(offset + i * count);
    }

    let responses: any[] = [];
    let retries = 0;
    let lastError: unknown = null;

    while (retries < maxRetries) {
      try {
        responses = await fetchVkTopicBatch(token, groupId, topicId, offsets);
        if (responses.length !== offsets.length || responses.some((r) => !r || !Array.isArray(r.items))) {
          throw new Error(`VK returned an incomplete batch for topic ${topicId}`);
        }
        break;
      } catch (error) {
        lastError = error;
        logWarn(
          `Network/execute error for topic ${topicId} (attempt ${retries + 1}/${maxRetries}):`,
          error
        );
        retries++;
        if (retries < maxRetries) {
          await sleep(1000 * retries);
          continue;
        }
      }
    }

    if (responses.length !== offsets.length || responses.some((r) => !r || !Array.isArray(r.items))) {
      throw lastError instanceof Error
        ? lastError
        : new Error(`Unable to fetch comments for topic ${topicId}`);
    }

    let reachedEnd = false;
    for (let idx = 0; idx < responses.length; idx++) {
      const resp = responses[idx];
      const items = resp.items;
      allItems.push(...items);
      if (items.length < count) {
        reachedEnd = true;
        break;
      }
    }

    offset += count * BATCH_SIZE;
    if (reachedEnd) return allItems;

    await sleep(200);
  }

  throw new Error(`Safety limit reached while fetching topic ${topicId}`);
};

// Sync simple (root)
export const fetchRootIndex = async (
  token: string,
  groupId?: string,
  topicId?: string
): Promise<VkNode[]> => {
  try {
    const effectiveGroupId =
      groupId && groupId.trim().length > 0 ? groupId.trim() : "203785966";
    const effectiveTopicId =
      topicId && topicId.trim().length > 0 ? topicId.trim() : "47515406";

    const items = await fetchAllComments(token, effectiveGroupId, effectiveTopicId);

    if (!items || items.length === 0) {
      return [];
    }

    const fullText = items.map((i: any) => i.text).join("\n");
    const nodes = parseTopicBodyEnhanced(fullText);

    if (nodes.length === 0) {
      return [];
    }

    const filteredNodes = nodes.filter((n) => n.title.toUpperCase().includes("EN FRANCAIS"));
    const finalNodes = filteredNodes.length > 0 ? filteredNodes : nodes;

    return finalNodes.map((n) => ({ ...n, type: "category" as const }));
  } catch (error) {
    logError("VK API Error (Root):", error);
    throw error;
  }
};

// Chargement d'un dossier (lazy)
export const fetchNodeContent = async (token: string, node: VkNode): Promise<VkNode> => {
  if (!node.vkGroupId || !node.vkTopicId) {
    return { ...node, isLoaded: true, children: [] };
  }

  try {
    const items = await fetchAllComments(token, node.vkGroupId, node.vkTopicId);

    if (!items) {
      throw new Error("Failed to fetch node content");
    }

    const fullText = items.map((i: any) => i.text).join("\n");
    const subTopics = parseTopicBodyEnhanced(fullText, node.vkTopicId);

    const documents = extractDocuments(items);

    // Remplacer les liens nus vk.com/doc... par les URLs signées des pièces jointes
    let allChildren: VkNode[];
    if (documents.length > 0) {
      const attachmentMap = new Map<string, VkNode>();
      for (const d of documents) {
        if (d.vkOwnerId && d.vkDocId) {
          attachmentMap.set(`${d.vkOwnerId}_${d.vkDocId}`, d);
        }
      }
      allChildren = subTopics
        .filter((c: VkNode) => {
          if (c.type !== "file" || !c.vkOwnerId || !c.vkDocId) return true;
          return !attachmentMap.has(`${c.vkOwnerId}_${c.vkDocId}`);
        })
        .concat(documents);
    } else {
      allChildren = [...subTopics, ...documents];
    }

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
    logError("VK API Error (Node):", error);
    throw error;
  }
};

export const fetchFolderTreeUpToDepth = async (
  token: string,
  groupId?: string,
  topicId?: string,
  maxDepth: number = 4
): Promise<VkNode[]> => {
  logSync("Starting fetchFolderTreeUpToDepth (mobile)...");

  const rootNodes = await fetchRootIndex(token, groupId, topicId);
  if (maxDepth <= 1 || rootNodes.length === 0) return rootNodes;

  logSync(`Loading Level 2 (Categories) for ${rootNodes.length} roots...`);
  const level1Expanded = await fetchNodesStructureBatch(token, rootNodes);
  if (maxDepth <= 2) return level1Expanded;

  const level2Nodes: VkNode[] = [];
  level1Expanded.forEach((root) => {
    (root.children || []).forEach((child) => {
      if (child.vkGroupId && child.vkTopicId) {
        level2Nodes.push(child);
      }
    });
  });

  if (level2Nodes.length === 0) return level1Expanded;

  logSync(`Loading Level 3 (Series) for ${level2Nodes.length} sub-categories...`);
  const level2Expanded = await fetchNodesStructureBatch(token, level2Nodes);

  const level2Map = new Map<string, VkNode>();
  level2Expanded.forEach((node) => level2Map.set(node.id, node));

  level1Expanded.forEach((root) => {
    if (root.children) {
      root.children = root.children.map((child) => level2Map.get(child.id) || child);
    }
  });

  if (maxDepth <= 3) return level1Expanded;

  const level3Nodes: VkNode[] = [];

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

  logSync(`Loading Level 4 (Deep Content) for ${level3Nodes.length} items (Comics only)...`);
  const level3Expanded = await fetchNodesStructureBatch(token, level3Nodes);

  const level3Map = new Map<string, VkNode>();
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

  logSync("fetchFolderTreeUpToDepth (mobile) done.");
  return level1Expanded;
};

/**
 * Résout une URL de téléchargement fraîche pour un document VK.
 * Les liens "nus" (https://vk.com/doc{owner}_{id}) ne servent PAS le fichier :
 * VK renvoie la page HTML du document (quelques Ko). docs.getById renvoie
 * l'URL signée (avec hash/dl) qui pointe directement vers le fichier.
 */
export const getDocumentDownloadUrl = async (
  token: string,
  ownerId: string,
  docId: string,
  accessKey?: string
): Promise<string | null> => {
  const docsParam = accessKey ? `${ownerId}_${docId}_${accessKey}` : `${ownerId}_${docId}`;
  const url = `https://api.vk.ru/method/docs.getById?access_token=${token}&docs=${encodeURIComponent(
    docsParam
  )}&v=${API_VERSION}`;

  try {
    const data = await executeRequest<any>(url);
    const doc = data?.response?.[0];
    if (doc?.url) return doc.url;
    logWarn(`docs.getById returned no URL for ${docsParam}`, data?.error || "");
    return null;
  } catch (e) {
    logError("docs.getById error", e);
    return null;
  }
};
