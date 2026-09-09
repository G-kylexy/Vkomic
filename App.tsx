import React, { Suspense, useEffect, useState, useCallback, useRef } from "react";
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
import { performPassiveSync, tauriDeepLink, tauriSettings, tauriShell, tauriVk } from "./lib/tauri";
import {
  clearPendingVkAuthorization,
  createVkAuthorizationUrl,
  createVkState,
  parseVkCallback,
  readPendingVkAuthorization,
  VkAuthSession,
} from "./lib/vk-auth";

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
  const [vkToken, setVkToken] = useState("");
  const [vkRefreshToken, setVkRefreshToken] = useState("");
  const [vkDeviceId, setVkDeviceId] = useState("");
  const [vkTokenExpiresAt, setVkTokenExpiresAt] = useState(0);
  const [vkGroupId, setVkGroupId] = useState(() => localStorage.getItem("vk_group_id") || "203785966");
  const [vkTopicId, setVkTopicId] = useState(() => localStorage.getItem("vk_topic_id") || "47515406");
  const [downloadPath, setDownloadPath] = useState(() => localStorage.getItem("vk_download_path") || DEFAULT_DOWNLOAD_PATH);
  const [hasFullSynced, setHasFullSynced] = useState(() => localStorage.getItem("vk_has_full_synced") === "true");
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [isVkAuthPending, setIsVkAuthPending] = useState(false);
  const [isVkAuthExchanging, setIsVkAuthExchanging] = useState(false);
  const [vkAuthError, setVkAuthError] = useState("");
  const vkAuthCallbackInFlight = useRef(false);

  // Load settings from Tauri on mount
  useEffect(() => {
    const load = async () => {
      try {
        const settings = await tauriSettings.load();
        if (settings) {
          if (settings.vk_refresh_token && settings.vk_device_id && settings.vk_token_expires_at) {
            const tokenTrimmed = settings.vk_token.trim();
            setVkToken(tokenTrimmed);
            setVkRefreshToken(settings.vk_refresh_token);
            setVkDeviceId(settings.vk_device_id);
            setVkTokenExpiresAt(settings.vk_token_expires_at);
          }
          if (settings.vk_group_id) {
            setVkGroupId(settings.vk_group_id);
            localStorage.setItem("vk_group_id", settings.vk_group_id);
          }
          if (settings.vk_topic_id) {
            setVkTopicId(settings.vk_topic_id);
            localStorage.setItem("vk_topic_id", settings.vk_topic_id);
          }
          if (settings.vk_download_path) {
            setDownloadPath(settings.vk_download_path);
            localStorage.setItem("vk_download_path", settings.vk_download_path);
          }
        }
      } catch (e) {
        console.error("Failed to load settings from Tauri:", e);
      } finally {
        // Legacy Kate Mobile credentials and per-user App IDs are no longer accepted.
        localStorage.removeItem("vk_token");
        localStorage.removeItem("vk_app_id");
        setIsSettingsLoaded(true);
      }
    };
    load();
  }, []);

  // Save settings to Tauri when they change
  useEffect(() => {
    if (!isSettingsLoaded) return;
    const save = async () => {
      try {
        await tauriSettings.save({
          vk_token: vkToken,
          vk_refresh_token: vkRefreshToken,
          vk_device_id: vkDeviceId,
          vk_token_expires_at: vkTokenExpiresAt,
          vk_group_id: vkGroupId,
          vk_topic_id: vkTopicId,
          vk_download_path: downloadPath,
        });
      } catch (e) {
        console.error("Failed to save settings to Tauri:", e);
      }
    };
    save();
  }, [vkToken, vkRefreshToken, vkDeviceId, vkTokenExpiresAt, vkGroupId, vkTopicId, downloadPath, isSettingsLoaded]);

  // Sync Logic
  const [syncedData, setSyncedData] = useState<VkNode[] | null>(null);
  const [syncedDataHydrated, setSyncedDataHydrated] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  // --- CUSTOM HOOKS ---
  const update = useAppUpdate();
  const downloads = useDownloads(downloadPath, vkToken);
  const connection = useVkConnection(vkToken);

  // --- HANDLERS ---
  const applyVkAuthSession = useCallback((session: VkAuthSession) => {
    setVkToken(session.accessToken.trim());
    setVkRefreshToken(session.refreshToken);
    setVkDeviceId(session.deviceId);
    setVkTokenExpiresAt(Date.now() + Math.max(session.expiresIn, 60) * 1000);
    setVkAuthError("");
  }, []);

  const handleDisconnectVk = useCallback(() => {
    setVkToken("");
    setVkRefreshToken("");
    setVkDeviceId("");
    setVkTokenExpiresAt(0);
    setIsVkAuthPending(false);
    setVkAuthError("");
    clearPendingVkAuthorization();
  }, []);

  const handleStartVkAuth = useCallback(async () => {
    setVkAuthError("");
    try {
      const url = await createVkAuthorizationUrl();
      await tauriShell.openExternal(url);
      setIsVkAuthPending(true);
    } catch (error) {
      clearPendingVkAuthorization();
      setIsVkAuthPending(false);
      setVkAuthError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleVkCallback = useCallback(async (rawUrl: string) => {
    if (vkAuthCallbackInFlight.current) return;
    vkAuthCallbackInFlight.current = true;
    setIsVkAuthExchanging(true);
    setVkAuthError("");
    try {
      const callback = parseVkCallback(rawUrl);
      const pending = readPendingVkAuthorization();
      if (!pending || callback.state !== pending.state) {
        throw new Error("La demande VK ID a expiré. Relance la connexion depuis les paramètres.");
      }
      const session = await tauriVk.exchangeAuthCode(
        callback.code,
        callback.deviceId,
        callback.state,
        pending.codeVerifier,
      );
      applyVkAuthSession(session);
      clearPendingVkAuthorization();
      setIsVkAuthPending(false);
      setActiveTab("settings");
    } catch (error) {
      setVkAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsVkAuthExchanging(false);
      vkAuthCallbackInFlight.current = false;
    }
  }, [applyVkAuthSession]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      unlisten = await tauriDeepLink.onOpenUrl((urls) => {
        const callbackUrl = urls.find((url) => url.startsWith("vkomic://vk-auth"));
        if (callbackUrl) void handleVkCallback(callbackUrl);
      });
      const current = await tauriDeepLink.getCurrent();
      if (!cancelled) {
        const callbackUrl = current?.find((url) => url.startsWith("vkomic://vk-auth"));
        if (callbackUrl) void handleVkCallback(callbackUrl);
      }
    })().catch((error) => {
      if (!cancelled) setVkAuthError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleVkCallback]);

  // VK ID access tokens are short-lived; refresh one minute before expiration.
  useEffect(() => {
    if (!isSettingsLoaded || !vkRefreshToken || !vkDeviceId || !vkTokenExpiresAt) return;
    const delay = Math.max(vkTokenExpiresAt - Date.now() - 60_000, 1_000);
    const timer = window.setTimeout(() => {
      setIsVkAuthExchanging(true);
      const state = createVkState();
      void tauriVk.refreshAuthToken(vkRefreshToken, vkDeviceId, state)
        .then(applyVkAuthSession)
        .catch((error) => {
          setVkToken("");
          setVkTokenExpiresAt(Date.now() + 60_000);
          setVkAuthError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => setIsVkAuthExchanging(false));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [isSettingsLoaded, vkRefreshToken, vkDeviceId, vkTokenExpiresAt, applyVkAuthSession]);

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

  // --- PASSIVE STARTUP SYNC ---
  useEffect(() => {
    // Wait for hydration and ensure we have data/token/fullsync
    if (!syncedDataHydrated || !syncedData || !vkToken || !hasFullSynced) return;
    if (sessionStorage.getItem("vk_passive_synced_session")) return;

    const runCheck = async () => {
      // Small delay to let the app settle
      await new Promise(r => setTimeout(r, 1500));

      setIsCheckingUpdates(true);
      try {
        const result = await performPassiveSync(vkToken, syncedData, vkGroupId);
        if (result.changedCount > 0) {
          console.log(`[Startup Sync] Found ${result.changedCount} updates`);
          setSyncedData(result.updatedData);
          connection.setVkStatus({
            ...connection.vkStatus,
            lastSync: new Date().toISOString()
          });
        }
        // Success: mark session as synced
        sessionStorage.setItem("vk_passive_synced_session", "true");
      } catch (err) {
        console.error("Manual check failed", err);
      } finally {
        setIsCheckingUpdates(false);
      }
    };

    runCheck();
  }, [syncedDataHydrated, syncedData, vkToken, hasFullSynced, vkGroupId]);

  return (
    <TranslationProvider>
      <div className="flex w-full h-screen bg-[#050B14] overflow-hidden font-sans text-slate-200">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          vkStatus={connection.vkStatus}
          isCheckingUpdates={isCheckingUpdates}
          activeDownloadsCount={downloads.downloads.filter(d => ["pending", "downloading"].includes(d.status)).length}
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
              onConnectVk={handleStartVkAuth}
              onDisconnectVk={handleDisconnectVk}
              isVkAuthPending={isVkAuthPending}
              isVkAuthExchanging={isVkAuthExchanging}
              vkAuthError={vkAuthError}
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
