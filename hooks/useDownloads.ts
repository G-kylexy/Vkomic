
import { useState, useEffect, useRef, useCallback } from "react";
import { DownloadItem, VkNode } from "../types";
import { DEFAULT_DOWNLOAD_PATH, UI } from "../utils/constants";
import { formatBytes, formatSpeed } from "../utils/formatters";
import { idbDel, idbGet, idbGetByPrefix, idbSet, migrateLocalStorageJsonToIdb } from "../utils/storage";
import { tauriFs, tauriEvents } from "../lib/tauri";

export const useDownloads = (downloadPath: string, vkToken?: string) => {
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [downloadsHydrated, setDownloadsHydrated] = useState(false);
    const downloadsRef = useRef(downloads);
    const missingDownloadPathAlertedRef = useRef(false);
    const lastUpdateRef = useRef<number>(0);
    const enqueuedPendingDownloadsRef = useRef<Set<string>>(new Set());

    // Helper to keep ref in sync
    useEffect(() => {
        downloadsRef.current = downloads;
    }, [downloads]);

    // Reset alert flag when download path changes
    useEffect(() => {
        if (downloadPath && downloadPath !== DEFAULT_DOWNLOAD_PATH) {
            missingDownloadPathAlertedRef.current = false;
        }
    }, [downloadPath]);

    // 1. Hydration
    useEffect(() => {
        let cancelled = false;
        const normalize = (items: DownloadItem[]) =>
            items.map((d) =>
                d.status === "downloading" ? { ...d, status: "paused" as const } : d
            );

        const hydrate = async () => {
            try {
                const prefix = "vk_download_";
                const granularItems = await idbGetByPrefix<DownloadItem>(prefix);

                let items: DownloadItem[] = [];
                if (granularItems.length > 0) {
                    items = granularItems;
                } else {
                    const stored =
                        (await idbGet<DownloadItem[]>("vk_downloads")) ??
                        (await migrateLocalStorageJsonToIdb<DownloadItem[]>("vk_downloads"));

                    if (Array.isArray(stored)) {
                        items = stored;
                        // Migration: save granularly and delete legacy
                        await Promise.all(items.map(item => idbSet(prefix + item.id, item)));
                        await idbDel("vk_downloads");
                    }
                }

                if (cancelled) return;
                setDownloads(normalize(items));
            } catch {
                if (cancelled) return;
                setDownloads([]);
            } finally {
                if (!cancelled) setDownloadsHydrated(true);
            }
        };
        hydrate();
        return () => { cancelled = true; };
    }, []);

    // 2. Add Download
    const addDownload = useCallback((node: VkNode, subFolder?: string) => {
        if (!node.url && (!node.vkOwnerId || !node.id)) return;

        if (!downloadPath || downloadPath === DEFAULT_DOWNLOAD_PATH) {
            if (!missingDownloadPathAlertedRef.current) {
                window.alert(
                    "Aucun dossier de telechargement n'est configure. Choisissez un chemin dans Parametres avant de lancer un telechargement.",
                );
                missingDownloadPathAlertedRef.current = true;
            }
            const id = node.id || Math.random().toString(36).substr(2, 9);
            const formattedSize = formatBytes(node.sizeBytes);

            setDownloads((prev) => {
                const existingIndex = prev.findIndex((d) => d.id === id);
                if (existingIndex >= 0) return prev;
                const errorDownload: DownloadItem = {
                    id, title: node.title, url: node.url, progress: 0,
                    status: "error", extension: node.extension, speed: "Dossier non configuré",
                    createdAt: new Date().toISOString(), size: formattedSize,
                };
                return [errorDownload, ...prev];
            });
            return;
        }

        const id = node.id || Math.random().toString(36).substr(2, 9);
        const formattedSize = formatBytes(node.sizeBytes);

        setDownloads((prev) => {
            const existingIndex = prev.findIndex((d) => d.id === id);
            const existing = existingIndex >= 0 ? prev[existingIndex] : undefined;

            if (
                existing &&
                ["pending", "downloading", "paused", "completed"].includes(existing.status)
            ) {
                return prev;
            }

            const newDownload: DownloadItem = {
                id, title: node.title, url: node.url, progress: 0,
                status: "pending", extension: node.extension, speed: "0 MB/s",
                createdAt: new Date().toISOString(),
                size: existing && existing.size ? existing.size : formattedSize,
                path: existing && (existing as any).path ? (existing as any).path : undefined,
                vkOwnerId: node.vkOwnerId,
                vkDocId: node.id.replace("doc_", ""),
                vkAccessKey: node.vkAccessKey,
            };

            if (existing) {
                const newList = [...prev];
                newList.splice(existingIndex, 1);
                return [newDownload, ...newList];
            }

            const itemWithSubFolder = { ...newDownload, subFolder };
            return [itemWithSubFolder, ...prev];
        });
    }, [downloadPath]);

    // 3. Queue Management
    const downloadStatusKey = downloads.map(d => `${d.id}:${d.status}`).join(',');

    useEffect(() => {
        if (!downloadsHydrated) return;

        const snapshot = downloadsRef.current;
        const enqueued = enqueuedPendingDownloadsRef.current;

        for (let index = snapshot.length - 1; index >= 0; index--) {
            const d = snapshot[index];
            if (d.status !== "pending") {
                enqueued.delete(d.id);
                continue;
            }

            if (enqueued.has(d.id)) continue;
            if (!downloadPath || downloadPath === DEFAULT_DOWNLOAD_PATH) continue;

            enqueued.add(d.id);

            let fileName = d.title;
            if (d.extension) {
                const ext = d.extension.toLowerCase();
                if (!fileName.toLowerCase().endsWith(`.${ext}`)) {
                    fileName = `${fileName}.${ext}`;
                }
            }

            let targetPath = downloadPath;
            if (d.subFolder) {
                const safeSubFolder = d.subFolder.replace(/[<>:"/\\|?*]+/g, "").trim();
                if (safeSubFolder.length > 0) {
                    const separator = downloadPath.includes("\\") ? "\\" : "/";
                    const cleanPath = downloadPath.endsWith(separator) ? downloadPath.slice(0, -1) : downloadPath;
                    targetPath = `${cleanPath}${separator}${safeSubFolder}`;
                }
            }

            const enqueue = async () => {
                try {
                    await tauriFs.queueDownload(d.id, d.url!, targetPath, fileName, vkToken);
                } catch {
                    enqueued.delete(d.id);
                    setDownloads((prev) =>
                        prev.map((item) => {
                            if (item.id !== d.id) return item;
                            if (item.status !== "pending") return item;
                            return { ...item, status: "canceled", speed: "Error" };
                        })
                    );
                }
            };
            void enqueue();
        }
    }, [downloadStatusKey, downloadsHydrated, downloadPath]);

    // 4. Progress Listeners
    useEffect(() => {
        const unlisten = tauriEvents.onDownloadProgress((payload: any) => {
            const { id, progress, speedBytes } = payload;
            const now = Date.now();

            if (progress < 100 && now - lastUpdateRef.current < UI.DOWNLOAD_THROTTLE_MS) {
                return;
            }
            lastUpdateRef.current = now;

            setDownloads((prev) => {
                let hasChanged = false;
                const next = prev.map((d) => {
                    if (d.id === id) {
                        if (d.status === "paused" || d.status === "canceled") return d;
                        const isComplete = progress >= 100;
                        const newProgress = typeof progress === "number" ? parseFloat(progress.toFixed(1)) : 0;
                        const safeProgress = Math.max(d.progress || 0, newProgress);
                        const newSpeed = formatSpeed(speedBytes);
                        const newStatus = isComplete ? "completed" : "downloading";

                        // Optimization: Avoid re-render if visual values haven't changed
                        if (
                            d.progress === safeProgress &&
                            d.speed === newSpeed &&
                            d.status === newStatus
                        ) {
                            return d;
                        }

                        hasChanged = true;
                        return {
                            ...d,
                            progress: safeProgress,
                            status: newStatus,
                            speed: newSpeed,
                        };
                    }
                    return d;
                });
                return hasChanged ? next : prev;
            });
        });
        return () => { unlisten.then(f => f()); };
    }, []);

    useEffect(() => {
        const unlisten = tauriEvents.onDownloadResult((payload: any) => {
            const { id, ok, status, path, size } = payload || {};
            if (!id) return;
            const formattedSize = typeof size === "number" ? formatBytes(size) || undefined : undefined;

            setDownloads((prev) => {
                let hasChanged = false;
                const next = prev.map((d) => {
                    if (d.id !== id) return d;
                    const nextItem: DownloadItem = {
                        ...d,
                        ...(path ? { path } : {}),
                        ...(formattedSize ? { size: formattedSize } : {}),
                    };

                    let finalItem: DownloadItem;
                    if (ok) finalItem = { ...nextItem, status: "completed", speed: "0 MB/s" };
                    else if (nextItem.status === "paused" || nextItem.status === "canceled") finalItem = nextItem;
                    else if (status === "aborted") finalItem = { ...nextItem, status: "error", speed: "Interrompu" };
                    else finalItem = { ...nextItem, status: "error", speed: "Erreur" };

                    // Optimization: Check for equality
                    if (
                        d.status === finalItem.status &&
                        d.speed === finalItem.speed &&
                        d.path === finalItem.path &&
                        d.size === finalItem.size
                    ) {
                        return d;
                    }

                    hasChanged = true;
                    return finalItem;
                });
                return hasChanged ? next : prev;
            });
        });
        return () => { unlisten.then(f => f()); };
    }, []);

    // 5. Persistence
    const lastPersistRef = useRef<number>(0);
    const lastPersistStatusKeyRef = useRef<string>("");
    const lastPersistedDownloadsRef = useRef<Map<string, DownloadItem>>(new Map());

    useEffect(() => {
        if (!downloadsHydrated) return;
        const now = Date.now();
        const downloadStatusKey = downloads.map((d) => `${d.id}:${d.status}:${d.progress}`).join("|");

        // Throttle persistence: save max once per second OR if status changed significantly
        if (now - lastPersistRef.current < 1000 && downloadStatusKey === lastPersistStatusKeyRef.current) {
            return;
        }

        lastPersistRef.current = now;
        lastPersistStatusKeyRef.current = downloadStatusKey;
        const persist = async () => {
            try {
                const currentMap = new Map(downloads.map((d) => [d.id, d]));
                const lastMap = lastPersistedDownloadsRef.current;
                const prefix = "vk_download_";
                const promises: Promise<void>[] = [];

                // 1. Handle Deletions
                for (const id of lastMap.keys()) {
                    if (!currentMap.has(id)) {
                        promises.push(idbDel(prefix + id));
                    }
                }

                // 2. Handle Updates/Additions
                for (const [id, item] of currentMap.entries()) {
                    if (lastMap.get(id) !== item) {
                        promises.push(idbSet(prefix + id, item));
                    }
                }

                if (promises.length > 0) {
                    await Promise.all(promises);
                    lastPersistedDownloadsRef.current = currentMap;
                }
            } catch { }
        };
        void persist();
    }, [downloads, downloadsHydrated]);

    // 6. Actions
    const pauseDownload = useCallback((id: string) => {
        tauriFs.cancelDownload(id).catch(console.error);
        setDownloads((prev) =>
            prev.map((d) => (d.id === id ? { ...d, status: "paused", speed: "0 MB/s" } : d))
        );
    }, []);

    const resumeDownload = useCallback((id: string) => {
        setDownloads((prev) =>
            prev.map((d) => (d.id === id ? { ...d, status: "pending", speed: "0 MB/s" } : d))
        );
    }, []);

    const cancelDownload = useCallback((id: string) => {
        tauriFs.cancelDownload(id).catch(console.error);
        setDownloads((prev) =>
            prev.map((d) =>
                d.id === id ? { ...d, status: "canceled", speed: "0 MB/s", progress: d.progress } : d
            )
        );
    }, []);

    const retryDownload = useCallback((id: string) => {
        const download = downloadsRef.current.find((d) => d.id === id);
        if (!download) return;
        setDownloads((prev) =>
            prev.map((d) =>
                d.id === id ? { ...d, status: "pending", progress: 0, speed: "0 MB/s", createdAt: new Date().toISOString() } : d
            )
        );
    }, []);

    const clearDownloads = useCallback(() => {
        tauriFs.clearDownloadQueue().catch(console.error);
        enqueuedPendingDownloadsRef.current.clear();
        setDownloads([]);
    }, []);

    return {
        downloads,
        addDownload,
        pauseDownload,
        resumeDownload,
        cancelDownload,
        retryDownload,
        clearDownloads,
    };
};
