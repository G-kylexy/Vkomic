import { VkNode } from '../types';
import { VK_API } from './constants';
import { logSync, logWarn, logError } from './logger';

const API_VERSION = VK_API.VERSION;

// --- DONNEES DE SECOURS (FALLBACK) ---
// Utilisees si l'API VK echoue ou si le token est invalide,
// pour garder l'interface navigable.
const MOCK_ROOT_NODES: VkNode[] = [
  {
    id: 'topic_47386771',
    title: 'BDs EN FRANCAIS',
    type: 'category',
    vkGroupId: '203785966',
    vkTopicId: '47386771',
    url: 'https://vk.com/topic-203785966_47386771',
    children: [],
    isLoaded: false,
  },
  {
    id: 'topic_47423270',
    title: 'MANGAS EN FRANCAIS',
    type: 'category',
    vkGroupId: '203785966',
    vkTopicId: '47423270',
    url: 'https://vk.com/topic-203785966_47423270',
    children: [],
    isLoaded: false,
  },
  {
    id: 'topic_47543940',
    title: 'COMICS EN FRANCAIS',
    type: 'category',
    vkGroupId: '203785966',
    vkTopicId: '47543940',
    url: 'https://vk.com/topic-203785966_47543940',
    children: [],
    isLoaded: false,
  },
];

// --- LIMITEUR DE REQUETES ---
// Pour eviter de spammer l'API VK et de se faire bloquer
const RATE_LIMIT_DELAY_MS = 350; // ~3 req/s
const requestQueue: (() => Promise<void>)[] = [];
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

// Wrapper qui met la requête en file d'attente
const executeRequest = <T>(url: string): Promise<T> => {
  return new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const res = await fetch(url);
        const json = await res.json();
        resolve(json);
      } catch (err) {
        reject(err);
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

// Recupere les commentaires d'un topic VK (une seule page, 100 messages)
export const fetchVkTopic = async (
  token: string,
  groupId: string,
  topicId: string
): Promise<any> => {
  if (!token || token.length < 10) throw new Error('Invalid Token');
  // Note: On n'a plus besoin du paramètre '&callback=...' car ce n'est plus du JSONP
  const url = `https://api.vk.com/method/board.getComments?access_token=${token}&group_id=${groupId}&topic_id=${topicId}&count=100&extended=1&v=${API_VERSION}`;
  return executeRequest(url);
};

// Version batch pour plusieurs offsets d'un même topic via VK execute (max 25 sous-appels)
const fetchVkTopicBatch = async (
  token: string,
  groupId: string,
  topicId: string,
  offsets: number[]
): Promise<any[]> => {
  if (!token || token.length < 10) throw new Error('Invalid Token');
  const offsetsLiteral = offsets.join(',');
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
  const data = await executeRequest<any>(url);
  if (data.error) {
    throw new Error(`VK execute error: ${JSON.stringify(data.error)}`);
  }
  if (!data.response || !Array.isArray(data.response)) {
    return [];
  }
  return data.response;
};

// Récupère les premiers commentaires de PLUSIEURS topics différents en UN seul appel execute
// Permet de charger jusqu'à 25 topics à la fois (limite VK execute)
const fetchMultipleTopics = async (
  token: string,
  topics: { groupId: string; topicId: string }[]
): Promise<any[]> => {
  if (!token || token.length < 10) throw new Error('Invalid Token');
  if (topics.length === 0) return [];
  if (topics.length > 25) throw new Error('Max 25 topics per execute call');

  // Construire le code VKScript pour récupérer tous les topics
  const calls = topics.map(t =>
    `API.board.getComments({group_id:${t.groupId},topic_id:${t.topicId},count:100,extended:1})`
  ).join(',');

  const code = `return [${calls}];`;
  const url = `https://api.vk.com/method/execute?access_token=${token}&v=${API_VERSION}&code=${encodeURIComponent(code)}`;

  const data = await executeRequest<any>(url);
  if (data.error) {
    logError('VK execute error:', data.error);
    return topics.map(() => null);
  }
  return data.response || [];
};

/**
 * Récupère la structure de plusieurs nœuds en parallèle par lots de 25.
 * Remplace les boucles manuelles pour une vitesse maximale.
 */
const fetchNodesStructureBatch = async (
  token: string,
  nodes: VkNode[]
): Promise<VkNode[]> => {
  if (nodes.length === 0) return [];

  // 1. Préparer les lots de 25
  const batches: VkNode[][] = [];
  for (let i = 0; i < nodes.length; i += 25) {
    batches.push(nodes.slice(i, i + 25));
  }

  // 2. Traiter les lots en parallèle (max 5 lots simultanés = 125 topics)
  const results = await runParallel(batches, 5, async (batch) => {
    const topicsToFetch = batch.map(n => ({
      groupId: n.vkGroupId as string,
      topicId: n.vkTopicId as string
    }));

    try {
      const responses = await fetchMultipleTopics(token, topicsToFetch);

      const processedNodes = await Promise.all(batch.map(async (node, index) => {
        const resp = responses[index];
        if (resp && resp.items) {
          let items = resp.items;

          // Si le topic contient plus de 100 messages, on doit tout récupérer
          if (resp.count > 100) {
            try {
              const allItems = await fetchAllComments(token, node.vkGroupId as string, node.vkTopicId as string);
              if (allItems && allItems.length > 0) {
                items = allItems;
              }
            } catch (err) {
              logWarn(`Failed to fetch full content for ${node.title}, using partial data.`);
            }
          }

          const text = items.map((it: any) => it.text || '').join('\n');
          const children = parseTopicBody(text, node.vkTopicId);
          return {
            ...node,
            children,
            isLoaded: true,
            structureOnly: true,
          };
        }
        // Si pas de réponse ou vide, on retourne le node tel quel mais chargé
        return { ...node, children: [], isLoaded: true, structureOnly: true };
      }));

      return processedNodes;
    } catch (e) {
      logError('Batch fetch error:', e);
      // En cas d'erreur de batch, on retourne les nodes vides pour ne pas bloquer
      return batch.map(n => ({ ...n, children: [], isLoaded: true, structureOnly: true }));
    }
  });

  // 3. Aplatir les résultats
  return results.flat();
};

// Recherche globale dans les topics du groupe
export const searchVkBoard = async (
  token: string,
  query: string,
  groupId?: string
): Promise<VkNode[]> => {
  if (!token) return [];
  const effectiveGroupId = groupId && groupId.trim().length > 0 ? groupId.trim() : '203785966';

  // On recupere un max de topics (100 est le max par defaut pour un appel)
  const url = `https://api.vk.com/method/board.getTopics?access_token=${token}&group_id=${effectiveGroupId}&count=100&order=1&preview=1&v=${API_VERSION}`;

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
          type: 'genre', // Un topic est un conteneur
          vkGroupId: effectiveGroupId,
          vkTopicId: item.id.toString(),
          url: `https://vk.com/topic-${effectiveGroupId}_${item.id}`,
          children: [],
          isLoaded: false,
        }));
    }
    return [];
  } catch (e) {
    logError('Search Error', e);
    return [];
  }
};

// --- LOGIQUE DE PARSING (ANALYSE DE TEXTE) ---

const cleanTitle = (text: string) => {
  return text
    .replace(/\s*[-–—=]+[>→»]\s*.*$/i, '')
    .replace(/https?:\/\/.*$/i, '')
    .replace(/[:\->]+$/, '')
    .replace(/^\s*[•*·\-"»«]+\s*/, '')
    .replace(/\s*[•*·\-"»«]+\s*$/, '')
    .replace(/\(lien\)/gi, '')
    .trim();
};

// Analyse le texte brut des messages pour trouver "Titre de la BD -> Lien VK"
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
        type: 'genre',
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
        type: 'genre',
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
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('vk.com/topic-')) continue;

    const lineUrlRegex = /vk\.com\/topic-(\d+)_(\d+)(?:\?post=(\d+))?/g;
    let match;

    while ((match = lineUrlRegex.exec(line)) !== null) {
      const [, groupId, topicId, postId] = match;
      if (excludeTopicId && topicId === excludeTopicId) continue;

      const uniqueId = postId ? `topic_${topicId}_post${postId}` : `topic_${topicId}`;
      if (seenIds.has(uniqueId)) continue;

      // Extraction du titre
      let title = '';

      // NOUVEAU: Format VK inversé "https://vk.com/topic-XXX|Titre]"
      // Le titre est APRÈS l'URL, séparé par un pipe |
      const afterMatch = line.substring(match.index + match[0].length);
      const pipeMatch = afterMatch.match(/^\|([^\]]+)\]/);
      if (pipeMatch) {
        title = pipeMatch[1].trim();
      }

      // Fallback: Extraction avant l'URL
      if (!title) {
        const beforeMatch = line.substring(0, match.index);
        const rawTitle = beforeMatch.replace(/https?:\/\/$/, '').trim();

        // Cas 1: "Naruto -> https://vk.com..." (sur la meme ligne)
        if (rawTitle.length > 2) {
          title = rawTitle;
        } else if (i > 0) {
          // Cas 2: "Naruto" (ligne precedente)
          const prevLine = lines[i - 1];
          if (!prevLine.includes('vk.com') && prevLine.length > 2) {
            title = prevLine;
          }
        }
      }

      if (!title) {
        const afterUrl = line.substring(match.index + match[0].length).trim();
        if (afterUrl.length > 2 && !afterUrl.includes('vk.com')) {
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
          type: 'genre',
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

// Extrait les documents attaches (PDF, CBZ, CBR, ZIP) des commentaires VK
const extractDocuments = (items: any[]): VkNode[] => {
  const nodes: VkNode[] = [];
  const seenUrls = new Set<string>();

  items.forEach((item: any) => {
    if (!item.attachments) return;

    item.attachments.forEach((att: any) => {
      if (att.type !== 'doc') return;

      const doc = att.doc;
      const url = doc.url;
      if (seenUrls.has(url)) return;
      seenUrls.add(url);

      nodes.push({
        id: `doc_${doc.id}`,
        title: doc.title,
        type: 'file',
        extension: doc.ext?.toUpperCase?.() || undefined,
        url,
        sizeBytes: typeof doc.size === 'number' ? doc.size : undefined,
        isLoaded: true,
      });
    });
  });

  return nodes;
};

// --- SERVICES PRINCIPAUX ---

// Fonction utilitaire pour attendre (delay)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Paginer tous les commentaires d'un topic (tant que VK renvoie des pages pleines)
// Avec retry automatique en cas d'échec
const fetchAllComments = async (
  token: string,
  groupId: string,
  topicId: string,
  maxRetries: number = 3
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
          logWarn(`VK execute error for topic ${topicId} (attempt ${retries + 1}/${maxRetries})`);
          retries++;
          if (retries < maxRetries) {
            await sleep(1000 * retries);
            continue;
          }
        }
        break;
      } catch (error) {
        logWarn(`Network/execute error for topic ${topicId} (attempt ${retries + 1}/${maxRetries}):`, error);
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

// Fonction appelee par le bouton "Synchroniser" (simple)
export const fetchRootIndex = async (
  token: string,
  groupId?: string,
  topicId?: string
): Promise<VkNode[]> => {
  try {
    const effectiveGroupId = groupId && groupId.trim().length > 0 ? groupId.trim() : '203785966';
    const effectiveTopicId = topicId && topicId.trim().length > 0 ? topicId.trim() : '47515406';

    // Utilisation de fetchAllComments pour récupérer TOUS les messages du topic index
    // et pas seulement les 100 premiers.
    const items = await fetchAllComments(token, effectiveGroupId, effectiveTopicId);

    if (!items || items.length === 0) {
      return MOCK_ROOT_NODES;
    }

    const fullText = items.map((i: any) => i.text).join('\n');
    const nodes = parseTopicBody(fullText);

    if (nodes.length === 0) {
      return MOCK_ROOT_NODES;
    }

    // Filtrage pour ne garder que les catégories principales (ex: "BDs EN FRANCAIS")
    // Cela évite d'afficher des liens "parasites" (comme "Howard Flynn") qui se trouvent dans l'index.
    const filteredNodes = nodes.filter((n) => n.title.toUpperCase().includes('EN FRANCAIS'));
    const finalNodes = filteredNodes.length > 0 ? filteredNodes : nodes;

    return finalNodes.map((n) => ({ ...n, type: 'category' }));
  } catch (error) {
    logError('VK API Error (Root):', error);
    return MOCK_ROOT_NODES;
  }
};

// Fonction appelee pour charger le contenu d'un dossier (lazy, un seul appel)
export const fetchNodeContent = async (token: string, node: VkNode): Promise<VkNode> => {
  if (!node.vkGroupId || !node.vkTopicId) {
    return { ...node, isLoaded: true, children: [] };
  }

  try {
    // Utilisation de fetchAllComments pour récupérer TOUS les messages, pas juste les 100 premiers
    const items = await fetchAllComments(token, node.vkGroupId, node.vkTopicId);

    if (!items) {
      throw new Error('Failed to fetch node content');
    }

    // Etape 1 : Sous-dossiers (autres topics cites)
    const fullText = items.map((i: any) => i.text).join('\n');
    const subTopics = parseTopicBody(fullText, node.vkTopicId);

    // Etape 2 : Fichiers (documents)
    const documents = extractDocuments(items);

    const allChildren = [...subTopics, ...documents];

    if (allChildren.length > 0) {
      return {
        ...node,
        children: allChildren,
        isLoaded: true,
        type: documents.length > 0 ? 'series' : 'genre',
      };
    }

    return { ...node, isLoaded: true, children: [] };
  } catch (error) {
    logError('VK API Error (Node):', error);
    return {
      ...node,
      isLoaded: true,
      children: [{ id: 'err1', title: 'Erreur (API)', type: 'category', isLoaded: true }],
    };
  }
};

// --- Helpers pour la synchro profonde ---

// Recupere uniquement la STRUCTURE (sous-topics) d'un topic, sans documents,
// en lisant toutes les pages de commentaires.
const fetchTopicStructure = async (
  token: string,
  groupId: string,
  topicId: string
): Promise<VkNode[]> => {
  const items = await fetchAllComments(token, groupId, topicId);
  if (!items || items.length === 0) return [];
  const fullText = items.map((i: any) => i.text).join('\n');
  return parseTopicBody(fullText, topicId);
};

// Synchronise uniquement la structure de dossiers (sans documents)
// jusqu'a une profondeur maximale (par defaut 3 niveaux).
// Utilisee par le bouton "Tout synchroniser".
export const fetchFolderTreeUpToDepth = async (
  token: string,
  groupId?: string,
  topicId?: string,
  maxDepth: number = 4
): Promise<VkNode[]> => {
  logSync('Starting fetchFolderTreeUpToDepth...');

  // Niveau 1 : categories racine
  const rootNodes = await fetchRootIndex(token, groupId, topicId);

  if (maxDepth <= 1) return rootNodes;

  // Niveau 2 : sous-topics des categories (OPTIMISÉ BATCH)
  logSync(`Loading Level 2 (Categories) for ${rootNodes.length} roots...`);
  const level1Expanded = await fetchNodesStructureBatch(token, rootNodes);

  if (maxDepth <= 2) return level1Expanded;

  // Niveau 3 : series a l'interieur de chaque sous-topic (OPTIMISÉ BATCH)
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

  // Indexer pour mise à jour rapide
  const level2Map = new Map<string, VkNode>();
  level2Expanded.forEach((node) => level2Map.set(node.id, node));

  // Mise a jour niveau 2 dans l'arbre
  level1Expanded.forEach((root) => {
    if (root.children) {
      root.children = root.children.map((child) => level2Map.get(child.id) || child);
    }
  });

  if (maxDepth <= 3) return level1Expanded;

  // OPTIMISATION : On ne descend au niveau 4 que pour les Comics qui utilisent des tranches (A-C, D-F).
  // Les BDs Européennes ont leurs séries directement au niveau 3.
  const level3Nodes: VkNode[] = [];

  level1Expanded.forEach((root) => {
    // Filtrage par ID de topic pour cibler spécifiquement "Comics en Français"
    // ID connu : 203785966_47543940 (Comics en français / Comics in french)
    const isTargetTopic = root.vkTopicId === '47543940';

    if (isTargetTopic) {
      (root.children || []).forEach((l2) => {
        const l2Expanded = level2Map.get(l2.id);
        if (l2Expanded && l2Expanded.children) {
          l2Expanded.children.forEach((l3) => {
            // On ne garde que les dossiers (pas les fichiers) pour descendre au niveau 4
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

  // Indexer
  const level3Map = new Map<string, VkNode>();
  level3Expanded.forEach((node) => level3Map.set(node.id, node));

  // Mise à jour arbre
  level1Expanded.forEach((root) => {
    if (root.children) {
      root.children.forEach((l2) => {
        if (l2.children) {
          l2.children = l2.children.map((l3) => level3Map.get(l3.id) || l3);
        }
      });
    }
  });

  logSync('Done! 4 levels loaded successfully.');
  return level1Expanded;
};

