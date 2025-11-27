import React from 'react';
import { NavItem } from '../types';
import { Zap, Globe, Download, Library, Settings } from './Icons';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Accueil', icon: Globe },
  { id: 'downloads', label: 'Téléchargements', icon: Download },
  { id: 'library', label: 'Bibliothèque', icon: Library },
  { id: 'settings', label: 'Paramètres', icon: Settings },
];

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <div className="w-64 bg-[#0B1221] flex flex-col h-screen border-r border-slate-800 flex-shrink-0">
      {/* Logo Area */}
      <div className="h-20 flex items-center px-6">
        <div className="flex items-center gap-2 text-white font-bold text-xl">
          <Zap className="text-blue-500 fill-blue-500" size={24} />
          <span>VKomic</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium
                ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }
              `}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer / Status */}
      <div className="pb-6">
        <div className="mx-6 h-px bg-slate-800/50 mb-6"></div>
        <div className="px-6 flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
            </span>
            Connecté à VK
          </div>
          <div className="text-slate-500 mt-1 pl-4">
            <p>Latence: 106ms</p>
            <p>Région: EU-West</p>
          </div>
        </div>
        
        {/* Debug/Console Line from screenshot */}
        <div className="px-6 mt-4">
          <div className="pt-2 border-t border-slate-800/50 text-[10px] text-slate-600 font-mono truncate">
             [0] process_gpu_BROWSER...
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;