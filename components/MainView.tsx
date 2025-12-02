import React from "react";
import BrowserView from "./BrowserView";
import SettingsView from "./SettingsView";
import DownloadsView from "./DownloadsView";
import LibraryView from "./LibraryView";
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
  const renderContent = () => {
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
            }}
          />
        );
      case "home":
        // BrowserView a besoin des données synchronisées et de la recherche
        return (
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
  };

  return <>{renderContent()}</>;
};

export default MainView;
