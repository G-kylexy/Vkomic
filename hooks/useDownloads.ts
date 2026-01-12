
import { useState, useEffect, useRef, useCallback } from "react";
import { DownloadItem, VkNode } from "../types";
import { DEFAULT_DOWNLOAD_PATH, UI } from "../utils/constants";
import { formatBytes, formatSpeed } from "../utils/formatters";
import { idbDel, idbGet, idbSet, migrateLocalStorageJsonToIdb } from "../utils/storage";

export const useDownloads = (downloadPath: string) => {
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
                const stored =
                    (await idbGet<DownloadItem[]>("vk_downloads")) ??
                    (await migrateLocalStorageJsonToIdb<DownloadItem[]>("vk_downloads"));

                if (cancelled) return;
                setDownloads(Array.isArray(stored) ? normalize(stored) : []);
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
        if (!node.url) return;

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
        if (typeof window === "undefined" || !window.fs) return;

        const canQueue = typeof window.fs.queueDownload === "function";
        const canDownload = typeof window.fs.downloadFile === "function";
        if (!canQueue && !canDownload) return;

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
                    if (canQueue && window.fs?.queueDownload) {
                        await window.fs.queueDownload(d.id, d.url, targetPath, fileName);
                    } else if (canDownload && window.fs?.downloadFile) {
                        void window.fs.downloadFile(d.id, d.url, targetPath, fileName).catch(() => { });
                    }
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
        if (!window.fs || !window.fs.onDownloadProgress) return;

        const removeListener = window.fs.onDownloadProgress((payload: any) => {
            const { id, progress, speedBytes } = payload;
            const now = Date.now();

            if (progress < 100 && now - lastUpdateRef.current < UI.DOWNLOAD_THROTTLE_MS) {
                return;
            }
            lastUpdateRef.current = now;

            setDownloads((prev) =>
                prev.map((d) => {
                    if (d.id === id) {
                        if (d.status === "paused" || d.status === "canceled") return d;
                        const isComplete = progress >= 100;
                        const newProgress = typeof progress === "number" ? parseFloat(progress.toFixed(1)) : 0;
                        const safeProgress = Math.max(d.progress || 0, newProgress);
                        return {
                            ...d,
                            progress: safeProgress,
                            status: isComplete ? "completed" : "downloading",
                            speed: formatSpeed(speedBytes),
                        };
                    }
                    return d;
                })
            );
        });
        return () => { if (removeListener) removeListener(); };
    }, []);

    useEffect(() => {
        if (!window.fs || !window.fs.onDownloadResult) return;
        const removeListener = window.fs.onDownloadResult((payload: any) => {
            const { id, ok, status, path, size } = payload || {};
            if (!id) return;
            const formattedSize = typeof size === "number" ? formatBytes(size) || undefined : undefined;

            setDownloads((prev) =>
                prev.map((d) => {
                    if (d.id !== id) return d;
                    const next: DownloadItem = {
                        ...d,
                        ...(path ? { path } : {}),
                        ...(formattedSize ? { size: formattedSize } : {}),
                    };
                    if (ok) return { ...next, status: "completed", speed: "0 MB/s" };
                    // Si l'utilisateur a mis en pause ou annulé, ne pas changer le statut
                    if (next.status === "paused" || next.status === "canceled") return next;
                    // Si aborted par le système, marquer en erreur pour retry
                    if (status === "aborted") return { ...next, status: "error", speed: "Interrompu" };
                    return { ...next, status: "error", speed: "Erreur" };
                })
            );
        });
        return () => { if (removeListener) removeListener(); };
    }, []);

    // 5. Persistence
    const lastPersistRef = useRef<number>(0);
    const lastPersistStatusKeyRef = useRef<string>("");
    useEffect(() => {
        if (!downloadsHydrated) return;
        const now = Date.now();
        const statusChanged = downloadStatusKey !== lastPersistStatusKeyRef.current;
        if (!statusChanged && now - lastPersistRef.current <= 1000) return;

        lastPersistRef.current = now;
        lastPersistStatusKeyRef.current = downloadStatusKey;
        const persist = async () => {
            try {
                if (downloads.length === 0) await idbDel("vk_downloads");
                else await idbSet("vk_downloads", downloads);
            } catch { }
        };
        void persist();
    }, [downloads, downloadStatusKey, downloadsHydrated]);

    // 6. Actions
    const pauseDownload = useCallback((id: string) => {
        if (window.fs && window.fs.cancelDownload) window.fs.cancelDownload(id);
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
        if (window.fs && window.fs.cancelDownload) window.fs.cancelDownload(id);
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
        if (window.fs?.clearDownloadQueue) window.fs.clearDownloadQueue();
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
