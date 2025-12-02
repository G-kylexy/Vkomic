import React, { useEffect, useState, useRef } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import MainView from './components/MainView';
import { VkNode, VkConnectionStatus, DownloadItem } from './types';
import { TranslationProvider } from './i18n';
import { DEFAULT_DOWNLOAD_PATH } from './utils/constants';
import UpdateModal from './components/UpdateModal';

// REMPLACER PAR VOTRE DEPOT GITHUB (ex: 'username/repo')
const GITHUB_REPO = 'G-kylexy/Vkomic';

const MAX_CONCURRENT_DOWNLOADS = 5;

const formatBytes = (bytes?: number): string | undefined => {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

const formatSpeed = (bytesPerSecond?: number | null): string => {
  if (!bytesPerSecond || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return '0 MB/s';
  }
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
  }
  return `${bytesPerSecond.toFixed(0)} B/s`;
};

const App: React.FC = () => {
  // --- GESTION DE L'ÉTAT GLOBAL ---

  // État pour la mise à jour
  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    url: string;
    notes: string;
  } | null>(null);

  useEffect(() => {
    const checkUpdate = async () => {
      if ((window as any).app?.checkUpdate) {
        const result = await (window as any).app.checkUpdate(GITHUB_REPO);
        if (result.updateAvailable) {
          setUpdateInfo({
            version: result.version,
            url: result.url,
            notes: result.notes
          });
        }
      }
    };

    // Vérifier après 2 secondes pour ne pas ralentir le démarrage
    const timer = setTimeout(checkUpdate, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Onglet actif (Accueil, Téléchargements, etc.)
  const [activeTab, setActiveTab] = useState('home');
  // Barre de recherche
  const [searchQuery, setSearchQuery] = useState('');

  // Token VK : Initialisé depuis le LocalStorage du navigateur pour persister au rechargement
  const [vkToken, setVkToken] = useState(() => {
    return localStorage.getItem('vk_token') || '';
  });
  const [vkGroupId, setVkGroupId] = useState(() => {
    return localStorage.getItem('vk_group_id') || '203785966';
  });
  const [vkTopicId, setVkTopicId] = useState(() => {
    return localStorage.getItem('vk_topic_id') || '47515406';
  });

  // Données synchronisées : L'arbre des dossiers/fichiers récupéré depuis VK
  const [syncedData, setSyncedData] = useState<VkNode[] | null>(() => {
    try {
      const raw = localStorage.getItem('vk_synced_data');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed as VkNode[];
    } catch {
      return null;
    }
  });

  // Persistance des données synchronisées
  useEffect(() => {
    try {
      if (syncedData) {
        localStorage.setItem('vk_synced_data', JSON.stringify(syncedData));
      } else {
        localStorage.removeItem('vk_synced_data');
      }
    } catch (e) {
      console.error("Failed to save synced data", e);
    }
  }, [syncedData]);

  // État pour savoir si une synchronisation complète a déjà été effectuée
  const [hasFullSynced, setHasFullSynced] = useState(() => {
    return localStorage.getItem('vk_has_full_synced') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('vk_has_full_synced', String(hasFullSynced));
  }, [hasFullSynced]);

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
  const [downloads, setDownloads] = useState<DownloadItem[]>(() => {
    try {
      const raw = localStorage.getItem('vk_downloads');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      // On remet les téléchargements "en cours" en pause au démarrage
      // car le processus de téléchargement est perdu au rechargement
      return (parsed as DownloadItem[]).map(d =>
        d.status === 'downloading' ? { ...d, status: 'paused' } : d
      );
    } catch {
      return [];
    }
  });
  const downloadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Avoid repeating the missing download path alert when batch-triggering downloads
  const missingDownloadPathAlertedRef = useRef(false);

  const addDownload = (node: VkNode, subFolder?: string) => {
    if (!node.url) return;

    // Vérifier si un dossier de téléchargement est configuré
    if (!downloadPath || downloadPath === DEFAULT_DOWNLOAD_PATH) {
      if (!missingDownloadPathAlertedRef.current) {
        window.alert("Aucun dossier de telechargement n'est configure. Choisissez un chemin dans Parametres avant de lancer un telechargement.");
        missingDownloadPathAlertedRef.current = true;
      }
      // Ajouter un téléchargement avec statut "error" pour informer l'utilisateur
      const id = node.id || Math.random().toString(36).substr(2, 9);
      const formattedSize = formatBytes(node.sizeBytes);

      setDownloads((prev) => {
        const existingIndex = prev.findIndex((d) => d.id === id);
        if (existingIndex >= 0) return prev; // Ne pas créer de doublon

        const errorDownload: DownloadItem = {
          id,
          title: node.title,
          url: node.url,
          progress: 0,
          status: 'error',
          extension: node.extension,
          speed: 'Dossier non configuré',
          createdAt: new Date().toISOString(),
          size: formattedSize,
        };

        return [errorDownload, ...prev];
      });
      return;
    }

    const id = node.id || Math.random().toString(36).substr(2, 9);

    const formattedSize = formatBytes(node.sizeBytes);

    // Mise à jour fonctionnelle de la liste des téléchargements
    setDownloads((prev) => {
      const existingIndex = prev.findIndex((d) => d.id === id);
      const existing = existingIndex >= 0 ? prev[existingIndex] : undefined;

      // Si déjà en cours (file d'attente / pause / déjà terminé), on ne recrée pas un doublon
      if (existing && ['pending', 'downloading', 'paused', 'completed'].includes(existing.status)) {

        return prev;
      }

      const newDownload: DownloadItem = {
        id,
        title: node.title,
        url: node.url,
        progress: 0,
        status: 'pending',
        extension: node.extension,
        speed: '0 MB/s',
        createdAt: new Date().toISOString(),
        // Garder la taille si le téléchargement existait déjà (ex: relance après annulation)
        size: existing && existing.size ? existing.size : formattedSize,
        path: existing && (existing as any).path ? (existing as any).path : undefined,
      };

      if (existing) {
        // Si existait (ex: annulé), on le remplace et on le remet en haut
        const newList = [...prev];
        newList.splice(existingIndex, 1);
        return [newDownload, ...newList];
      }

      // Nouveau téléchargement
      const itemWithSubFolder = { ...newDownload, subFolder };

      return [itemWithSubFolder, ...prev];
    });

    // On ne démarre plus le téléchargement immédiatement, le useEffect de gestion de file d'attente s'en chargera
  };

  const startRealDownload = async (id: string, url: string, title: string, extension?: string, subFolder?: string) => {

    // Mise à jour du statut en "downloading"
    // On ne reset PAS la progression si on reprend un téléchargement
    setDownloads((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          // Si on reprend, on garde la progression actuelle
          // y compris pour les éléments repassés en "pending" mais ayant déjà une progression > 0
          const hasProgress = typeof d.progress === 'number' && d.progress > 0;
          const keepProgress =
            d.status === 'paused' || d.status === 'canceled' || d.status === 'error' || hasProgress;
          return {
            ...d,
            status: 'downloading',
            progress: keepProgress ? d.progress : 0,
            speed: '0 MB/s'
          };
        }
        return d;
      })
    );

    try {
      let fileName = title;
      if (extension) {
        const ext = extension.toLowerCase();
        if (!fileName.toLowerCase().endsWith(`.${ext}`)) {
          fileName = `${fileName}.${ext}`;
        }
      }

      // Appel au processus principal pour télécharger
      if (window.fs && window.fs.downloadFile) {
        let targetPath = downloadPath;
        if (subFolder) {
          // Nettoyage du nom de dossier (suppression des caractères interdits sous Windows)
          const safeSubFolder = subFolder.replace(/[<>:"/\\|?*]+/g, '').trim();

          // Détection basique du séparateur
          const separator = downloadPath.includes('\\') ? '\\' : '/';
          // On évite les doubles séparateurs
          const cleanPath = downloadPath.endsWith(separator) ? downloadPath.slice(0, -1) : downloadPath;
          targetPath = `${cleanPath}${separator}${safeSubFolder}`;
        }
        const result = await window.fs.downloadFile(id, url, targetPath, fileName);

        // Si le téléchargement a été avorté (pause/cancel), ce n'est pas une erreur
        if (result && !result.ok && result.status === 'aborted') {
          // Le statut a déjà été mis à jour par pauseDownload ou cancelDownload
          return;
        }

        // Si le téléchargement est terminé, on conserve le chemin réel pour le révéler/sélectionner ensuite
        if (result && result.ok && (result as any).path) {
          const pathFromResult = (result as any).path as string;
          const formattedSize = typeof (result as any).size === 'number'
            ? formatBytes((result as any).size) || undefined
            : undefined;

          setDownloads((prev) =>
            prev.map((d) =>
              d.id === id
                ? {
                  ...d,
                  path: pathFromResult,
                  size: formattedSize || d.size,
                }
                : d
            )
          );
        }

        // La progression est gérée par l'événement onDownloadProgress dans useEffect
      } else {
        throw new Error("Download capability not available");
      }
    } catch (error) {
      console.error("Download failed", error);
      setDownloads((prev) =>
        prev.map((d) => {
          if (d.id === id) {
            // Si le téléchargement a été mis en pause manuellement, on ne le marque pas comme annulé/erreur
            if (d.status === 'paused') return d;
            return { ...d, status: 'canceled', speed: 'Error' };
          }
          return d;
        })
      );
    }
  };

  const retryDownload = (id: string) => {
    const download = downloads.find((d) => d.id === id);
    if (!download) return;

    setDownloads((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          return {
            ...d,
            status: 'pending',
            progress: 0,
            speed: '0 MB/s',
            createdAt: new Date().toISOString(),
          };
        }
        return d;
      })
    );
  };

  // GESTION DE LA FILE D'ATTENTE (QUEUE)
  useEffect(() => {
    // Compte les téléchargements actifs (en cours)
    // Les téléchargements en pause ne comptent pas dans la limite
    const activeCount = downloads.filter(d => d.status === 'downloading').length;
    const pendingItems = downloads.filter(d => d.status === 'pending');

    // Si on a moins de 5 téléchargements actifs et qu'il y a des éléments en attente
    if (activeCount < 5 && pendingItems.length > 0) {

      // On lance les prochains éléments pour atteindre la limite de 5
      const slotsAvailable = 5 - activeCount;
      // Traiter en priorité les plus anciens en attente (fin de liste) pour coller à l'ordre visuel
      const toStart = pendingItems.slice(-slotsAvailable);

      toStart.forEach(item => {
        startRealDownload(item.id, item.url, item.title, item.extension, item.subFolder);
      });
    }
  }, [downloads]);

  // Écoute de la progression réelle des téléchargements depuis le processus principal
  useEffect(() => {
    if (!window.fs || !window.fs.onDownloadProgress) return;

    const removeListener = window.fs.onDownloadProgress((payload: any) => {
      const { id, progress, speedBytes } = payload;

      setDownloads((prev) =>
        prev.map((d) => {
          if (d.id === id) {
            const isComplete = progress >= 100;
            const newProgress = typeof progress === 'number' ? parseFloat(progress.toFixed(1)) : 0;

            // Ne jamais réduire la progression - cela évite le flottement à 0% lors de la reprise
            const safeProgress = Math.max(d.progress || 0, newProgress);

            return {
              ...d,
              progress: safeProgress,
              status: isComplete ? 'completed' : 'downloading',
              speed: formatSpeed(speedBytes)
            };
          }
          return d;
        })
      );
    });

    return () => {
      if (removeListener) removeListener();
    };
  }, []);

  // Persistance de l'historique de téléchargement
  useEffect(() => {
    try {
      localStorage.setItem('vk_downloads', JSON.stringify(downloads));
    } catch {
      // Ignore les erreurs de stockage
    }
  }, [downloads]);

  const pauseDownload = (id: string) => {
    // On annule le téléchargement côté Electron mais on garde le statut "paused" côté UI
    if (window.fs && window.fs.cancelDownload) {
      window.fs.cancelDownload(id);
    }

    setDownloads((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, status: 'paused', speed: '0 MB/s' } : d,
      ),
    );
  };

  const resumeDownload = (id: string) => {
    // Relance le téléchargement
    const download = downloads.find(d => d.id === id);
    if (download) {
      // Vérifier le nombre de téléchargements actifs pour un démarrage immédiat
      const activeCount = downloads.filter(d => d.status === 'downloading').length;

      if (activeCount < 5) {
        // Démarrage immédiat pour éviter le délai visuel
        startRealDownload(download.id, download.url, download.title, download.extension, download.subFolder);

        setDownloads((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, status: 'downloading', speed: '...' } : d,
          ),
        );
      } else {
        // Sinon mise en file d'attente
        setDownloads((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, status: 'pending', speed: '0 MB/s' } : d,
          ),
        );
      }
    }
  };

  const cancelDownload = (id: string) => {
    // Annulation réelle côté Electron
    if (window.fs && window.fs.cancelDownload) {
      window.fs.cancelDownload(id);
    }

    setDownloads((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, status: 'canceled', speed: '0 MB/s', progress: d.progress }
          : d,
      ),
    );
  };

  // --- FONCTIONS UTILITAIRES ---

  // Wrapper pour sauvegarder le token dans le stockage local (Persistance)
  const handleSetVkToken = (token: string) => {
    setVkToken(token);
    localStorage.setItem('vk_token', token);
  };

  const handleSetVkGroupId = (groupId: string) => {
    setVkGroupId(groupId);
    localStorage.setItem('vk_group_id', groupId);
  };

  const handleSetVkTopicId = (topicId: string) => {
    setVkTopicId(topicId);
    localStorage.setItem('vk_topic_id', topicId);
  };

  const handleSetDownloadPath = (path: string) => {
    setDownloadPath(path);
    localStorage.setItem('vk_download_path', path);
  };

  useEffect(() => {
    if (downloadPath && downloadPath !== DEFAULT_DOWNLOAD_PATH) {
      missingDownloadPathAlertedRef.current = false;
    }
  }, [downloadPath]);

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
        if (
          upper.includes('SOUTH') ||
          upper.includes('ARGENTINA') ||
          upper.includes('SAO_PAULO')
        )
          return 'South America';
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
      if (!vkToken) {
        setVkStatus((prev) => ({
          ...prev,
          connected: false,
          latencyMs: null,
          lastSync: null,
          region: rawRegion,
          regionAggregate,
        }));
        return;
      }

      try {
        let latency: number | null = null;

        if (window.vk?.ping) {
          const res = await window.vk.ping(vkToken);
          latency = res.latency !== null ? res.latency : null;
        } else {
          // Fallback pour le développement web (sans Electron)
          // On ne fait rien si pas de token ou pas d'IPC, pour respecter la demande "pas d'appel direct"
          // Mais pour le dev web, on peut simuler un succès si le token a l'air valide, ou juste échouer.
          // Pour être strict : on échoue si pas d'IPC.
          throw new Error("VK IPC not available");
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
    const id = setInterval(measurePing, 3000);
    return () => clearInterval(id);
  }, [vkToken]);

  return (
    <TranslationProvider>
      <div className="flex w-full h-screen bg-[#050B14] overflow-hidden font-sans text-slate-200">
        {/* Barre latérale gauche (Navigation) */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} vkStatus={vkStatus} />

        {/* Contenu Principal */}
        <div className="content-wrapper flex-1 flex flex-col h-full relative">
          {/* Effet visuel d'arrière-plan (Lueur bleue) */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

          {/* Barre du haut (Recherche & Fenêtre) */}
          <TopBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

          {/* Vue dynamique (Change selon l'onglet actif) */}
          <MainView
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            vkToken={vkToken}
            setVkToken={handleSetVkToken}
            vkGroupId={vkGroupId}
            setVkGroupId={handleSetVkGroupId}
            vkTopicId={vkTopicId}
            setVkTopicId={handleSetVkTopicId}
            syncedData={syncedData}
            setSyncedData={setSyncedData}
            hasFullSynced={hasFullSynced}
            setHasFullSynced={setHasFullSynced}
            downloadPath={downloadPath}
            setDownloadPath={handleSetDownloadPath}
            onVkStatusChange={setVkStatus}
            downloads={downloads}
            addDownload={addDownload}
            pauseDownload={pauseDownload}
            resumeDownload={resumeDownload}
            cancelDownload={cancelDownload}
            retryDownload={retryDownload}
            clearDownloads={() => setDownloads([])}
          />

          {/* Modal de mise à jour */}
          {updateInfo && (
            <UpdateModal
              version={updateInfo.version}
              notes={updateInfo.notes}
              url={updateInfo.url}
              onClose={() => setUpdateInfo(null)}
            />
          )}
        </div>
      </div>
    </TranslationProvider>
  );
};

export default App;

