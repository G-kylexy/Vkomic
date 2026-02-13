import React from "react";
import { Download, X, Gift, ShieldCheck, Zap } from "lucide-react";

interface UpdateModalProps {
  version: string;
  notes: string;
  status: "available" | "downloading" | "ready";
  progress?: number;
  onDownload: () => void;
  onInstall: () => void;
  onClose: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({
  version,
  notes,
  status,
  progress,
  onDownload,
  onInstall,
  onClose,
}) => {
  const isReady = status === "ready";
  const isDownloading = status === "downloading";
  const percentValue =
    typeof progress === "number"
      ? Math.max(0, Math.min(Math.round(progress), 100))
      : null;

  const handlePrimary = () => {
    if (isReady) {
      onInstall();
    } else {
      onDownload();
    }
  };

  const getButtonLabel = () => {
    if (isReady) return "Redémarrer maintenant";
    if (isDownloading) return "Téléchargement en cours...";
    return "Installer la mise à jour";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="relative bg-[#0b1120] border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-row h-[380px] ring-1 ring-white/10">

        {/* Decorative background glow (Global) */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-3xl pointer-events-none" />

        {/* Left Panel: Header & Branding */}
        <div className="w-[220px] bg-[#0f1629] border-r border-slate-800/50 flex flex-col items-center justify-center p-6 relative overflow-hidden shrink-0">
          <div className="absolute inset-0 bg-blue-600/5" />
          <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-blue-900/20 to-transparent" />

          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 mb-4 rotate-3">
              <Zap className="text-white" size={28} fill="currentColor" />
            </div>

            <h2 className="text-lg font-bold text-white mb-1 leading-tight">
              Mise à jour<br />disponible
            </h2>

            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-xs font-semibold">
              <ShieldCheck size={12} />
              <span>v{version}</span>
            </div>
          </div>
        </div>

        {/* Right Panel: Content & Actions */}
        <div className="flex-1 flex flex-col p-6 relative z-10 min-w-0">

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>

          {/* Title */}
          <div className="mb-4 flex items-center gap-2">
            <Gift size={16} className="text-purple-400" />
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide">
              Nouveautés
            </h3>
          </div>

          {/* Scrollable Notes */}
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar -mr-2 mb-4">
            <div
              className="prose prose-sm prose-invert max-w-none text-slate-400 text-sm leading-relaxed font-light [&>ul]:list-disc [&>ul]:pl-4 [&>li]:mb-1"
              dangerouslySetInnerHTML={{
                __html: notes || "<p>Améliorations de la stabilité et corrections de bugs.</p>"
              }}
            />
          </div>

          {/* Footer Area */}
          <div className="mt-auto pt-4 border-t border-slate-800/50">
            {/* Progress Bar */}
            {isDownloading && (
              <div className="mb-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-medium">
                  <span>Téléchargement...</span>
                  <span>{percentValue ?? 0}%</span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                    style={{ width: `${percentValue ?? 0}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 font-medium hover:text-white hover:bg-white/5 transition-colors"
              >
                Plus tard
              </button>
              <button
                onClick={handlePrimary}
                disabled={isDownloading && !isReady}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold shadow-md shadow-blue-600/10 hover:shadow-blue-600/30 transition-all duration-200 flex items-center justify-center gap-2"
              >
                {isReady ? <Zap size={16} fill="currentColor" /> : <Download size={16} />}
                {getButtonLabel()}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
