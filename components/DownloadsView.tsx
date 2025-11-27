
import React from 'react';
import { BarChart, Download, Check, Folder, AlertCircle } from './Icons';

// Mock Data - Empty for now as requested
const DOWNLOAD_HISTORY: any[] = [];

const DownloadsView: React.FC = () => {
  return (
    <div className="flex-1 p-8 flex flex-col pt-8 animate-fade-in overflow-y-auto custom-scrollbar">
      
      {/* Search Bar Placeholder */}
      <div className="mb-8"></div>

      {/* Overview Section */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-6">
           <BarChart className="text-slate-400" size={24} />
           <h2 className="text-2xl font-bold text-white tracking-tight">Vue d'ensemble</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <StatCard label="SÉRIES INDEXÉES" value="0" />
           <StatCard label="TOMES TÉLÉCHARGÉS" value="0" />
           <StatCard label="EN COURS" value="0" />
        </div>
      </div>

      {/* Downloads List Section */}
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-6">
           <Download className="text-slate-400" size={24} />
           <h2 className="text-2xl font-bold text-white tracking-tight">Téléchargements</h2>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-[300px] flex flex-col">
           
           {/* Table Header */}
           <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-[#1f2937]/50 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <div className="col-span-6">Série</div>
              <div className="col-span-1 text-center">Tome</div>
              <div className="col-span-2 text-center">Statut</div>
              <div className="col-span-2 text-right">Taille</div>
              <div className="col-span-1 text-center">Actions</div>
           </div>

           {/* Table Body */}
           <div className="divide-y divide-slate-800/50 flex-1 relative">
              {DOWNLOAD_HISTORY.length > 0 ? (
                  DOWNLOAD_HISTORY.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-800/30 transition-colors group">
                        {/* Title */}
                        <div className="col-span-6 pr-4">
                            <div className="text-slate-200 font-medium truncate" title={item.title}>
                               {item.title}
                            </div>
                        </div>
                        {/* Volume */}
                        <div className="col-span-1 text-center text-slate-500 font-mono text-sm">
                           {item.volume}
                        </div>
                        {/* Status */}
                        <div className="col-span-2 flex flex-col items-center justify-center">
                           {item.status === 'completed' && (
                               <>
                                 <Check size={16} className="text-emerald-500 mb-1" />
                                 <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide">Téléchargé</span>
                               </>
                           )}
                        </div>
                        {/* Size */}
                        <div className="col-span-2 text-right text-slate-400 font-mono text-sm">
                           {item.size}
                        </div>
                        {/* Actions */}
                        <div className="col-span-1 flex justify-center">
                            <button className="text-slate-600 hover:text-blue-400 transition-colors p-2 rounded-lg hover:bg-slate-800">
                               <Folder size={18} />
                            </button>
                        </div>
                    </div>
                  ))
              ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                      <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4 border border-slate-700/50">
                          <Download size={32} className="opacity-50" />
                      </div>
                      <p className="font-medium">Aucun téléchargement effectué</p>
                      <p className="text-xs text-slate-600 mt-1">L'historique des téléchargements apparaîtra ici</p>
                  </div>
              )}
           </div>
        </div>
      </div>

    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-[#1e293b]/40 border border-slate-700/50 rounded-xl p-6 flex flex-col items-start justify-center min-h-[120px]">
     <div className="text-4xl font-bold text-white mb-2">{value}</div>
     <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</div>
  </div>
);

export default DownloadsView;
