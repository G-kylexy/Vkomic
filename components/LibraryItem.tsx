import React, { memo } from "react";
import { Folder, FileText, DownloadCloud } from "./Icons";
import { useTranslation } from "../i18n";
import { formatBytesWithFallback, formatDateTimestamp } from "../utils/formatters";
import { FsEntry } from "../types";

interface LibraryItemProps {
  entry: FsEntry;
  onNavigate: (path: string) => void;
  onOpen: (path: string) => void;
}

const LibraryItem: React.FC<LibraryItemProps> = ({ entry, onNavigate, onOpen }) => {
  const { t } = useTranslation();
  const isFolder = entry.isDirectory;

  const handleInteract = () => {
    if (isFolder) {
      onNavigate(entry.path);
    } else {
      onOpen(entry.path);
    }
  };

  return (
    <div
      onDoubleClick={handleInteract}
      className="bg-[#111827] rounded-xl border border-slate-800 p-5 flex flex-col justify-between hover:border-blue-500/40 transition-all duration-200 cursor-pointer"
    >
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={handleInteract}
          className="p-3 rounded-xl bg-slate-800 text-blue-400 hover:bg-slate-700 transition-colors"
        >
          {isFolder ? <Folder size={24} /> : <FileText size={24} />}
        </button>
        <div className="flex-1 min-w-0">
          <h3
            className="text-white font-semibold truncate"
            title={entry.name}
          >
            {entry.name}
          </h3>
          <p className="text-xs text-slate-500">
            {isFolder ? t.library.folderLabel : t.library.fileLabel}
          </p>
        </div>
      </div>

      <div className="text-xs text-slate-500 space-y-1 mb-4">
        <p>
          {t.library.size}:{" "}
          {isFolder ? "--" : formatBytesWithFallback(entry.size)}
        </p>
        <p>
          {t.library.modified}: {formatDateTimestamp(entry.modifiedAt)}
        </p>
      </div>

      <button
        type="button"
        onClick={handleInteract}
        className="w-full border border-slate-700/50 rounded-md py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-all flex items-center justify-center gap-2"
      >
        {!isFolder && <DownloadCloud size={14} />}
        {isFolder ? t.library.openFolder : t.library.openFile}
      </button>
    </div>
  );
};

export default memo(LibraryItem);
