/**
 * MAIN.JS - Processus principal Electron
 * ======================================
 *
 * Ce fichier gère:
 * - La fenêtre principale de l'application
 * - Les communications IPC avec le renderer (React)
 * - Le système de téléchargement avec file d'attente
 * - Les mises à jour automatiques via GitHub
 * - L'intégration avec l'API VK
 */

import { app, BrowserWindow, ipcMain, shell, dialog, session } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  fetchFolderTreeUpToDepth as vkFetchFolderTreeUpToDepth,
  fetchNodeContent as vkFetchNodeContent,
  fetchRootIndex as vkFetchRootIndex,
  refreshDocUrl as vkRefreshDocUrl,
} from "./vk-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

let mainWindow;
let updateFeedReady = false;
let lastVkToken = null;  // Cache du dernier token VK utilisé

const GITHUB_REPO = "G-kylexy/vkomic";
const APP_BACKGROUND_COLOR = "#050B14";

/** Content Security Policy pour la production */
const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.vk.com https://oauth.vk.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

// ============================================================================
// SINGLE INSTANCE LOCK
// ============================================================================

/** Empêche l'ouverture de plusieurs instances de l'app */
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

// ============================================================================
// UTILITAIRES
// ============================================================================

/** Normalise les notes de release (peut être string ou array) */
const normalizeReleaseNotes = (notes) => {
  if (Array.isArray(notes)) {
    return notes
      .map((entry) => typeof entry === "string" ? entry : entry?.note || "")
      .filter(Boolean)
      .join("\n\n");
  }
  return typeof notes === "string" ? notes : "";
};

/** Envoie un message au renderer (React) via IPC */
const sendToRenderer = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
};

// ============================================================================
// CRÉATION DE LA FENÊTRE
// ============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,              // Fenêtre sans bordure (titre custom)
    autoHideMenuBar: true,
    show: false,               // Afficher après ready-to-show
    backgroundColor: APP_BACKGROUND_COLOR,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,  // Sécurité: isolation du contexte
      nodeIntegration: false,  // Sécurité: pas d'accès Node dans le renderer
      sandbox: true,           // Sécurité: sandbox activé
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
  });

  // En dev: charge le serveur Vite, en prod: charge le build
  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.once("did-frame-finish-load", () => {
      mainWindow?.webContents.openDevTools();
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// ============================================================================
// AUTO-UPDATER (Mises à jour via GitHub)
// ============================================================================

const ensureUpdateFeed = () => {
  if (updateFeedReady || !app.isPackaged) return;
  try {
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "G-kylexy",
      repo: "vkomic",
    });
    updateFeedReady = true;
  } catch (error) {
    console.error("Failed to configure update feed:", error);
  }
};

const setupAutoUpdater = () => {
  if (!app.isPackaged) return;

  ensureUpdateFeed();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Notifie le renderer des événements de mise à jour
  autoUpdater.on("update-available", (info) => {
    sendToRenderer("app:update-available", {
      version: info.version,
      notes: normalizeReleaseNotes(info.releaseNotes),
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("app:update-progress", {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendToRenderer("app:update-downloaded", {
      version: info.version,
      notes: normalizeReleaseNotes(info.releaseNotes),
    });
  });

  autoUpdater.on("error", (error) => {
    sendToRenderer("app:update-error", {
      message: error?.message || "Unknown update error",
    });
  });
};

// ============================================================================
// CONTENT SECURITY POLICY
// ============================================================================

const setupContentSecurityPolicy = () => {
  if (!app.isPackaged) return;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...(details.responseHeaders || {}),
        "Content-Security-Policy": [CSP_PROD],
      },
    });
  });
};

// ============================================================================
// INITIALISATION DE L'APPLICATION
// ============================================================================

app.whenReady().then(() => {
  setupContentSecurityPolicy();
  createWindow();
  setupAutoUpdater();

  // ========================================================================
  // IPC HANDLERS - Contrôles de fenêtre
  // ========================================================================

  ipcMain.on("win:min", () => mainWindow.minimize());
  ipcMain.on("win:max", () =>
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  );
  ipcMain.on("win:close", () => mainWindow.close());

  // Ouvre un lien dans le navigateur par défaut
  ipcMain.on("open-external", (_, url) => shell.openExternal(url));

  // ========================================================================
  // IPC HANDLERS - Système de fichiers
  // ========================================================================

  /** Ouvre le sélecteur de dossier natif */
  ipcMain.handle("dialog:selectFolder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  /** Liste le contenu d'un dossier local (pour la Bibliothèque) */
  ipcMain.handle("fs:listDirectory", async (_, targetPath) => {
    if (!targetPath || typeof targetPath !== "string") {
      throw new Error("Invalid path");
    }

    const stats = await fs.promises.stat(targetPath);
    if (!stats.isDirectory()) {
      throw new Error("Path is not a directory");
    }

    const dirEntries = await fs.promises.readdir(targetPath, { withFileTypes: true });
    const entries = await Promise.all(
      dirEntries.map(async (entry) => {
        const entryPath = path.join(targetPath, entry.name);
        const entryStats = await fs.promises.stat(entryPath);
        return {
          name: entry.name,
          path: entryPath,
          isDirectory: entryStats.isDirectory(),
          size: entryStats.isDirectory() ? null : entryStats.size,
          modifiedAt: entryStats.mtimeMs,
        };
      })
    );

    // Tri: dossiers d'abord, puis par nom
    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return { path: targetPath, entries };
  });

  // ========================================================================
  // SYSTÈME DE TÉLÉCHARGEMENT
  // ========================================================================

  /** Nombre max de téléchargements simultanés (réduit pour éviter le rate-limiting VK) */
  const DOWNLOAD_CONCURRENCY = 3;

  const activeDownloads = new Map();    // Map<id, AbortController>
  const downloadQueue = [];              // File d'attente des IDs
  const queuedDownloadIds = new Set();   // Set pour vérification rapide
  const downloadTasks = new Map();       // Map<id, TaskInfo>

  /** Envoie la progression au renderer */
  function sendDownloadProgress(payload) {
    sendToRenderer("fs:downloadProgress", payload);
  }

  /** Envoie le résultat final au renderer */
  function sendDownloadResult(payload) {
    sendToRenderer("fs:downloadResult", payload);
  }

  /**
   * Résout le chemin de destination d'un téléchargement
   * Sanitize le nom de fichier pour éviter les caractères invalides
   */
  function resolveDownloadTarget(url, directory, fileName) {
    let finalName = fileName?.trim() || undefined;

    // Si pas de nom, extraire depuis l'URL
    if (!finalName) {
      try {
        const urlObj = new URL(url);
        const lastSegment = urlObj.pathname.split("/").filter(Boolean).pop() || "download";
        finalName = decodeURIComponent(lastSegment);
      } catch {
        finalName = "download";
      }
    }

    const sanitizedName = (finalName || "download").replace(/[<>:"/\\|?*]+/g, "").trim() || "download";
    const targetPath = path.join(directory, sanitizedName);

    return { safeDirectory: directory, targetPath };
  }

  /** Génère un résultat d'abort avec les infos du fichier partiel */
  async function resolveAbortResult(task) {
    try {
      const { targetPath } = resolveDownloadTarget(task.url, task.directory, task.fileName);
      const stats = await fs.promises.stat(targetPath);
      return { ok: false, status: "aborted", path: targetPath, size: stats.size };
    } catch {
      const { targetPath } = resolveDownloadTarget(task.url || "", task.directory, task.fileName);
      return { ok: false, status: "aborted", path: targetPath, size: 0 };
    }
  }

  /**
   * Télécharge un fichier avec support de:
   * - Reprise (Range headers)
   * - Rafraîchissement d'URL VK
   * - Détection d'erreurs HTML (fichiers protégés)
   */
  async function downloadFileInternal(controller, args) {
    const { id, url, directory, fileName, token, vkOwnerId, vkDocId, vkAccessKey } = args || {};
    const useToken = token || lastVkToken;

    if (!id || typeof id !== "string") throw new Error("Invalid download identifier");
    if ((!url || typeof url !== "string") && !vkDocId) throw new Error("Invalid URL for download");
    if (!directory || typeof directory !== "string") throw new Error("Invalid download directory");

    let currentUrl = url || "";

    // === Rafraîchissement automatique des URLs VK ===
    // Les URLs VK expirent, on tente de récupérer une URL fraîche via l'API
    if (useToken && ((currentUrl && currentUrl.includes("vk.com/doc")) || vkDocId)) {
      const ownerId = vkOwnerId || currentUrl?.match(/doc(-?\d+)_/)?.[1];
      const docId = vkDocId || currentUrl?.match(/_(\d+)/)?.[1] || id.replace("doc_", "");

      if (ownerId && docId) {
        const refresh = await vkRefreshDocUrl(useToken, ownerId, docId, currentUrl, vkAccessKey);
        if (refresh.url) {
          currentUrl = refresh.url;
          // Conserver le paramètre 'dl' si présent (requis pour certains téléchargements)
          const dlMatch = url?.match(/[?&]dl=([^&]+)/);
          if (dlMatch && !currentUrl.includes("dl=")) {
            currentUrl += (currentUrl.includes("?") ? "&" : "?") + `dl=${dlMatch[1]}`;
          }
        }
      }
    }

    const { safeDirectory, targetPath } = resolveDownloadTarget(currentUrl, directory, fileName);

    // === Support de la reprise ===
    let startByte = 0;
    try {
      const stats = await fs.promises.stat(targetPath);
      startByte = stats.size;
    } catch {
      startByte = 0;
    }

    try {
      const headers = { "User-Agent": "Vkomic/1.0" };
      if (startByte > 0) {
        headers["Range"] = `bytes=${startByte}-`;
      }

      const res = await fetch(currentUrl, { signal: controller.signal, headers });
      const contentType = res.headers.get("content-type") || "";

      // === Détection d'erreurs VK ===
      // Si VK renvoie HTML au lieu du fichier, c'est une erreur (fichier protégé, supprimé, etc.)
      const docExtensions = ['.pdf', '.cbz', '.cbr', '.zip', '.rar', '.epub', '.djvu', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif'];
      const isDocFile = docExtensions.some(ext => fileName?.toLowerCase().endsWith(ext));
      if (contentType.includes("text/html") && isDocFile) {
        const error = new Error("Le fichier est protégé ou n'est plus disponible sur VK");
        error.isVkHtmlError = true;
        throw error;
      }

      // === Gestion des codes HTTP ===
      if (!res.ok && res.status !== 206) {
        if (res.status === 416) {
          // Range Not Satisfiable = fichier déjà complet
          sendDownloadProgress({ id, receivedBytes: startByte, totalBytes: startByte, progress: 100, speedBytes: 0 });
          return { ok: true, path: targetPath, size: startByte };
        }
        throw new Error(`Failed to download file (HTTP ${res.status})`);
      }

      // Si le serveur ne supporte pas Range, recommencer depuis le début
      if (res.status === 200) startByte = 0;

      await fs.promises.mkdir(safeDirectory, { recursive: true });

      // === Streaming du fichier ===
      let receivedBytes = 0;
      const contentLength = res.headers.get("content-length");
      const chunkLength = contentLength ? parseInt(contentLength, 10) : null;
      const totalBytes = chunkLength ? startByte + chunkLength : null;
      const startedAt = Date.now();

      const emitProgress = (forceComplete = false) => {
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
        const speedBytes = receivedBytes / elapsedSeconds;
        const currentTotalBytes = startByte + receivedBytes;
        const progressValue = forceComplete || (totalBytes && currentTotalBytes >= totalBytes)
          ? 100
          : totalBytes ? Math.min(100, (currentTotalBytes / totalBytes) * 100) : null;

        sendDownloadProgress({ id, receivedBytes: currentTotalBytes, totalBytes, progress: progressValue, speedBytes });
      };

      if (startByte > 0) emitProgress();

      const reader = res.body?.getReader?.();
      if (!reader) {
        // Fallback pour navigateurs sans streaming
        const buffer = Buffer.from(await res.arrayBuffer());
        receivedBytes = buffer.length;
        await fs.promises.writeFile(targetPath, buffer);
        emitProgress(true);
        return { ok: true, path: targetPath, size: receivedBytes };
      }

      // Écriture streaming avec gestion du backpressure
      const flags = startByte > 0 && res.status === 206 ? "a" : "w";
      const fileStream = fs.createWriteStream(targetPath, { flags });
      let lastEmit = Date.now();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            const chunk = Buffer.from(value);
            receivedBytes += chunk.length;
            if (!fileStream.write(chunk)) {
              await new Promise((resolve) => fileStream.once("drain", resolve));
            }
            // Throttle les updates de progression (250ms)
            if (Date.now() - lastEmit >= 250) {
              emitProgress();
              lastEmit = Date.now();
            }
          }
        }

        fileStream.end();
        await new Promise((resolve, reject) => {
          fileStream.on("finish", resolve);
          fileStream.on("error", reject);
        });
        emitProgress(true);
      } catch (error) {
        fileStream.destroy();
        if (error?.name === "AbortError") {
          return { ok: false, status: "aborted", path: targetPath, size: startByte + receivedBytes };
        }
        await fs.promises.rm(targetPath, { force: true }).catch(() => {});
        throw error;
      }

      return { ok: true, path: targetPath, size: startByte + receivedBytes };
    } catch (error) {
      const isAbortError = error?.name === "AbortError" || error?.code === "ABORT_ERR" ||
        error?.message?.includes("aborted");

      if (isAbortError) {
        try {
          const stats = await fs.promises.stat(targetPath);
          return { ok: false, status: "aborted", path: targetPath, size: stats.size };
        } catch {
          return { ok: false, status: "aborted", path: targetPath, size: startByte };
        }
      }
      throw error;
    }
  }

  /** Ajoute un téléchargement à la file d'attente */
  function enqueueDownloadTask(args, waiter) {
    const { id, url, directory, fileName, vkOwnerId, vkDocId, vkAccessKey } = args || {};

    if (!id || typeof id !== "string") throw new Error("Invalid download identifier");
    if ((!url || typeof url !== "string") && !vkDocId) throw new Error("Invalid URL for download");
    if (!directory || typeof directory !== "string") throw new Error("Invalid download directory");

    // Vérifier si déjà en cours
    const activeController = activeDownloads.get(id);
    if (activeController && !activeController.signal?.aborted) {
      waiter?.reject?.(new Error("Download already in progress"));
      return { queued: false, alreadyRunning: true };
    }

    // Créer ou mettre à jour la tâche
    const existing = downloadTasks.get(id);
    const task = existing || { id, url, directory, fileName, waiters: [] };
    Object.assign(task, { url, directory, fileName, vkOwnerId, vkDocId, vkAccessKey });

    if (!existing) downloadTasks.set(id, task);
    if (waiter) task.waiters.push(waiter);
    if (!queuedDownloadIds.has(id)) {
      downloadQueue.push(id);
      queuedDownloadIds.add(id);
    }

    scheduleDownloads();
    return { queued: true, alreadyRunning: false };
  }

  /** Lance les téléchargements en attente (jusqu'à DOWNLOAD_CONCURRENCY) */
  function scheduleDownloads() {
    while (activeDownloads.size < DOWNLOAD_CONCURRENCY && downloadQueue.length > 0) {
      const nextId = downloadQueue.shift();
      if (!nextId || activeDownloads.has(nextId)) continue;

      queuedDownloadIds.delete(nextId);
      const task = downloadTasks.get(nextId);
      if (!task) continue;

      downloadTasks.delete(nextId);
      void runDownloadTask(nextId, task);
    }
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Exécute un téléchargement avec retry automatique
   * - 2 tentatives max
   * - Retry après erreur VK (3s) ou erreur réseau (2s)
   */
  async function runDownloadTask(id, task) {
    const controller = new AbortController();
    activeDownloads.set(id, controller);

    const MAX_RETRIES = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        sendDownloadProgress({ id, receivedBytes: 0, totalBytes: null, progress: 0, speedBytes: 0 });

        const result = await downloadFileInternal(controller, task);
        sendDownloadResult({ id, ...result });

        // Résoudre les waiters
        task.waiters?.forEach(({ resolve }) => { try { resolve(result); } catch {} });

        activeDownloads.delete(id);
        scheduleDownloads();
        return;
      } catch (error) {
        lastError = error;

        // Ne pas retry les aborts utilisateur
        const isAbortError = error?.name === "AbortError" || error?.code === "ABORT_ERR" ||
          error?.message?.includes("aborted");
        if (isAbortError) break;

        // Retry après erreur VK
        if (error?.isVkHtmlError && attempt < MAX_RETRIES) {
          await sleep(3000);
          continue;
        }

        // Retry après erreur réseau
        if (attempt < MAX_RETRIES && (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' ||
          error?.message?.includes('network'))) {
          await sleep(2000);
          continue;
        }

        break;
      }
    }

    // Échec final
    const message = lastError?.message || "Unknown download error";
    sendDownloadResult({ id, ok: false, status: "error", error: message });
    task.waiters?.forEach(({ reject }) => { try { reject(lastError); } catch {} });

    activeDownloads.delete(id);
    scheduleDownloads();
  }

  // === IPC Handlers pour les téléchargements ===

  /** Annule un téléchargement en cours ou en attente */
  ipcMain.handle("fs:cancelDownload", async (_, id) => {
    if (!id || typeof id !== "string") return false;

    let cancelled = false;

    // Retirer de la file d'attente
    if (queuedDownloadIds.has(id)) {
      queuedDownloadIds.delete(id);
      const idx = downloadQueue.indexOf(id);
      if (idx >= 0) downloadQueue.splice(idx, 1);
      cancelled = true;
    }

    // Annuler une tâche en attente
    if (downloadTasks.has(id)) {
      const task = downloadTasks.get(id);
      const abortResult = await resolveAbortResult(task);
      sendDownloadResult({ id, ...abortResult });
      task?.waiters?.forEach(({ resolve }) => { try { resolve(abortResult); } catch {} });
      downloadTasks.delete(id);
      cancelled = true;
    }

    // Annuler un téléchargement actif
    if (activeDownloads.has(id)) {
      try { activeDownloads.get(id).abort(); } catch {}
      cancelled = true;
    }

    scheduleDownloads();
    return cancelled;
  });

  /** Ajoute un téléchargement à la file */
  ipcMain.handle("fs:queueDownload", async (_, args) => {
    const { queued, alreadyRunning } = enqueueDownloadTask(args);
    return { ok: true, queued, alreadyRunning };
  });

  /** Vide toute la file de téléchargement */
  ipcMain.handle("fs:clearDownloadQueue", async () => {
    queuedDownloadIds.clear();
    downloadQueue.length = 0;

    for (const [id, task] of downloadTasks.entries()) {
      const abortResult = await resolveAbortResult(task);
      sendDownloadResult({ id, ...abortResult });
      task?.waiters?.forEach(({ resolve }) => { try { resolve(abortResult); } catch {} });
    }
    downloadTasks.clear();

    for (const controller of activeDownloads.values()) {
      try { controller.abort(); } catch {}
    }

    scheduleDownloads();
    return true;
  });

  /** Télécharge un fichier (bloquant - attend la fin) */
  ipcMain.handle("fs:downloadFile", async (_, args) => {
    return new Promise((resolve, reject) => {
      enqueueDownloadTask(args, { resolve, reject });
    });
  });

  /** Ouvre un fichier/dossier dans l'explorateur système */
  ipcMain.handle("fs:openPath", async (_, targetPath) => {
    if (targetPath && typeof targetPath === "string") {
      await shell.openPath(targetPath);
    }
  });

  /** Ouvre l'explorateur et sélectionne le fichier */
  ipcMain.handle("fs:revealPath", async (_, targetPath) => {
    if (!targetPath || typeof targetPath !== "string") return;
    try {
      shell.showItemInFolder(targetPath);
    } catch {
      try {
        await shell.openPath(path.dirname(targetPath));
      } catch {}
    }
  });

  // ========================================================================
  // IPC HANDLERS - API VK
  // ========================================================================

  /** Vérifie la connexion VK et mesure la latence */
  ipcMain.handle("vk:ping", async (_, token) => {
    if (!token) return { ok: false, latency: null };
    lastVkToken = token;

    const start = Date.now();
    try {
      const url = `https://api.vk.com/method/utils.getServerTime?access_token=${token}&v=5.131`;
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      const data = await res.json();
      if (data.error) return { ok: false, latency: null };
      return { ok: true, latency: Date.now() - start };
    } catch {
      return { ok: false, latency: null };
    }
  });

  /** Requête générique à l'API VK (contourne CORS) */
  ipcMain.handle("vk:request", async (_, url) => {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": "Vkomic/1.0" },
      });
      return await res.json();
    } catch (error) {
      return { error: { error_code: -1, error_msg: error.message } };
    }
  });

  /** Récupère l'index racine (BDs, Mangas, Comics) */
  ipcMain.handle("vk:fetchRootIndex", async (_, args) => {
    const { token, groupId, topicId } = args || {};
    if (token) lastVkToken = token;
    return vkFetchRootIndex(token, groupId, topicId);
  });

  /** Récupère le contenu d'un dossier (sous-dossiers + fichiers) */
  ipcMain.handle("vk:fetchNodeContent", async (_, args) => {
    const { token, node } = args || {};
    if (token) lastVkToken = token;
    return vkFetchNodeContent(token, node);
  });

  /** Pré-charge l'arbre de dossiers jusqu'à une profondeur donnée */
  ipcMain.handle("vk:fetchFolderTreeUpToDepth", async (_, args) => {
    const { token, groupId, topicId, maxDepth } = args || {};
    if (token) lastVkToken = token;
    return vkFetchFolderTreeUpToDepth(token, groupId, topicId, maxDepth);
  });

  /** Rafraîchit l'URL d'un document VK (les URLs expirent) */
  ipcMain.handle("vk:refreshDocUrl", async (_, args) => {
    const { token, ownerId, docId } = args || {};
    return vkRefreshDocUrl(token, ownerId, docId);
  });

  // ========================================================================
  // IPC HANDLERS - Application
  // ========================================================================

  /** Retourne la version de l'app */
  ipcMain.handle("app:getVersion", () => app.getVersion());

  /** Vérifie les mises à jour disponibles */
  ipcMain.handle("app:checkUpdate", async () => {
    if (!app.isPackaged) return { updateAvailable: false };

    try {
      ensureUpdateFeed();
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo;
      const updateAvailable = Boolean(info?.version) && info.version !== app.getVersion();

      return {
        updateAvailable,
        version: info?.version,
        notes: normalizeReleaseNotes(info?.releaseNotes),
        url: `https://github.com/${GITHUB_REPO}/releases`,
      };
    } catch (error) {
      return { updateAvailable: false, error: error.message };
    }
  });

  /** Télécharge la mise à jour */
  ipcMain.handle("app:downloadUpdate", async () => {
    if (!app.isPackaged) return { ok: false, error: "Dev mode" };

    try {
      ensureUpdateFeed();
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  /** Installe la mise à jour et redémarre */
  ipcMain.handle("app:installUpdate", () => {
    if (!app.isPackaged) return false;
    try {
      autoUpdater.quitAndInstall(false, true);
      return true;
    } catch {
      return false;
    }
  });

  // ========================================================================
  // ÉVÉNEMENTS DE CYCLE DE VIE
  // ========================================================================

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
