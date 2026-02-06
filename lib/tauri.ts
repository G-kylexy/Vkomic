import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { open as selectFolder } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { VkNode } from "../types";

// --- VK API Commands ---
export const tauriVk = {
    ping: (token: string) => invoke<number>("vk_ping", { token }),
    fetchRootIndex: (token: string, groupId: string, topicId: string) =>
        invoke<VkNode[]>("vk_fetch_root_index", { token, groupId, topicId }),
    fetchFullIndex: (token: string, groupId: string, topicId: string) =>
        invoke<VkNode[]>("vk_fetch_full_index", { token, groupId, topicId }),
    fetchNodeContent: (token: string, groupId: string, topicId: string) =>
        invoke<VkNode>("vk_fetch_node_content", { token, groupId, topicId }),
};

// --- Filesystem Commands ---
export const tauriFs = {
    listDirectory: (path: string) => invoke<any>("fs_list_directory", { path }),
    openPath: (path: string) => invoke<void>("fs_open_path", { path }),
    revealPath: (path: string) => invoke<void>("fs_reveal_path", { path }),
    queueDownload: (id: string, url: string, directory: string, fileName: string, token?: string) =>
        invoke<void>("fs_queue_download", { id, url, directory, fileName, token }),
    cancelDownload: (id: string) => invoke<boolean>("fs_cancel_download", { id }),
    clearDownloadQueue: () => invoke<number>("fs_clear_download_queue"),
};

// --- Shell Commands ---
export const tauriShell = {
    openExternal: (url: string) => openExternal(url),
};

// --- Dialog Commands ---
export const tauriDialog = {
    selectFolder: () => selectFolder({ directory: true, multiple: false }),
};

// --- Window Commands ---
const getWindow = () => getCurrentWindow();

export const tauriWin = {
    minimize: async () => { try { await getWindow().minimize(); } catch (e) { console.error("Failed to minimize:", e); } },
    maximize: async () => { try { await getWindow().toggleMaximize(); } catch (e) { console.error("Failed to maximize:", e); } },
    close: async () => { try { await getWindow().close(); } catch (e) { console.error("Failed to close:", e); } },
};

// --- Events ---
export const tauriEvents = {
    onDownloadProgress: (callback: (payload: any) => void) =>
        listen("download-progress", (event) => callback(event.payload)),
    onDownloadResult: (callback: (payload: any) => void) =>
        listen("download-result", (event) => callback(event.payload)),
};

// --- VK API Helpers (avec valeurs par défaut) ---
const VK_DEFAULTS = { GROUP: "203785966", TOPIC: "47515406" };

export const fetchRootIndex = async (token: string, groupId?: string, topicId?: string): Promise<VkNode[]> => {
    try {
        return await tauriVk.fetchRootIndex(token, groupId?.trim() || VK_DEFAULTS.GROUP, topicId?.trim() || VK_DEFAULTS.TOPIC);
    } catch (error) {
        console.error("VK API Error (Root):", error);
        return [];
    }
};

export const fetchNodeContent = async (token: string, node: VkNode): Promise<VkNode> => {
    if (!node.vkGroupId || !node.vkTopicId) return { ...node, isLoaded: true, children: [] };
    try {
        const result = await tauriVk.fetchNodeContent(token, node.vkGroupId, node.vkTopicId);
        return { ...result, title: node.title };
    } catch (error) {
        console.error("VK API Error (Node):", error);
        return { ...node, isLoaded: true, children: [{ id: "err1", title: "Erreur (API)", type: "category", isLoaded: true }] };
    }
};

export const fetchFolderTreeUpToDepth = async (token: string, groupId?: string, topicId?: string): Promise<VkNode[]> => {
    try {
        return await tauriVk.fetchFullIndex(token, groupId?.trim() || VK_DEFAULTS.GROUP, topicId?.trim() || VK_DEFAULTS.TOPIC);
    } catch (error) {
        console.error("VK API Error (Full Index):", error);
        return [];
    }
};
