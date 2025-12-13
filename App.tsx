import React, { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import MainView from "./components/MainView";
import { VkNode, VkConnectionStatus, DownloadItem } from "./types";
import { TranslationProvider } from "./i18n";
import { DEFAULT_DOWNLOAD_PATH, MAX_CONCURRENT_DOWNLOADS, GITHUB_REPO, UI } from "./utils/constants";
import { formatBytes, formatSpeed } from "./utils/formatters";
import { mapRegion } from "./utils/region";
import UpdateModal from "./components/UpdateModal";


const App: React.FC = () => {
  // --- GESTION DE L'ÉTAT GLOBAL ---

  // État pour la mise à jour
  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    url?: string;
    notes: string;
    status: "available" | "downloading" | "ready";
    progress?: number;
  } | null>(null);

  useEffect(() => {
    const checkUpdate = async () => {
      if ((window as any).app?.checkUpdate) {
        const result = await (window as any).app.checkUpdate();
        if (result.updateAvailable && result.version) {
          setUpdateInfo({
            version: result.version,
            url: result.url,
            notes: result.notes || "",
            status: "available",
          });
        }
      }
    };

    const unsubAvailable =
      (window as any).app?.onUpdateAvailable?.((payload: any) => {
        if (!payload?.version) return;
        setUpdateInfo({
          version: payload.version,
          notes: payload.notes || "",
          url: `https://github.com/${GITHUB_REPO}/releases`,
          status: "available",
        });
      }) || null;

    const unsubProgress =
      (window as any).app?.onUpdateProgress?.((payload: any) => {
        setUpdateInfo((prev) =>
          prev
            ? {
              ...prev,
              status: "downloading",
              progress:
                typeof payload?.percent === "number"
                  ? Math.min(Math.max(payload.percent, 0), 100)
                  : prev.progress,
            }
            : prev,
        );
      }) || null;

    const unsubReady =
      (window as any).app?.onUpdateReady?.((payload: any) => {
        setUpdateInfo((prev) => ({
          version: payload?.version || prev?.version || "",
          notes: payload?.notes || prev?.notes || "",
          url: `https://github.com/${GITHUB_REPO}/releases`,
          status: "ready",
          progress: 100,
        }));
      }) || null;

    const unsubError =
      (window as any).app?.onUpdateError?.(() => {
        setUpdateInfo(null);
      }) || null;

    // Vérifier après 2 secondes pour ne pas ralentir le démarrage
    const timer = setTimeout(checkUpdate, 2000);
    return () => {
      clearTimeout(timer);
      unsubAvailable && unsubAvailable();
      unsubProgress && unsubProgress();
      unsubReady && unsubReady();
      unsubError && unsubError();
    };
  }, []);

  const handleDownloadUpdate = async () => {
    // Redirection simple vers la page de release GitHub
    if (updateInfo?.url) {
      setUpdateInfo(null); // On ferme le modal
      if (window.shell?.openExternal) {
        window.shell.openExternal(updateInfo.url);
      } else {
        window.open(updateInfo.url, "_blank");
      }
    }
  };

  const handleInstallUpdate = async () => {
    // Même comportement pour l'installation
    if (updateInfo?.url) {
      setUpdateInfo(null);
      if (window.shell?.openExternal) {
        window.shell.openExternal(updateInfo.url);
      } else {
        window.open(updateInfo.url, "_blank");
      }
    }
  };

  // Onglet actif (Accueil, Téléchargements, etc.)
  const [activeTab, setActiveTab] = useState("home");
  // Barre de recherche
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  // Debounce global pour éviter de re-rendre BrowserView à chaque frappe
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, UI.SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Token VK : Initialisé depuis le LocalStorage du navigateur pour persister au rechargement
  const [vkToken, setVkToken] = useState(() => {
    return localStorage.getItem("vk_token") || "";
  });
  const [vkGroupId, setVkGroupId] = useState(() => {
    return localStorage.getItem("vk_group_id") || "203785966";
  });
  const [vkTopicId, setVkTopicId] = useState(() => {
    return localStorage.getItem("vk_topic_id") || "47515406";
  });

  // Données synchronisées : L'arbre des dossiers/fichiers récupéré depuis VK
  const [syncedData, setSyncedData] = useState<VkNode[] | null>(() => {
    try {
      const raw = localStorage.getItem("vk_synced_data");
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
    const persist = () => {
      try {
        if (syncedData) {
          localStorage.setItem("vk_synced_data", JSON.stringify(syncedData));
        } else {
          localStorage.removeItem("vk_synced_data");
        }
      } catch (e) {
        console.error("Failed to save synced data", e);
      }
    };

    const ric = (window as any)?.requestIdleCallback as
      | ((cb: () => void, opts?: { timeout?: number }) => number)
      | undefined;

    if (ric) {
      const id = ric(persist, { timeout: 2000 });
      return () => {
        const cancel = (window as any)
          ?.cancelIdleCallback as ((id: number) => void) | undefined;
        cancel?.(id);
      };
    }

    const id = window.setTimeout(persist, 0);
    return () => window.clearTimeout(id);
  }, [syncedData]);

  // État pour savoir si une synchronisation complète a déjà été effectuée
  const [hasFullSynced, setHasFullSynced] = useState(() => {
    return localStorage.getItem("vk_has_full_synced") === "true";
  });

  useEffect(() => {
    localStorage.setItem("vk_has_full_synced", String(hasFullSynced));
  }, [hasFullSynced]);

  // Chemin de téléchargement local choisi par l'utilisateur
  const [downloadPath, setDownloadPath] = useState(() => {
    return localStorage.getItem("vk_download_path") || DEFAULT_DOWNLOAD_PATH;
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
      const raw = localStorage.getItem("vk_downloads");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      // On remet les téléchargements "en cours" en pause au démarrage
      // car le processus de téléchargement est perdu au rechargement
      return (parsed as DownloadItem[]).map((d) =>
        d.status === "downloading" ? { ...d, status: "paused" } : d,
      );
    } catch {
      return [];
    }
  });
  const downloadsRef = useRef(downloads);
  useEffect(() => {
    downloadsRef.current = downloads;
  }, [downloads]);
  // Avoid repeating the missing download path alert when batch-triggering downloads
  const missingDownloadPathAlertedRef = useRef(false);

  const addDownload = useCallback((node: VkNode, subFolder?: string) => {
    if (!node.url) return;

    // Vérifier si un dossier de téléchargement est configuré
    if (!downloadPath || downloadPath === DEFAULT_DOWNLOAD_PATH) {
      if (!missingDownloadPathAlertedRef.current) {
        window.alert(
          "Aucun dossier de telechargement n'est configure. Choisissez un chemin dans Parametres avant de lancer un telechargement.",
        );
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
          status: "error",
          extension: node.extension,
          speed: "Dossier non configuré",
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
      if (
        existing &&
        ["pending", "downloading", "paused", "completed"].includes(
          existing.status,
        )
      ) {
        return prev;
      }

      const newDownload: DownloadItem = {
        id,
        title: node.title,
        url: node.url,
        progress: 0,
        status: "pending",
        extension: node.extension,
        speed: "0 MB/s",
        createdAt: new Date().toISOString(),
        // Garder la taille si le téléchargement existait déjà (ex: relance après annulation)
        size: existing && existing.size ? existing.size : formattedSize,
        path:
          existing && (existing as any).path
            ? (existing as any).path
            : undefined,
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
  }, [downloadPath]);

  const startRealDownload = useCallback(async (
    id: string,
    url: string,
    title: string,
    extension?: string,
    subFolder?: string,
  ) => {
    // Mise à jour du statut en "downloading"
    // On ne reset PAS la progression si on reprend un téléchargement
    setDownloads((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          // Si on reprend, on garde la progression actuelle
          // y compris pour les éléments repassés en "pending" mais ayant déjà une progression > 0
          const hasProgress = typeof d.progress === "number" && d.progress > 0;
          const keepProgress =
            d.status === "paused" ||
            d.status === "canceled" ||
            d.status === "error" ||
            hasProgress;
          return {
            ...d,
            status: "downloading",
            progress: keepProgress ? d.progress : 0,
            speed: "0 MB/s",
          };
        }
        return d;
      }),
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
          const safeSubFolder = subFolder.replace(/[<>:"/\\|?*]+/g, "").trim();

          // Détection basique du séparateur
          const separator = downloadPath.includes("\\") ? "\\" : "/";
          // On évite les doubles séparateurs
          const cleanPath = downloadPath.endsWith(separator)
            ? downloadPath.slice(0, -1)
            : downloadPath;
          targetPath = `${cleanPath}${separator}${safeSubFolder}`;
        }
        const result = await window.fs.downloadFile(
          id,
          url,
          targetPath,
          fileName,
        );

        // Si le téléchargement a été avorté (pause/cancel), ce n'est pas une erreur
        if (result && !result.ok && result.status === "aborted") {
          // Le statut a déjà été mis à jour par pauseDownload ou cancelDownload
          return;
        }

        // Si le téléchargement est terminé, on conserve le chemin réel pour le révéler/sélectionner ensuite
        if (result && result.ok && (result as any).path) {
          const pathFromResult = (result as any).path as string;
          const formattedSize =
            typeof (result as any).size === "number"
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
                : d,
            ),
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
            if (d.status === "paused") return d;
            return { ...d, status: "canceled", speed: "Error" };
          }
          return d;
        }),
      );
    }
  }, [downloadPath]);

  const retryDownload = useCallback((id: string) => {
    const download = downloadsRef.current.find((d) => d.id === id);
    if (!download) return;

    setDownloads((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          return {
            ...d,
            status: "pending",
            progress: 0,
            speed: "0 MB/s",
            createdAt: new Date().toISOString(),
          };
        }
        return d;
      }),
    );
  }, []);

  // Clé de statut pour optimiser le useEffect de la queue
  // On ne recalcule que quand les statuts changent, pas à chaque update de progression
  const downloadStatusKey = downloads.map(d => `${d.id}:${d.status}`).join(',');

  // GESTION DE LA FILE D'ATTENTE (QUEUE)
  useEffect(() => {
    // Compte les téléchargements actifs (en cours)
    // Les téléchargements en pause ne comptent pas dans la limite
    const activeCount = downloads.filter(
      (d) => d.status === "downloading",
    ).length;
    const pendingItems = downloads.filter((d) => d.status === "pending");

    // Si on a moins de 5 téléchargements actifs et qu'il y a des éléments en attente
    if (activeCount < MAX_CONCURRENT_DOWNLOADS && pendingItems.length > 0) {
      // On lance les prochains éléments pour atteindre la limite de 5
      const slotsAvailable = MAX_CONCURRENT_DOWNLOADS - activeCount;
      // Traiter en priorité les plus anciens en attente (fin de liste) pour coller à l'ordre visuel
      const toStart = pendingItems.slice(-slotsAvailable);

      toStart.forEach((item) => {
        startRealDownload(
          item.id,
          item.url,
          item.title,
          item.extension,
          item.subFolder,
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadStatusKey]); // Optimisation : ne réagit qu'aux changements de statut

  // Écoute de la progression réelle des téléchargements depuis le processus principal
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!window.fs || !window.fs.onDownloadProgress) return;

    const removeListener = window.fs.onDownloadProgress((payload: any) => {
      const { id, progress, speedBytes } = payload;
      const now = Date.now();

      // Throttle : on ne met à jour l'état que toutes les 200ms max, sauf si fini
      if (progress < 100 && now - lastUpdateRef.current < UI.DOWNLOAD_THROTTLE_MS) {
        return;
      }
      lastUpdateRef.current = now;

      setDownloads((prev) =>
        prev.map((d) => {
          if (d.id === id) {
            // Si l'élément est en pause ou annulé, on ignore les mises à jour de progression
            if (d.status === "paused" || d.status === "canceled") {
              return d;
            }

            const isComplete = progress >= 100;
            const newProgress =
              typeof progress === "number"
                ? parseFloat(progress.toFixed(1))
                : 0;

            // Ne jamais réduire la progression - cela évite le flottement à 0% lors de la reprise
            const safeProgress = Math.max(d.progress || 0, newProgress);

            return {
              ...d,
              progress: safeProgress,
              status: isComplete ? "completed" : "downloading",
              speed: formatSpeed(speedBytes),
            };
          }
          return d;
        }),
      );
    });

    return () => {
      if (removeListener) removeListener();
    };
  }, []);

  // Persistance de l'historique de téléchargement (throttled pour éviter les écritures excessives)
  const lastPersistRef = useRef<number>(0);
  useEffect(() => {
    const now = Date.now();
    // Ne persiste que toutes les 1 seconde max, ou immédiatement si statut change
    const hasStatusChange = downloads.some(d =>
      d.status === 'completed' || d.status === 'canceled' || d.status === 'error'
    );

    if (hasStatusChange || now - lastPersistRef.current > 1000) {
      lastPersistRef.current = now;
      try {
        localStorage.setItem("vk_downloads", JSON.stringify(downloads));
      } catch {
        // Ignore les erreurs de stockage
      }
    }
  }, [downloads]);

  const pauseDownload = useCallback((id: string) => {
    // On annule le téléchargement côté Electron mais on garde le statut "paused" côté UI
    if (window.fs && window.fs.cancelDownload) {
      window.fs.cancelDownload(id);
    }

    setDownloads((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, status: "paused", speed: "0 MB/s" } : d,
      ),
    );
  }, []);

  const resumeDownload = useCallback((id: string) => {
    // Relance le téléchargement
    const downloadsSnapshot = downloadsRef.current;
    const download = downloadsSnapshot.find((d) => d.id === id);
    if (download) {
      // Vérifier le nombre de téléchargements actifs pour un démarrage immédiat
      const activeCount = downloadsSnapshot.filter(
        (d) => d.status === "downloading",
      ).length;

      if (activeCount < MAX_CONCURRENT_DOWNLOADS) {
        // Démarrage immédiat pour éviter le délai visuel
        startRealDownload(
          download.id,
          download.url,
          download.title,
          download.extension,
          download.subFolder,
        );

        setDownloads((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, status: "downloading", speed: "..." } : d,
          ),
        );
      } else {
        // Sinon mise en file d'attente
        setDownloads((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, status: "pending", speed: "0 MB/s" } : d,
          ),
        );
      }
    }
  }, [startRealDownload]);

  const cancelDownload = useCallback((id: string) => {
    // Annulation réelle côté Electron
    if (window.fs && window.fs.cancelDownload) {
      window.fs.cancelDownload(id);
    }

    setDownloads((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, status: "canceled", speed: "0 MB/s", progress: d.progress }
          : d,
      ),
    );
  }, []);

  const clearDownloads = useCallback(() => {
    setDownloads([]);
  }, []);

  // --- FONCTIONS UTILITAIRES ---

  // Wrapper pour sauvegarder le token dans le stockage local (Persistance)
  const handleSetVkToken = useCallback((token: string) => {
    setVkToken(token);
    localStorage.setItem("vk_token", token);
  }, []);

  const handleSetVkGroupId = useCallback((groupId: string) => {
    setVkGroupId(groupId);
    localStorage.setItem("vk_group_id", groupId);
  }, []);

  const handleSetVkTopicId = useCallback((topicId: string) => {
    setVkTopicId(topicId);
    localStorage.setItem("vk_topic_id", topicId);
  }, []);

  const handleSetDownloadPath = useCallback((path: string) => {
    setDownloadPath(path);
    localStorage.setItem("vk_download_path", path);
  }, []);

  useEffect(() => {
    if (downloadPath && downloadPath !== DEFAULT_DOWNLOAD_PATH) {
      missingDownloadPathAlertedRef.current = false;
    }
  }, [downloadPath]);

  useEffect(() => {
    if (!vkToken) {
      setVkStatus((prev) => ({
        ...prev,
        connected: false,
        latencyMs: null,
        lastSync: null,
      }));
    }
  }, [vkToken]);

  useEffect(() => {
    // Déduit une région agrégée à partir de la timezone/locale
    const rawRegion =
      Intl?.DateTimeFormat?.().resolvedOptions().timeZone ||
      (typeof navigator !== "undefined" ? navigator.language : null) ||
      null;

    const regionAggregate = mapRegion(rawRegion);

    // Mesure la latence vers VK toutes les secondes (via IPC pour éviter CORB côté renderer)
    const measurePing = async () => {
      if (!vkToken) {
        setVkStatus((prev) => {
          if (
            prev.connected === false &&
            prev.latencyMs === null &&
            prev.lastSync === null &&
            prev.region === rawRegion &&
            prev.regionAggregate === regionAggregate
          ) {
            return prev;
          }
          return {
            ...prev,
            connected: false,
            latencyMs: null,
            lastSync: null,
            region: rawRegion,
            regionAggregate,
          };
        });
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

        setVkStatus((prev) => {
          const threshold = 50;
          const latencyStable =
            prev.latencyMs !== null &&
            latency !== null &&
            Math.abs(prev.latencyMs - latency) < threshold;

          const nextLatency = latencyStable ? prev.latencyMs : latency;

          if (
            prev.connected === true &&
            prev.latencyMs === nextLatency &&
            prev.region === rawRegion &&
            prev.regionAggregate === regionAggregate
          ) {
            return prev;
          }

          return {
            ...prev,
            connected: true,
            latencyMs: nextLatency,
            // lastSync est mis à jour par les actions "Sync", pas par le ping
            region: rawRegion,
            regionAggregate,
          };
        });
      } catch (e) {
        setVkStatus((prev) => {
          if (
            prev.connected === false &&
            prev.latencyMs === null &&
            prev.region === rawRegion &&
            prev.regionAggregate === regionAggregate
          ) {
            return prev;
          }
          return {
            ...prev,
            connected: false,
            latencyMs: null,
            region: rawRegion,
            regionAggregate,
          };
        });
      }
    };

    measurePing();
    const id = setInterval(measurePing, UI.PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [vkToken]);

  return (
    <TranslationProvider>
      <div className="flex w-full h-screen bg-[#050B14] overflow-hidden font-sans text-slate-200">
        {/* Barre latérale gauche (Navigation) */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          vkStatus={vkStatus}
        />

        {/* Contenu Principal */}
        <div className="content-wrapper flex-1 flex flex-col h-full relative">
          {/* Effet visuel d'arrière-plan (Lueur bleue) */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px]  pointer-events-none" />

          {/* Barre du haut (Recherche & Fenêtre) */}
          <TopBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

          {/* Vue dynamique (Change selon l'onglet actif) */}
          <MainView
            searchQuery={debouncedSearchQuery} // On passe la version debounced pour éviter les re-renders inutiles
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
            clearDownloads={clearDownloads}
          />

          {/* Modal de mise à jour */}
          {updateInfo && (
            <UpdateModal
              version={updateInfo.version}
              notes={updateInfo.notes}
              status={updateInfo.status}
              progress={updateInfo.progress}
              onDownload={handleDownloadUpdate}
              onInstall={handleInstallUpdate}
              onClose={() => setUpdateInfo(null)}
            />
          )}
        </div>
      </div>
    </TranslationProvider>
  );
};

export default App;
