import React, { useMemo } from "react";
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
} from "lucide-react";
import { useTranslation } from "../i18n";
import { DownloadItem, VkNode } from "../types";

interface DownloadsViewProps {
  downloads: DownloadItem[];
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string) => void;
  syncedData?: VkNode[] | null;
  downloadPath?: string;
  clearDownloads: () => void;
}

const DownloadsView: React.FC<DownloadsViewProps> = ({
  downloads,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  retryDownload,
  syncedData,
  downloadPath,
  clearDownloads,
}) => {
  const { t } = useTranslation();

  const stats = useMemo(() => {
    const downloadedCount = downloads.filter(
      (d) => d.status === "completed",
    ).length;
    const inProgressCount = downloads.filter((d) =>
      ["downloading", "pending", "paused"].includes(d.status),
    ).length;

    let seriesCount = 0;
    const countSeries = (nodes: VkNode[]) => {
      nodes.forEach((n) => {
        if (n.type === "genre" || n.type === "series") seriesCount++;
        if (n.children) countSeries(n.children);
      });
    };
    if (syncedData) countSeries(syncedData);

    return {
      indexed: seriesCount > 0 ? seriesCount : 0,
      downloaded: downloadedCount,
      inProgress: inProgressCount,
    };
  }, [downloads, syncedData]);

  const getVolumeLabel = (title: string) => {
    const match =
      title.match(/T(\d+)/i) ||
      title.match(/#(\d+)/) ||
      title.match(/Vol\.?(\d+)/i);
    return match ? `#${match[1]}` : "#1";
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "--";
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "--";
    return date.toLocaleString();
  };

  const getFolderFromPath = (p?: string) => {
    if (!p) return undefined;
    const normalized = p.replace(/\\/g, "/");
    const idx = normalized.lastIndexOf("/");
    if (idx <= 0) return p;
    return p.slice(0, idx);
  };

  return (
    <div className="flex-1 p-8 flex flex-col pt-6 animate-fade-in overflow-y-auto custom-scrollbar">
      <div className="w-full flex flex-col">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <BarChart className="text-slate-200" size={24} />
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {t.downloads.overviewTitle}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-[#131926] border border-[#1e293b] rounded-xl p-6 flex flex-col justify-center shadow-lg">
              <span className="text-4xl font-bold text-white mb-2">
                {stats.indexed}
              </span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {t.downloads.statsIndexed}
              </span>
            </div>

            <div className="bg-[#131926] border border-[#1e293b] rounded-xl p-6 flex flex-col justify-center shadow-lg">
              <span className="text-4xl font-bold text-white mb-2">
                {stats.downloaded}
              </span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {t.downloads.statsDownloaded}
              </span>
            </div>

            <div className="bg-[#131926] border border-[#1e293b] rounded-xl p-6 flex flex-col justify-center shadow-lg sm:col-span-2 lg:col-span-1">
              <span className="text-4xl font-bold text-white mb-2">
                {stats.inProgress}
              </span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {t.downloads.statsInProgress}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Download className="text-slate-200" size={24} />
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {t.downloads.title}
            </h2>
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

        <div className="bg-[#131926] border border-[#1e293b] rounded-xl overflow-hidden shadow-xl flex flex-col min-h-[400px]">
          {downloads.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-20">
              <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
                <Download size={24} />
              </div>
              <p className="font-medium">{t.downloads.noDownloads}</p>
              <p className="text-xs text-slate-600 mt-1">
                {t.downloads.noDownloadsDescription}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left border-collapse">
                <thead>
                  <tr>
                    <th className="py-4 px-6 bg-[#0f1523] text-xs font-bold text-slate-500 uppercase border-b border-slate-800 tracking-wider">
                      {t.downloads.tableSeries}
                    </th>
                    <th className="py-4 px-6 bg-[#0f1523] text-xs font-bold text-slate-500 uppercase border-b border-slate-800 tracking-wider">
                      {t.downloads.tableVolume}
                    </th>
                    <th className="py-4 px-6 bg-[#0f1523] text-xs font-bold text-slate-500 uppercase border-b border-slate-800 tracking-wider">
                      {t.downloads.tableStatus}
                    </th>
                    <th className="py-4 px-6 bg-[#0f1523] text-xs font-bold text-slate-500 uppercase border-b border-slate-800 tracking-wider">
                      {t.downloads.tableSize}
                    </th>
                    <th className="py-4 px-6 bg-[#0f1523] text-xs font-bold text-slate-500 uppercase border-b border-slate-800 tracking-wider text-right">
                      {t.downloads.tableActions}
                    </th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {downloads
                    .sort((a, b) => {
                      const statusPriority = {
                        downloading: 1,
                        paused: 2,
                        pending: 3,
                        completed: 4,
                        canceled: 5,
                        error: 6,
                      };

                      const priorityA = statusPriority[a.status] || 99;
                      const priorityB = statusPriority[b.status] || 99;

                      return priorityA - priorityB;
                    })
                    .map((d) => {
                      const isCompleted = d.status === "completed";
                      const isDownloading = d.status === "downloading";
                      const isPaused = d.status === "paused";
                      const isCanceled = d.status === "canceled";
                      const dateLabel = formatDate(d.createdAt);
                      const volumeLabel = getVolumeLabel(d.title);
                      const displaySize = d.size || "--";

                      return (
                        <tr
                          key={d.id}
                          className="hover:bg-[#1a2233] transition-colors group"
                        >
                          <td className="py-4 px-6 border-b border-slate-800/50">
                            <div
                              className="font-medium text-white truncate max-w-[250px] md:max-w-sm lg:max-w-md"
                              title={d.title}
                            >
                              {d.title}
                            </div>
                            {dateLabel !== "--" && (
                              <div className="mt-1 text-xs text-slate-500">
                                {dateLabel}
                              </div>
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
                                  <span
                                    className={`text-[10px] font-bold uppercase ${isPaused ? "text-amber-500" : "text-blue-400"}`}
                                  >
                                    {isPaused
                                      ? t.downloads.statusPaused
                                      : isDownloading
                                        ? t.downloads.statusDownloading
                                        : t.downloads.statusPending}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-500">
                                    {d.progress}%
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-300 ${isPaused ? "bg-amber-500" : "bg-blue-600"}`}
                                    style={{ width: `${d.progress}%` }}
                                  ></div>
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
                                  <span className="hidden lg:inline">
                                    {t.downloads.redownload}
                                  </span>
                                </button>
                              ) : (
                                !isCompleted && (
                                  <>
                                    {isPaused ? (
                                      <button
                                        onClick={() => resumeDownload(d.id)}
                                        className="p-1.5 hover:bg-slate-700 rounded text-slate-300"
                                        title={t.tooltips.resume}
                                      >
                                        <Play size={16} />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => pauseDownload(d.id)}
                                        className="p-1.5 hover:bg-slate-700 rounded text-slate-300"
                                        title={t.tooltips.pause}
                                      >
                                        <Pause size={16} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => cancelDownload(d.id)}
                                      className="p-1.5 hover:bg-rose-900/30 rounded text-rose-400"
                                      title={t.tooltips.cancel}
                                    >
                                      <X size={16} />
                                    </button>
                                  </>
                                )
                              )}

                              {isCompleted && (
                                <button
                                  className="p-1.5 hover:bg-slate-700 rounded text-slate-300"
                                  title={t.tooltips.openFolder}
                                  onClick={() => {
                                    if (
                                      typeof window === "undefined" ||
                                      !window.fs
                                    )
                                      return;

                                    if (window.fs.revealPath && d.path) {
                                      window.fs.revealPath(d.path);
                                    } else if (window.fs.openPath) {
                                      const folder =
                                        getFolderFromPath(d.path) ||
                                        downloadPath;
                                      if (folder) {
                                        window.fs.openPath(folder);
                                      }
                                    }
                                  }}
                                >
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
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(DownloadsView);
