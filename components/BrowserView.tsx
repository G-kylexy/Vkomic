
import React, { useState } from 'react';
import { VkNode } from '../types';
import { fetchRootIndex, fetchNodeContent } from '../utils/vk-service';
import { RefreshCw, Folder, ChevronRight, BookOpen, AlertCircle, Home, DownloadCloud, FileText } from 'lucide-react';

interface BrowserViewProps {
  vkToken: string;
  syncedData: VkNode[] | null;
  setSyncedData: (data: VkNode[]) => void;
  searchQuery: string;
}

const BrowserView: React.FC<BrowserViewProps> = ({ vkToken, syncedData, setSyncedData, searchQuery }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Fil d'Ariane (Breadcrumbs) : Historique de navigation (ex: Accueil > Manga > Naruto)
  const [navPath, setNavPath] = useState<VkNode[]>([]);

  const openNodeUrl = (url: string) => {
    if (!url) return;
    if (window.shell?.openExternal) {
      window.shell.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };
  
  // --- SYNCHRONISATION INITIALE ---
  // Appelle l'API VK pour charger la racine de l'index
  const handleSync = async () => {
    if (!vkToken) {
      setError("Veuillez configurer un Token VK dans les paramètres.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setNavPath([]); // Reset navigation
    try {
      const data = await fetchRootIndex(vkToken);
      setSyncedData(data);
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la connexion à VK. Vérifiez votre token.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- NAVIGATION ET LAZY LOADING ---
  // Gère le clic sur une carte (Dossier ou Fichier)
  const navigateTo = async (node: VkNode) => {
    // CAS 1 : C'est un FICHIER -> On lance le téléchargement (ouvre dans le navigateur)
    if (node.type === 'file' && node.url) {
        openNodeUrl(node.url);
        return;
    }

    // CAS 2 : Dossier déjà chargé -> On entre dedans simplement
    if (node.children && node.children.length > 0) {
      setNavPath([...navPath, node]);
      return;
    }

    // CAS 3 : Dossier non chargé -> On appelle l'API (Lazy Loading)
    if (!node.isLoaded) {
      setIsLoading(true);
      try {
        const updatedNode = await fetchNodeContent(vkToken, node);
        
        // Mise à jour récursive de l'arbre global avec les nouvelles données
        const updateTree = (nodes: VkNode[]): VkNode[] => {
          return nodes.map(n => {
            if (n.id === node.id) return updatedNode;
            if (n.children) return { ...n, children: updateTree(n.children) };
            return n;
          });
        };

        if (syncedData) {
            setSyncedData(updateTree(syncedData));
        }

        // On entre dans le dossier une fois chargé
        setNavPath([...navPath, updatedNode]);

      } catch (err) {
        setError("Impossible de charger le contenu.");
      } finally {
        setIsLoading(false);
      }
    } else {
      // Cas rare : Dossier vide mais marqué comme chargé
      setNavPath([...navPath, node]);
    }
  };

  // Remonter dans l'arborescence (Fil d'ariane)
  const navigateUp = (index?: number) => {
    if (index === undefined) {
        setNavPath(navPath.slice(0, -1));
    } else {
        setNavPath(navPath.slice(0, index + 1));
    }
  };

  const clearNav = () => setNavPath([]);

  // --- RENDU : ÉTAT VIDE ---
  if (!syncedData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center -mt-20 animate-fade-in">
        <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 border border-slate-700 shadow-lg shadow-blue-900/10">
           <Folder className="text-slate-500" size={32} />
        </div>
        <h2 className="text-white text-xl font-bold mb-2">Bibliothèque vide</h2>
        <p className="text-slate-400 mb-8 font-medium text-center max-w-md px-6">
           Synchronisez l'application avec l'index VK pour accéder aux BDs.
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
          {isLoading ? 'Synchronisation...' : 'Synchroniser depuis VK'}
        </button>
      </div>
    );
  }

  // --- RENDU : EXPLORATEUR ---
  // Détermine quels noeuds afficher (Racine ou enfants du dossier courant)
  const currentViewNodes = navPath.length === 0 
    ? syncedData 
    : navPath[navPath.length - 1].children;

  // Filtrage par recherche
  const isSearching = searchQuery.length > 0;
  const displayedNodes = isSearching && syncedData
    ? currentViewNodes?.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : currentViewNodes;

  return (
    <div className="flex-1 flex flex-col px-6 pb-6 overflow-hidden">
      
      {/* Barre d'outils / Fil d'Ariane */}
      <div className="mt-6 mb-6 flex items-center justify-between text-sm min-h-[32px]">
        <div className="flex items-center gap-2 overflow-hidden">
          {!isSearching && (
            <>
              {/* BOUTON HOME */}
              <button 
                  onClick={clearNav}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${navPath.length === 0 ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                  title="Accueil"
              >
                  <Home size={16} />
              </button>
              
              {/* Étapes du chemin (Breadcrumbs) */}
              {navPath.map((node, index) => (
                  <div key={node.id} className="flex items-center gap-2 whitespace-nowrap">
                      <ChevronRight size={14} className="text-slate-600" />
                      <button 
                          onClick={() => index === navPath.length - 1 ? {} : navigateUp(index)}
                          className={`font-medium transition-colors ${index === navPath.length - 1 ? 'text-white cursor-default' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                          {node.title}
                      </button>
                  </div>
              ))}
            </>
          )}
          {isSearching && (
               <div className="text-white font-medium">
                  Recherche dans le dossier actuel...
               </div>
          )}
        </div>

        {/* Bouton Actualiser */}
        <button 
            onClick={handleSync}
            className="text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-lg transition-all"
            title="Actualiser l'index"
        >
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* GRILLE DES DOSSIERS / FICHIERS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 overflow-y-auto pr-2 custom-scrollbar pb-10 pt-4 content-start relative">
        
        {/* Overlay de chargement */}
        {isLoading && (
            <div className="absolute inset-0 bg-[#050B14]/60 z-10 flex items-center justify-center backdrop-blur-sm rounded-xl">
                <RefreshCw className="animate-spin text-blue-500" size={40} />
            </div>
        )}

        {displayedNodes?.map((node) => {
            const isFile = node.type === 'file';
            const isFolder = !isFile;
            
            return (
              <div
                key={node.id}
                onClick={() => navigateTo(node)}
                className="bg-[#111827] rounded-xl border border-slate-800 p-5 relative flex flex-col transition-all hover:border-blue-500/40 shadow-xl group cursor-pointer hover:-translate-y-1 duration-300"
              >
                {/* Badges (DIR / VK / DOC) */}
                <div className="flex justify-between items-start mb-8">
                    <span className="bg-[#1f2937] border border-slate-700 text-[10px] font-bold px-2 py-1 rounded text-slate-300 tracking-wider">
                        {isFile ? (node.extension || 'DOC') : 'DIR'}
                    </span>
                    <span className="bg-blue-600 text-[10px] font-bold px-2 py-1 rounded text-white tracking-wider shadow-lg shadow-blue-900/50">
                        VK
                    </span>
                </div>

                {/* Icône Centrale avec effet lumineux */}
                <div className="flex justify-center mb-8 relative">
                    <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full blur-2xl opacity-0 group-hover:opacity-40 transition-opacity duration-500 ${isFolder ? 'bg-blue-500' : 'bg-purple-500'}`}></div>
                    
                    {isFolder ? (
                        <Folder className="text-blue-400 w-20 h-20 stroke-[1.5] group-hover:scale-105 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(96,165,250,0.3)]" />
                    ) : (
                        <FileText className="text-purple-400 w-20 h-20 stroke-[1.5] group-hover:scale-105 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(192,132,252,0.3)]" />
                    )}
                </div>

                {/* Titre et Type */}
                <div className="flex-1 mb-4">
                    <h3 className="text-white font-bold text-lg mb-2 truncate" title={node.title}>
                        {node.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${isFolder ? 'bg-blue-400 shadow-[0_0_5px_rgba(96,165,250,0.8)]' : 'bg-purple-400 shadow-[0_0_5px_rgba(192,132,252,0.8)]'}`}></div>
                        <span className="capitalize text-slate-400">{isFolder ? 'Dossier' : 'Fichier'}</span>
                    </div>
                </div>

                {/* Bouton Action */}
                <button className="w-full border border-slate-700/50 rounded py-2 text-xs font-bold text-slate-400 group-hover:bg-slate-800 group-hover:text-white group-hover:border-slate-600 transition-all uppercase tracking-wider flex items-center justify-center gap-2">
                    {isFile && <DownloadCloud size={14} />}
                    {isFolder ? 'OUVRIR' : 'TÉLÉCHARGER'}
                </button>
              </div>
            );
        })}
        
        {displayedNodes?.length === 0 && !isLoading && (
            <div className="col-span-full text-center py-12 text-slate-500 italic">
                Ce dossier est vide ou aucun résultat trouvé.
            </div>
        )}
      </div>
    </div>
  );
};

export default BrowserView;
