import React from "react";
import { NavItem, VkConnectionStatus } from "../types";
import { Zap, Globe, Download, Library, Settings } from "./Icons";
import { useTranslation } from "../i18n";
import { detectDetailedRegion } from "../utils/region";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
  vkStatus: VkConnectionStatus;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  vkStatus,
}) => {
  const { t, language } = useTranslation();
  const navItems: NavItem[] = [
    { id: "home", label: t.nav.home, icon: Globe },
    { id: "downloads", label: t.nav.downloads, icon: Download },
    { id: "library", label: t.nav.library, icon: Library },
    { id: "settings", label: t.nav.settings, icon: Settings },
  ];

  const displayRegion = vkStatus.region
    ? detectDetailedRegion(vkStatus.region, language)
    : "--";

  return (
    <div className="w-16 lg:w-64 bg-[#050B14] flex flex-col h-screen border-r border-[#1e293b] flex-shrink-0 pt-2 transition-all duration-300">
      {/* Logo Area */}
      <div className="h-16 flex items-center px-4 lg:px-6 mb-4 justify-center lg:justify-start">
        <div className="flex items-center gap-3 text-white font-bold text-xl tracking-tight">
          <Zap className="text-blue-500 fill-blue-500" size={24} />
          <span className="hidden lg:inline">VKomic</span>
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

      {/* Footer / Status - Hidden on small screens */}
      <div className="pb-6 mt-4 hidden lg:block">
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
            <p>
              {t.sidebar.latency}:{" "}
              {vkStatus.latencyMs !== null ? `${vkStatus.latencyMs}ms` : "--"}
            </p>
            <p>
              {t.sidebar.region}: {displayRegion}
            </p>
          </div>
        </div>
      </div>

      {/* Minimal status indicator for small screens */}
      <div className="pb-4 lg:hidden flex justify-center">
        <span className={`relative flex h-3 w-3 ${vkStatus.connected ? "" : ""}`}>
          <span className={`relative inline-flex rounded-full h-3 w-3 ${vkStatus.connected ? "bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"}`}></span>
        </span>
      </div>
    </div>
  );
};

export default React.memo(Sidebar);
