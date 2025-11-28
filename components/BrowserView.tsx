import React, { useState } from 'react';
import { VkConnectionStatus, VkNode } from '../types';
import { fetchRootIndex, fetchNodeContent } from '../utils/vk-service';
import { RefreshCw, Folder, ChevronRight, AlertCircle, Home, DownloadCloud, FileText } from 'lucide-react';
import { useTranslation } from '../i18n';

interface BrowserViewProps {
  vkToken: string;
  syncedData: VkNode[] | null;
  setSyncedData: (data: VkNode[]) => void;
  searchQuery: string;
  onVkStatusChange: (status: VkConnectionStatus) => void;
  addDownload: (node: VkNode) => void;
}

const BrowserView: React.FC<BrowserViewProps> = ({ vkToken, syncedData, setSyncedData, searchQuery, onVkStatusChange, addDownload }) => {
  const { t, language } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navPath, setNavPath] = useState<VkNode[]>([]);

  const openNodeUrl = (url: string) => {
    if (!url) return;
    if (window.shell?.openExternal) {
      window.shell.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSync = async () => {
    if (!vkToken) {
      setError("Veuillez configurer un Token VK dans les parametres.");
      onVkStatusChange({ connected: false, latencyMs: null, lastSync: null });
      return;
    }
    setError(null);
    setIsLoading(true);
    setNavPath([]);
    try {
      const start = performance.now();
      const data = await fetchRootIndex(vkToken);
      setSyncedData(data);
      const latency = Math.round(performance.now() - start);
      onVkStatusChange({ connected: true, latencyMs: latency, lastSync: new Date().toISOString() });
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la connexion a VK. Verifiez votre token.");
      onVkStatusChange({ connected: false, latencyMs: null, lastSync: null });
    } finally {
      setIsLoading(false);
    }
  };

  const navigateTo = async (node: VkNode) => {
    if (node.type === 'file' && node.url) {
      addDownload(node);
      return;
    }

    if (node.children && node.children.length > 0) {
      setNavPath([...navPath, node]);
      return;
    }

    if (!node.isLoaded) {
      setIsLoading(true);
      try {
        const updatedNode = await fetchNodeContent(vkToken, node);
        const updateTree = (nodes: VkNode[]): VkNode[] => {
          return nodes.map((n) => {
            if (n.id === node.id) return updatedNode;
            if (n.children) return { ...n, children: updateTree(n.children) };
            return n;
          });
        };

        if (syncedData) {
          setSyncedData(updateTree(syncedData));
        }
        setNavPath([...navPath, updatedNode]);
      } catch (err) {
        setError("Impossible de charger le contenu.");
      } finally {
        setIsLoading(false);
      }
    } else {
      setNavPath([...navPath, node]);
    }
  };

  const navigateUp = (index?: number) => {
    if (index === undefined) {
      setNavPath(navPath.slice(0, -1));
    } else {
      setNavPath(navPath.slice(0, index + 1));
    }
  };

  const clearNav = () => setNavPath([]);

  const handleDownloadAll = () => {
    const files = displayedNodes?.filter(n => n.type === 'file');
    if (!files) return;
    files.forEach(node => {
      addDownload(node);
    });
  };

  const getDisplayTitle = (node: VkNode) => {
    let title = node.title;

    // Gestion des titres multilingues (ex: "Français / English")
    // On suppose que c'est un titre racine s'il contient un slash
    if (title.includes('/')) {
      const parts = title.split('/');
      if (parts.length >= 2) {
        if (language === 'fr') {
          title = parts[0].trim();
        } else {
          // Pour l'anglais (ou autre), on prend la partie après le slash
          title = parts.slice(1).join('/').trim();
        }
      }
    }

    // Nettoyage : supprimer les tirets ou underscores au début (ex: "- Adulte" -> "Adulte")
    // On enlève le caractère et les espaces éventuels qui suivent
    title = title.replace(/^[-_]\s*/, '');

    return title;
  };

  if (!syncedData) {
    // ... (keep existing empty state return)
    return (
      <div className="flex-1 flex flex-col items-center justify-center -mt-20 animate-fade-in">
        <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 border border-slate-700 shadow-lg shadow-blue-900/10">
          <Folder className="text-slate-500" size={32} />
        </div>
        <h2 className="text-white text-xl font-bold mb-2">{t.library.empty}</h2>
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
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? t.library.syncing : t.library.syncButton}
        </button>
      </div>
    );
  }

  const currentViewNodes = navPath.length === 0 ? syncedData : navPath[navPath.length - 1].children;

  const isSearching = searchQuery.length > 0;
  const displayedNodes =
    isSearching && syncedData
      ? currentViewNodes?.filter((n) => n.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : currentViewNodes;

  return (
    <div className="flex-1 flex flex-col px-6 pb-6 pt-6 overflow-hidden">
      <div className="mt-6 mb-6 flex items-center justify-between text-sm min-h-[32px]">
        <div className="flex items-center gap-2 overflow-hidden">
          {!isSearching && (
            <>
              <button
                onClick={clearNav}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${navPath.length === 0
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                title="Accueil"
              >
                <Home size={16} />
              </button>

              {navPath.map((node, index) => (
                <div key={node.id} className="flex items-center gap-2 whitespace-nowrap">
                  <ChevronRight size={14} className="text-slate-600" />
                  <button
                    onClick={() => (index === navPath.length - 1 ? {} : navigateUp(index))}
                    className={`font-medium transition-colors ${index === navPath.length - 1 ? 'text-white cursor-default' : 'text-slate-500 hover:text-slate-300'
                      }`}
                  >
                    {getDisplayTitle(node)}
                  </button>
                </div>
              ))}
            </>
          )}
          {isSearching && <div className="text-white font-medium">{t.library.searching}</div>}
        </div>

        <div className="flex items-center gap-2">
          {displayedNodes?.some(n => n.type === 'file') && (
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-blue-900/20"
              title={t.library.downloadAll}
            >
              <DownloadCloud size={14} />
              <span className="hidden sm:inline">{t.library.downloadAll}</span>
            </button>
          )}
          <button
            onClick={handleSync}
            className="text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-lg transition-all"
            title="Actualiser l'index"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-y-auto pr-2 custom-scrollbar pb-10 pt-4">
        {isLoading && (
          <div className="absolute inset-0 bg-[#050B14]/60 z-10 flex items-center justify-center backdrop-blur-sm rounded-xl">
            <RefreshCw className="animate-spin text-blue-500" size={40} />
          </div>
        )}

        {/* Folders Grid */}
        {displayedNodes?.filter(n => n.type !== 'file').length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 mb-8">
            {displayedNodes
              .filter(n => n.type !== 'file')
              .map((node) => {
                const displayTitle = getDisplayTitle(node);
                return (
                  <div
                    key={node.id}
                    onClick={() => navigateTo(node)}
                    className="bg-[#111827] rounded-xl border border-slate-800 p-5 relative flex flex-col transition-all hover:border-blue-500/40 shadow-xl group cursor-pointer hover:-translate-y-1 duration-300"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <span className="bg-[#1f2937] border border-slate-700 text-[10px] font-bold px-2 py-1 rounded text-slate-300 tracking-wider">
                        DIR
                      </span>
                      <span className="bg-blue-600 text-[10px] font-bold px-2 py-1 rounded text-white tracking-wider shadow-lg shadow-blue-900/50">
                        VK
                      </span>
                    </div>

                    <div className="flex justify-center mb-6 relative">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full blur-2xl opacity-0 group-hover:opacity-40 transition-opacity duration-500 bg-blue-500"></div>
                      <Folder className="text-blue-400 w-16 h-16 stroke-[1.5] group-hover:scale-105 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(96,165,250,0.3)]" />
                    </div>

                    <div className="flex-1 mb-4 text-center">
                      <h3 className="text-white font-bold text-lg mb-1 truncate px-2" title={node.title}>
                        {displayTitle}
                      </h3>
                      <div className="text-xs text-slate-400">
                        {t.library.folderLabel}
                      </div>
                    </div>

                    <button className="w-full border border-slate-700/50 rounded py-2 text-xs font-bold text-slate-400 group-hover:bg-slate-800 group-hover:text-white group-hover:border-slate-600 transition-all uppercase tracking-wider flex items-center justify-center gap-2">
                      <Folder size={14} />
                      {t.library.openFolder}
                    </button>
                  </div>
                );
              })}
          </div>
        )}

        {/* Files List */}
        {displayedNodes?.filter(n => n.type === 'file').length > 0 && (
          <div className="flex flex-col gap-2">
            {displayedNodes
              .filter(n => n.type === 'file')
              .map((node) => {
                const displayTitle = getDisplayTitle(node);
                return (
                  <div
                    key={node.id}
                    onClick={() => navigateTo(node)}
                    className="group flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-[#0f1523] hover:border-purple-500/40 hover:bg-[#161e2e] transition-all duration-200 cursor-pointer shadow-lg w-full overflow-hidden"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-800/50 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors flex-shrink-0">
                      <FileText className="text-purple-400 w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-slate-200 font-semibold text-sm truncate pr-2 group-hover:text-white transition-colors" title={node.title}>
                        {displayTitle}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 bg-slate-800/50 uppercase flex-shrink-0">
                          {node.extension || 'FILE'}
                        </span>
                        <span className="text-[10px] text-slate-500 truncate">
                          {t.library.fileLabel}
                        </span>
                      </div>
                    </div>

                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-900/20 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateTo(node);
                      }}
                    >
                      <DownloadCloud size={14} />
                      <span className="hidden lg:inline">{t.library.downloadFile}</span>
                    </button>
                  </div>
                );
              })}
          </div>
        )}

        {displayedNodes?.length === 0 && !isLoading && (
          <div className="col-span-full text-center py-12 text-slate-500 italic">{t.library.noResults}</div>
        )}
      </div>
    </div>
  );
};

export default BrowserView;
