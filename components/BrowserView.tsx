import React, { useState } from 'react';
import {VkConnectionStatus, VkNode, DownloadItem} from '../types';
import {fetchNodeContent, fetchRootIndex} from '../utils/vk-service';
import {AlertCircle, ChevronRight, DownloadCloud, FileText, Folder, Home, RefreshCw, FileArchive, BookOpen, Image, Pause, Play, X, Check} from './Icons';
import {useTranslation} from '../i18n';

interface BrowserViewProps {
  vkToken: string;
  syncedData: VkNode[] | null;
  setSyncedData: (data: VkNode[]) => void;
  searchQuery: string;
  onVkStatusChange: (status: VkConnectionStatus) => void;
  addDownload: (node: VkNode) => void;
  downloads: DownloadItem[];
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
}

const BrowserView: React.FC<BrowserViewProps> = ({ 
  vkToken, 
  syncedData, 
  setSyncedData, 
  searchQuery, 
  onVkStatusChange, 
  addDownload, 
  downloads,
  pauseDownload,
  resumeDownload,
  cancelDownload
}) => {
  const { t, language } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navPath, setNavPath] = useState<VkNode[]>([]);

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

  // Calcul des noeuds affichés
  const currentViewNodes = navPath.length === 0 ? syncedData : navPath[navPath.length - 1].children;
  const isSearching = searchQuery.length > 0;
  const displayedNodes =
    isSearching && syncedData
      ? currentViewNodes?.filter((n) => n.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : currentViewNodes;

  // Logique du bouton "Tout télécharger" / "Tout annuler"
  const fileNodes = displayedNodes?.filter(n => n.type === 'file') || [];
  
  // On regarde s'il y a des téléchargements actifs (en cours, en pause ou en attente) parmi les fichiers visibles
  const activeDownloadsInView = fileNodes.filter(node => {
      const d = downloads.find(down => down.id === node.id);
      return d && ['pending', 'downloading', 'paused'].includes(d.status);
  });

  const hasActiveDownloads = activeDownloadsInView.length > 0;

  const handleGlobalAction = () => {
      if (hasActiveDownloads) {
          // Si des téléchargements sont en cours, on annule tout
          activeDownloadsInView.forEach(node => cancelDownload(node.id));
      } else {
          // Sinon on lance le téléchargement pour ceux qui ne sont pas déjà terminés
          fileNodes.forEach(node => {
              const d = downloads.find(down => down.id === node.id);
              if (!d || d.status !== 'completed') {
                  addDownload(node);
              }
          });
      }
  };

  const getDisplayTitle = (node: VkNode) => {
    let title = node.title;

    // Gestion des titres multilingues (ex: "Français / English")
    if (title.includes('/')) {
      const parts = title.split('/');
      if (parts.length >= 2) {
        if (language === 'fr') {
          title = parts[0].trim();
        } else {
          title = parts.slice(1).join('/').trim();
        }
      }
    }

    title = title.replace(/^[-_]\s*/, '');
    return title;
  };

  // Helper pour les icônes de fichiers
  const getFileIconConfig = (extension?: string) => {
    const ext = extension?.toUpperCase() || '';
    switch (ext) {
      case 'PDF':
        return { 
          icon: FileText, 
          color: 'text-rose-400', 
          bg: 'group-hover:bg-rose-500/20 bg-rose-500/10',
          border: 'border-rose-500/20'
        };
      case 'CBZ':
      case 'CBR':
        return { 
          icon: BookOpen, 
          color: 'text-purple-400', 
          bg: 'group-hover:bg-purple-500/20 bg-purple-500/10',
          border: 'border-purple-500/20'
        };
      case 'ZIP':
      case 'RAR':
      case '7Z':
        return { 
          icon: FileArchive, 
          color: 'text-amber-400', 
          bg: 'group-hover:bg-amber-500/20 bg-amber-500/10',
          border: 'border-amber-500/20'
        };
      case 'JPG':
      case 'PNG':
      case 'JPEG':
        return { 
          icon: Image, 
          color: 'text-cyan-400', 
          bg: 'group-hover:bg-cyan-500/20 bg-cyan-500/10',
          border: 'border-cyan-500/20'
        };
      default:
        return { 
          icon: FileText, 
          color: 'text-slate-400', 
          bg: 'group-hover:bg-slate-700/50 bg-slate-800/50',
          border: 'border-slate-700'
        };
    }
  };

  if (!syncedData) {
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

  return (
    <div className="flex-1 flex flex-col px-6 pb-6 pt-6 overflow-hidden">
      <div className="mt-2 mb-6 flex items-center justify-between text-sm min-h-[32px]">
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
          {/* Global Action Button (Download/Cancel All) */}
          {displayedNodes?.some(n => n.type === 'file') && (
            <button
              onClick={handleGlobalAction}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-lg ${
                  hasActiveDownloads 
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/20' 
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
              }`}
              title={hasActiveDownloads ? t.library.cancelAll : t.library.downloadAll}
            >
              {hasActiveDownloads ? <X size={14} /> : <DownloadCloud size={14} />}
              <span className="hidden sm:inline">
                  {hasActiveDownloads ? t.library.cancelAll : t.library.downloadAll}
              </span>
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

      <div className="flex-1 relative overflow-y-auto pr-2 custom-scrollbar pb-10 pt-2">
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
                    className="bg-[#131926] rounded-lg border border-[#1e293b] flex flex-col transition-all hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 group cursor-pointer relative overflow-hidden"
                  >
                    <div className="p-5 flex-1 flex flex-col h-full">
                      {/* Top Badges */}
                      <div className="flex justify-between items-start mb-6">
                        <span className="bg-[#1e293b] text-slate-400 text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide border border-slate-700/50">
                          DIR
                        </span>
                        <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide shadow-lg shadow-blue-900/50">
                          VK
                        </span>
                      </div>

                      {/* Icon */}
                      <div className="flex justify-center mb-6">
                         <Folder className="text-blue-500 w-14 h-14 stroke-[1.5]" />
                      </div>

                      {/* Content */}
                      <div className="mt-auto">
                        <h3 className="text-white font-bold text-lg mb-3 leading-snug line-clamp-2" title={node.title}>
                          {displayTitle}
                        </h3>
                        
                        <div className="flex flex-col gap-1.5 mb-6">
                           <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></span>
                              <span className="text-xs text-slate-400 font-medium capitalize truncate">{node.type || 'Category'}</span>
                           </div>
                           <div className="flex items-center gap-2">
                              <Folder size={12} className="text-slate-500 flex-shrink-0" />
                              <span className="text-xs text-slate-500 font-medium">Folder</span>
                           </div>
                        </div>

                        {/* Button */}
                        <button className="w-full py-2.5 rounded border border-[#2d3748] text-[11px] font-bold text-slate-400 uppercase tracking-widest hover:bg-[#1f2937] hover:text-white hover:border-slate-500 transition-all">
                            OPEN
                        </button>
                      </div>
                    </div>
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
                const fileConfig = getFileIconConfig(node.extension);
                const FileIcon = fileConfig.icon;

                // Check download status
                const activeDownload = downloads.find(d => d.id === node.id);
                const isDownloading = activeDownload && ['pending', 'downloading', 'paused'].includes(activeDownload.status);
                const isCompleted = activeDownload && activeDownload.status === 'completed';
                
                const showProgress = isDownloading;
                const progress = activeDownload?.progress || 0;
                const statusText = activeDownload?.status === 'paused' ? 'Pause' : activeDownload?.speed || '0 MB/s';

                return (
                  <div
                    key={node.id}
                    onClick={() => {
                        if (!isDownloading && !isCompleted) navigateTo(node);
                    }}
                    className={`group flex items-center gap-3 p-3 rounded-lg border border-[#1e293b] bg-[#131926] hover:border-opacity-50 transition-all duration-200 cursor-pointer shadow-sm w-full overflow-hidden hover:bg-[#1a2130] ${fileConfig.border}`}
                  >
                    <div className={`w-10 h-10 rounded flex items-center justify-center transition-colors flex-shrink-0 ${fileConfig.bg}`}>
                      {isCompleted ? (
                          <Check className="text-emerald-400 w-5 h-5" />
                      ) : (
                          <FileIcon className={`${fileConfig.color} w-5 h-5 group-hover:scale-110 transition-transform duration-300`} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <h3 className="text-slate-200 font-semibold text-sm truncate pr-2 group-hover:text-white transition-colors" title={node.title}>
                        {displayTitle}
                      </h3>
                      
                      {showProgress ? (
                         <div className="mt-1.5 w-full max-w-[200px] flex items-center gap-2">
                             <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                                 <div 
                                    className={`h-full ${activeDownload.status === 'paused' ? 'bg-amber-500' : 'bg-blue-500'}`} 
                                    style={{width: `${progress}%`}} 
                                 />
                             </div>
                             <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap min-w-[60px] text-right">{progress}%</span>
                             <span className="text-[9px] text-slate-500 hidden sm:inline-block">{statusText}</span>
                         </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-0.5">
                            {isCompleted ? (
                                <span className="text-[10px] font-bold text-emerald-500 uppercase">Téléchargé</span>
                            ) : (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 bg-slate-800/50 uppercase flex-shrink-0">
                                {node.extension || 'FILE'}
                                </span>
                            )}
                        </div>
                      )}
                    </div>

                    {showProgress ? (
                        <div className="flex items-center gap-1">
                             {activeDownload.status === 'paused' ? (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); resumeDownload(node.id); }}
                                    className="p-1.5 rounded-full hover:bg-slate-700 text-slate-300"
                                >
                                    <Play size={14} fill="currentColor" />
                                </button>
                             ) : (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); pauseDownload(node.id); }}
                                    className="p-1.5 rounded-full hover:bg-slate-700 text-slate-300"
                                >
                                    <Pause size={14} fill="currentColor" />
                                </button>
                             )}
                             <button 
                                onClick={(e) => { e.stopPropagation(); cancelDownload(node.id); }}
                                className="p-1.5 rounded-full hover:bg-rose-900/30 text-rose-400"
                             >
                                <X size={14} />
                             </button>
                        </div>
                    ) : (
                        !isCompleted && (
                            <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-900/20 flex-shrink-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                navigateTo(node);
                            }}
                            >
                            <DownloadCloud size={14} />
                            <span className="hidden lg:inline">{t.library.downloadFile}</span>
                            </button>
                        )
                    )}
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