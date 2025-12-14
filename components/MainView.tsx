import React, { Suspense, useState } from "react";
import BrowserView from "./BrowserView";

const SettingsView = React.lazy(() => import("./SettingsView"));
const DownloadsView = React.lazy(() => import("./DownloadsView"));
const LibraryView = React.lazy(() => import("./LibraryView"));
import { VkNode, VkConnectionStatus, DownloadItem } from "../types";

interface MainViewProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  vkToken: string;
  setVkToken: (t: string) => void;
  vkGroupId: string;
  setVkGroupId: (groupId: string) => void;
  vkTopicId: string;
  setVkTopicId: (topicId: string) => void;
  syncedData: VkNode[] | null;
  setSyncedData: (data: VkNode[] | null) => void;
  hasFullSynced: boolean;
  setHasFullSynced: (hasSynced: boolean) => void;
  downloadPath: string;
  setDownloadPath: (path: string) => void;
  onVkStatusChange: (status: VkConnectionStatus) => void;
  downloads: DownloadItem[];
  addDownload: (node: VkNode, subFolder?: string) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string) => void;
  clearDownloads: () => void;
}

// Ce composant agit comme un "Routeur".
// Il décide quel écran afficher en fonction de `activeTab`.
const MainView: React.FC<MainViewProps> = ({
  searchQuery,
  setSearchQuery,
  activeTab,
  setActiveTab,
  vkToken,
  setVkToken,
  vkGroupId,
  setVkGroupId,
  vkTopicId,
  setVkTopicId,
  syncedData,
  setSyncedData,
  hasFullSynced,
  setHasFullSynced,
  downloadPath,
  setDownloadPath,
  onVkStatusChange,
  downloads,
  addDownload,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  retryDownload,
  clearDownloads,
}) => {
  const [navPath, setNavPath] = useState<VkNode[]>([]);

  const loadingFallback = (
    <div className="flex-1 flex items-center justify-center text-slate-400">
      <div className="flex items-center gap-3 text-sm">
        <span className="inline-block h-4 w-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
        Chargement...
      </div>
    </div>
  );

  // Rendu du contenu secondaire (non-home)
  const renderSecondaryContent = () => {
    return (
      <Suspense fallback={loadingFallback}>
        {(() => {
          switch (activeTab) {
            case "settings":
              return (
                <SettingsView
                  vkToken={vkToken}
                  setVkToken={setVkToken}
                  vkGroupId={vkGroupId}
                  setVkGroupId={setVkGroupId}
                  vkTopicId={vkTopicId}
                  setVkTopicId={setVkTopicId}
                  downloadPath={downloadPath}
                  setDownloadPath={setDownloadPath}
                  onResetDatabase={() => {
                    setSyncedData(null);
                    setHasFullSynced(false);
                    setNavPath([]);
                  }}
                />
              );
            case "downloads":
              return (
                <DownloadsView
                  downloads={downloads}
                  pauseDownload={pauseDownload}
                  resumeDownload={resumeDownload}
                  cancelDownload={cancelDownload}
                  retryDownload={retryDownload}
                  syncedData={syncedData}
                  downloadPath={downloadPath}
                  clearDownloads={clearDownloads}
                />
              );
            case "library":
              return (
                <LibraryView
                  downloadPath={downloadPath}
                  onNavigateToSettings={() => setActiveTab("settings")}
                />
              );
            default:
              return null;
          }
        })()}
      </Suspense>
    );
  };

  if (activeTab === "home") {
    return (
    <>
      {/* BrowserView est TOUJOURS monté pour préserver le navPath */}
      <div style={{ display: activeTab === "home" ? "contents" : "none" }}>
        <BrowserView
          vkToken={vkToken}
          vkGroupId={vkGroupId}
          vkTopicId={vkTopicId}
          syncedData={syncedData}
          setSyncedData={setSyncedData}
          hasFullSynced={hasFullSynced}
          setHasFullSynced={setHasFullSynced}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onVkStatusChange={onVkStatusChange}
          addDownload={addDownload}
          downloads={downloads}
          pauseDownload={pauseDownload}
          resumeDownload={resumeDownload}
          cancelDownload={cancelDownload}
          retryDownload={retryDownload}
          navPath={navPath}
          setNavPath={setNavPath}
        />
      </div>
      {/* Les autres vues sont rendues normalement */}
      {activeTab !== "home" && renderSecondaryContent()}
    </>
    );
  }

  return renderSecondaryContent();
};

export default React.memo(MainView);
