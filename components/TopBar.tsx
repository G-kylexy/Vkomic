import React from "react";
import { Search, Minus, Square, X } from "./Icons";
import { useTranslation } from "../i18n";

interface TopBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isMobile: boolean;
}

import { tauriWin, tauriShell } from "../lib/tauri";

const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  setSearchQuery,
  isMobile,
}) => {
  const { t } = useTranslation();
  return (
    <div className="h-12 relative flex items-center bg-[#050B14] border-b border-slate-800/50 z-40 sticky top-0">
      {/* Invisible Drag Region in background */}
      <div
        data-tauri-drag-region
        className="absolute inset-0 z-0"
      />

      {/* Main Content Area - pointer-events-none to let drag through background */}
      <header
        className={`relative z-10 flex-1 flex items-center justify-between ${isMobile ? "px-4 gap-3" : "pl-6 pr-0"
          } pointer-events-none h-full`}
      >
        {/* Search Input - pointer-events-auto to catch clicks */}
        <div
          className={`relative flex-1 ${isMobile ? "max-w-full" : "max-w-96"
            } min-w-[140px] pointer-events-auto`}
        >
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="text-slate-500" size={16} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.currentTarget.focus()}
            placeholder={t.topbar.searchPlaceholder}
            className="w-full bg-[#1e293b] text-slate-200 text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-slate-700/50 placeholder-slate-500 cursor-text"
          />
        </div>

        {/* Right Controls - pointer-events-auto */}
        <div
          className={`flex items-center ${isMobile ? "gap-1" : "gap-0"} pointer-events-auto h-full`}
        >
          {/* User Profile */}
          <div className="px-2 flex items-center">
            <button
              type="button"
              title="Kylexy"
              onClick={() => {
                console.log("Profile clicked");
                tauriShell.openExternal("https://github.com/G-kylexy");
              }}
              className="relative p-[2px] rounded-full animate-rainbow cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/70"
            >
              <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-300 font-bold border-2 border-[#050B14]">
                KY
              </div>
            </button>
          </div>

          {/* Window Controls */}
          {!isMobile && (
            <div className="flex items-center h-full">
              <button
                onClick={() => {
                  console.log("Minimize button clicked");
                  tauriWin.minimize();
                }}
                className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Minus size={14} />
              </button>
              <button
                onClick={() => {
                  console.log("Maximize button clicked");
                  tauriWin.maximize();
                }}
                className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Square size={12} />
              </button>
              <button
                onClick={() => {
                  console.log("Close button clicked");
                  tauriWin.close();
                }}
                className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </header>
    </div>
  );
};

export default React.memo(TopBar);
