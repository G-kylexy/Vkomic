/**
 * VK-SERVICE.JS
 * =============
 * Service pour interagir avec l'API VK et récupérer les BDs/Mangas/Comics.
 *
 * Architecture:
 * - Utilise l'API VK "board.getComments" pour lire les topics du groupe
 * - Parse le texte des commentaires pour extraire les liens vers d'autres topics (sous-dossiers)
 * - Extrait les documents attachés (fichiers PDF, CBZ, etc.)
 *
 * Hiérarchie des contenus VK:
 * - Catégorie (BDs, Mangas, Comics) → Topic principal
 * - Genre (A-B, C-D, etc.) → Sous-topic listé dans le topic principal
 * - Série (Largo Winch, etc.) → Sous-topic avec les fichiers
 * - Fichiers → Documents attachés aux commentaires
 */

import { app } from "electron";

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_VERSION = "5.131";
const VK_ID_RE = /^\d+$/;
const IS_DEV = !app.isPackaged;

/** Délai entre chaque requête API pour éviter le rate-limiting VK (~3 req/s) */
const RATE_LIMIT_DELAY_MS = 350;

// ============================================================================
// UTILITAIRES DE LOGGING
// ============================================================================

/** Log uniquement en mode développement */
const logDev = (...args) => {
  if (IS_DEV) console.log(...args);
};

const warnDev = (...args) => {
  if (IS_DEV) console.warn(...args);
};

// ============================================================================
// VALIDATION DES DONNÉES VK
// ============================================================================

/**
 * Valide et normalise un ID VK (doit être un nombre positif)
 * @throws {Error} Si l'ID n'est pas valide
 */
const normalizeVkIdOrThrow = (value, label) => {
  const raw = typeof value === "number" ? String(Math.trunc(value)) : String(value ?? "");
  const trimmed = raw.trim();
  if (!VK_ID_RE.test(trimmed)) {
    throw new Error(`Invalid ${label}`);
  }
  return trimmed;
};

/** Version silencieuse qui retourne un fallback au lieu de throw */
const normalizeVkIdOrDefault = (value, fallback) => {
  try {
    return normalizeVkIdOrThrow(value, "vk id");
  } catch {
    return fallback;
  }
};

/** Valide un offset de pagination */
const normalizeOffset = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Invalid offset");
  }
  return Math.trunc(n);
};

// ============================================================================
// CATÉGORIES PAR DÉFAUT (FALLBACK)
// ============================================================================

/**
 * Catégories de base si l'API échoue.
 * Ces IDs correspondent aux topics principaux du groupe VK.
 */
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

// ============================================================================
// FILE D'ATTENTE POUR LES REQUÊTES API (RATE LIMITING)
// ============================================================================

const requestQueue = [];
let processingQueue = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Traite la file d'attente des requêtes API une par une
 * avec un délai entre chaque pour respecter le rate-limit VK
 */
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

/**
 * Exécute une requête API VK via la file d'attente
 * @param {string} url - URL complète de l'API VK
 * @returns {Promise<object>} Réponse JSON de l'API
 */
const executeRequest = (url) =>
  new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { "User-Agent": "Vkomic/1.0" },
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

// ============================================================================
// UTILITAIRES DE PARALLÉLISATION
// ============================================================================

/**
 * Exécute des tâches en parallèle avec une limite de concurrence
 * @param {Array} items - Éléments à traiter
 * @param {number} limit - Nombre max de workers simultanés
 * @param {Function} worker - Fonction async à exécuter pour chaque item
 */
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

// ============================================================================
// FONCTIONS D'APPEL API VK
// ============================================================================

/**
 * Récupère plusieurs pages de commentaires d'un topic en une seule requête
 * Utilise l'API "execute" de VK pour batching (jusqu'à 25 appels par requête)
 *
 * @param {string} token - Token d'accès VK
 * @param {string} groupId - ID du groupe VK
 * @param {string} topicId - ID du topic
 * @param {number[]} offsets - Liste des offsets de pagination à récupérer
 */
const fetchVkTopicBatch = async (token, groupId, topicId, offsets) => {
  if (!token || token.length < 10) throw new Error("Invalid Token");

  const safeGroupId = normalizeVkIdOrThrow(groupId, "groupId");
  const safeTopicId = normalizeVkIdOrThrow(topicId, "topicId");
  const safeOffsets = Array.isArray(offsets) ? offsets.map(normalizeOffset) : [];

  // Code VKScript exécuté côté serveur VK
  const code = `
    var offsets = [${safeOffsets.join(",")}];
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
  return data?.response || [];
};

/**
 * Récupère les 100 premiers commentaires de plusieurs topics en parallèle
 * Limité à 25 topics par appel (limite VK execute)
 */
const fetchMultipleTopics = async (token, topics) => {
  if (!token || token.length < 10) throw new Error("Invalid Token");
  if (topics.length === 0) return [];
  if (topics.length > 25) throw new Error("Max 25 topics per execute call");

  const calls = topics
    .map((t) => {
      const safeGroupId = normalizeVkIdOrThrow(t.groupId, "groupId");
      const safeTopicId = normalizeVkIdOrThrow(t.topicId, "topicId");
      return `API.board.getComments({group_id:${safeGroupId},topic_id:${safeTopicId},count:100})`;
    })
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

// ============================================================================
// PARSING DU CONTENU DES TOPICS
// ============================================================================

/**
 * Nettoie un titre extrait du texte VK
 * Supprime les caractères spéciaux, guillemets, et annotations inutiles
 */
const cleanTitle = (text) => {
  return text
    .replace(/[:\-]+$/, "")           // Supprime : ou - en fin
    .replace(/^\s*[-"»«]+\s*/, "")    // Supprime guillemets en début
    .replace(/\s*[-"»«]+\s*$/, "")    // Supprime guillemets en fin
    .replace(/\(lien\)/gi, "")        // Supprime "(lien)"
    .trim();
};

/**
 * Parse le texte d'un topic pour extraire les liens vers d'autres topics
 *
 * Formats supportés:
 * 1. BBCode VK: [topic-GROUP_TOPIC|Titre du lien]
 * 2. Mentions: @topic-GROUP_TOPIC (Titre optionnel)
 * 3. URLs en clair: https://vk.com/topic-GROUP_TOPIC avec titre sur la même ligne ou précédente
 *
 * @param {string} text - Texte brut des commentaires du topic
 * @param {string} excludeTopicId - ID du topic actuel à exclure (évite les auto-références)
 * @returns {Array} Liste des nodes (sous-dossiers) trouvés
 */
const parseTopicBody = (text, excludeTopicId) => {
  const nodes = [];
  const seenIds = new Set();

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
  // Format: "Titre : https://vk.com/topic-XXX" ou titre sur ligne précédente
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

      // Essayer avant l'URL sur la même ligne
      const beforeUrl = line.substring(0, match.index);
      const parts = beforeUrl.split(/https?:\/\//);
      const titlePart = parts[0].trim();

      if (titlePart.length > 2) {
        title = titlePart;
      } else if (i > 0) {
        // Sinon chercher sur la ligne précédente
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

/**
 * Extrait les documents (fichiers) attachés aux commentaires d'un topic
 *
 * @param {Array} items - Commentaires VK avec leurs attachments
 * @returns {Array} Liste des fichiers avec URL de téléchargement
 */
const extractDocuments = (items) => {
  const nodes = [];
  const seenUrls = new Set();

  items.forEach((item) => {
    if (!item.attachments) return;

    item.attachments.forEach((att) => {
      if (att.type !== "doc") return;

      const doc = att.doc;
      const url = doc.url;

      // Ignorer les documents sans URL ni ID
      if (!url && !doc.id) return;

      // Éviter les doublons
      if (url && seenUrls.has(url)) return;
      if (url) seenUrls.add(url);

      nodes.push({
        id: `doc_${doc.id}`,
        title: doc.title,
        type: "file",
        extension: doc.ext?.toUpperCase?.() || undefined,
        url,
        vkOwnerId: String(doc.owner_id),
        vkAccessKey: doc.access_key || "",
        sizeBytes: typeof doc.size === "number" ? doc.size : undefined,
        isLoaded: true,
      });
    });
  });

  return nodes;
};

// ============================================================================
// FONCTIONS DE RÉCUPÉRATION DES COMMENTAIRES
// ============================================================================

/**
 * Récupère TOUS les commentaires d'un topic (pagination automatique)
 * Utilise le batching pour minimiser les appels API
 *
 * @param {string} token - Token VK
 * @param {string} groupId - ID du groupe
 * @param {string} topicId - ID du topic
 * @param {number} maxRetries - Nombre de tentatives en cas d'erreur
 * @param {object} options - Options: startOffset, seedItems (pour continuer une récupération)
 */
const fetchAllComments = async (token, groupId, topicId, maxRetries = 3, options = {}) => {
  const startOffset = normalizeOffset(options?.startOffset ?? 0);
  const seedItems = Array.isArray(options?.seedItems) ? options.seedItems : [];

  const allItems = [...seedItems];
  let offset = startOffset;
  const count = 100;        // Max par requête VK
  const BATCH_SIZE = 10;    // Nombre de pages par batch execute

  while (true) {
    // Préparer les offsets pour ce batch
    const offsets = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      offsets.push(offset + i * count);
    }

    let responses = [];
    let retries = 0;

    // Retry loop avec backoff exponentiel
    while (retries < maxRetries) {
      try {
        responses = await fetchVkTopicBatch(token, groupId, topicId, offsets);
        const hasError = responses.some((r) => r?.error);
        if (hasError) {
          retries++;
          if (retries < maxRetries) {
            await sleep(1000 * retries);
            continue;
          }
        }
        break;
      } catch (error) {
        retries++;
        if (retries < maxRetries) {
          await sleep(1000 * retries);
          continue;
        }
        break;
      }
    }

    // Traiter les réponses
    let reachedEnd = false;
    for (const resp of responses) {
      if (!resp || !resp.items) continue;
      allItems.push(...resp.items);
      if (resp.items.length < count) {
        reachedEnd = true;
        break;
      }
    }

    offset += count * BATCH_SIZE;
    if (reachedEnd) break;
  }

  return allItems;
};

/**
 * Récupère la structure (sous-dossiers) de plusieurs nodes en batch
 * Ne récupère pas les fichiers, seulement les liens vers d'autres topics
 */
const fetchNodesStructureBatch = async (token, nodes) => {
  if (nodes.length === 0) return [];

  // Découper en batches de 25 (limite VK execute)
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

            // Si le topic a plus de 100 commentaires, récupérer la suite
            if (resp.count > 100) {
              try {
                const allItems = await fetchAllComments(
                  token, node.vkGroupId, node.vkTopicId, 3,
                  { startOffset: 100, seedItems: items }
                );
                if (allItems?.length > 0) items = allItems;
              } catch {
                warnDev(`Failed to fetch full content for ${node.title}`);
              }
            }

            const text = items.map((it) => it.text || "").join("\n");
            const children = parseTopicBody(text, node.vkTopicId);
            return { ...node, children, isLoaded: true, structureOnly: true };
          }

          return { ...node, children: [], isLoaded: true, structureOnly: true };
        })
      );

      return processedNodes;
    } catch (e) {
      console.error("Batch fetch error:", e);
      return batch.map((n) => ({ ...n, children: [], isLoaded: true, structureOnly: true }));
    }
  });

  return results.flat();
};

// ============================================================================
// EXPORTS - FONCTIONS PUBLIQUES
// ============================================================================

/**
 * Récupère l'index racine (les catégories principales: BDs, Mangas, Comics)
 *
 * @param {string} token - Token VK
 * @param {string} groupId - ID du groupe (optionnel, défaut: 203785966)
 * @param {string} topicId - ID du topic index (optionnel, défaut: 47515406)
 */
export const fetchRootIndex = async (token, groupId, topicId) => {
  try {
    const effectiveGroupId = groupId?.trim().length > 0
      ? normalizeVkIdOrDefault(groupId, "203785966")
      : "203785966";
    const effectiveTopicId = topicId?.trim().length > 0
      ? normalizeVkIdOrDefault(topicId, "47515406")
      : "47515406";

    const items = await fetchAllComments(token, effectiveGroupId, effectiveTopicId);

    if (!items || items.length === 0) return MOCK_ROOT_NODES;

    const fullText = items.map((i) => i.text).join("\n");
    const nodes = parseTopicBody(fullText);

    if (nodes.length === 0) return MOCK_ROOT_NODES;

    // Filtrer pour ne garder que les catégories "EN FRANCAIS"
    const filteredNodes = nodes.filter((n) => n.title.toUpperCase().includes("EN FRANCAIS"));
    const finalNodes = filteredNodes.length > 0 ? filteredNodes : nodes;

    return finalNodes.map((n) => ({ ...n, type: "category" }));
  } catch (error) {
    console.error("VK API Error (Root):", error);
    return MOCK_ROOT_NODES;
  }
};

/**
 * Récupère le contenu complet d'un node (sous-dossiers + fichiers)
 * Appelé quand l'utilisateur ouvre un dossier
 *
 * @param {string} token - Token VK
 * @param {object} node - Node à charger (doit avoir vkGroupId et vkTopicId)
 */
export const fetchNodeContent = async (token, node) => {
  if (!node?.vkGroupId || !node?.vkTopicId) {
    return { ...node, isLoaded: true, children: [] };
  }

  try {
    const items = await fetchAllComments(token, node.vkGroupId, node.vkTopicId);

    if (!items) throw new Error("Failed to fetch node content");

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
      children: [{ id: "err1", title: "Erreur (API)", type: "category", isLoaded: true }],
    };
  }
};

/**
 * Pré-charge l'arbre de dossiers jusqu'à une profondeur donnée
 * Utilisé au démarrage pour afficher la structure sans attendre les clics
 *
 * Niveaux:
 * 1 = Catégories (BDs, Mangas, Comics)
 * 2 = Genres alphabétiques (A-B, C-D, etc.)
 * 3 = Séries (Largo Winch, etc.)
 * 4 = Contenu profond (pour Comics uniquement)
 *
 * @param {string} token - Token VK
 * @param {string} groupId - ID du groupe
 * @param {string} topicId - ID du topic racine
 * @param {number} maxDepth - Profondeur max (défaut: 4)
 */
export const fetchFolderTreeUpToDepth = async (token, groupId, topicId, maxDepth = 4) => {
  // logDev("Starting fetchFolderTreeUpToDepth...");

  // Niveau 1: Catégories racines
  const rootNodes = await fetchRootIndex(token, groupId, topicId);
  if (maxDepth <= 1) return rootNodes;

  // Niveau 2: Genres (A-B, C-D, etc.)
  // logDev(`Loading Level 2 for ${rootNodes.length} roots...`);
  const level1Expanded = await fetchNodesStructureBatch(token, rootNodes);
  if (maxDepth <= 2) return level1Expanded;

  // Niveau 3: Séries
  const level2Nodes = [];
  level1Expanded.forEach((root) => {
    (root.children || []).forEach((child) => {
      if (child.vkGroupId && child.vkTopicId) {
        level2Nodes.push(child);
      }
    });
  });

  if (level2Nodes.length === 0) return level1Expanded;

  // logDev(`Loading Level 3 for ${level2Nodes.length} sub-categories...`);
  const level2Expanded = await fetchNodesStructureBatch(token, level2Nodes);

  // Mapper les résultats pour mise à jour
  const level2Map = new Map();
  level2Expanded.forEach((node) => level2Map.set(node.id, node));

  level1Expanded.forEach((root) => {
    if (root.children) {
      root.children = root.children.map((child) => level2Map.get(child.id) || child);
    }
  });

  if (maxDepth <= 3) return level1Expanded;

  // Niveau 4: Contenu profond (Comics uniquement - topic 47543940)
  const level3Nodes = [];
  level1Expanded.forEach((root) => {
    if (root.vkTopicId === "47543940") {  // Comics seulement
      (root.children || []).forEach((l2) => {
        const l2Expanded = level2Map.get(l2.id);
        if (l2Expanded?.children) {
          l2Expanded.children.forEach((l3) => {
            if (l3.vkGroupId && l3.vkTopicId) level3Nodes.push(l3);
          });
        }
      });
    }
  });

  if (level3Nodes.length === 0) return level1Expanded;

  // logDev(`Loading Level 4 for ${level3Nodes.length} items (Comics only)...`);
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

  // logDev("Done! 4 levels loaded successfully.");
  return level1Expanded;
};

/**
 * Rafraîchit l'URL d'un document VK via l'API docs.getById
 * Les URLs VK expirent après un certain temps, cette fonction récupère une URL fraîche
 *
 * Note: Certains documents ont des restrictions de confidentialité qui empêchent
 * l'accès via API même avec un token valide. Dans ce cas, la fonction retourne null.
 *
 * @param {string} token - Token VK
 * @param {string} ownerId - ID du propriétaire du document (peut être négatif pour un groupe)
 * @param {string} docId - ID du document
 * @param {string} originalUrl - URL originale (pour extraire le hash si nécessaire)
 * @param {string} accessKey - Clé d'accès du document
 * @returns {Promise<{url: string|null, error: string|null}>}
 */
export const refreshDocUrl = async (token, ownerId, docId, originalUrl = "", accessKey = "") => {
  if (!token || token.length < 10) {
    return { url: null, error: "Invalid token" };
  }

  try {
    const safeOwnerId = String(ownerId).trim();
    const safeDocId = normalizeVkIdOrThrow(docId, "docId");

    // Construire l'ID complet: ownerId_docId_accessKey
    let docFullId = `${safeOwnerId}_${safeDocId}`;

    // Priorité: accessKey explicite > hash dans l'URL originale
    let finalAccessKey = accessKey;
    if (!finalAccessKey && originalUrl) {
      const hashMatch = originalUrl.match(/[?&]hash=([^&]+)/);
      if (hashMatch) finalAccessKey = hashMatch[1];
    }

    if (finalAccessKey) {
      docFullId += `_${finalAccessKey}`;
    }

    const url = `https://api.vk.com/method/docs.getById?access_token=${token}&v=${API_VERSION}&docs=${docFullId}`;
    const data = await executeRequest(url);

    if (data?.error) {
      return { url: null, error: data.error.error_msg || "API error" };
    }

    const docs = data?.response;
    if (!docs || docs.length === 0) {
      return { url: null, error: "Document not found" };
    }

    const freshUrl = docs[0]?.url;
    if (!freshUrl) {
      return { url: null, error: "No URL in response" };
    }

    return { url: freshUrl, error: null };
  } catch (err) {
    if (originalUrl) {
      return { url: originalUrl, error: null };
    }
    console.error(`[VK-SERVICE] refreshDocUrl error:`, err);
    return { url: null, error: err.message || "Unknown error" };
  }
};
