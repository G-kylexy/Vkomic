import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import MainView from './components/MainView';
import { VkNode, VkConnectionStatus, DownloadItem } from './types';
import { TranslationProvider } from './i18n';
import { DEFAULT_DOWNLOAD_PATH } from './utils/constants';

const App: React.FC = () => {
  // --- GESTION DE L'ÉTAT GLOBAL ---

  // Onglet actif (Accueil, Téléchargements, etc.)
  const [activeTab, setActiveTab] = useState('home');
  // Barre de recherche
  const [searchQuery, setSearchQuery] = useState('');

  // Token VK : Initialisé depuis le LocalStorage du navigateur pour persister au rechargement
  const [vkToken, setVkToken] = useState(() => {
    return localStorage.getItem('vk_token') || '';
  });

  // Données synchronisées : L'arbre des dossiers/fichiers récupéré depuis VK
  const [syncedData, setSyncedData] = useState<VkNode[] | null>(null);
  // Chemin de téléchargement local choisi par l'utilisateur
  const [downloadPath, setDownloadPath] = useState(() => {
    return localStorage.getItem('vk_download_path') || DEFAULT_DOWNLOAD_PATH;
  });
  // Statut VK global (latence, dernière synchro, région)
  const [vkStatus, setVkStatus] = useState<VkConnectionStatus>({
    connected: false,
    latencyMs: null,
    lastSync: null,
    region: null,
    regionAggregate: null,
  });

  // Gestion des téléchargements
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  const addDownload = (node: VkNode) => {
    if (!node.url) return;
    const newDownload: DownloadItem = {
      id: node.id || Math.random().toString(36).substr(2, 9),
      title: node.title,
      url: node.url,
      progress: 0,
      status: 'pending',
      extension: node.extension,
    };
    setDownloads(prev => [newDownload, ...prev]);

    // Simulation de téléchargement pour l'instant
    setTimeout(() => {
      setDownloads(prev => prev.map(d => d.id === newDownload.id ? { ...d, status: 'downloading', progress: 10 } : d));
    }, 1000);
  };

  const pauseDownload = (id: string) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'paused' } : d));
  };

  const resumeDownload = (id: string) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'downloading' } : d));
  };

  const cancelDownload = (id: string) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'canceled' } : d));
  };

  // --- FONCTIONS UTILITAIRES ---

  // Wrapper pour sauvegarder le token dans le stockage local (Persistance)
  const handleSetVkToken = (token: string) => {
    setVkToken(token);
    localStorage.setItem('vk_token', token);
  };

  const handleSetDownloadPath = (path: string) => {
    setDownloadPath(path);
    localStorage.setItem('vk_download_path', path);
  };

  useEffect(() => {
    if (!vkToken) {
      setVkStatus({
        connected: false,
        latencyMs: null,
        lastSync: null,
        region: vkStatus.region ?? null,
        regionAggregate: vkStatus.regionAggregate ?? null,
      });
    }
  }, [vkToken]);

  useEffect(() => {
    // Déduit une région agrégée à partir de la timezone/locale
    const rawRegion =
      Intl?.DateTimeFormat?.().resolvedOptions().timeZone ||
      (typeof navigator !== 'undefined' ? navigator.language : null) ||
      null;

    const mapRegion = (value: string | null): string | null => {
      if (!value) return null;
      const upper = value.toUpperCase();
      if (upper.includes('EUROPE')) return 'Europe West';
      if (upper.includes('AMERICA')) {
        if (upper.includes('SOUTH') || upper.includes('ARGENTINA') || upper.includes('SAO_PAULO')) return 'South America';
        return 'North America';
      }
      if (upper.includes('PACIFIC')) return 'Pacific';
      if (upper.includes('ASIA')) return 'Asia';
      if (upper.includes('AFRICA')) return 'Africa';
      if (upper.includes('AUSTRALIA') || upper.includes('OCEANIA')) return 'Oceania';
      return 'Global';
    };

    const regionAggregate = mapRegion(rawRegion);

    // Mesure la latence vers VK toutes les secondes (via IPC pour éviter CORB côté renderer)
    const measurePing = async () => {
      try {
        let latency = null;

        if (window.vk?.ping) {
          const res = await window.vk.ping(vkToken || undefined);
          latency = res.latency !== null ? res.latency : null;
        } else {
          const start = performance.now();
          await fetch('https://vk.com/favicon.ico', { mode: 'no-cors', cache: 'no-store', method: 'HEAD' });
          latency = Math.round(performance.now() - start);
        }

        setVkStatus((prev) => ({
          ...prev,
          connected: true,
          latencyMs: latency,
          lastSync: new Date().toISOString(),
          region: rawRegion,
          regionAggregate,
        }));
      } catch (e) {
        setVkStatus((prev) => ({
          ...prev,
          connected: false,
          latencyMs: null,
          lastSync: prev.lastSync,
          region: rawRegion,
          regionAggregate,
        }));
      }
    };

    measurePing();
    const id = setInterval(measurePing, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <TranslationProvider>
      <div className="flex w-full h-screen bg-[#050B14] overflow-hidden font-sans text-slate-200">
        {/* Barre latérale gauche (Navigation) */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} vkStatus={vkStatus} />

        {/* Contenu Principal */}
        <div className="content-wrapper flex-1 flex flex-col h-full relative">
          {/* Effet visuel d'arrière-plan (Lueur bleue) */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

          {/* Barre du haut (Recherche & Fenêtre) */}
          <TopBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

          {/* Vue dynamique (Change selon l'onglet actif) */}
          <MainView
            searchQuery={searchQuery}
            activeTab={activeTab}
            vkToken={vkToken}
            setVkToken={handleSetVkToken}
            syncedData={syncedData}
            setSyncedData={setSyncedData}
            downloadPath={downloadPath}
            setDownloadPath={handleSetDownloadPath}
            onVkStatusChange={setVkStatus}
            downloads={downloads}
            addDownload={addDownload}
            pauseDownload={pauseDownload}
            resumeDownload={resumeDownload}
            cancelDownload={cancelDownload}
          />
        </div>
      </div>
    </TranslationProvider>
  );
};

export default App;
