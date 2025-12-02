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

  // Détecte la région basée sur la timezone avec plus de précision
  const detectDetailedRegion = (timezone?: string | null): string => {
    if (!timezone) return '--';

    const tz = timezone.toLowerCase();

    // Europe - Détection détaillée
    if (tz.startsWith('europe/')) {
      // Europe de l'Est
      const eastEurope = ['moscow', 'kiev', 'bucharest', 'sofia', 'warsaw', 'prague', 'budapest', 'minsk', 'tallinn', 'riga', 'vilnius', 'helsinki', 'athens', 'istanbul'];
      if (eastEurope.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Europe de l\'Est' : 'Eastern Europe';
      }

      // Europe du Nord
      const northEurope = ['stockholm', 'oslo', 'copenhagen', 'reykjavik'];
      if (northEurope.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Europe du Nord' : 'Northern Europe';
      }

      // Europe de l'Ouest par défaut
      return language === 'fr' ? 'Europe de l\'Ouest' : 'Western Europe';
    }

    // Amérique
    if (tz.startsWith('america/')) {
      const southAmerica = ['argentina', 'sao_paulo', 'santiago', 'buenos_aires', 'lima', 'bogota', 'caracas', 'montevideo', 'asuncion', 'la_paz'];
      if (southAmerica.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Amérique du Sud' : 'South America';
      }

      const centralAmerica = ['mexico', 'guatemala', 'panama', 'costa_rica', 'managua'];
      if (centralAmerica.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Amérique Centrale' : 'Central America';
      }

      return language === 'fr' ? 'Amérique du Nord' : 'North America';
    }

    // Asie - Détection détaillée
    if (tz.startsWith('asia/')) {
      const eastAsia = ['tokyo', 'seoul', 'shanghai', 'beijing', 'hong_kong', 'taipei'];
      if (eastAsia.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Asie de l\'Est' : 'East Asia';
      }

      const southeastAsia = ['singapore', 'bangkok', 'manila', 'jakarta', 'kuala_lumpur', 'ho_chi_minh', 'hanoi'];
      if (southeastAsia.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Asie du Sud-Est' : 'Southeast Asia';
      }

      const southAsia = ['kolkata', 'delhi', 'mumbai', 'dhaka', 'karachi', 'colombo'];
      if (southAsia.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Asie du Sud' : 'South Asia';
      }

      const centralAsia = ['almaty', 'tashkent', 'bishkek'];
      if (centralAsia.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Asie Centrale' : 'Central Asia';
      }

      const middleEast = ['dubai', 'riyadh', 'baghdad', 'tehran', 'jerusalem', 'beirut', 'damascus', 'amman', 'kuwait', 'doha'];
      if (middleEast.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Moyen-Orient' : 'Middle East';
      }

      return language === 'fr' ? 'Asie' : 'Asia';
    }

    // Afrique - Détection détaillée
    if (tz.startsWith('africa/')) {
      const northAfrica = ['cairo', 'algiers', 'tunis', 'tripoli', 'casablanca'];
      if (northAfrica.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Afrique du Nord' : 'North Africa';
      }

      const westAfrica = ['lagos', 'accra', 'dakar', 'abidjan'];
      if (westAfrica.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Afrique de l\'Ouest' : 'West Africa';
      }

      const eastAfrica = ['nairobi', 'addis_ababa', 'dar_es_salaam', 'kampala'];
      if (eastAfrica.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Afrique de l\'Est' : 'East Africa';
      }

      const southAfrica = ['johannesburg', 'cape_town', 'maputo', 'lusaka'];
      if (southAfrica.some(city => tz.includes(city))) {
        return language === 'fr' ? 'Afrique Australe' : 'Southern Africa';
      }

      return language === 'fr' ? 'Afrique' : 'Africa';
    }

    // Océanie
    if (tz.startsWith('pacific/') || tz.startsWith('australia/')) {
      return language === 'fr' ? 'Océanie' : 'Oceania';
    }

    // Atlantique (Europe de l'Ouest)
    if (tz.startsWith('atlantic/')) {
      return language === 'fr' ? 'Europe de l\'Ouest' : 'Western Europe';
    }

    return '--';
  };

  const displayRegion = vkStatus.region ? detectDetailedRegion(vkStatus.region) : '--';

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
                ${isActive
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
          {vkStatus.connected ? (
            <div className="flex items-center gap-2 text-emerald-400 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
              </span>
              {t.sidebar.connectedToVK}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-rose-400 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"></span>
              </span>
              {t.sidebar.disconnected}
            </div>
          )}
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