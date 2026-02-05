import React, { useMemo, useCallback, useState } from "react";
import {
  Download,
  Pause,
  Play,
  X,
  Check,
  BarChart,
  Folder,
  RefreshCw,
  Trash2,
  ChevronDown,
} from "./Icons";
import { tauriFs } from "../lib/tauri";
import { useTranslation } from "../i18n";
import { DownloadItem } from "../types";
import { formatDateISO } from "../utils/formatters";
import { extractVolumeLabel } from "../utils/text";

interface DownloadsViewProps {
  downloads: DownloadItem[];
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string) => void;
  indexedCount?: number;
  downloadPath?: string;
  clearDownloads: () => void;
}

// Type pour les données pré-calculées
interface PreparedDownload extends DownloadItem {
  dateLabel: string;
  volumeLabel: string;
  displaySize: string;
}

// Nombre d'items affichés par page
const ITEMS_PER_PAGE = 50;

const DownloadsView: React.FC<DownloadsViewProps> = ({
  downloads,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  retryDownload,
  indexedCount = 0,
  downloadPath,
  clearDownloads,
}) => {
  const { t } = useTranslation();
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const downloadCounts = useMemo(() => {
    const downloaded = downloads.filter((d) => d.status === "completed").length;
    const inProgress = downloads.filter((d) =>
      ["downloading", "pending", "paused"].includes(d.status)
    ).length;
    return { downloaded, inProgress };
  }, [downloads]);

  // Pré-calcul des données triées avec valeurs formatées (évite les recalculs dans le render)
  const sortedDownloads = useMemo((): PreparedDownload[] => {
    const statusPriority: Record<DownloadItem["status"], number> = {
      downloading: 1,
      paused: 2,
      pending: 3,
      completed: 4,
      canceled: 5,
      error: 6,
    };

    return [...downloads]
      .sort((a, b) => {
        const priorityA = statusPriority[a.status] ?? 99;
        const priorityB = statusPriority[b.status] ?? 99;
        return priorityA - priorityB;
      })
      .map((d) => ({
        ...d,
        dateLabel: formatDateISO(d.createdAt),
        volumeLabel: extractVolumeLabel(d.title),
        displaySize: d.size || "--",
      }));
  }, [downloads]);

  // Items visibles (pagination)
  const visibleDownloads = useMemo(() => {
    return sortedDownloads.slice(0, visibleCount);
  }, [sortedDownloads, visibleCount]);

  const hasMore = visibleCount < sortedDownloads.length;
  const remainingCount = sortedDownloads.length - visibleCount;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + ITEMS_PER_PAGE, sortedDownloads.length));
  }, [sortedDownloads.length]);

  const getFolderFromPath = useCallback((p?: string) => {
    if (!p) return undefined;
    const normalized = p.replace(/\\/g, "/");
    const idx = normalized.lastIndexOf("/");
    if (idx <= 0) return p;
    return p.slice(0, idx);
  }, []);

  const openFolder = useCallback((path?: string) => {
    if (!path) return;
    // Sur Tauri, on peut utiliser openPath sur le dossier parent ou le fichier
    // openPath sur un fichier l'ouvre (execute).
    // Pour "Show in folder", souvent on ouvre le dossier parent.

    // Si on a un path de fichier, on veut ouvrir le dossier le contenant
    const folder = getFolderFromPath(path) || downloadPath;
    if (folder) {
      tauriFs.openPath(folder).catch(console.error);
    }
  }, [getFolderFromPath, downloadPath]);

  return (
    <div className="flex-1 px-4 sm:px-8 pt-6 sm:pt-8 pb-24 flex flex-col animate-fade-in overflow-y-auto custom-scrollbar">
      <div className="w-full flex flex-col">
        {/* Stats */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <BarChart className="text-slate-200" size={24} />
            <h2 className="text-2xl font-bold text-white tracking-tight">{t.downloads.overviewTitle}</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-[#131926] border border-[#1e293b] rounded-xl p-6 flex flex-col justify-center shadow-lg">
              <span className="text-4xl font-bold text-white mb-2">{indexedCount}</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.downloads.statsIndexed}</span>
            </div>
            <div className="bg-[#131926] border border-[#1e293b] rounded-xl p-6 flex flex-col justify-center shadow-lg">
              <span className="text-4xl font-bold text-white mb-2">{downloadCounts.downloaded}</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.downloads.statsDownloaded}</span>
            </div>
            <div className="bg-[#131926] border border-[#1e293b] rounded-xl p-6 flex flex-col justify-center shadow-lg sm:col-span-2 lg:col-span-1">
              <span className="text-4xl font-bold text-white mb-2">{downloadCounts.inProgress}</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.downloads.statsInProgress}</span>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Download className="text-slate-200" size={24} />
            <h2 className="text-2xl font-bold text-white tracking-tight">{t.downloads.title}</h2>
          </div>
          {downloads.length > 0 && (
            <button
              onClick={clearDownloads}
              className="flex items-center gap-2 px-4 py-2 bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 rounded-lg transition-colors text-sm font-medium"
              title={t.tooltips.clean}
            >
              <Trash2 size={18} />
              <span>{t.tooltips.clean}</span>
            </button>
          )}
        </div>

        {/* Liste */}
        <div className="bg-[#131926] border border-[#1e293b] rounded-xl overflow-hidden shadow-xl flex flex-col min-h-[400px]">
          {downloads.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-20">
              <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
                <Download size={24} />
              </div>
              <p className="font-medium">{t.downloads.noDownloads}</p>
              <p className="text-xs text-slate-600 mt-1">{t.downloads.noDownloadsDescription}</p>
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full table-fixed text-left border-collapse">
                  <thead>
                    <tr>
                      <th className="py-4 px-6 bg-[#0f1523] text-xs font-bold text-slate-500 uppercase border-b border-slate-800 tracking-wider w-[30%]">
                        {t.downloads.tableSeries}
                      </th>
                      <th className="py-4 px-6 bg-[#0f1523] text-xs font-bold text-slate-500 uppercase border-b border-slate-800 tracking-wider w-[10%]">
                        {t.downloads.tableVolume}
                      </th>
                      <th className="py-4 px-6 bg-[#0f1523] text-xs font-bold text-slate-500 uppercase border-b border-slate-800 tracking-wider w-[30%]">
                        {t.downloads.tableStatus}
                      </th>
                      <th className="py-4 px-6 bg-[#0f1523] text-xs font-bold text-slate-500 uppercase border-b border-slate-800 tracking-wider w-[15%]">
                        {t.downloads.tableSize}
                      </th>
                      <th className="py-4 px-6 bg-[#0f1523] text-xs font-bold text-slate-500 uppercase border-b border-slate-800 tracking-wider text-right w-[15%]">
                        {t.downloads.tableActions}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {visibleDownloads.map((d) => {
                      const isCompleted = d.status === "completed";
                      const isDownloading = d.status === "downloading";
                      const isPaused = d.status === "paused";
                      const isCanceled = d.status === "canceled";
                      const { dateLabel, volumeLabel, displaySize } = d;

                      return (
                        <tr key={d.id} className="hover:bg-[#1a2233] transition-colors group">
                          <td className="py-4 px-6 border-b border-slate-800/50">
                            <div className="font-medium text-white truncate max-w-[250px] md:max-w-sm lg:max-w-md" title={d.title}>
                              {d.title}
                            </div>
                            {dateLabel !== "--" && (
                              <div className="mt-1 text-xs text-slate-500">{dateLabel}</div>
                            )}
                          </td>
                          <td className="py-4 px-6 border-b border-slate-800/50 font-mono text-slate-400">
                            {volumeLabel}
                          </td>
                          <td className="py-4 px-6 border-b border-slate-800/50">
                            {isCompleted ? (
                              <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs uppercase tracking-wide">
                                <Check size={16} strokeWidth={3} />
                                {t.downloads.completed}
                              </div>
                            ) : isCanceled ? (
                              <div className="flex items-center gap-2 text-rose-500 font-bold text-xs uppercase tracking-wide">
                                <X size={16} strokeWidth={3} />
                                {t.downloads.canceled}
                              </div>
                            ) : (
                              <div className="w-full">
                                <div className="flex justify-between items-end mb-1">
                                  <span className={`text-[10px] font-bold uppercase ${isPaused ? "text-amber-500" : "text-blue-400"}`}>
                                    {isPaused ? t.downloads.statusPaused : isDownloading ? t.downloads.statusDownloading : t.downloads.statusPending}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {isDownloading && d.speed && d.speed !== "0 MB/s" && (
                                      <span className="text-[10px] font-mono text-blue-400">{d.speed}</span>
                                    )}
                                    <span className="text-[10px] font-mono text-slate-500">{d.progress}%</span>
                                  </div>
                                </div>
                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-300 ${isPaused ? "bg-amber-500" : "bg-blue-600"}`}
                                    style={{ width: `${Math.max(0, d.progress || 0)}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-6 border-b border-slate-800/50 text-sm font-mono text-slate-400">
                            {displaySize}
                          </td>
                          <td className="py-4 px-6 border-b border-slate-800/50 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                              {isCanceled ? (
                                <button
                                  onClick={() => retryDownload(d.id)}
                                  className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 flex items-center gap-2 text-xs font-bold transition-colors"
                                  title={t.downloads.redownload}
                                >
                                  <RefreshCw size={14} />
                                  <span className="hidden lg:inline">{t.downloads.redownload}</span>
                                </button>
                              ) : !isCompleted ? (
                                <>
                                  {isPaused ? (
                                    <button onClick={() => resumeDownload(d.id)} className="p-1.5 hover:bg-slate-700 rounded text-slate-300" title={t.tooltips.resume}>
                                      <Play size={16} />
                                    </button>
                                  ) : (
                                    <button onClick={() => pauseDownload(d.id)} className="p-1.5 hover:bg-slate-700 rounded text-slate-300" title={t.tooltips.pause}>
                                      <Pause size={16} />
                                    </button>
                                  )}
                                  <button onClick={() => cancelDownload(d.id)} className="p-1.5 hover:bg-rose-900/30 rounded text-rose-400" title={t.tooltips.cancel}>
                                    <X size={16} />
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => openFolder(d.path)} className="p-1.5 hover:bg-slate-700 rounded text-slate-300" title={t.tooltips.openFolder}>
                                  <Folder size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden flex flex-col gap-3 p-4">
                {visibleDownloads.map((d) => {
                  const isCompleted = d.status === "completed";
                  const isDownloading = d.status === "downloading";
                  const isPaused = d.status === "paused";
                  const isCanceled = d.status === "canceled";
                  const { dateLabel, volumeLabel, displaySize } = d;

                  const statusLabel = isCompleted ? t.downloads.completed
                    : isCanceled ? t.downloads.canceled
                      : isPaused ? t.downloads.statusPaused
                        : isDownloading ? t.downloads.statusDownloading
                          : t.downloads.statusPending;

                  const statusTone = isCompleted ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                    : isCanceled ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
                      : isPaused ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
                        : "text-blue-400 bg-blue-500/10 border-blue-500/30";

                  const showProgress = !isCompleted && !isCanceled;

                  return (
                    <div key={d.id} className="bg-[#0f1523] border border-[#1e293b] rounded-xl p-4 shadow-lg">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white leading-snug line-clamp-2">{d.title}</div>
                          <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-2">
                            <span className="font-mono text-slate-400">{volumeLabel}</span>
                            {dateLabel !== "--" && <span className="text-slate-500">• {dateLabel}</span>}
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase border whitespace-nowrap ${statusTone}`}>
                          {statusLabel}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-mono">{displaySize}</span>
                        {!isCompleted && !isCanceled && d.speed && d.speed !== "0 MB/s" && (
                          <span className="text-blue-400 font-mono">{d.speed}</span>
                        )}
                        <span className="font-mono">{d.progress}%</span>
                      </div>

                      {showProgress && (
                        <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${isPaused ? "bg-amber-500" : "bg-blue-600"}`}
                            style={{ width: `${Math.max(0, d.progress || 0)}%` }}
                          />
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {isCanceled ? (
                          <button onClick={() => retryDownload(d.id)} className="flex-1 min-w-[140px] px-3 py-2 rounded-lg bg-slate-800 text-slate-200 border border-slate-700/50 text-sm font-semibold flex items-center justify-center gap-2">
                            <RefreshCw size={14} />
                            <span>{t.downloads.redownload}</span>
                          </button>
                        ) : !isCompleted ? (
                          <>
                            <button onClick={() => isPaused ? resumeDownload(d.id) : pauseDownload(d.id)} className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-slate-800 text-slate-200 border border-slate-700/50 text-sm font-semibold flex items-center justify-center gap-2">
                              {isPaused ? <Play size={14} /> : <Pause size={14} />}
                              <span>{isPaused ? t.tooltips.resume : t.tooltips.pause}</span>
                            </button>
                            <button onClick={() => cancelDownload(d.id)} className="flex-1 min-w-[100px] px-3 py-2 rounded-lg bg-rose-900/40 text-rose-300 border border-rose-900/60 text-sm font-semibold flex items-center justify-center gap-2">
                              <X size={14} />
                              <span>{t.tooltips.cancel}</span>
                            </button>
                          </>
                        ) : (
                          <button onClick={() => openFolder(d.path)} className="flex-1 min-w-[140px] px-3 py-2 rounded-lg bg-slate-800 text-slate-200 border border-slate-700/50 text-sm font-semibold flex items-center justify-center gap-2">
                            <Folder size={14} />
                            <span>{t.tooltips.openFolder}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bouton "Voir plus" */}
              {hasMore && (
                <div className="p-4 border-t border-slate-800">
                  <button
                    onClick={loadMore}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <ChevronDown size={18} />
                    <span>Voir plus ({remainingCount} restants)</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(DownloadsView);
