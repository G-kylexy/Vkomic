import React from 'react';
import { Download, Pause, Play, X, Check } from 'lucide-react';
import { useTranslation } from '../i18n';
import { DownloadItem } from '../types';

interface DownloadsViewProps {
  downloads: DownloadItem[];
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
}

const DownloadsView: React.FC<DownloadsViewProps> = ({ downloads, pauseDownload, resumeDownload, cancelDownload }) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 p-8 flex flex-col pt-6 animate-fade-in overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-3 mb-6">
        <Download className="text-slate-400" size={24} />
        <h2 className="text-2xl font-bold text-white tracking-tight">{t.downloads.title}</h2>
      </div>

      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
        {downloads.length === 0 && (
          <div className="py-16 text-center text-slate-500">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
              <Download size={20} />
            </div>
            <p className="font-medium">{t.downloads.noDownloads}</p>
            <p className="text-xs text-slate-600 mt-1">{t.downloads.noDownloadsDescription}</p>
          </div>
        )}

        <div className="divide-y divide-slate-800/60">
          {downloads.map((d) => {
            const isPaused = d.status === 'paused';
            const isCompleted = d.status === 'completed';
            const isCanceled = d.status === 'canceled';

            return (
              <div key={d.id} className="px-6 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-white font-semibold truncate" title={d.title}>
                      {d.title}
                    </div>
                    <div className="text-xs text-slate-500 uppercase">
                      {d.extension || t.library.fileLabel}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isCompleted && !isCanceled && (
                      <>
                        {isPaused ? (
                          <button
                            onClick={() => resumeDownload(d.id)}
                            className="px-3 py-2 rounded-lg border border-slate-700/60 text-xs text-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-1"
                          >
                            <Play size={14} /> Reprendre
                          </button>
                        ) : (
                          <button
                            onClick={() => pauseDownload(d.id)}
                            className="px-3 py-2 rounded-lg border border-slate-700/60 text-xs text-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-1"
                          >
                            <Pause size={14} /> Pause
                          </button>
                        )}
                        <button
                          onClick={() => cancelDownload(d.id)}
                          className="px-3 py-2 rounded-lg border border-rose-700/60 text-xs text-rose-200 hover:bg-rose-900/30 transition-colors flex items-center gap-1"
                        >
                          <X size={14} /> Annuler
                        </button>
                      </>
                    )}
                    {isCompleted && (
                      <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                        <Check size={14} /> Terminé
                      </span>
                    )}
                    {isCanceled && (
                      <span className="text-slate-500 text-xs font-semibold flex items-center gap-1">
                        Annulé
                      </span>
                    )}
                  </div>
                </div>

                <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${isCompleted ? 'bg-emerald-500' : 'bg-blue-500'}`}
                    style={{ width: `${d.progress}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400">{d.progress}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DownloadsView;
