import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
// Expo SDK 54+: l'API "historique" (documentDirectory / createDownloadResumable / readDirectoryAsync)
// doit être importée via `expo-file-system/legacy`.
import * as FileSystem from "expo-file-system/legacy";

import { fetchNodeContent, fetchRootIndex } from "../services/vk-service";
import { getT } from "../i18n";
import { DownloadItem, VkNode } from "../types";
import { useVk } from "./VkContext";

type AppDataContextType = {
  // Arbre VK synchronisé (index) + navigation "dossier par dossier".
  syncedData: VkNode[] | null;
  navPath: VkNode[];
  isSyncing: boolean;
  isLoadingNode: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;

  currentNodes: VkNode[];
  currentFolder: VkNode | null;

  syncRoot: () => Promise<void>;
  openNode: (node: VkNode) => Promise<void>;
  goHome: () => void;
  goUp: (index?: number) => void;

  // File de téléchargements réelle (sandbox mobile) avec progression et actions pause/reprise.
  downloads: DownloadItem[];
  addDownload: (node: VkNode) => Promise<void>;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  retryDownload: (id: string) => Promise<void>;
  clearDownloads: () => Promise<void>;

  getDownloadDirUri: () => string | null;
};

const AppDataContext = createContext<AppDataContextType | null>(null);

const STORAGE_KEYS = {
  syncedData: "vk_synced_data_mobile",
  downloads: "vk_downloads_mobile",
};

const DOWNLOAD_DIR_NAME = "vkomic-downloads";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && info.isDirectory) return;
    await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
  } catch {
    // noop
  }
};

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { token, groupId, topicId, language, setStatus } = useVk();
  const t = useMemo(() => getT(language), [language]);

  const [syncedData, setSyncedData] = useState<VkNode[] | null>(null);
  const [navPath, setNavPath] = useState<VkNode[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingNode, setIsLoadingNode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  // Les DownloadResumable ne sont pas sérialisables: on les garde uniquement en mémoire.
  const resumablesRef = useRef(new Map<string, FileSystem.DownloadResumable>());
  const speedRef = useRef(new Map<string, { bytes: number; at: number }>());

  const getDownloadDirUri = () => {
    const base = FileSystem.documentDirectory;
    if (!base) return null;
    return `${base}${DOWNLOAD_DIR_NAME}/`;
  };

  // Hydrate (syncedData + downloads) once.
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const [treeRaw, downloadsRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.syncedData),
          AsyncStorage.getItem(STORAGE_KEYS.downloads),
        ]);

        if (cancelled) return;

        if (treeRaw) {
          const parsed = JSON.parse(treeRaw);
          setSyncedData(Array.isArray(parsed) ? parsed : null);
        }

        if (downloadsRaw) {
          const parsed = JSON.parse(downloadsRaw);
          setDownloads(Array.isArray(parsed) ? parsed : []);
        }
      } catch {
        if (cancelled) return;
        setSyncedData(null);
        setDownloads([]);
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist syncedData (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (!syncedData) {
          void AsyncStorage.removeItem(STORAGE_KEYS.syncedData);
        } else {
          void AsyncStorage.setItem(STORAGE_KEYS.syncedData, JSON.stringify(syncedData));
        }
      } catch {
        // noop
      }
    }, 400);
    return () => clearTimeout(t);
  }, [syncedData]);

  // Persist downloads (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        void AsyncStorage.setItem(STORAGE_KEYS.downloads, JSON.stringify(downloads));
      } catch {
        // noop
      }
    }, 400);
    return () => clearTimeout(t);
  }, [downloads]);

  const currentFolder = navPath.length > 0 ? navPath[navPath.length - 1] : null;
  const rawCurrentNodes = (currentFolder?.children ?? syncedData ?? []) as VkNode[];

  const currentNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rawCurrentNodes;
    return rawCurrentNodes.filter((n) => (n.title || "").toLowerCase().includes(q));
  }, [rawCurrentNodes, searchQuery]);

  const syncRoot = async () => {
    if (!token) {
      setError(t.browser.errorNoToken);
      return;
    }

    setIsSyncing(true);
    setError(null);
    try {
      const nodes = await fetchRootIndex(token, groupId, topicId);
      setSyncedData(nodes);
      setNavPath([]);
      setStatus((prev) => ({ ...prev, lastSync: Date.now() }));
    } catch (e) {
      setError(t.browser.errorSync);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateTreeNode = (nodes: VkNode[], updated: VkNode): VkNode[] => {
    return nodes.map((n) => {
      if (n.id === updated.id) return updated;
      if (n.children && n.children.length > 0) {
        return { ...n, children: updateTreeNode(n.children, updated) };
      }
      return n;
    });
  };

  const openNode = async (node: VkNode) => {
    // Files don't open: they download.
    if (node.type === "file") return;

    if (!token) {
      setError(t.browser.errorNoToken);
      return;
    }

    setError(null);

    if (!node.isLoaded) {
      setIsLoadingNode(true);
      try {
        const loaded = await fetchNodeContent(token, node);
        if (syncedData) setSyncedData(updateTreeNode(syncedData, loaded));
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

  const goHome = () => setNavPath([]);
  const goUp = (index?: number) => {
    setNavPath((prev) => {
      if (index === undefined) return prev.slice(0, -1);
      return prev.slice(0, index + 1);
    });
  };

  const ensureDownloadsDir = async () => {
    const dir = getDownloadDirUri();
    if (!dir) return null;
    await ensureDir(dir);
    return dir;
  };

  const upsertDownload = (id: string, patch: Partial<DownloadItem>) => {
    setDownloads((prev) => {
      const idx = prev.findIndex((d) => d.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const startDownload = async (item: DownloadItem) => {
    const dir = await ensureDownloadsDir();
    if (!dir) {
      upsertDownload(item.id, { status: "error" });
      return;
    }

    const ext = item.extension ? `.${item.extension.toLowerCase()}` : "";
    const name = safeFilename(item.title || item.id);
    const fileUri = `${dir}${name}-${item.id}${ext}`;

    upsertDownload(item.id, { status: "downloading", path: fileUri });

    const resumable = FileSystem.createDownloadResumable(
      item.url,
      fileUri,
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

        upsertDownload(item.id, {
          progress: Math.min(Math.max(pct, 0), 100),
          speed,
          size: total > 0 ? formatBytes(total) : item.size,
        });
      },
    );

    resumablesRef.current.set(item.id, resumable);

    try {
      await resumable.downloadAsync();
      upsertDownload(item.id, { status: "completed", progress: 100 });
    } catch {
      const existing = resumablesRef.current.get(item.id);
      if (!existing) return;
      // If we paused, Expo throws: treat as paused.
      const d = downloads.find((x) => x.id === item.id);
      if (d?.status === "paused") return;
      upsertDownload(item.id, { status: "error" });
    }
  };

  const addDownload = async (node: VkNode) => {
    if (node.type !== "file" || !node.url) {
      setError(t.browser.errorNoUrl);
      return;
    }

    setError(null);
    const id = `${node.id}-${Date.now()}`;
    const item: DownloadItem = {
      id,
      title: node.title,
      url: node.url,
      progress: 0,
      status: "pending",
      extension: node.extension,
      speed: "",
      createdAt: new Date().toISOString(),
      size: node.sizeBytes ? formatBytes(node.sizeBytes) : undefined,
    };

    setDownloads((prev) => [item, ...prev]);
    await sleep(10);
    await startDownload(item);
  };

  const pauseDownload = async (id: string) => {
    upsertDownload(id, { status: "paused" });
    const resumable = resumablesRef.current.get(id);
    if (!resumable) return;
    try {
      await resumable.pauseAsync();
    } catch {
      // noop
    }
  };

  const resumeDownload = async (id: string) => {
    const resumable = resumablesRef.current.get(id);
    if (resumable) {
      upsertDownload(id, { status: "downloading" });
      try {
        await resumable.resumeAsync();
        upsertDownload(id, { status: "completed", progress: 100 });
      } catch {
        upsertDownload(id, { status: "error" });
      }
      return;
    }

    const item = downloads.find((d) => d.id === id);
    if (!item) return;
    await startDownload(item);
  };

  const cancelDownload = async (id: string) => {
    const resumable = resumablesRef.current.get(id);
    if (resumable) {
      try {
        await resumable.pauseAsync();
      } catch {
        // noop
      }
      resumablesRef.current.delete(id);
    }

    const item = downloads.find((d) => d.id === id);
    if (item?.path) {
      try {
        await FileSystem.deleteAsync(item.path, { idempotent: true });
      } catch {
        // noop
      }
    }

    upsertDownload(id, { status: "canceled" });
  };

  const retryDownload = async (id: string) => {
    const item = downloads.find((d) => d.id === id);
    if (!item) return;
    upsertDownload(id, { status: "pending", progress: 0, speed: "" });
    await sleep(10);
    await startDownload({ ...item, progress: 0, speed: "" });
  };

  const clearDownloads = async () => {
    // Cancel active ones
    const ids = downloads.map((d) => d.id);
    for (const id of ids) {
      const r = resumablesRef.current.get(id);
      if (r) {
        try {
          await r.pauseAsync();
        } catch {
          // noop
        }
      }
    }
    resumablesRef.current.clear();
    speedRef.current.clear();
    setDownloads([]);
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.downloads);
    } catch {
      // noop
    }
  };

  const value: AppDataContextType = {
    syncedData,
    navPath,
    isSyncing,
    isLoadingNode,
    error,
    searchQuery,
    setSearchQuery,
    currentNodes,
    currentFolder,
    syncRoot,
    openNode,
    goHome,
    goUp,
    downloads,
    addDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    clearDownloads,
    getDownloadDirUri,
  };

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
};

export const useAppData = () => {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
};
