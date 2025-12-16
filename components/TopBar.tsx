import React from "react";
import { Search, Minus, Square, X } from "./Icons";
import { useTranslation } from "../i18n";

interface TopBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isMobile: boolean;
}

const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  setSearchQuery,
  isMobile,
}) => {
  const { t } = useTranslation();
  return (
    <header
      className={`h-12 flex items-center justify-between ${
        isMobile ? "px-4 gap-3" : "pl-6 pr-0"
      } relative bg-[#050B14] z-40 sticky top-0`}
      style={{ WebkitAppRegion: "drag" } as any}
    >
      {/* Search Input */}
      <div
        className={`relative flex-1 ${
          isMobile ? "max-w-full" : "max-w-96"
        } min-w-[140px] z-50`}
        style={{ WebkitAppRegion: "no-drag" } as any}
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
          style={{ WebkitAppRegion: "no-drag" } as any}
          className="w-full bg-[#1e293b] text-slate-200 text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-slate-700/50 placeholder-slate-500 cursor-text"
        />
      </div>

      {/* Right Controls (User Profile + Window Controls) */}
      <div
        className={`flex items-center ${isMobile ? "gap-1" : "gap-2"}`}
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        {/* User Profile / GitHub link */}
        <button
          type="button"
          title="Kylexy"
          onClick={() => {
            const url = "https://github.com/G-kylexy";
            if (window.shell?.openExternal) {
              window.shell.openExternal(url);
            } else {
              window.open(url, "_blank");
            }
          }}
          className="relative p-[2px] rounded-full animate-rainbow cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:ring-offset-2 focus:ring-offset-[#050B14]"
        >
          <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-300 font-bold border-2 border-[#050B14]">
            KY
          </div>
        </button>

        {/* Window Controls */}
        {!isMobile && (
          <div className="flex items-center">
            <button
              onClick={() => window.win?.minimize()}
              className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => window.win?.maximize()}
              className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Square size={12} />
            </button>
            <button
              onClick={() => window.win?.close()}
              className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-600 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default React.memo(TopBar);
