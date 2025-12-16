import { VkNode } from '../types';
import { VK_API, MOCK_ROOT_NODES } from './constants';
import { logSync, logWarn, logError } from './logger';

const API_VERSION = VK_API.VERSION;

// --- LIMITEUR DE REQUETES ---
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
                const response = await fetch(url);
                const result = await response.json();
                resolve(result);
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

export const fetchVkTopic = async (
    token: string,
    groupId: string,
    topicId: string
): Promise<any> => {
    if (!token || token.length < 10) throw new Error('Invalid Token');
    const url = `https://api.vk.com/method/board.getComments?access_token=${token}&group_id=${groupId}&topic_id=${topicId}&count=100&extended=1&v=${API_VERSION}`;
    return executeRequest(url);
};

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

const fetchMultipleTopics = async (
    token: string,
    topics: { groupId: string; topicId: string }[]
): Promise<any[]> => {
    if (!token || token.length < 10) throw new Error('Invalid Token');
    if (topics.length === 0) return [];
    if (topics.length > 25) throw new Error('Max 25 topics per execute call');

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

const fetchNodesStructureBatch = async (
    token: string,
    nodes: VkNode[]
): Promise<VkNode[]> => {
    if (nodes.length === 0) return [];

    const batches: VkNode[][] = [];
    for (let i = 0; i < nodes.length; i += 25) {
        batches.push(nodes.slice(i, i + 25));
    }

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
                return { ...node, children: [], isLoaded: true, structureOnly: true };
            }));

            return processedNodes;
        } catch (e) {
            logError('Batch fetch error:', e);
            return batch.map(n => ({ ...n, children: [], isLoaded: true, structureOnly: true }));
        }
    });

    return results.flat();
};

export const searchVkBoard = async (
    token: string,
    query: string,
    groupId?: string
): Promise<VkNode[]> => {
    if (!token) return [];
    const effectiveGroupId = groupId && groupId.trim().length > 0 ? groupId.trim() : '203785966';

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
                    type: 'genre',
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

// --- LOGIQUE DE PARSING ---

const cleanTitle = (text: string) => {
    return text
        .replace(/[:\-]+$/, '')
        .replace(/^\s*[-"»«]+\s*/, '')
        .replace(/\s*[-"»«]+\s*$/, '')
        .replace(/\(lien\)/gi, '')
        .trim();
};

const parseTopicBody = (text: string, excludeTopicId?: string): VkNode[] => {
    const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    const nodes: VkNode[] = [];
    const seenIds = new Set<string>();

    const linkRegex = /vk\.com\/topic-(\d+)_(\d+)/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!line.includes('vk.com/topic-')) continue;

        const match = line.match(linkRegex);
        if (!match) continue;

        const topicId = match[2];

        if (excludeTopicId && topicId === excludeTopicId) continue;

        const uniqueId = `topic_${topicId}`;

        if (seenIds.has(uniqueId)) continue;

        let title = '';

        const parts = line.split(/http|vk\.com/);
        if (parts[0].trim().length > 3) {
            title = parts[0];
        } else if (i > 0) {
            const prevLine = lines[i - 1];
            if (!prevLine.includes('vk.com') && prevLine.length > 2) {
                title = prevLine;
            }
        }

        if (!title) {
            const withoutLink = line.replace(/https?:\/\/vk\.com\/topic-\d+_\d+/i, '').trim();
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
                type: 'genre',
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

        await sleep(200);
    }

    return allItems;
};

export const fetchRootIndex = async (
    token: string,
    groupId?: string,
    topicId?: string
): Promise<VkNode[]> => {
    try {
        const effectiveGroupId = groupId && groupId.trim().length > 0 ? groupId.trim() : '203785966';
        const effectiveTopicId = topicId && topicId.trim().length > 0 ? topicId.trim() : '47515406';

        const items = await fetchAllComments(token, effectiveGroupId, effectiveTopicId);

        if (!items || items.length === 0) {
            return MOCK_ROOT_NODES;
        }

        const fullText = items.map((i: any) => i.text).join('\n');
        const nodes = parseTopicBody(fullText);

        if (nodes.length === 0) {
            return MOCK_ROOT_NODES;
        }

        const filteredNodes = nodes.filter((n) => n.title.toUpperCase().includes('EN FRANCAIS'));
        const finalNodes = filteredNodes.length > 0 ? filteredNodes : nodes;

        return finalNodes.map((n) => ({ ...n, type: 'category' }));
    } catch (error) {
        logError('VK API Error (Root):', error);
        return MOCK_ROOT_NODES;
    }
};

export const fetchNodeContent = async (token: string, node: VkNode): Promise<VkNode> => {
    if (!node.vkGroupId || !node.vkTopicId) {
        return { ...node, isLoaded: true, children: [] };
    }

    try {
        const items = await fetchAllComments(token, node.vkGroupId, node.vkTopicId);

        if (!items) {
            throw new Error('Failed to fetch node content');
        }

        const fullText = items.map((i: any) => i.text).join('\n');
        const subTopics = parseTopicBody(fullText, node.vkTopicId);

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
