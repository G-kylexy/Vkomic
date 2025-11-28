import React, { useEffect, useState } from 'react';
import { Save, Folder, ChevronDown } from './Icons';
import { useTranslation, Language } from '../i18n';

interface SettingsViewProps {
  vkToken: string;
  setVkToken: (token: string) => void;
  downloadPath: string;
  setDownloadPath: (path: string) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ vkToken, setVkToken, downloadPath, setDownloadPath }) => {
  const { t, language, setLanguage } = useTranslation();

  const [localToken, setLocalToken] = useState(vkToken);
  const [localDownloadPath, setLocalDownloadPath] = useState(downloadPath);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setLocalToken(vkToken);
  }, [vkToken]);

  useEffect(() => {
    setLocalDownloadPath(downloadPath);
  }, [downloadPath]);

  const handleSave = () => {
    setVkToken(localToken);
    setDownloadPath(localDownloadPath);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleTokenChange = (value: string) => {
    setLocalToken(value);
    setIsSaved(false);
  };

  const handleDownloadPathChange = (value: string) => {
    // Sauvegarde auto du chemin de téléchargement sans passer par le bouton
    setLocalDownloadPath(value);
    setDownloadPath(value);
  };

  // Ouvre le sélecteur natif (si dispo) pour définir le dossier de téléchargement
  const handleBrowseFolder = async () => {
    if (window.dialog?.selectFolder) {
      const folder = await window.dialog.selectFolder();
      if (folder) {
        setLocalDownloadPath(folder);
        setDownloadPath(folder);
      }
    } else {
      window.alert(t.settings.folderDialogWarning);
    }
  };

  const handleLanguageChange = (value: Language) => {
    // Sauvegarde auto de la langue (le provider écrit déjà dans le localStorage)
    setLanguage(value);
  };

  const openAuthLink = () => {
    const url =
      'https://oauth.vk.com/authorize?client_id=2685278&scope=offline,docs,groups,wall&redirect_uri=https://oauth.vk.com/blank.html&display=page&response_type=token&revoke=1';

    if (window.shell) {
      window.shell.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="flex-1 p-8 flex flex-col pt-6 animate-fade-in overflow-y-auto custom-scrollbar pb-24">
      {/* En-tete */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">{t.settings.title}</h1>
        <p className="text-slate-400 text-sm">{t.settings.subtitle}</p>
      </div>

      <div className="w-full max-w-4xl space-y-6">
        {/* Carte 1: Connexion VK */}
        <div className="bg-[#0f1523] border border-slate-800/60 rounded-xl p-8 shadow-sm">
          <h2 className="text-lg font-bold text-white mb-6">{t.settings.vkConnection}</h2>

          <div className="space-y-8">
            {/* Champ Token */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2.5">
                {t.settings.accessToken}
              </label>
              <input
                type="password"
                value={localToken}
                onChange={(e) => handleTokenChange(e.target.value)}
                className="w-full bg-[#161f32] text-slate-200 text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-slate-700/50 placeholder-slate-600 font-mono tracking-widest transition-all"
              />
              <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                {t.settings.tokenHelper}{' '}
                <button
                  onClick={openAuthLink}
                  className="text-blue-500 hover:text-blue-400 font-medium hover:underline transition-colors"
                >
                  {t.settings.clickHere}
                </button>
                {t.settings.tokenInstructions}
                <span className="mx-1.5 inline-block bg-slate-800 border border-slate-700 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold shadow-sm">
                  access_token=
                </span>
                {t.settings.and}
                <span className="mx-1.5 inline-block bg-slate-800 border border-slate-700 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold shadow-sm">
                  &expires
                </span>
              </p>
            </div>

            {/* Champs ID (Lecture seule) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2.5">
                  {t.settings.groupId}
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
                  {t.settings.topicId}
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

        {/* Carte 2: Preferences Generales */}
        <div className="bg-[#0f1523] border border-slate-800/60 rounded-xl p-8 shadow-sm">
          <h2 className="text-lg font-bold text-white mb-6">{t.settings.generalPreferences}</h2>

          <div className="space-y-8">
            {/* Selection Langue */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2.5">
                {t.settings.language}
              </label>
              <div className="relative">
                <select
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value as Language)}
                  className="w-full bg-[#161f32] text-slate-200 text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-slate-700/50 appearance-none cursor-pointer"
                >
                  <option value="fr">{t.languages.fr}</option>
                  <option value="en">{t.languages.en}</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                  <ChevronDown size={18} />
                </div>
              </div>
            </div>

            {/* Selection Dossier */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2.5">
                {t.settings.downloadFolder}
              </label>
              <div className="flex gap-4">
                <input
                  type="text"
                  value={localDownloadPath}
                  onChange={(e) => handleDownloadPathChange(e.target.value)}
                  className="flex-1 bg-[#161f32] text-slate-200 text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-slate-700/50 font-mono truncate"
                />
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-6 rounded-lg border border-slate-700/50 transition-colors font-medium text-sm flex items-center gap-2 whitespace-nowrap"
                >
                  <Folder size={18} />
                  {t.settings.browse}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bouton de sauvegarde global */}
        <div className="pt-4 flex justify-end sticky bottom-0 bg-[#050B14]/80 p-4 backdrop-blur-sm border-t border-slate-800/50 -mx-8 -mb-8 mt-8">
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-8 py-3 rounded-md font-semibold text-sm transition-all duration-300 shadow-lg ${
              isSaved
                ? 'bg-emerald-600 text-white shadow-emerald-900/20'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
            }`}
          >
            <Save size={18} />
            {isSaved ? t.settings.saved : t.settings.saveAll}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
