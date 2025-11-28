
import React from 'react';
import BrowserView from './BrowserView';
import SettingsView from './SettingsView';
import DownloadsView from './DownloadsView';
import LibraryView from './LibraryView';
import { VkNode, VkConnectionStatus } from '../types';

interface MainViewProps {
  searchQuery: string;
  activeTab: string;
  vkToken: string;
  setVkToken: (t: string) => void;
  syncedData: VkNode[] | null;
  setSyncedData: (data: VkNode[]) => void;
  downloadPath: string;
  setDownloadPath: (path: string) => void;
  onVkStatusChange: (status: VkConnectionStatus) => void;
}

// Ce composant agit comme un "Routeur".
// Il décide quel écran afficher en fonction de `activeTab`.
const MainView: React.FC<MainViewProps> = ({ 
  searchQuery, 
  activeTab, 
  vkToken, 
  setVkToken, 
  syncedData, 
  setSyncedData,
  downloadPath,
  setDownloadPath,
  onVkStatusChange
}) => {
  
  const renderContent = () => {
    switch (activeTab) {
      case 'settings':
        return (
          <SettingsView
            vkToken={vkToken}
            setVkToken={setVkToken}
            downloadPath={downloadPath}
            setDownloadPath={setDownloadPath}
          />
        );
      case 'home':
        // BrowserView a besoin des données synchronisées et de la recherche
        return (
          <BrowserView 
            vkToken={vkToken} 
            syncedData={syncedData} 
            setSyncedData={setSyncedData}
            searchQuery={searchQuery}
            onVkStatusChange={onVkStatusChange}
          />
        );
      case 'downloads':
        return <DownloadsView />;
      case 'library':
        return <LibraryView downloadPath={downloadPath} />;
      default:
        return null;
    }
  };

  return (
    <>
      {renderContent()}
    </>
  );
};

export default MainView;
