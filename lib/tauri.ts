import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { open as selectFolder } from "@tauri-apps/plugin-dialog";
import { check, type Update } from "@tauri-apps/plugin-updater";

export const tauriVk = {
    ping: (token: string) => invoke<number>("vk_ping", { token }),
    fetchRootIndex: (token: string, groupId: string, topic_id: string) =>
        invoke<any[]>("vk_fetch_root_index", { token, groupId, topicId: topic_id }),
    fetchFullIndex: (token: string, groupId: string, topic_id: string) =>
        invoke<any[]>("vk_fetch_full_index", { token, groupId, topicId: topic_id }),
    fetchNodeContent: (token: string, groupId: string, topicId: string) =>
        invoke<any>("vk_fetch_node_content", { token, groupId, topicId }),
};

export const tauriFs = {
    listDirectory: (path: string) => invoke<any>("fs_list_directory", { path }),
    openPath: (path: string) => invoke<void>("fs_open_path", { path }),
    revealPath: (path: string) => invoke<void>("fs_reveal_path", { path }),
    queueDownload: (
        id: string,
        url: string,
        directory: string,
        fileName: string,
        token?: string
    ) =>
        invoke<void>("fs_queue_download", {
            id,
            url,
            directory,
            fileName,
            token,
        }),
    cancelDownload: (id: string) => invoke<boolean>("fs_cancel_download", { id }),
    clearDownloadQueue: () => invoke<number>("fs_clear_download_queue"),
};

export const tauriShell = {
    openExternal: (url: string) => openExternal(url),
};

export const tauriDialog = {
    selectFolder: () => selectFolder({ directory: true, multiple: false }),
};

import { getCurrentWindow } from "@tauri-apps/api/window";

const getWindow = () => getCurrentWindow();

export const tauriWin = {
    minimize: async () => {
        console.log("Minimizing window");
        try {
            await getWindow().minimize();
        } catch (e) {
            console.error("Failed to minimize:", e);
        }
    },
    maximize: async () => {
        console.log("Toggling maximize");
        try {
            await getWindow().toggleMaximize();
        } catch (e) {
            console.error("Failed to toggle maximize:", e);
        }
    },
    close: async () => {
        console.log("Closing window");
        try {
            await getWindow().close();
        } catch (e) {
            console.error("Failed to close:", e);
        }
    },
};

export const tauriEvents = {
    onDownloadProgress: (callback: (payload: any) => void) =>
        listen("download-progress", (event) => callback(event.payload)),
    onDownloadResult: (callback: (payload: any) => void) =>
        listen("download-result", (event) => callback(event.payload)),
};

export const tauriUpdater = {
    check: () => check(),
};
