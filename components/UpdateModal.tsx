import React from 'react';
import { Download, X } from './Icons';
import { Github } from 'lucide-react';

interface UpdateModalProps {
  version: string;
  notes: string;
  url: string;
  onClose: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({ version, notes, url, onClose }) => {
  const handleDownload = () => {
    if (window.shell?.openExternal) {
      window.shell.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#131926] border border-blue-500/30 rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Github className="text-white" size={24} />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">Mise à jour disponible</h3>
              <p className="text-blue-100 text-xs font-medium">Version {version}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-blue-100 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-6">
            <h4 className="text-slate-300 text-sm font-bold uppercase tracking-wider mb-3">
              Nouveautés
            </h4>
            <div className="bg-[#0f1523] rounded-lg p-4 border border-slate-800 max-h-48 overflow-y-auto custom-scrollbar">
              <p className="text-slate-400 text-sm whitespace-pre-wrap leading-relaxed">
                {notes || 'Aucune note de version disponible.'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-lg border border-slate-700 text-slate-300 font-medium hover:bg-slate-800 transition-colors"
            >
              Ignorer
            </button>
            <button
              onClick={handleDownload}
              className="flex-1 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2"
            >
              <Download size={18} />
              Télécharger
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;

