
import React, { useState } from 'react';
import { Save, Globe, Folder } from './Icons';

interface SettingsViewProps {
  vkToken: string;
  setVkToken: (token: string) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ vkToken, setVkToken }) => {
  // États locaux du formulaire
  const [localToken, setLocalToken] = useState(vkToken);
  const [language, setLanguage] = useState('fr');
  const [downloadPath, setDownloadPath] = useState('C:\\Users\\Default\\Downloads\\VKomic');
  const [isSaved, setIsSaved] = useState(false);

  // Simulation de la sauvegarde
  const handleSave = () => {
    setVkToken(localToken);
    // Dans une vraie app Electron, on sauvegarderait le path dans un fichier config
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const openAuthLink = () => {
    // Ouvre la page d'auth VK dans le navigateur par défaut de l'utilisateur
    const url = "https://oauth.vk.com/authorize?client_id=2685278&scope=offline,docs,groups,wall&redirect_uri=https://oauth.vk.com/blank.html&display=page&response_type=token&revoke=1";

    if (window.shell) {
      // En mode Electron
      window.shell.openExternal(url);
    } else {
      // En mode web (fallback)
      window.open(url, "_blank");
    }
  };

  return (
    <div className="flex-1 p-8 flex flex-col pt-12 animate-fade-in overflow-y-auto custom-scrollbar pb-24">

      {/* En-tête */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Paramètres</h1>
        <p className="text-slate-400 text-sm">Configuration de l'application et de la connexion VK</p>
      </div>

      <div className="w-full max-w-4xl space-y-6">

        {/* Carte 1: Connexion VK */}
        <div className="bg-[#0f1523] border border-slate-800/60 rounded-xl p-8 shadow-sm">
          <h2 className="text-lg font-bold text-white mb-6">Connexion VK</h2>

          <div className="space-y-8">

            {/* Champ Token */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2.5">
                Access Token
              </label>
              <input
                type="password"
                value={localToken}
                onChange={(e) => setLocalToken(e.target.value)}
                className="w-full bg-[#161f32] text-slate-200 text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-slate-700/50 placeholder-slate-600 font-mono tracking-widest transition-all"
              />
              <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                Pour obtenir un token VK (Kate Mobile), <button onClick={openAuthLink} className="text-blue-500 hover:text-blue-400 font-medium hover:underline transition-colors">cliquez ici</button>, vous devez copier le texte entre
                <span className="mx-1.5 inline-block bg-slate-800 border border-slate-700 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold shadow-sm">access_token=</span>
                et
                <span className="mx-1.5 inline-block bg-slate-800 border border-slate-700 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold shadow-sm">&expires</span>
              </p>
            </div>

            {/* Champs ID (Lecture seule) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2.5">
                  ID du Groupe
                </label>
                <input
                  type="text"
                  value="203785966"
                  readOnly
                  className="w-full bg-[#161f32] text-slate-200 text-sm rounded-lg px-4 py-3 border border-slate-700/50 cursor-default opacity-80 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2.5">
                  ID du Topic
                </label>
                <input
                  type="text"
                  value="47515406"
                  readOnly
                  className="w-full bg-[#161f32] text-slate-200 text-sm rounded-lg px-4 py-3 border border-slate-700/50 cursor-default opacity-80 focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Carte 2: Préférences Générales */}
        <div className="bg-[#0f1523] border border-slate-800/60 rounded-xl p-8 shadow-sm">
          <h2 className="text-lg font-bold text-white mb-6">Préférences Générales</h2>

          <div className="space-y-8">

            {/* Sélection Langue */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2.5">
                Langue de l'interface
              </label>
              <div className="relative">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-[#161f32] text-slate-200 text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-slate-700/50 appearance-none cursor-pointer"
                >
                  <option value="fr">Français (Défaut)</option>
                  <option value="en">English</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                  <Globe size={18} />
                </div>
              </div>
            </div>

            {/* Sélection Dossier (Simulé) */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2.5">
                Dossier de téléchargement
              </label>
              <div className="flex gap-4">
                <input
                  type="text"
                  value={downloadPath}
                  onChange={(e) => setDownloadPath(e.target.value)}
                  className="flex-1 bg-[#161f32] text-slate-200 text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-slate-700/50 font-mono truncate"
                />
                <button className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-6 rounded-lg border border-slate-700/50 transition-colors font-medium text-sm flex items-center gap-2 whitespace-nowrap">
                  <Folder size={18} />
                  Parcourir
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Bouton de sauvegarde global */}
        <div className="pt-4 flex justify-end sticky bottom-0 bg-[#050B14]/80 p-4 backdrop-blur-sm border-t border-slate-800/50 -mx-8 -mb-8 mt-8">
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-8 py-3 rounded-md font-semibold text-sm transition-all duration-300 shadow-lg ${isSaved
                ? 'bg-emerald-600 text-white shadow-emerald-900/20'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
              }`}
          >
            <Save size={18} />
            {isSaved ? 'Modifications enregistrées' : 'Sauvegarder tout'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default SettingsView;
