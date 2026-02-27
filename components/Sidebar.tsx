import React, { useEffect, useState } from "react";
import { NavItem, VkConnectionStatus } from "../types";
import { Globe, Download, Library, Settings } from "./Icons";
import { useTranslation } from "../i18n";

// Technical tips that rotate
// Technical tips that rotate
const TIPS_FR = [
  "📚 On s'occupe du téléchargement, vous fournissez le café.",
  "📂 Un clic sur le dossier parent et hop, toute la série est à vous.",
  "🔍 Marre de scroller ? La barre de recherche est votre meilleure amie.",
  "💾 Votre dossier de téléchargement va finir par déborder.",
  "🌍 Tout VK sur votre disque dur, ou presque.",
  "🤫 Votre collection est entre de bonnes mains (les vôtres).",
];

const TIPS_EN = [
  "📚 We handle the download, you handle the coffee.",
  "📂 Click the parent folder and boom, the whole series is yours.",
  "🔍 Tired of scrolling? Search is your best friend.",
  "💾 Your download folder might need a bigger disk soon.",
  "🌍 All of VK on your hard drive, almost.",
  "🤫 Your collection is in good hands (yours).",
];

const formatRelativeTime = (isoDate: string | null, language: string): string => {
  const isFr = language === "fr";
  if (!isoDate) return isFr ? "Jamais" : "Never";
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return isFr ? "à l'instant" : "just now";

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return isFr ? "à l'instant" : "just now";
  if (minutes < 60) return isFr ? `${minutes} min` : `${minutes} min`;
  if (hours < 24) return isFr ? `${hours}h` : `${hours}h`;
  if (days < 7) return isFr ? `${days}j` : `${days}d`;

  return new Date(isoDate).toLocaleDateString(language === "fr" ? "fr-FR" : "en-US", {
    day: "numeric",
    month: "short",
  });
};

interface SidebarProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
  vkStatus: VkConnectionStatus;
  isCheckingUpdates: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  vkStatus,
  isCheckingUpdates,
}) => {
  const { t, language } = useTranslation();
  const navItems: NavItem[] = [
    { id: "home", label: t.nav.home, icon: Globe },
    { id: "downloads", label: t.nav.downloads, icon: Download },
    { id: "library", label: t.nav.library, icon: Library },
    { id: "settings", label: t.nav.settings, icon: Settings },
  ];

  // Rotating fun tip
  const tips = language === "fr" ? TIPS_FR : TIPS_EN;
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * tips.length));
  const [tipVisible, setTipVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => {
        setTipIndex((prev) => (prev + 1) % tips.length);
        setTipVisible(true);
      }, 300);
    }, 12000);
    return () => clearInterval(interval);
  }, [tips.length]);

  // Relative time that updates every minute
  const [relativeTime, setRelativeTime] = useState(() =>
    formatRelativeTime(vkStatus.lastSync, language)
  );

  useEffect(() => {
    setRelativeTime(formatRelativeTime(vkStatus.lastSync, language));
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(vkStatus.lastSync, language));
    }, 30000);
    return () => clearInterval(interval);
  }, [vkStatus.lastSync, language]);

  // App version
  const [appVersion, setAppVersion] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const version = await getVersion();
        setAppVersion(version);
      } catch {
        setAppVersion(null);
      }
    })();
  }, []);

  return (
    <div className="w-16 lg:w-64 bg-[#050B14] flex flex-col h-screen border-r border-[#1e293b] flex-shrink-0 pt-2 transition-all duration-300">
      {/* Logo Area */}
      <div className="h-16 flex items-center px-4 lg:px-6 mb-4 justify-center lg:justify-start">
        <div className="flex items-center gap-2 text-white font-black text-2xl tracking-tighter cursor-default select-none">
          <span className="hidden lg:inline bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent drop-shadow-sm">
            VKomic
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 lg:px-4 space-y-1.5">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-4 py-3 rounded-lg transition-all text-sm font-medium border relative group
                ${isActive
                  ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/40"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50 border-transparent"
                }
              `}
              title={item.label}
            >
              <item.icon
                size={18}
                className={
                  isActive
                    ? "text-white"
                    : "text-slate-500 group-hover:text-white"
                }
              />
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer / Status — Desktop */}
      <div className="pb-6 mt-4 hidden lg:block">
        <div className="mx-6 h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent mb-5" />

        <div className="mx-4 px-3 py-3 rounded-xl bg-[#0a1120]/80 border border-slate-800/60">
          {/* Connection status */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 flex justify-center items-center flex-shrink-0">
              <span className="relative flex h-2 w-2">
                {vkStatus.connected ? (
                  <>
                    <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                )}
              </span>
            </div>
            <span
              className={`text-xs font-semibold ${vkStatus.connected ? "text-emerald-400" : "text-rose-400"}`}
            >
              {vkStatus.connected ? t.sidebar.connectedToVK : t.sidebar.disconnected}
            </span>
          </div>

          {/* Last sync / Status */}
          <div className="flex flex-col gap-0 mb-3">
            <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-mono tracking-tight opacity-80">
              <div className="w-4 flex justify-center items-center flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <span>{t.sidebar.lastSync}</span>
            </div>
            <div className="pl-4">
              <span className="text-[11px] text-slate-300 font-medium">{relativeTime}</span>
            </div>
          </div>

          {/* Index check status */}
          <div className="flex items-center gap-2 text-[10px]">
            <div className="w-4 flex justify-center items-center flex-shrink-0">
              <div className={`h-1 w-1 rounded-full ${isCheckingUpdates ? "bg-blue-400 animate-pulse shadow-[0_0_5px_rgba(96,165,250,0.8)]" : "bg-pink-500 shadow-[0_0_5px_rgba(236,72,153,0.6)]"}`} />
            </div>
            <span className={`${isCheckingUpdates ? "text-blue-400 font-medium" : "text-slate-500"} transition-colors uppercase tracking-wider font-bold text-[9px]`}>
              {isCheckingUpdates ? t.sidebar.checkingUpdates : t.sidebar.syncDone}
            </span>
          </div>

          {/* Fun tip */}
          <div className="mt-3 pt-3 border-t border-slate-800/50">
            <p
              className={`text-[10px] text-slate-500 leading-relaxed transition-all duration-300 ${tipVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
                }`}
            >
              {tips[tipIndex]}
            </p>
          </div>
        </div>
      </div>

      {/* Minimal status indicator for small screens */}
      <div className="pb-4 lg:hidden flex justify-center">
        <span className="relative flex h-3 w-3">
          <span className={`relative inline-flex rounded-full h-3 w-3 ${vkStatus.connected ? "bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"}`} />
        </span>
      </div>
    </div>
  );
};

export default React.memo(Sidebar);
