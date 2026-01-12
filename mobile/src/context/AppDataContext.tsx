import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { InteractionManager, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import ReactNativeBlobUtil from "react-native-blob-util";

import { expandNodesStructure, fetchNodeContent, fetchRootIndex, fetchFolderTreeUpToDepth } from "../services/vk-service";
import { getT } from "../i18n";
import { DownloadItem, VkNode } from "../types";
import { useVk } from "./VkContext";
import { setupNotifications, notifyDownloadStarted, notifyDownloadCompleted, notifyDownloadError } from "../services/NotificationService";
import { logDownload, logError } from "../services/logger";
import * as FolderService from "../services/FolderService";
import { SafError, SafErrorType } from "../services/FolderService";

type AppDataContextType = {
  syncedData: VkNode[] | null;
  navPath: VkNode[];
  isSyncing: boolean;
  isLoadingNode: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  hasFullSynced: boolean;
  currentNodes: VkNode[];
  currentFolder: VkNode | null;
  syncRoot: () => Promise<void>;
  syncAll: () => Promise<void>;
  resetLibrary: () => Promise<void>;
  openNode: (node: VkNode) => Promise<void>;
  goHome: () => void;
  goUp: (index?: number) => void;
  refreshCurrent: () => Promise<void>;
  downloads: DownloadItem[];
  addDownload: (node: VkNode) => Promise<void>;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  retryDownload: (id: string) => Promise<void>;
  clearDownloads: () => Promise<void>;
  downloadAll: (nodes: VkNode[]) => Promise<void>;
  cancelAll: () => Promise<void>;
  clearCache: () => Promise<void>;
  getDownloadDirUri: () => string | null;
  deleteLocalFile: (uri: string) => Promise<void>;
  globalSearchNodes: VkNode[];
  readingFile: { uri: string; title: string } | null;
  setReadingFile: (file: { uri: string; title: string } | null) => void;
};

const AppDataContext = createContext<AppDataContextType | null>(null);

const STORAGE_KEYS = {
  syncedData: "vk_synced_data_mobile",
  downloads: "vk_downloads_mobile",
  hasFullSynced: "vk_full_synced_mobile",
};

const DOWNLOAD_DIR_NAME = "vkomic-downloads";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const withRetry = async <T,>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  throw lastError;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  const digits = idx === 0 ? 0 : idx === 1 ? 0 : 1;
  return `${val.toFixed(digits)} ${units[idx]}`;
};

const safeFilename = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

const ensureDir = async (uri: string) => {
  try {
    if (!uri) return;

    // IF SAF URI (content://), we don't use mkdir (it's handled by SAF-X / FolderService)
    if (uri.startsWith("content://")) {
      return;
    }

    if (Platform.OS === "android") {
      // Android public folder path (raw path, not URI)
      const exists = await ReactNativeBlobUtil.fs.exists(uri);
      if (exists) return;
      await ReactNativeBlobUtil.fs.mkdir(uri);
    } else {
      // iOS or file:// URIs
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && info.isDirectory) return;
      await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
    }
  } catch (err) {
    console.log("ensureDir failed:", err);
  }
};

const normalizeText = (value: string) => {
  const raw = value || "";
  let normalized = raw;
  try {
    normalized = normalized.normalize("NFD");
  } catch {
    // Some JS engines may not support unicode normalization; keep raw string.
  }
  return normalized
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\-\.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const mergeTrees = (fresh: VkNode[], existing: VkNode[]): VkNode[] => {
  const existingMap = new Map((existing || []).map(n => [n.id, n]));
  const freshIds = new Set((fresh || []).map(f => f.id));

  const result = [...(fresh || [])];
  if (existing) {
    for (const ex of existing) {
      if (!freshIds.has(ex.id)) {
        result.push(ex);
      }
    }
  }

  return result.map(node => {
    const prev = existingMap.get(node.id);
    if (!prev) return node;

    return {
      ...prev,
      ...node,
      children: mergeTrees(node.children || [], prev.children || [])
    };
  });
};

const clearSpeed = (speedRef: React.RefObject<Map<string, { bytes: number; at: number }>>, id: string) => {
  speedRef.current?.delete(id);
};

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { token, groupId, topicId, language, setStatus, autoSync, isReady, downloadPath, status } = useVk();

  // Vérifier si le token est invalide (error_code 5)
  const isTokenInvalid = status.errorCode === 5;
  const t = useMemo(() => getT(language), [language]);

  const [syncedData, setSyncedData] = useState<VkNode[] | null>(null);
  const [navPath, setNavPath] = useState<VkNode[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingNode, setIsLoadingNode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [hasFullSynced, setHasFullSynced] = useState(false);

  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [readingFile, setReadingFile] = useState<{ uri: string; title: string } | null>(null);

  const resumablesRef = useRef(new Map<string, FileSystem.DownloadResumable>());
  const androidTasksRef = useRef(new Map<string, { cancel: () => void }>());
  const speedRef = useRef(new Map<string, { bytes: number; at: number }>());
  const prefetchRef = useRef(false);
  const startingRef = useRef(new Set<string>()); // Track downloads being started to prevent duplicates
  // Batched progress updates to avoid race conditions with multiple concurrent downloads
  const pendingProgressRef = useRef(new Map<string, Partial<DownloadItem>>());
  const retryCountRef = useRef(new Map<string, number>());
  const MAX_AUTO_RETRIES = 3;
  const RETRY_DELAY_MS = 2000; // 2 seconds between retries
  const MAX_CONCURRENT_DOWNLOADS = 3;

  // Process queue effect: Watch downloads state and start pending items if slots available
  useEffect(() => {
    // Count active downloads (downloading)
    const activeCount = downloads.filter(d => d.status === "downloading").length;

    if (activeCount < MAX_CONCURRENT_DOWNLOADS) {
      // Find pending downloads
      const pendingItems = downloads.filter(d => d.status === "pending");

      // Start as many as possible to fill slots
      const slotsAvailable = MAX_CONCURRENT_DOWNLOADS - activeCount;
      const toStart = pendingItems.slice(0, slotsAvailable);

      toStart.forEach(item => {
        // We use a small timeout to avoid batched state update conflicts
        // But since startDownload is async and checks startingRef, it should be safe
        void processDownload(item);
      });
    }
  }, [downloads]);

  const getDownloadDirUri = () => {
    if (downloadPath && downloadPath.startsWith("content://")) {
      return FolderService.ensureFolderUri(downloadPath);
    }

    // On Android, use public Downloads folder via react-native-blob-util
    // On iOS, use private document directory
    if (Platform.OS === "android") {
      const base = ReactNativeBlobUtil.fs.dirs.DownloadDir;
      const subFolder = safeFilename(downloadPath || "VKomic");
      return `${base}/${subFolder}`;
    } else {
      const base = FileSystem.documentDirectory;
      if (!base) return null;
      const userSub = (downloadPath || DOWNLOAD_DIR_NAME)
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean)
        .map(safeFilename)
        .join("/");
      return `${base}${userSub}/`;
    }
  };

  // Check if download path is a SAF content:// URI
  const isSafUri = (uri: string | null) => uri?.startsWith("content://") ?? false;

  const upsertDownload = (id: string, patch: Partial<DownloadItem>) => {
    setDownloads((prev: DownloadItem[]) => {
      const idx = prev.findIndex((d) => d.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  // Queue progress update to be applied in batch (avoids race conditions)
  const queueProgressUpdate = (id: string, patch: Partial<DownloadItem>) => {
    const existing = pendingProgressRef.current.get(id) || {};
    // Merge with existing pending update, keeping latest values
    pendingProgressRef.current.set(id, { ...existing, ...patch });
  };

  // Flush all pending progress updates in a single state update
  const flushProgressUpdates = () => {
    if (pendingProgressRef.current.size === 0) return;
    const pending = new Map(pendingProgressRef.current);
    pendingProgressRef.current.clear();

    setDownloads((prev: DownloadItem[]) => {
      let changed = false;
      const next = prev.map((d) => {
        const patch = pending.get(d.id);
        if (!patch) return d;
        // Only apply if download is still active
        if (d.status !== "downloading") return d;
        changed = true;
        return { ...d, ...patch };
      });
      return changed ? next : prev;
    });
  };

  // Periodically flush progress updates (every 400ms)
  useEffect(() => {
    const interval = setInterval(flushProgressUpdates, 400);
    return () => clearInterval(interval);
  }, []);

  // Auto-retry failed download if under max retries
  const scheduleAutoRetry = (id: string, title: string) => {
    const currentRetries = retryCountRef.current.get(id) || 0;
    if (currentRetries < MAX_AUTO_RETRIES) {
      retryCountRef.current.set(id, currentRetries + 1);
      console.log(`Auto-retry ${currentRetries + 1}/${MAX_AUTO_RETRIES} for: ${title}`);
      // Reset to pending after delay, which will trigger the download useEffect
      setTimeout(() => {
        setDownloads((prev) => {
          const d = prev.find((x) => x.id === id);
          // Only retry if still in error state (user might have manually retried/canceled)
          if (d?.status !== "error") return prev;
          return prev.map((x) => (x.id === id ? { ...x, status: "pending" as const, progress: 0, speed: "" } : x));
        });
      }, RETRY_DELAY_MS);
      return true; // Will auto-retry
    }
    // Max retries reached, notify user
    void notifyDownloadError(title);
    return false;
  };

  // Clear retry count on success or manual retry
  const clearRetryCount = (id: string) => {
    retryCountRef.current.delete(id);
  };

  const ensureDownloadsDir = async () => {
    const dir = getDownloadDirUri();
    if (!dir) return null;
    await ensureDir(dir);
    return dir;
  };



  // Renamed from startDownload to processDownload (internal use)
  const processDownload = async (item: DownloadItem) => {
    // Prevent duplicate starts using ref (avoids stale closure issues)
    if (startingRef.current.has(item.id)) return;

    // Safety check: if somehow we are called but item is not pending/downloading/error
    // Actually, we force status to downloading here
    startingRef.current.add(item.id);

    const dir = await ensureDownloadsDir();
    if (!dir) {
      startingRef.current.delete(item.id);
      upsertDownload(item.id, { status: "error" });
      return;
    }

    const extension = item.extension?.toLowerCase() || "pdf";
    const dottedExt = `.${extension}`;
    let cleanName = safeFilename(item.title || item.id);

    let fileName = cleanName;
    if (!fileName.toLowerCase().endsWith(dottedExt)) {
      fileName = `${fileName}${dottedExt}`;
    }
    console.log("processDownload: Filename:", fileName);

    // Check if we're using SAF (content:// URI)
    const usingSaf = isSafUri(dir);

    // For SAF, we'll download to temp then copy
    // For regular paths, download directly
    const tempPath = usingSaf
      ? `${FileSystem.cacheDirectory}${item.id}${dottedExt}`
      : `${dir}/${fileName}`;

    upsertDownload(item.id, { status: "downloading", path: tempPath, resumeData: item.resumeData ?? null });
    clearSpeed(speedRef, item.id);

    // Android: use native DownloadManager via addAndroidDownloads (only for non-SAF paths)
    // This ensures files are visible in file manager and handles all permissions automatically
    if (Platform.OS === "android" && !usingSaf) {
      try {
        const mimeType = item.extension === "pdf" ? "application/pdf"
          : item.extension === "cbz" ? "application/x-cbz"
            : item.extension === "cbr" ? "application/x-cbr"
              : item.extension === "zip" ? "application/zip"
                : "*/*";

        const task = ReactNativeBlobUtil.config({
          addAndroidDownloads: {
            useDownloadManager: true,
            notification: true,
            title: item.title,
            description: `Téléchargement VKomic`,
            path: tempPath,
            mime: mimeType,
            mediaScannable: true,
          },
        }).fetch("GET", item.url);

        // Store task for potential cancellation
        androidTasksRef.current.set(item.id, { cancel: () => task.cancel() });

        // Progress tracking (works with DownloadManager too) - throttled to reduce state updates
        task.progress((receivedStr, totalStr) => {
          const received = Number(receivedStr) || 0;
          const total = Number(totalStr) || 0;
          const pct = total > 0 ? Math.round((received / total) * 100) : 0;
          const now = Date.now();
          const prev = speedRef.current.get(item.id);
          let speed = "";
          if (prev) {
            const dt = Math.max(1, now - prev.at);
            const db = Math.max(0, received - prev.bytes);
            const bps = (db * 1000) / dt;
            speed = `${formatBytes(bps)}/s`;
          }
          speedRef.current.set(item.id, { bytes: received, at: now });
          // Don't queue 100% - let completion handler do it to avoid race
          if (pct < 100) {
            queueProgressUpdate(item.id, {
              progress: pct,
              speed,
              size: total > 0 ? formatBytes(total) : item.size,
            });
          }
        });

        const res = await task;
        // Always mark as completed when task finishes successfully
        const actualPath = res?.path?.() || tempPath;
        // Clear any pending progress updates for this download
        pendingProgressRef.current.delete(item.id);
        // Directly set completed status (not queued)
        upsertDownload(item.id, {
          status: "completed",
          progress: 100,
          speed: "",
          resumeData: null,
          path: actualPath
        });
        androidTasksRef.current.delete(item.id);
        startingRef.current.delete(item.id);
        clearRetryCount(item.id); // Success: clear retry count
        clearSpeed(speedRef, item.id);
        void notifyDownloadCompleted(item.title);
      } catch (err) {
        console.log("Download error:", err);
        androidTasksRef.current.delete(item.id);
        startingRef.current.delete(item.id);
        clearSpeed(speedRef, item.id);
        // Check if download was paused/canceled by user
        setDownloads((prev) => {
          const d = prev.find(x => x.id === item.id);
          if (d?.status === 'paused' || d?.status === 'canceled') return prev;
          const next = [...prev];
          const idx = next.findIndex(x => x.id === item.id);
          if (idx !== -1) {
            next[idx] = { ...next[idx], status: 'error', speed: "" };
          }
          return next;
        });
        // Schedule auto-retry (will notify on final failure)
        scheduleAutoRetry(item.id, item.title);
      }
      return;
    }

    // Android SAF: Use DownloadManager (continues in background) then copy to SAF
    if (Platform.OS === "android" && usingSaf) {
      // Step 1: Verify folder permissions before starting
      const hasPermission = await FolderService.ensureFolderPermission(dir);
      if (!hasPermission) {
        logError(`Step 1 FAILED: Permission denied for ${dir}. Please re-select the download folder in Settings.`);
        setDownloads((prev) => prev.map(d => d.id === item.id ? { ...d, status: 'error', speed: "" } : d));
        void notifyDownloadError(`${item.title} (Permission refusée)`);
        startingRef.current.delete(item.id);
        return;
      }

      try {
        const mimeType = item.extension === "pdf" ? "application/pdf"
          : item.extension === "cbz" ? "application/x-cbz"
            : item.extension === "cbr" ? "application/x-cbr"
              : item.extension === "zip" ? "application/zip"
                : "*/*";

        // Download to cache using DownloadManager (continues in background!)
        const cacheTempPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${item.id}${dottedExt}`;

        const task = ReactNativeBlobUtil.config({
          addAndroidDownloads: {
            useDownloadManager: true,
            notification: true,
            title: item.title,
            description: `Téléchargement VKomic`,
            path: cacheTempPath,
            mime: mimeType,
            mediaScannable: false, // Don't scan temp file
          },
        }).fetch("GET", item.url);

        androidTasksRef.current.set(item.id, { cancel: () => task.cancel() });

        // Progress tracking
        task.progress((receivedStr, totalStr) => {
          const received = Number(receivedStr) || 0;
          const total = Number(totalStr) || 0;
          const pct = total > 0 ? Math.round((received / total) * 100) : 0;
          const now = Date.now();
          const prev = speedRef.current.get(item.id);
          let speed = "";
          if (prev) {
            const dt = Math.max(1, now - prev.at);
            const db = Math.max(0, received - prev.bytes);
            const bps = (db * 1000) / dt;
            speed = `${formatBytes(bps)}/s`;
          }
          speedRef.current.set(item.id, { bytes: received, at: now });
          if (pct < 100) {
            queueProgressUpdate(item.id, {
              progress: pct,
              speed,
              size: total > 0 ? formatBytes(total) : item.size,
            });
          }
        });

        const res = await task;
        const downloadedPath = res?.path?.() || cacheTempPath;

        // Copy to SAF folder
        logDownload(`SAF: creating file for ${item.title}...`);
        const fileUri = await FolderService.createFileRobust(dir, fileName, mimeType);

        logDownload(`SAF: copying temp file to ${fileUri}...`);
        const copied = await FolderService.copyLocalToSaf(downloadedPath, fileUri);

        if (copied) {
          // Clean up temp file
          try { await ReactNativeBlobUtil.fs.unlink(downloadedPath); } catch { }

          pendingProgressRef.current.delete(item.id);
          upsertDownload(item.id, {
            status: "completed",
            progress: 100,
            speed: "",
            resumeData: null,
            path: fileUri
          });
          androidTasksRef.current.delete(item.id);
          startingRef.current.delete(item.id);
          clearRetryCount(item.id);
          clearSpeed(speedRef, item.id);
          void notifyDownloadCompleted(item.title);
        } else {
          throw new SafError(SafErrorType.UNKNOWN, "Échec de la copie vers le dossier SAF");
        }
      } catch (err) {
        console.log("SAF Download error:", err);
        androidTasksRef.current.delete(item.id);
        startingRef.current.delete(item.id);
        clearSpeed(speedRef, item.id);
        setDownloads((prev) => {
          const d = prev.find(x => x.id === item.id);
          if (d?.status === 'paused' || d?.status === 'canceled') return prev;
          const next = [...prev];
          const idx = next.findIndex(x => x.id === item.id);
          if (idx !== -1) {
            next[idx] = { ...next[idx], status: 'error', speed: "" };
          }
          return next;
        });
        scheduleAutoRetry(item.id, item.title);
      }
      return;
    }

    // iOS: Use expo-file-system DownloadResumable
    const resumable = FileSystem.createDownloadResumable(
      item.url,
      tempPath,
      {},
      (progress) => {
        const total = progress.totalBytesExpectedToWrite || 0;
        const written = progress.totalBytesWritten || 0;
        const pct = total > 0 ? Math.round((written / total) * 100) : 0;
        const now = Date.now();
        const prev = speedRef.current.get(item.id);
        let speed = "";
        if (prev) {
          const dt = Math.max(1, now - prev.at);
          const db = Math.max(0, written - prev.bytes);
          const bps = (db * 1000) / dt;
          speed = `${formatBytes(bps)}/s`;
        }
        speedRef.current.set(item.id, { bytes: written, at: now });
        if (pct < 100) {
          queueProgressUpdate(item.id, {
            progress: pct,
            speed,
            size: total > 0 ? formatBytes(total) : item.size,
          });
        }
      },
      item.resumeData ?? undefined,
    );

    resumablesRef.current.set(item.id, resumable);

    try {
      const result = await resumable.downloadAsync();

      if (result) {
        pendingProgressRef.current.delete(item.id);
        upsertDownload(item.id, { status: "completed", progress: 100, speed: "", resumeData: null, path: result.uri });
        resumablesRef.current.delete(item.id);
        startingRef.current.delete(item.id);
        clearRetryCount(item.id);
        clearSpeed(speedRef, item.id);
        void notifyDownloadCompleted(item.title);
      }
    } catch (err: any) {
      console.warn("Download error:", err);
      resumablesRef.current.delete(item.id);
      startingRef.current.delete(item.id);
      clearSpeed(speedRef, item.id);

      setDownloads((prev) => {
        const d = prev.find(x => x.id === item.id);
        if (d?.status === 'paused' || d?.status === 'canceled') return prev;
        const next = [...prev];
        const idx = next.findIndex(x => x.id === item.id);
        if (idx !== -1) {
          next[idx] = { ...next[idx], status: 'error', speed: "" };
        }
        return next;
      });

      const isManualPause = item.status === 'paused';
      if (!isManualPause) {
        scheduleAutoRetry(item.id, item.title);
      }
    }
  };

  const prefetchRootStructure = async (nodes: VkNode[]) => {
    if (!token || hasFullSynced || prefetchRef.current || isTokenInvalid) return;
    if (!nodes || nodes.length === 0) return;
    prefetchRef.current = true;
    try {
      const expanded = await expandNodesStructure(token, nodes);
      if (!expanded || expanded.length === 0) return;
      // Merge instead of replace to preserve existing children data
      setSyncedData((prev) => {
        if (!prev) return prev;
        return mergeTrees(expanded, prev);
      });
    } catch {
      // silent prefetch
    } finally {
      prefetchRef.current = false;
    }
  };

  const syncRoot = async () => {
    if (!token) { setError(t.browser.errorNoToken); return; }
    if (isTokenInvalid) { setError("Token invalide - Veuillez le mettre à jour dans les paramètres"); return; }
    setIsSyncing(true);
    setError(null);
    try {
      const nodes = await withRetry(() => fetchRootIndex(token, groupId, topicId), 3, 1000);
      const merged = syncedData ? mergeTrees(nodes, syncedData) : nodes;
      setSyncedData(merged);
      setNavPath([]);
      setStatus((prev: any) => ({ ...prev, lastSync: Date.now() }));
      void InteractionManager.runAfterInteractions(() => prefetchRootStructure(merged));
    } catch {
      setError(t.browser.errorSync);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncAll = async () => {
    if (!token) { setError(t.browser.errorNoToken); return; }
    if (isTokenInvalid) { setError("Token invalide - Veuillez le mettre à jour dans les paramètres"); return; }
    setIsSyncing(true);
    setError(null);
    try {
      const nodes = await withRetry(() => fetchFolderTreeUpToDepth(token, groupId, topicId, 4), 2, 2000);
      if (nodes && nodes.length > 0) {
        setHasFullSynced(true);
        setSyncedData(prev => prev ? mergeTrees(nodes, prev) : nodes);
        setNavPath([]);
        await AsyncStorage.setItem(STORAGE_KEYS.hasFullSynced, "true");
      }
    } catch {
      setError(t.browser.errorSync);
    } finally {
      setIsSyncing(false);
    }
  };

  const refreshCurrent = async () => {
    if (!token) { setError(t.browser.errorNoToken); return; }
    if (isTokenInvalid) { setError("Token invalide - Veuillez le mettre à jour dans les paramètres"); return; }
    setIsSyncing(true);
    setError(null);
    try {
      if (navPath.length === 0) {
        const nodes = await fetchRootIndex(token, groupId, topicId);
        const merged = syncedData ? mergeTrees(nodes, syncedData) : nodes;
        setSyncedData(merged);
        setStatus((prev: any) => ({ ...prev, lastSync: Date.now() }));
      } else {
        const node = navPath[navPath.length - 1];
        const loaded = await fetchNodeContent(token, node);
        if (syncedData) {
          const updateTree = (nodes: VkNode[]): VkNode[] => nodes.map(n => {
            if (n.id === loaded.id) return mergeTrees([loaded], [n])[0];
            if (n.children) return { ...n, children: updateTree(n.children) };
            return n;
          });
          setSyncedData(updateTree(syncedData));
        }
        setNavPath(prev => {
          const next = [...prev];
          next[next.length - 1] = loaded;
          return next;
        });
      }
    } catch {
      setError(t.browser.errorSync);
    } finally {
      setIsSyncing(false);
    }
  };

  const openNode = async (node: VkNode) => {
    if (node.type === "file") return;
    if (!token) { setError(t.browser.errorNoToken); return; }
    if (isTokenInvalid) { setError("Token invalide - Veuillez le mettre à jour dans les paramètres"); return; }
    setError(null);
    // Clear search when opening a folder so we see its contents
    setSearchQuery("");
    if (!node.isLoaded || node.structureOnly) {
      setIsLoadingNode(true);
      try {
        const loaded = await fetchNodeContent(token, node);
        if (syncedData) {
          const updateTree = (nodes: VkNode[]): VkNode[] => nodes.map(n => {
            if (n.id === loaded.id) return mergeTrees([loaded], [n])[0];
            if (n.children) return { ...n, children: updateTree(n.children) };
            return n;
          });
          setSyncedData(updateTree(syncedData));
        }
        setNavPath((prev) => [...prev, loaded]);
      } catch {
        setError(t.browser.errorLoad);
      } finally {
        setIsLoadingNode(false);
      }
      return;
    }
    setNavPath((prev) => [...prev, node]);
  };

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const [treeRaw, downloadsRaw, fullSyncRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.syncedData),
          AsyncStorage.getItem(STORAGE_KEYS.downloads),
          AsyncStorage.getItem(STORAGE_KEYS.hasFullSynced),
        ]);
        if (cancelled) return;
        if (treeRaw) setSyncedData(JSON.parse(treeRaw));
        if (downloadsRaw) {
          const parsed: DownloadItem[] = JSON.parse(downloadsRaw);
          const normalized = parsed.map((d) => ({
            ...d,
            status: d.status === "downloading" ? "pending" : d.status,
            progress: Number.isFinite(d.progress) ? d.progress : 0,
            speed: "",
          }));
          setDownloads(normalized);
        }
        if (fullSyncRaw === "true") setHasFullSynced(true);
      } catch { }
    };
    void hydrate();
    void setupNotifications();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (syncedData) AsyncStorage.setItem(STORAGE_KEYS.syncedData, JSON.stringify(syncedData));
    }, 500);
    return () => clearTimeout(t);
  }, [syncedData]);

  useEffect(() => {
    if (!isReady || !autoSync) return;
    if (!token || isSyncing || syncedData || isTokenInvalid) return;
    void syncRoot();
  }, [isReady, autoSync, token, isSyncing, syncedData, isTokenInvalid]);

  useEffect(() => {
    if (!token || isSyncing || hasFullSynced || isTokenInvalid) return;
    if (!syncedData || syncedData.length === 0) return;
    if (prefetchRef.current) return;
    void InteractionManager.runAfterInteractions(() => prefetchRootStructure(syncedData));
  }, [token, isSyncing, hasFullSynced, syncedData, isTokenInvalid]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), 180);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEYS.downloads, JSON.stringify(downloads));
    }, 500);
    return () => clearTimeout(t);
  }, [downloads]);

  // Sequential downloads: only MAX_CONCURRENT_DOWNLOADS active at a time, in order of creation
  useEffect(() => {
    const active = downloads.filter((d) => d.status === "downloading").length;
    const starting = startingRef.current.size;
    // Only 3 download at a time
    if (active + starting >= MAX_CONCURRENT_DOWNLOADS) return;
    // Find the oldest pending download (by createdAt) to respect insertion order
    const pendingDownloads = downloads
      .filter((d) => d.status === "pending" && !startingRef.current.has(d.id))
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    const next = pendingDownloads[0];
    if (next) void processDownload(next);
  }, [downloads]);

  const currentFolder = navPath.length > 0 ? navPath[navPath.length - 1] : null;
  const rawCurrentNodes = (currentFolder?.children ?? syncedData ?? []) as VkNode[];

  const currentNodes = useMemo(() => {
    const q = normalizeText(debouncedQuery);
    if (!q) return rawCurrentNodes;
    const words = q.split(" ").filter(Boolean);
    if (words.length === 0) return rawCurrentNodes;
    return rawCurrentNodes.filter((n) => {
      const title = normalizeText(n.title || "");
      // All words must be present somewhere in the title (flexible search)
      return words.every((w) => title.includes(w));
    });
  }, [rawCurrentNodes, debouncedQuery]);

  const searchIndex = useMemo(() => {
    if (!syncedData) return [];
    const index: Array<{ id: string; node: VkNode; normalizedTitle: string }> = [];
    const stack: VkNode[] = [...syncedData];
    const seenIds = new Set<string>();
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      if (seenIds.has(node.id)) continue;
      seenIds.add(node.id);
      index.push({ id: node.id, node, normalizedTitle: normalizeText(node.title || "") });
      if (node.children && node.children.length > 0) {
        stack.push(...node.children);
      }
    }
    return index;
  }, [syncedData]);

  const globalSearchNodes = useMemo(() => {
    const q = normalizeText(debouncedQuery);
    if (!q || !syncedData) return [];
    const words = q.split(" ").filter(Boolean);
    if (words.length === 0) return [];
    const results: VkNode[] = [];
    const seenIds = new Set<string>();
    const MAX_RESULTS = 100;
    for (const entry of searchIndex) {
      if (results.length >= MAX_RESULTS) break;
      if (seenIds.has(entry.id)) continue;
      // All words must be present somewhere in the title (flexible search)
      const matches = words.every((w) => entry.normalizedTitle.includes(w));
      if (!matches) continue;
      seenIds.add(entry.id);
      results.push(entry.node);
    }
    return results;
  }, [syncedData, debouncedQuery, searchIndex]);

  const goHome = () => setNavPath([]);
  const goUp = (index?: number) => {
    setNavPath((prev) => {
      if (index === undefined) return prev.slice(0, -1);
      return prev.slice(0, index + 1);
    });
  };

  const addDownload = async (node: VkNode) => {
    if (node.type !== "file" || !node.url) { setError(t.browser.errorNoUrl); return; }
    // Check if download folder is configured
    if (!downloadPath || downloadPath.trim() === "") {
      setError(t.downloads.errorNoFolder || "Configurez un dossier de téléchargement dans les paramètres");
      return;
    }
    const exists = downloads.find(d => d.url === node.url && (d.status === 'downloading' || d.status === 'pending' || d.status === 'completed' || d.status === 'paused'));
    if (exists) return;
    setError(null);
    const id = `${node.id}-${Date.now()}`;
    const item: DownloadItem = {
      id, title: node.title, url: node.url, progress: 0, status: "pending",
      extension: node.extension, speed: "", createdAt: new Date().toISOString(),
      size: node.sizeBytes ? formatBytes(node.sizeBytes) : undefined,
      resumeData: null,
    };
    setDownloads((prev) => [item, ...prev]);
    void notifyDownloadStarted(node.title);
  };

  const pauseDownload = async (id: string) => {
    // First update status to paused
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'paused', speed: "" } : d));

    // iOS / Expo Resumable - try to pause and save resume data
    const resumable = resumablesRef.current.get(id);
    if (resumable) {
      try {
        const state = await resumable.pauseAsync();
        if (state?.resumeData) {
          upsertDownload(id, { resumeData: state.resumeData });
        }
      } catch (e) {
        console.warn("Error pausing resumable:", e);
      }
      // Keep the resumable in the map for potential resume
    }

    // Android / ReactNativeBlobUtil Task - cancel but note we'll restart on resume
    const androidTask = androidTasksRef.current.get(id);
    if (androidTask) {
      try {
        androidTask.cancel();
      } catch (e) {
        console.warn("Error cancelling android task on pause", e);
      }
      androidTasksRef.current.delete(id);
    }

    startingRef.current.delete(id);
    clearSpeed(speedRef, id);
  };

  const resumeDownload = async (id: string) => {
    const current = downloads.find(d => d.id === id);
    if (!current || current.status === 'downloading') return;

    // Try to use existing resumable first
    const resumable = resumablesRef.current.get(id);
    if (resumable && current.resumeData) {
      console.log("Resuming with existing resumable and resumeData");
      setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'downloading', speed: "" } : d));
      clearSpeed(speedRef, id);
      try {
        await resumable.resumeAsync();
        return;
      } catch (e) {
        console.warn("Resume failed, will restart:", e);
        resumablesRef.current.delete(id);
      }
    }

    // If we have resumeData but no resumable, create a new one
    if (current.resumeData && current.path) {
      console.log("Creating new resumable from saved resumeData");
      const newResumable = FileSystem.createDownloadResumable(
        current.url,
        current.path,
        {},
        (progress) => {
          const total = progress.totalBytesExpectedToWrite || 0;
          const written = progress.totalBytesWritten || 0;
          const pct = total > 0 ? Math.round((written / total) * 100) : 0;
          const now = Date.now();
          const prev = speedRef.current.get(id);
          let speed = "";
          if (prev) {
            const dt = Math.max(1, now - prev.at);
            const db = Math.max(0, written - prev.bytes);
            const bps = (db * 1000) / dt;
            speed = `${formatBytes(bps)}/s`;
          }
          speedRef.current.set(id, { bytes: written, at: now });
          queueProgressUpdate(id, { progress: Math.min(Math.max(pct, 0), 100), speed, size: total > 0 ? formatBytes(total) : current.size });
        },
        current.resumeData
      );
      resumablesRef.current.set(id, newResumable);
      setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'downloading', speed: "" } : d));
      clearSpeed(speedRef, id);
      try {
        const result = await newResumable.resumeAsync();
        if (result) {
          upsertDownload(id, { status: "completed", progress: 100, speed: "", resumeData: null, path: result.uri });
          resumablesRef.current.delete(id);
          clearSpeed(speedRef, id);
          void notifyDownloadCompleted(current.title);
        }
        return;
      } catch (e) {
        console.warn("Resume with new resumable failed:", e);
        resumablesRef.current.delete(id);
      }
    }

    // Fallback: restart download from beginning (for Android DownloadManager or if no resumeData)
    console.log("No resumeData available, restarting download");
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'pending', progress: 0, speed: "", resumeData: null } : d));
  };

  const cancelDownload = async (id: string) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'canceled', speed: "", resumeData: null } : d));

    // Cancel Android task if exists
    const androidTask = androidTasksRef.current.get(id);
    if (androidTask) {
      try { androidTask.cancel(); } catch { }
      androidTasksRef.current.delete(id);
    }

    // Cancel iOS resumable if exists
    const resumable = resumablesRef.current.get(id);
    if (resumable) {
      try { await resumable.pauseAsync(); } catch { }
      resumablesRef.current.delete(id);
    }

    startingRef.current.delete(id);
    clearSpeed(speedRef, id);
    const item = downloads.find((d) => d.id === id);
    if (item?.path) {
      try {
        if (Platform.OS === "android" && !item.path.startsWith("file://")) {
          await ReactNativeBlobUtil.fs.unlink(item.path);
        } else {
          await FileSystem.deleteAsync(item.path, { idempotent: true });
        }
      } catch { }
    }
  };

  const downloadAll = async (nodes: VkNode[]) => {
    const files = nodes.filter(n => n.type === 'file' && n.url);
    for (const file of files) {
      await addDownload(file);
      await sleep(50);
    }
  };

  const cancelAll = async () => {
    const active = downloads.filter(d => ['downloading', 'pending', 'paused'].includes(d.status));
    await Promise.all(active.map(d => cancelDownload(d.id).catch(e => console.log("Cancel error", e))));
  };

  const clearCache = async () => {
    setSyncedData(null);
    setNavPath([]);
    await AsyncStorage.removeItem(STORAGE_KEYS.syncedData);
    setHasFullSynced(false);
    await AsyncStorage.removeItem(STORAGE_KEYS.hasFullSynced);
  };

  const retryDownload = async (id: string) => {
    const item = downloads.find((d) => d.id === id);
    if (!item) return;
    // Clear retry count on manual retry
    clearRetryCount(id);
    // First update the state to pending
    setDownloads(prev => prev.map(d =>
      d.id === id ? { ...d, progress: 0, speed: "", status: "pending" as const, resumeData: null } : d
    ));
  };

  const clearDownloads = async () => {
    await cancelAll();
    setDownloads([]);
    AsyncStorage.removeItem(STORAGE_KEYS.downloads);
  };

  const resetLibrary = async () => {
    await cancelAll();
    setDownloads([]);
    await AsyncStorage.removeItem(STORAGE_KEYS.downloads);
    await clearCache();
    const dir = getDownloadDirUri();
    if (dir) {
      try {
        if (Platform.OS === "android" && !dir.startsWith("file://")) {
          const exists = await ReactNativeBlobUtil.fs.exists(dir);
          if (exists) await ReactNativeBlobUtil.fs.unlink(dir);
        } else {
          const info = await FileSystem.getInfoAsync(dir);
          if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
        }
      } catch { }
      await ensureDir(dir);
    }
  };

  const deleteLocalFile = async (uri: string) => {
    try {
      if (Platform.OS === "android" && !uri.startsWith("content://")) {
        const path = uri.startsWith("file://") ? uri.substring(7) : uri;
        await ReactNativeBlobUtil.fs.unlink(path);
      } else {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch (e) {
      console.warn("deleteLocalFile error:", e);
    }
  };

  const value: AppDataContextType = {
    syncedData, navPath, isSyncing, isLoadingNode, error, searchQuery, setSearchQuery,
    hasFullSynced, currentNodes, currentFolder, syncRoot, syncAll, resetLibrary, openNode, goHome, goUp, refreshCurrent, downloads,
    addDownload, pauseDownload, resumeDownload, cancelDownload, retryDownload,
    clearDownloads, downloadAll, cancelAll, clearCache, getDownloadDirUri, deleteLocalFile, globalSearchNodes,
    readingFile, setReadingFile,
  };

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
};

export const useAppData = () => {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
};
