
import React from 'react';
import BrowserView from './BrowserView';
import SettingsView from './SettingsView';
import DownloadsView from './DownloadsView';
import { VkNode } from '../types';

interface MainViewProps {
  searchQuery: string;
  activeTab: string;
  vkToken: string;
  setVkToken: (t: string) => void;
  syncedData: VkNode[] | null;
  setSyncedData: (data: VkNode[]) => void;
}

// Ce composant agit comme un "Routeur".
// Il décide quel écran afficher en fonction de `activeTab`.
const MainView: React.FC<MainViewProps> = ({ 
  searchQuery, 
  activeTab, 
  vkToken, 
  setVkToken, 
  syncedData, 
  setSyncedData 
}) => {
  
  const renderContent = () => {
    switch (activeTab) {
      case 'settings':
        return <SettingsView vkToken={vkToken} setVkToken={setVkToken} />;
      case 'home':
        // BrowserView a besoin des données synchronisées et de la recherche
        return (
          <BrowserView 
            vkToken={vkToken} 
            syncedData={syncedData} 
            setSyncedData={setSyncedData}
            searchQuery={searchQuery}
          />
        );
      case 'downloads':
        return <DownloadsView />;
      case 'library':
        return (
           <div className="flex-1 flex items-center justify-center text-slate-500">
             Page Bibliothèque (Bientôt)
           </div>
        );
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
