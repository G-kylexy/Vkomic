import React, { useState, useEffect } from "react";
import {
  Folder,
  FileText,
  File,
  DownloadCloud,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  X,
  Check,
  ChevronRight,
  Home,
  Search,
  Image,
  FileArchive,
  BookOpen,
  AlertCircle,
  AlertTriangle,
} from "./Icons";
import { useTranslation } from "../i18n";
import { VkNode, VkConnectionStatus, DownloadItem } from "../types";
import {
  fetchRootIndex,
  fetchNodeContent,
  fetchFolderTreeUpToDepth,
} from "../utils/vk-client";
import { normalizeText } from "../utils/text";

interface BrowserViewProps {
  vkToken: string;
  vkGroupId: string;
  vkTopicId: string;
  syncedData: VkNode[] | null;
  setSyncedData: (data: VkNode[] | null) => void;
  hasFullSynced: boolean;
  setHasFullSynced: (hasSynced: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onVkStatusChange: (status: VkConnectionStatus) => void;
  addDownload: (node: VkNode, subFolder?: string) => void;
  downloads: DownloadItem[];
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string) => void;
  navPath: VkNode[];
  setNavPath: (path: VkNode[]) => void;
}

const BrowserView: React.FC<BrowserViewProps> = ({
  vkToken,
  vkGroupId,
  vkTopicId,
  syncedData,
  setSyncedData,
  hasFullSynced,
  setHasFullSynced,
  searchQuery,
  setSearchQuery,
  onVkStatusChange,
  addDownload,
  downloads,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  retryDownload,
  navPath,
  setNavPath,
}) => {
  const { t, language } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La recherche est maintenant debounced depuis App.tsx
  // searchQuery ici est déjà "calme" (ne change pas à chaque frappe)
  const debouncedQuery = searchQuery;

  const currentFolder = navPath.length > 0 ? navPath[navPath.length - 1] : null;
  const currentNodes = currentFolder ? currentFolder.children : syncedData;
  const isSearching = debouncedQuery.trim().length > 0;

  const searchIndex = React.useMemo(() => {
    if (!syncedData) return [];
    const index: Array<{ node: VkNode; normalizedTitle: string }> = [];
    const stack: VkNode[] = [...syncedData];

    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      index.push({ node, normalizedTitle: normalizeText(node.title) });
      if (node.children && node.children.length > 0) {
        stack.push(...node.children);
      }
    }

    return index;
  }, [syncedData]);

  // Fonction de recherche optimisée avec useMemo
  const displayedNodes = React.useMemo(() => {
    if (!isSearching) {
      return currentNodes || [];
    }

    if (!syncedData) return [];

    const normalizedQuery = normalizeText(debouncedQuery);
    const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 0);
    const results: VkNode[] = [];
    const MAX_RESULTS = 100; // Limite pour éviter le freeze du DOM

    for (const entry of searchIndex) {
      if (results.length >= MAX_RESULTS) break;
      // Vérifie si TOUS les mots de la requête sont dans le titre
      const matches = queryWords.every((word) =>
        entry.normalizedTitle.includes(word),
      );
      if (matches) results.push(entry.node);
    }
    return results;
  }, [isSearching, debouncedQuery, currentNodes, searchIndex]);

  const downloadsById = React.useMemo(() => {
    const map = new Map<string, DownloadItem>();
    downloads.forEach((d) => map.set(d.id, d));
    return map;
  }, [downloads]);

  const fileNodes = React.useMemo(
    () => displayedNodes.filter((n) => n.type === "file"),
    [displayedNodes],
  );

  const folderNodes = React.useMemo(
    () => displayedNodes.filter((n) => n.type !== "file"),
    [displayedNodes],
  );

  const activeDownloadsInView = React.useMemo(() => {
    if (fileNodes.length === 0) return [];
    const active: VkNode[] = [];
    fileNodes.forEach((node) => {
      const d = downloadsById.get(node.id);
      if (d && ["pending", "downloading", "paused"].includes(d.status)) {
        active.push(node);
      }
    });
    return active;
  }, [fileNodes, downloadsById]);

  const hasActiveDownloads = activeDownloadsInView.length > 0;

  const handleSync = async () => {
    if (!vkToken) {
      setError("Veuillez configurer un Token VK dans les paramètres.");
      onVkStatusChange({ connected: false, latencyMs: null, lastSync: null });
      return;
    }
    setError(null);
    setIsLoading(true);
    setNavPath([]);
    try {
      const start = performance.now();
      const data = await fetchRootIndex(vkToken, vkGroupId, vkTopicId);
      setSyncedData(data);
      const latency = Math.round(performance.now() - start);
      onVkStatusChange({
        connected: true,
        latencyMs: latency,
        lastSync: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la connexion à VK. Vérifiez votre token.");
      onVkStatusChange({ connected: false, latencyMs: null, lastSync: null });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFullSync = async () => {
    if (!vkToken) {
      setError("Veuillez configurer un Token VK dans les paramètres.");
      onVkStatusChange({ connected: false, latencyMs: null, lastSync: null });
      return;
    }
    setError(null);
    setIsLoading(true);
    setNavPath([]);
    try {
      const start = performance.now();
      // Full sync sur tous les niveaux (structure uniquement, les docs sont chargés en lazy)
      // Profondeur par défaut = 5 niveaux (suffisant pour l'arborescence VK)
      const data = await fetchFolderTreeUpToDepth(
        vkToken,
        vkGroupId,
        vkTopicId,
      );
      setSyncedData(data);
      setHasFullSynced(true); // Mark as fully synced
      const latency = Math.round(performance.now() - start);
      onVkStatusChange({
        connected: true,
        latencyMs: latency,
        lastSync: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la connexion à VK. Vérifiez votre token.");
      onVkStatusChange({ connected: false, latencyMs: null, lastSync: null });
    } finally {
      setIsLoading(false);
    }
  };

  const navigateTo = async (node: VkNode) => {
    // Pour les fichiers, on lance le téléchargement SANS toucher à la recherche
    if (node.type === "file" && node.url) {
      addDownload(node);
      return;
    }

    // Si on est en mode recherche et qu'on navigue dans un DOSSIER, on quitte la recherche
    if (isSearching) {
      setSearchQuery("");
    }

    // Si le nœud a des enfants ET n'est pas marqué "structureOnly", on peut naviguer directement
    if (node.children && node.children.length > 0 && !node.structureOnly) {
      setNavPath((prev) => [...prev, node]);
      return;
    }

    // Si le nœud n'est pas chargé OU est marqué "structureOnly" (sync structure sans docs),
    // on doit faire un appel API pour récupérer le contenu complet (y compris les documents)
    if (!node.isLoaded || node.structureOnly) {
      setIsLoading(true);
      try {
        const updatedNode = await fetchNodeContent(vkToken, node);

        // Si on avait des enfants "structure only", on les fusionne avec les nouveaux
        // Pour garder les sous-dossiers déjà synchronisés tout en ajoutant les documents
        let finalNode = updatedNode;
        if (node.structureOnly && node.children && node.children.length > 0) {
          const existingChildIds = new Set(node.children.map((c) => c.id));
          const newChildren = (updatedNode.children || []).filter(
            (c) => !existingChildIds.has(c.id),
          );
          // On garde les enfants existants (structure) et on ajoute les nouveaux (documents principalement)
          finalNode = {
            ...updatedNode,
            children: [...node.children, ...newChildren],
            structureOnly: false, // Maintenant on a le contenu complet
          };
        }

        const updateTree = (nodes: VkNode[]): VkNode[] =>
          nodes.map((n) => {
            if (n.id === node.id) return finalNode;
            if (n.children) return { ...n, children: updateTree(n.children) };
            return n;
          });

        if (syncedData) {
          setSyncedData(updateTree(syncedData));
        }
        setNavPath((prev) => [...prev, finalNode]);
      } catch (err) {
        console.error(err);
        setError("Impossible de charger le contenu.");
      } finally {
        setIsLoading(false);
      }
    } else {
      setNavPath((prev) => [...prev, node]);
    }
  };

  const navigateUp = (index?: number) => {
    setNavPath((prev) => {
      if (index === undefined) {
        return prev.slice(0, -1);
      }
      return prev.slice(0, index + 1);
    });
  };

  const clearNav = () => setNavPath([]);

  const MAX_BREADCRUMBS = 4;
  const breadcrumbs: {
    node?: VkNode;
    originalIndex?: number;
    isEllipsis?: boolean;
  }[] = (() => {
    if (navPath.length <= MAX_BREADCRUMBS) {
      return navPath.map((node, index) => ({ node, originalIndex: index }));
    }

    const first = { node: navPath[0], originalIndex: 0 };
    const secondLastIndex = navPath.length - 2;
    const lastIndex = navPath.length - 1;
    const secondLast = {
      node: navPath[secondLastIndex],
      originalIndex: secondLastIndex,
    };
    const last = { node: navPath[lastIndex], originalIndex: lastIndex };

    return [first, { isEllipsis: true }, secondLast, last];
  })();

  const handleGlobalAction = () => {
    if (hasActiveDownloads) {
      activeDownloadsInView.forEach((node) => cancelDownload(node.id));
    } else {
      // Si on est dans un dossier, on utilise son titre comme nom de sous-dossier
      const subFolder = currentFolder
        ? getDisplayTitle(currentFolder)
        : undefined;

      fileNodes.forEach((node) => {
        const d = downloadsById.get(node.id);
        if (!d || d.status !== "completed") addDownload(node, subFolder);
      });
    }
  };

  const getDisplayTitle = (node: VkNode) => {
    let title = node.title;

    // Gestion des titres multilingues (ex: "Français / English")
    if (title.includes("/")) {
      const parts = title.split("/");
      if (parts.length >= 2) {
        if (language === "fr") {
          title = parts[0].trim();
        } else {
          title = parts.slice(1).join("/").trim();
        }
      }
    }

    // Nettoyage léger
    title = title.replace(/^[-_]\s*/, "");
    return title;
  };

  const getFileIconConfig = (extension?: string) => {
    const ext = extension?.toUpperCase() || "";
    switch (ext) {
      case "PDF":
        return {
          icon: FileText,
          color: "text-rose-400",
          bg: "group-hover:bg-rose-500/20 bg-rose-500/10",
          border: "border-rose-500/20",
        };
      case "CBZ":
      case "CBR":
        return {
          icon: BookOpen,
          color: "text-purple-400",
          bg: "group-hover:bg-purple-500/20 bg-purple-500/10",
          border: "border-purple-500/20",
        };
      case "ZIP":
      case "RAR":
      case "7Z":
        return {
          icon: FileArchive,
          color: "text-amber-400",
          bg: "group-hover:bg-amber-500/20 bg-amber-500/10",
          border: "border-amber-500/20",
        };
      case "JPG":
      case "PNG":
      case "JPEG":
        return {
          icon: Image,
          color: "text-cyan-400",
          bg: "group-hover:bg-cyan-500/20 bg-cyan-500/10",
          border: "border-cyan-500/20",
        };
      default:
        return {
          icon: FileText,
          color: "text-slate-400",
          bg: "group-hover:bg-slate-700/50 bg-slate-800/50",
          border: "border-slate-700",
        };
    }
  };

  const openVkSearch = () => {
    const url = `https://vk.com/board203785966?act=search&q=${encodeURIComponent(searchQuery)}`;
    if ((window as any).shell && (window as any).shell.openExternal) {
      (window as any).shell.openExternal(url);
    } else {
      window.open(url, "_blank");
    }
  };

  if (!syncedData) {
    return (
      <div className="flex-1 p-8 flex flex-col pt-6 animate-fade-in overflow-y-auto custom-scrollbar">
        <div className="flex-1 flex flex-col items-center justify-center -mt-20">
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 border border-slate-700 shadow-lg shadow-blue-900/10">
            <Folder className="text-slate-500" size={32} />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">
            {t.library.empty}
          </h2>
          <p className="text-slate-400 mb-8 font-medium text-center max-w-md px-6">
            {t.library.emptyDescription}
          </p>

          {error && (
            <div className="mb-6 flex items-center gap-2 text-rose-400 bg-rose-500/10 px-4 py-2 rounded-lg border border-rose-500/20">
              <AlertCircle size={16} />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <button
            onClick={handleSync}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-8 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/40 text-sm tracking-wide uppercase"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            {isLoading ? t.library.syncing : t.library.syncButton}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full animate-fade-in overflow-hidden">
      {/* Header / Breadcrumbs - Fixed */}
      <div className="w-full flex-shrink-0 z-10 bg-[#050B14]/95 backdrop-blur-xl border-b border-slate-800/50 shadow-sm">
        <div className="w-full px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between text-sm min-h-[32px]">
            <div className="flex items-center gap-2 overflow-x-auto flex-nowrap flex-1 min-w-0 pr-2 custom-scrollbar-none">
              {!isSearching && (
                <>
                  <button
                    onClick={clearNav}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${navPath.length === 0
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                      }`}
                    title="Accueil"
                  >
                    <Home size={16} />
                  </button>

                  {breadcrumbs.map((crumb, idx) => {
                    if (crumb.isEllipsis) {
                      return (
                        <div
                          key={`ellipsis-${idx}`}
                          className="flex items-center gap-2 text-slate-500"
                        >
                          <ChevronRight size={14} className="text-slate-600" />
                          <span className="text-xs">...</span>
                        </div>
                      );
                    }

                    const node = crumb.node as VkNode;
                    const index = crumb.originalIndex as number;

                    return (
                      <div
                        key={node.id}
                        className="flex items-center gap-2 whitespace-nowrap"
                      >
                        <ChevronRight size={14} className="text-slate-600" />
                        <button
                          onClick={() =>
                            index === navPath.length - 1
                              ? undefined
                              : navigateUp(index)
                          }
                          className={`font-medium transition-colors max-w-[180px] truncate text-left ${index === navPath.length - 1
                            ? "text-white cursor-default"
                            : "text-slate-500 hover:text-slate-300"
                            }`}
                        >
                          {getDisplayTitle(node)}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
              {isSearching && (
                <div className="flex items-center gap-2">
                  <div className="text-white font-medium">
                    {t.library.searching}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {fileNodes.length > 0 && (
                <button
                  onClick={handleGlobalAction}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-lg ${hasActiveDownloads
                    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/20"
                    : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20"
                    }`}
                  title={
                    hasActiveDownloads
                      ? t.library.cancelAll
                      : t.library.downloadAll
                  }
                >
                  {hasActiveDownloads ? (
                    <X size={14} />
                  ) : (
                    <DownloadCloud size={14} />
                  )}
                  <span className="hidden sm:inline">
                    {hasActiveDownloads
                      ? t.library.cancelAll
                      : t.library.downloadAll}
                  </span>
                </button>
              )}
              {!hasFullSynced && (
                <button
                  onClick={handleFullSync}
                  className="flex items-center overflow-hidden rounded-lg transition-all border border-orange-500/20 text-xs font-bold"
                  title={t.library.syncAllWarning}
                  disabled={isLoading}
                >
                  <div className="flex items-center justify-center px-2 py-2">
                    <AlertCircle
                      size={16}
                      className={`text-orange-400 ${isLoading ? "animate-pulse" : ""}`}
                    />
                  </div>
                  <div className="bg-amber-600 hover:bg-amber-500 px-3 py-2 text-white transition-colors hidden sm:block">
                    {t.library.syncAllButton}
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
        <div className="w-full px-8 py-6 flex flex-col gap-6 min-h-full">
          {isLoading && (
            <div className="absolute inset-0 bg-[#050B14]/60 z-20 flex items-center justify-center backdrop-blur-sm">
              <RefreshCw className="animate-spin text-blue-500" size={40} />
            </div>
          )}

          {/* Folders Grid */}
          {folderNodes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {folderNodes.map((node) => {
                  const displayTitle = getDisplayTitle(node);
                  return (
                    <div
                      key={node.id}
                      onClick={() => navigateTo(node)}
                      className="bg-[#131926] rounded-lg border border-[#1e293b] flex flex-col transition-all hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 group cursor-pointer relative overflow-hidden"
                    >
                      <div className="p-5 flex-1 flex flex-col h-full">
                        <div className="flex justify-between items-start mb-6">
                          <span className="bg-[#1e293b] text-slate-400 text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide border border-slate-700/50">
                            DIR
                          </span>
                          <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide shadow-lg shadow-blue-900/50">
                            VK
                          </span>
                        </div>

                        <div className="flex justify-center mb-6">
                          <Folder className="text-blue-500 w-14 h-14 stroke-[1.5]" />
                        </div>

                        <div className="mt-auto">
                          <h3
                            className="text-white font-bold text-lg mb-3 leading-snug line-clamp-2"
                            title={node.title}
                          >
                            {displayTitle}
                          </h3>

                          <div className="flex flex-col gap-1.5 mb-6">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                              <span className="text-xs text-slate-400 font-medium capitalize truncate">
                                {node.type || "Category"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Folder
                                size={12}
                                className="text-slate-500 flex-shrink-0"
                              />
                              <span className="text-xs text-slate-500 font-medium">
                                Folder
                              </span>
                            </div>
                          </div>

                          <button className="w-full py-2.5 rounded border border-[#2d3748] text-[11px] font-bold text-slate-400 uppercase tracking-widest hover:bg-[#1f2937] hover:text-white hover:border-slate-500 transition-all">
                            {t.library.openFolder}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Files List Box - responsive, type "Settings card" */}
          {fileNodes.length > 0 && (
            <div className="bg-[#0f1523] border border-[#1e293b] rounded-xl shadow-lg overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-[#0f1523] sticky top-0 z-10">
                <span className="font-semibold text-slate-200">
                  {t.library.fileLabel} · {fileNodes.length}
                </span>
                {activeDownloadsInView.length > 0 && (
                  <span className="hidden sm:inline-block">
                    {activeDownloadsInView.length} en cours / en file d'attente
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-800">
                {fileNodes.map((node) => {
                  const displayTitle = getDisplayTitle(node);
                  const fileConfig = getFileIconConfig(node.extension);
                  const FileIcon = fileConfig.icon;

                  const activeDownload = downloadsById.get(node.id);
                  const isDownloading =
                    activeDownload &&
                    ["pending", "downloading", "paused"].includes(
                      activeDownload.status,
                    );
                  const isCompleted =
                    activeDownload && activeDownload.status === "completed";

                  const showProgress = Boolean(isDownloading);
                  const progress = activeDownload?.progress || 0;
                  const statusText =
                    activeDownload?.status === "paused"
                      ? "Pause"
                      : activeDownload?.speed || "0 MB/s";

                  return (
                    <div
                      key={node.id}
                      onClick={() => {
                        if (!isDownloading && !isCompleted) navigateTo(node);
                      }}
                      className="group px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-[#131926] transition-colors cursor-pointer"
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${fileConfig.bg}`}
                        >
                          {isCompleted ? (
                            <Check className="text-emerald-400 w-5 h-5" />
                          ) : (
                            <FileIcon
                              className={`${fileConfig.color} w-5 h-5 group-hover:scale-110 transition-transform duration-300`}
                            />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="flex items-start justify-between gap-2">
                            <h3
                              className="text-slate-200 font-semibold text-sm leading-snug line-clamp-2 break-words pr-2 group-hover:text-white transition-colors flex-1 min-w-0"
                              title={node.title}
                            >
                              {displayTitle}
                            </h3>
                            {!showProgress && !isCompleted && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 bg-slate-800/50 uppercase flex-shrink-0">
                                {node.extension || "FILE"}
                              </span>
                            )}
                            {isCompleted && (
                              <span className="text-[10px] font-bold text-emerald-500 uppercase flex-shrink-0">
                                {t.downloads.completed}
                              </span>
                            )}
                          </div>

                          {showProgress && (
                            <div className="mt-2 flex items-center gap-3">
                              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${activeDownload?.status === "paused"
                                    ? "bg-amber-500"
                                    : "bg-blue-500"
                                    }`}
                                  style={{ width: `${Math.max(0, progress)}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap min-w-[48px] text-right">
                                {progress}%
                              </span>
                              <span className="hidden md:inline-block text-[10px] text-slate-500 w-[70px] text-right truncate">
                                {statusText}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                        {showProgress ? (
                          <>
                            {activeDownload?.status === "paused" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resumeDownload(node.id);
                                }}
                                className="p-1.5 rounded-full hover:bg-slate-700 text-slate-300"
                              >
                                <Play size={14} fill="currentColor" />
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  pauseDownload(node.id);
                                }}
                                className="p-1.5 rounded-full hover:bg-slate-700 text-slate-300"
                              >
                                <Pause size={14} fill="currentColor" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelDownload(node.id);
                              }}
                              className="p-1.5 rounded-full hover:bg-rose-900/30 text-rose-400"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            {!isCompleted && (
                              <button
                                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-900/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateTo(node);
                                }}
                              >
                                <DownloadCloud size={14} />
                                <span className="hidden lg:inline">
                                  {t.library.downloadFile}
                                </span>
                              </button>
                            )}
                            {isCompleted && (
                              <button
                                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold flex items-center gap-2 border border-slate-600 shadow-lg shadow-slate-900/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  retryDownload(node.id);
                                }}
                                title={t.downloads.redownload}
                              >
                                <RefreshCw size={14} />
                                <span className="hidden lg:inline">
                                  {t.downloads.redownload}
                                </span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {displayedNodes.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              {isSearching ? (
                <div className="bg-[#131926] border border-[#1e293b] rounded-xl p-8 max-w-lg w-full shadow-2xl flex flex-col items-center text-center animate-fade-in">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-6">
                    <Search className="text-blue-500 w-8 h-8" />
                  </div>

                  <h3 className="text-white text-lg font-bold mb-2">
                    {t.library.noResults}
                  </h3>

                  <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                    Vous n'avez probablement pas encore synchronisé ce dossier.
                    <br />
                    Voulez-vous continuer votre recherche directement sur VK ?
                  </p>

                  <button
                    onClick={openVkSearch}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 group"
                  >
                    <span className="uppercase text-xs tracking-wider">
                      Rechercher sur VK
                    </span>
                    <ChevronRight
                      size={14}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </button>
                </div>
              ) : (
                <div className="text-slate-500 italic">
                  {t.library.noResults}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(BrowserView);
