
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import MainView from './components/MainView';
import { VkNode } from './types';

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

  // --- FONCTIONS UTILITAIRES ---

  // Wrapper pour sauvegarder le token dans le stockage local (Persistance)
  const handleSetVkToken = (token: string) => {
    setVkToken(token);
    localStorage.setItem('vk_token', token);
  };

  return (
    <div className="flex w-full h-screen bg-[#050B14] overflow-hidden font-sans text-slate-200">
      {/* Barre latérale gauche (Navigation) */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

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
        />
      </div>
    </div>
  );
};

export default App;
