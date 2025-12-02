import { VkNode } from "../types";

const API_VERSION = "5.131";

// --- DONNEES DE SECOURS (FALLBACK) ---
// Utilisees si l'API VK echoue ou si le token est invalide,
// pour garder l'interface navigable.
const MOCK_ROOT_NODES: VkNode[] = [
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

// --- HACK JSONP + Limiteur ---
// L'API VK ne supporte pas le CORS pour les appels frontend directs.
// JSONP permet de contourner cela en injectant une balise <script>.
// On ajoute en plus un petit limiteur global pour �viter de spammer l'API.

const RATE_LIMIT_DELAY_MS = 350; // ~3 req/s
type QueueItem<T> = {
  fn: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: any) => void;
};
const requestQueue: QueueItem<any>[] = [];
let processingQueue = false;

const processQueue = async () => {
  if (processingQueue) return;
  processingQueue = true;
  while (requestQueue.length > 0) {
    const { fn, resolve, reject } = requestQueue.shift()!;
    try {
      const result = await fn();
      resolve(result);
    } catch (err) {
      reject(err);
    }
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
  }
  processingQueue = false;
};

const enqueueRequest = <T>(fn: () => Promise<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    requestQueue.push({ fn, resolve, reject });
    processQueue();
  });
};

const jsonp = (url: string): Promise<any> => {
  return enqueueRequest(() => {
    return new Promise((resolve, reject) => {
      const callbackName = "vk_cb_" + Math.round(100000 * Math.random());
      const script = document.createElement("script");

      (window as any)[callbackName] = (data: any) => {
        delete (window as any)[callbackName];
        document.body.removeChild(script);
        resolve(data);
      };

      script.src = `${url}&callback=${callbackName}`;
      script.onerror = (err) => {
        delete (window as any)[callbackName];
        document.body.removeChild(script);
        reject(err);
      };
      document.body.appendChild(script);
    });
  });
};

// --- API Calls ---

// Recupere les commentaires d'un topic VK (une seule page, 100 messages)
export const fetchVkTopic = async (
  token: string,
  groupId: string,
  topicId: string,
): Promise<any> => {
  if (!token || token.length < 10) throw new Error("Invalid Token");
  const url = `https://api.vk.com/method/board.getComments?access_token=${token}&group_id=${groupId}&topic_id=${topicId}&count=100&extended=1&v=${API_VERSION}`;
  return jsonp(url);
};

// Version batch pour plusieurs offsets d'un même topic via VK execute (max 25 sous-appels)
const fetchVkTopicBatch = async (
  token: string,
  groupId: string,
  topicId: string,
  offsets: number[],
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
  const url = `https://api.vk.com/method/execute?access_token=${token}&v=${API_VERSION}&code=${encodeURIComponent(code)}`;
  const data = await jsonp(url);
  if (data.error) {
    throw new Error(`VK execute error: ${JSON.stringify(data.error)}`);
  }
  if (!data.response || !Array.isArray(data.response)) {
    return [];
  }
  return data.response;
};

// Recherche globale dans les topics du groupe
export const searchVkBoard = async (
  token: string,
  query: string,
  groupId?: string,
): Promise<VkNode[]> => {
  if (!token) return [];
  const effectiveGroupId =
    groupId && groupId.trim().length > 0 ? groupId.trim() : "203785966";

  // On recupere un max de topics (100 est le max par defaut pour un appel)
  const url = `https://api.vk.com/method/board.getTopics?access_token=${token}&group_id=${effectiveGroupId}&count=100&order=1&preview=1&v=${API_VERSION}`;

  try {
    const data = await jsonp(url);
    if (data.response && data.response.items) {
      const items = data.response.items;
      const lowerQuery = query.toLowerCase();

      return items
        .filter((item: any) => item.title.toLowerCase().includes(lowerQuery))
        .map((item: any) => ({
          id: `topic_${item.id}`,
          title: item.title,
          type: "genre", // Un topic est un conteneur
          vkGroupId: effectiveGroupId,
          vkTopicId: item.id.toString(),
          url: `https://vk.com/topic-${effectiveGroupId}_${item.id}`,
          children: [],
          isLoaded: false,
        }));
    }
    return [];
  } catch (e) {
    console.error("Search Error", e);
    return [];
  }
};

// --- LOGIQUE DE PARSING (ANALYSE DE TEXTE) ---

const cleanTitle = (text: string) => {
  return text
    .replace(/[:\-]+$/, "")
    .replace(/^\s*[-"»«]+\s*/, "")
    .replace(/\s*[-"»«]+\s*$/, "")
    .replace(/\(lien\)/gi, "")
    .trim();
};

// Analyse le texte brut des messages pour trouver "Titre de la BD -> Lien VK"
const parseTopicBody = (text: string, excludeTopicId?: string): VkNode[] => {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const nodes: VkNode[] = [];
  const seenIds = new Set<string>(); // Set pour eviter les doublons

  const linkRegex = /vk\.com\/topic-(\d+)_(\d+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.includes("vk.com/topic-")) continue;

    const match = line.match(linkRegex);
    if (!match) continue;

    const topicId = match[2];

    // ANTI-BOUCLE : on exclut le topic actuel s'il est cite
    if (excludeTopicId && topicId === excludeTopicId) continue;

    const uniqueId = `topic_${topicId}`;

    // ANTI-DOUBLON
    if (seenIds.has(uniqueId)) continue;

    let title = "";

    const parts = line.split(/http|vk\.com/);
    // Cas 1: "Naruto : http://vk.com..." (sur la meme ligne)
    if (parts[0].trim().length > 3) {
      title = parts[0];
    } else if (i > 0) {
      // Cas 2: "Naruto" (ligne precedente)
      const prevLine = lines[i - 1];
      if (!prevLine.includes("vk.com") && prevLine.length > 2) {
        title = prevLine;
      }
    }

    // Fallback : si on n'a toujours pas de titre, on prend la ligne
    // sans le lien VK, ou a defaut un nom generique.
    if (!title) {
      const withoutLink = line
        .replace(/https?:\/\/vk\.com\/topic-\d+_\d+/i, "")
        .trim();
      title = withoutLink || `Topic ${topicId}`;
    }

    title = cleanTitle(title);
    if (!title) {
      title = `Topic ${topicId}`;
    }

    if (title.length < 200) {
      seenIds.add(uniqueId);
      nodes.push({
        id: uniqueId,
        title,
        type: "genre",
        url: `https://vk.com/topic-${match[1]}_${match[2]}`,
        vkGroupId: match[1],
        vkTopicId: match[2],
        children: [],
        isLoaded: false,
      });
    }
  }

  return nodes;
};

// Extrait les documents attaches (PDF, CBZ, CBR, ZIP) des commentaires VK
const extractDocuments = (items: any[]): VkNode[] => {
  const nodes: VkNode[] = [];
  const seenUrls = new Set<string>();

  items.forEach((item: any) => {
    if (!item.attachments) return;

    item.attachments.forEach((att: any) => {
      if (att.type !== "doc") return;

      const doc = att.doc;
      const url = doc.url;
      if (seenUrls.has(url)) return;
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

// --- SERVICES PRINCIPAUX ---

// Fonction appelee par le bouton "Synchroniser" (simple)
export const fetchRootIndex = async (
  token: string,
  groupId?: string,
  topicId?: string,
): Promise<VkNode[]> => {
  try {
    const effectiveGroupId =
      groupId && groupId.trim().length > 0 ? groupId.trim() : "203785966";
    const effectiveTopicId =
      topicId && topicId.trim().length > 0 ? topicId.trim() : "47515406";

    // Utilisation de fetchAllComments pour récupérer TOUS les messages du topic index
    // et pas seulement les 100 premiers.
    const items = await fetchAllComments(
      token,
      effectiveGroupId,
      effectiveTopicId,
    );

    if (!items || items.length === 0) {
      return MOCK_ROOT_NODES;
    }

    const fullText = items.map((i: any) => i.text).join("\n");
    const nodes = parseTopicBody(fullText);

    if (nodes.length === 0) {
      return MOCK_ROOT_NODES;
    }

    // Filtrage pour ne garder que les catégories principales (ex: "BDs EN FRANCAIS")
    // Cela évite d'afficher des liens "parasites" (comme "Howard Flynn") qui se trouvent dans l'index.
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

// Fonction appelee pour charger le contenu d'un dossier (lazy, un seul appel)
export const fetchNodeContent = async (
  token: string,
  node: VkNode,
): Promise<VkNode> => {
  if (!node.vkGroupId || !node.vkTopicId) {
    return { ...node, isLoaded: true, children: [] };
  }

  try {
    const response = await fetchVkTopic(token, node.vkGroupId, node.vkTopicId);

    if (!response.response || !response.response.items) {
      throw new Error("Failed to fetch node content");
    }

    const items = response.response.items;

    // Etape 1 : Sous-dossiers (autres topics cites)
    const fullText = items.map((i: any) => i.text).join("\n");
    const subTopics = parseTopicBody(fullText, node.vkTopicId);

    // Etape 2 : Fichiers (documents)
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

// --- Helpers pour la synchro profonde ---

// Fonction utilitaire pour attendre (delay)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Paginer tous les commentaires d'un topic (tant que VK renvoie des pages pleines)
// Avec retry automatique en cas d'échec
const fetchAllComments = async (
  token: string,
  groupId: string,
  topicId: string,
  maxRetries: number = 3,
): Promise<any[]> => {
  const allItems: any[] = [];
  let offset = 0;
  const count = 100;
  const BATCH_SIZE = 10; // <=25 sous-appels autorisés dans execute, marge de sécurité

  while (true) {
    const offsets: number[] = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      offsets.push(offset + i * count);
    }

    let responses: any[] = [];
    let retries = 0;

    while (retries < maxRetries) {
      try {
        responses = await fetchVkTopicBatch(token, groupId, topicId, offsets);
        const hasError = responses.some((r) => r?.error);
        if (hasError) {
          console.warn(
            `VK execute error for topic ${topicId} (attempt ${retries + 1}/${maxRetries})`,
          );
          retries++;
          if (retries < maxRetries) {
            await sleep(1000 * retries);
            continue;
          }
        }
        break;
      } catch (error) {
        console.warn(
          `Network/execute error for topic ${topicId} (attempt ${retries + 1}/${maxRetries}):`,
          error,
        );
        retries++;
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

    // Petit délai entre les batches pour éviter de surcharger l'API
    await sleep(200);
  }

  return allItems;
};

// Recupere uniquement la STRUCTURE (sous-topics) d'un topic, sans documents,
// en lisant toutes les pages de commentaires.
const fetchTopicStructure = async (
  token: string,
  groupId: string,
  topicId: string,
): Promise<VkNode[]> => {
  const items = await fetchAllComments(token, groupId, topicId);
  if (!items || items.length === 0) return [];
  const fullText = items.map((i: any) => i.text).join("\n");
  return parseTopicBody(fullText, topicId);
};

// Synchronise uniquement la structure de dossiers (sans documents)
// jusqu'a une profondeur maximale (par defaut 3 niveaux).
// Utilisee par le bouton "Tout synchroniser (3 niveaux)".
export const fetchFolderTreeUpToDepth = async (
  token: string,
  groupId?: string,
  topicId?: string,
  maxDepth: number = 3,
): Promise<VkNode[]> => {
  // Helper de parallelisation limitee
  const runWithConcurrency = async <T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
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

    const workers = Array(Math.min(limit, items.length))
      .fill(0)
      .map(() => runner());

    await Promise.all(workers);
    return results;
  };

  const CONCURRENCY_LIMIT = 5;

  // Niveau 1 : categories racine (index -> topics principaux)
  const rootNodes = await fetchRootIndex(token, groupId, topicId);

  if (maxDepth <= 1) {
    return rootNodes;
  }

  // Niveau 2 : sous-topics des categories (ex: Adulte, Jeunesse, etc.)
  const level1Expanded = await runWithConcurrency(
    rootNodes,
    CONCURRENCY_LIMIT,
    async (root, idx) => {
      if (!root.vkGroupId || !root.vkTopicId) {
        return root;
      }

      try {
        const children = await fetchTopicStructure(
          token,
          root.vkGroupId,
          root.vkTopicId,
        );
        return {
          ...root,
          children,
          isLoaded: true,
        };
      } catch (e) {
        console.error(
          `    ❌ Failed to fetch subcategories for "${root.title}":`,
          e,
        );
        return root;
      }
    },
  );

  if (maxDepth <= 2) {
    return level1Expanded;
  }

  // Niveau 3 : series a l'interieur de chaque sous-topic
  const level2Nodes: VkNode[] = [];
  level1Expanded.forEach((root) => {
    (root.children || []).forEach((child) => {
      if (child.vkGroupId && child.vkTopicId) {
        level2Nodes.push(child);
      }
    });
  });

  if (level2Nodes.length === 0) {
    return level1Expanded;
  }

  const level2Expanded = await runWithConcurrency(
    level2Nodes,
    CONCURRENCY_LIMIT,
    async (node, idx) => {
      try {
        const children = await fetchTopicStructure(
          token,
          node.vkGroupId as string,
          node.vkTopicId as string,
        );
        return {
          ...node,
          children,
          isLoaded: true,
        };
      } catch (e) {
        console.error(`    ❌ Failed to fetch series for "${node.title}":`, e);
        return node;
      }
    },
  );

  const level2Map = new Map<string, VkNode>();
  level2Expanded.forEach((node) => {
    level2Map.set(node.id, node);
  });

  // On reconstruit l'arbre complet avec les niveaux 2 mis a jour
  const finalRoots = level1Expanded.map((root) => ({
    ...root,
    children: (root.children || []).map(
      (child) => level2Map.get(child.id) || child,
    ),
  }));

  return finalRoots;
};
