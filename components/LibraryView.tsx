import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Folder,
  FileText,
  RefreshCw,
  ChevronLeft,
  DownloadCloud,
  Settings,
} from "./Icons";
import { useTranslation } from "../i18n";

interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number | null;
  modifiedAt: number;
}

interface LibraryViewProps {
  downloadPath: string;
  onNavigateToSettings?: () => void;
}

const normalizePath = (value: string) => value.replace(/\\/g, "/");

const joinPaths = (base: string, segment: string) => {
  if (!segment) return base;
  if (base.endsWith("\\") || base.endsWith("/")) return `${base}${segment}`;
  const usesBackslash = base.includes("\\");
  return `${base}${usesBackslash ? "\\" : "/"}${segment}`;
};

const formatSize = (size: number | null) => {
  if (size === null || size === undefined) return "--";
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

const formatDate = (timestamp: number) => {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  return date.toLocaleString();
};

const buildBreadcrumbs = (base: string, target: string, rootLabel: string) => {
  if (!base) return [];
  const breadcrumbs = [{ label: rootLabel, path: base }];
  if (!target) return breadcrumbs;

  const normalizedBase = normalizePath(base);
  const normalizedTarget = normalizePath(target);

  if (!normalizedTarget.startsWith(normalizedBase)) {
    breadcrumbs.push({ label: target, path: target });
    return breadcrumbs;
  }

  const diff = normalizedTarget
    .slice(normalizedBase.length)
    .replace(/^\/+/, "");
  if (!diff) return breadcrumbs;

  let current = base;
  diff.split("/").forEach((segment) => {
    if (segment.length === 0) return;
    current = joinPaths(current, segment);
    breadcrumbs.push({ label: segment, path: current });
  });

  return breadcrumbs;
};

const computeParentWithinBase = (current: string, base: string) => {
  const normalizedBase = normalizePath(base);
  const normalizedCurrent = normalizePath(current);

  if (!normalizedCurrent.startsWith(normalizedBase)) {
    return base;
  }

  const relative = normalizedCurrent
    .slice(normalizedBase.length)
    .replace(/^\/+/, "");
  if (!relative) return base;

  const parts = relative.split("/");
  parts.pop();

  let target = base;
  parts.forEach((segment) => {
    target = joinPaths(target, segment);
  });
  return target;
};

// Parcourt le dossier de téléchargement local via l'IPC exposé par Electron
const LibraryView: React.FC<LibraryViewProps> = ({
  downloadPath,
  onNavigateToSettings,
}) => {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePath = downloadPath?.trim();
  const hasFsBridge =
    typeof window !== "undefined" && Boolean(window.fs?.listDirectory);

  const loadPath = useCallback(
    async (target: string) => {
      if (typeof window === "undefined" || !window.fs?.listDirectory) {
        setError(t.library.desktopOnly);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const result = await window.fs.listDirectory(target);
        setEntries(result.entries);
        setCurrentPath(result.path);
      } catch (err) {
        console.error(err);
        setError(t.library.readError);
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (effectivePath && hasFsBridge) {
      loadPath(effectivePath);
    }
  }, [effectivePath, hasFsBridge, loadPath]);

  const breadcrumbs = useMemo(() => {
    if (!effectivePath || !currentPath) return [];
    return buildBreadcrumbs(effectivePath, currentPath, t.library.rootLabel);
  }, [effectivePath, currentPath, t.library.rootLabel]);

  const canNavigateUp = Boolean(
    currentPath &&
    effectivePath &&
    normalizePath(currentPath) !== normalizePath(effectivePath),
  );

  const handleNavigateUp = () => {
    if (!currentPath || !effectivePath) return;
    if (!canNavigateUp) return;
    const parent = computeParentWithinBase(currentPath, effectivePath);
    loadPath(parent);
  };

  const handleEntryClick = (entry: FsEntry) => {
    if (entry.isDirectory) {
      loadPath(entry.path);
    } else if (typeof window !== "undefined" && window.fs?.openPath) {
      window.fs.openPath(entry.path);
    }
  };

  const handleOpenFile = (entry: FsEntry) => {
    if (typeof window !== "undefined" && window.fs?.openPath) {
      window.fs.openPath(entry.path);
    }
  };

  if (!effectivePath) {
    return (
      <div className="flex-1 p-8 flex flex-col pt-6 animate-fade-in overflow-y-auto custom-scrollbar">
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-slate-400 gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-2">
            <Settings size={32} className="text-slate-500" />
          </div>
          <p className="font-medium text-lg">{t.library.noDownloadPath}</p>
          {onNavigateToSettings && (
            <button
              onClick={onNavigateToSettings}
              className="mt-2 flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-lg"
            >
              <Settings size={18} />
              <span>{t.library.configureFolder}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!hasFsBridge) {
    return (
      <div className="flex-1 p-8 flex flex-col pt-6 animate-fade-in overflow-y-auto custom-scrollbar">
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-slate-400 gap-3">
          <p className="font-medium text-lg">{t.library.desktopOnly}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 flex flex-col pt-6 animate-fade-in overflow-y-auto custom-scrollbar pb-24">
      <div className="w-full flex flex-col">
        <div className="pt-2 pb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                {t.library.localTitle}
              </h1>
              <p className="text-slate-500 text-sm mt-2">
                {currentPath || effectivePath}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleNavigateUp}
                disabled={!canNavigateUp || isLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700/50 text-sm transition-colors ${canNavigateUp && !isLoading
                    ? "text-slate-200 bg-slate-800 hover:bg-slate-700"
                    : "text-slate-500 bg-slate-800/50 cursor-not-allowed"
                  }`}
              >
                <ChevronLeft size={16} />
                {t.library.back}
              </button>
              <button
                onClick={() => currentPath && loadPath(currentPath)}
                disabled={!currentPath || isLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700/50 text-sm text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw
                  size={16}
                  className={isLoading ? "animate-spin" : ""}
                />
                {t.library.refresh}
              </button>
            </div>
          </div>

          {breadcrumbs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.path}>
                  {index > 0 && <span className="text-slate-600">/</span>}
                  <button
                    onClick={() => loadPath(crumb.path)}
                    className={`hover:text-white transition-colors ${index === breadcrumbs.length - 1
                        ? "text-white font-semibold cursor-default"
                        : ""
                      }`}
                    disabled={index === breadcrumbs.length - 1}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-3 text-rose-300 bg-rose-500/10 px-4 py-3 rounded-lg border border-rose-500/20">
            <span className="text-sm">{error}</span>
          </div>
        )}

        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <RefreshCw className="animate-spin mr-2" size={20} />
            {t.library.loading}
          </div>
        )}

        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 pb-4">
            {entries.map((entry) => {
              const isFolder = entry.isDirectory;
              return (
                <div
                  key={entry.path}
                  onDoubleClick={() => handleEntryClick(entry)}
                  className="bg-[#111827] rounded-xl border border-slate-800 p-5 flex flex-col justify-between hover:border-blue-500/40 transition-all duration-200 cursor-pointer"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => handleEntryClick(entry)}
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
                      {isFolder ? "--" : formatSize(entry.size)}
                    </p>
                    <p>
                      {t.library.modified}: {formatDate(entry.modifiedAt)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      isFolder ? loadPath(entry.path) : handleOpenFile(entry)
                    }
                    className="w-full border border-slate-700/50 rounded-md py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-all flex items-center justify-center gap-2"
                  >
                    {!isFolder && <DownloadCloud size={14} />}
                    {isFolder ? t.library.openFolder : t.library.openFile}
                  </button>
                </div>
              );
            })}

            {entries.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-500">
                <p>{t.library.emptyFolder}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(LibraryView);
