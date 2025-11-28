import React from 'react';
import { NavItem, VkConnectionStatus } from '../types';
import { Zap, Globe, Download, Library, Settings } from './Icons';
import { useTranslation } from '../i18n';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
  vkStatus: VkConnectionStatus;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, vkStatus }) => {
  const { t, language } = useTranslation();
  const navItems: NavItem[] = [
    { id: 'home', label: t.nav.home, icon: Globe },
    { id: 'downloads', label: t.nav.downloads, icon: Download },
    { id: 'library', label: t.nav.library, icon: Library },
    { id: 'settings', label: t.nav.settings, icon: Settings },
  ];

  // Traduit l'agrégat de région en français si besoin
  const formatRegion = (region?: string | null) => {
    if (!region) return '--';
    if (language === 'fr') {
      const map: Record<string, string> = {
        'Europe West': "Europe de l'Ouest",
        'North America': 'Amérique du Nord',
        'South America': 'Amérique du Sud',
        'Asia': 'Asie',
        'Africa': 'Afrique',
        'Oceania': 'Océanie',
        'Pacific': 'Pacifique',
        'Global': 'Global',
      };
      return map[region] || region;
    }
    return region;
  };

  const displayRegion = formatRegion(vkStatus.regionAggregate);

  return (
    <div className="w-64 bg-[#050B14] flex flex-col h-screen border-r border-[#1e293b] flex-shrink-0 pt-2">
      {/* Logo Area */}
      <div className="h-16 flex items-center px-6 mb-4">
        <div className="flex items-center gap-3 text-white font-bold text-xl tracking-tight">
          <Zap className="text-blue-500 fill-blue-500" size={24} />
          <span>VKomic</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1.5">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-medium border relative group
                ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border-transparent'
                }
              `}
            >
              <item.icon size={18} className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-white'} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer / Status */}
      <div className="pb-6 mt-4">
        <div className="mx-6 h-px bg-slate-800/50 mb-6"></div>
        <div className="px-6 flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
            </span>
            {t.sidebar.connectedToVK}
          </div>
          <div className="text-slate-500 mt-1 pl-4 space-y-1">
            <p>{t.sidebar.latency}: {vkStatus.latencyMs !== null ? `${vkStatus.latencyMs}ms` : '--'}</p>
            <p>{t.sidebar.region}: {displayRegion}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;