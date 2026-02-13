import React, { Suspense, useEffect, useState, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import MainView from "./components/MainView";
import { VkNode } from "./types";
import { TranslationProvider } from "./i18n";
import { DEFAULT_DOWNLOAD_PATH, UI } from "./utils/constants";
import { idbDel, idbGet, idbSet, migrateLocalStorageJsonToIdb } from "./utils/storage";

// Hooks
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useDownloads } from "./hooks/useDownloads";
import { useVkConnection } from "./hooks/useVkConnection";

const UpdateModal = React.lazy(() => import("./components/UpdateModal"));

const App: React.FC = () => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, UI.SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Persisted Settings
  const [vkToken, setVkToken] = useState(() => localStorage.getItem("vk_token") || "");
  const [vkGroupId, setVkGroupId] = useState(() => localStorage.getItem("vk_group_id") || "203785966");
  const [vkTopicId, setVkTopicId] = useState(() => localStorage.getItem("vk_topic_id") || "47515406");
  const [downloadPath, setDownloadPath] = useState(() => localStorage.getItem("vk_download_path") || DEFAULT_DOWNLOAD_PATH);
  const [hasFullSynced, setHasFullSynced] = useState(() => localStorage.getItem("vk_has_full_synced") === "true");

  // Sync Logic
  const [syncedData, setSyncedData] = useState<VkNode[] | null>(null);
  const [syncedDataHydrated, setSyncedDataHydrated] = useState(false);

  // --- CUSTOM HOOKS ---
  const update = useAppUpdate();
  const downloads = useDownloads(downloadPath, vkToken);
  const connection = useVkConnection(vkToken);

  // --- HANDLERS ---
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

  // Persist hasFullSynced
  useEffect(() => {
    localStorage.setItem("vk_has_full_synced", String(hasFullSynced));
  }, [hasFullSynced]);

  // Hydrate Synced Data
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const stored =
          (await idbGet<VkNode[]>("vk_synced_data")) ??
          (await migrateLocalStorageJsonToIdb<VkNode[]>("vk_synced_data"));

        if (cancelled) return;
        setSyncedData(Array.isArray(stored) ? stored : null);
      } catch {
        if (cancelled) return;
        setSyncedData(null);
      } finally {
        if (!cancelled) setSyncedDataHydrated(true);
      }
    };
    hydrate();
    return () => { cancelled = true; };
  }, []);

  // Persist Synced Data
  useEffect(() => {
    if (!syncedDataHydrated) return;
    const persist = async () => {
      try {
        if (syncedData) await idbSet("vk_synced_data", syncedData);
        else await idbDel("vk_synced_data");
      } catch (e) {
        console.error("Failed to save synced data", e);
      }
    };

    // Use requestIdleCallback if available
    const ric = (window as any)?.requestIdleCallback;
    if (ric) {
      const id = ric(() => void persist(), { timeout: 2000 });
      return () => (window as any)?.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => void persist(), 0);
    return () => window.clearTimeout(id);
  }, [syncedData, syncedDataHydrated]);

  return (
    <TranslationProvider>
      <div className="flex w-full h-screen bg-[#050B14] overflow-hidden font-sans text-slate-200">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          vkStatus={connection.vkStatus}
        />

        <div className="content-wrapper flex-1 flex flex-col h-full relative min-w-0">
          <TopBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            isMobile={false}
          />

          <div className="flex-1 min-h-0 flex flex-col">
            <MainView
              searchQuery={debouncedSearchQuery}
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
              onVkStatusChange={connection.setVkStatus}
              downloads={downloads.downloads}
              addDownload={downloads.addDownload}
              pauseDownload={downloads.pauseDownload}
              resumeDownload={downloads.resumeDownload}
              cancelDownload={downloads.cancelDownload}
              retryDownload={downloads.retryDownload}
              clearDownloads={downloads.clearDownloads}
            />
          </div>

          {update.updateInfo && (
            <Suspense fallback={null}>
              <UpdateModal
                version={update.updateInfo.version}
                notes={update.updateInfo.notes}
                status="available"
                onDownload={update.openReleasePage}
                onInstall={() => { }}
                onClose={update.dismissUpdate}
              />
            </Suspense>
          )}
        </div>
      </div>
    </TranslationProvider>
  );
};

export default App;
