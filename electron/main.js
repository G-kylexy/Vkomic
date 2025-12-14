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
} from "./vk-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let updateFeedReady = false;

const GITHUB_REPO = "G-kylexy/vkomic";
const APP_BACKGROUND_COLOR = "#050B14";
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

const normalizeReleaseNotes = (notes) => {
  if (Array.isArray(notes)) {
    return notes
      .map((entry) =>
        typeof entry === "string" ? entry : entry?.note ? entry.note : "",
      )
      .filter(Boolean)
      .join("\n\n");
  }
  return typeof notes === "string" ? notes : "";
};

const sendToRenderer = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: APP_BACKGROUND_COLOR,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.once("did-frame-finish-load", () => {
      mainWindow?.webContents.openDevTools();
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

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

const setupContentSecurityPolicy = () => {
  if (!app.isPackaged) return;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = {
      ...(details.responseHeaders || {}),
      "Content-Security-Policy": [CSP_PROD],
    };

    callback({ responseHeaders });
  });
};

app.whenReady().then(() => {
  setupContentSecurityPolicy();
  createWindow();
  setupAutoUpdater();

  // IPC handlers for window controls
  ipcMain.on("win:min", () => mainWindow.minimize());

  ipcMain.on("win:max", () =>
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(),
  );

  ipcMain.on("win:close", () => mainWindow.close());

  // IPC handler for opening external links
  ipcMain.on("open-external", (event, url) => {
    shell.openExternal(url);
  });

  // Sélecteur natif pour choisir un dossier de téléchargement
  ipcMain.handle("dialog:selectFolder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Lecture d'un dossier local (Bibliothèque)
  ipcMain.handle("fs:listDirectory", async (_, targetPath) => {
    if (!targetPath || typeof targetPath !== "string") {
      throw new Error("Invalid path");
    }

    const stats = await fs.promises.stat(targetPath);
    if (!stats.isDirectory()) {
      throw new Error("Path is not a directory");
    }

    const dirEntries = await fs.promises.readdir(targetPath, {
      withFileTypes: true,
    });

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
      }),
    );

    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return { path: targetPath, entries };
  });

  const DOWNLOAD_CONCURRENCY = 5;
  const activeDownloads = new Map();
  const downloadQueue = [];
  const queuedDownloadIds = new Set();
  const downloadTasks = new Map();

  function sendDownloadProgress(payload) {
    sendToRenderer("fs:downloadProgress", payload);
  }

  function sendDownloadResult(payload) {
    sendToRenderer("fs:downloadResult", payload);
  }

  function resolveDownloadTarget(url, directory, fileName) {
    const safeDirectory = directory;

    let finalName =
      typeof fileName === "string" && fileName.trim().length > 0
        ? fileName.trim()
        : undefined;

    try {
      if (!finalName) {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname || "";
        const lastSegment =
          pathname.split("/").filter(Boolean).pop() || "download";
        finalName = decodeURIComponent(lastSegment);
      }
    } catch {
      if (!finalName) finalName = "download";
    }

    const sanitizedName =
      (finalName || "download").replace(/[<>:"/\\|?*]+/g, "").trim() ||
      "download";
    const targetPath = path.join(safeDirectory, sanitizedName);

    return { safeDirectory, targetPath };
  }

  async function resolveAbortResult(task) {
    try {
      const { targetPath } = resolveDownloadTarget(
        task.url,
        task.directory,
        task.fileName,
      );
      const stats = await fs.promises.stat(targetPath);
      return {
        ok: false,
        status: "aborted",
        path: targetPath,
        size: stats.size,
      };
    } catch {
      try {
        const { targetPath } = resolveDownloadTarget(
          task.url,
          task.directory,
          task.fileName,
        );
        return { ok: false, status: "aborted", path: targetPath, size: 0 };
      } catch {
        return { ok: false, status: "aborted", path: "", size: 0 };
      }
    }
  }

  async function downloadFileInternal(controller, args) {
    const { id, url, directory, fileName } = args || {};

    if (!id || typeof id !== "string") {
      throw new Error("Invalid download identifier");
    }
    if (!url || typeof url !== "string") {
      throw new Error("Invalid URL for download");
    }
    if (!directory || typeof directory !== "string") {
      throw new Error("Invalid download directory");
    }

    const { safeDirectory, targetPath } = resolveDownloadTarget(
      url,
      directory,
      fileName,
    );

    let startByte = 0;
    try {
      const stats = await fs.promises.stat(targetPath);
      startByte = stats.size;
    } catch {
      startByte = 0;
    }

    try {
      const headers = {};
      if (startByte > 0) {
        headers["Range"] = `bytes=${startByte}-`;
      }

      const res = await fetch(url, {
        signal: controller.signal,
        headers,
      });

      if (!res.ok && res.status !== 206) {
        if (res.status === 416) {
          sendDownloadProgress({
            id,
            receivedBytes: startByte,
            totalBytes: startByte,
            progress: 100,
            speedBytes: 0,
          });
          return { ok: true, path: targetPath, size: startByte };
        }
        throw new Error(`Failed to download file (HTTP ${res.status})`);
      }

      if (res.status === 200) {
        startByte = 0;
      }

      await fs.promises.mkdir(safeDirectory, { recursive: true });

      let receivedBytes = 0;
      const contentLengthHeader = res.headers.get("content-length");
      const chunkLength = contentLengthHeader
        ? parseInt(contentLengthHeader, 10)
        : null;

      const totalBytes = chunkLength ? startByte + chunkLength : null;

      const startedAt = Date.now();

      const emitProgress = (forceComplete = false) => {
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
        const speedBytes = receivedBytes / elapsedSeconds;

        const currentTotalBytes = startByte + receivedBytes;

        const progressValue =
          forceComplete || (totalBytes && currentTotalBytes >= totalBytes)
            ? 100
            : totalBytes
              ? Math.min(100, (currentTotalBytes / totalBytes) * 100)
              : null;

        sendDownloadProgress({
          id,
          receivedBytes: currentTotalBytes,
          totalBytes,
          progress: progressValue,
          speedBytes,
        });
      };

      if (startByte > 0) {
        emitProgress();
      }

      const reader =
        typeof res.body?.getReader === "function" ? res.body.getReader() : null;

      if (!reader) {
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        receivedBytes = buffer.length;
        await fs.promises.writeFile(targetPath, buffer);
        emitProgress(true);
        return { ok: true, path: targetPath, size: receivedBytes };
      }

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
            const now = Date.now();
            if (now - lastEmit >= 250) {
              emitProgress();
              lastEmit = now;
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
          return {
            ok: false,
            status: "aborted",
            path: targetPath,
            size: startByte + receivedBytes,
          };
        }

        await fs.promises.rm(targetPath, { force: true }).catch(() => { });
        throw error;
      }

      return { ok: true, path: targetPath, size: startByte + receivedBytes };
    } catch (error) {
      const isAbortError =
        error?.name === "AbortError" ||
        error?.code === "ABORT_ERR" ||
        (typeof error?.message === "string" && error.message.includes("aborted"));

      if (isAbortError) {
        try {
          const stats = await fs.promises.stat(targetPath);
          return {
            ok: false,
            status: "aborted",
            path: targetPath,
            size: stats.size,
          };
        } catch {
          return {
            ok: false,
            status: "aborted",
            path: targetPath,
            size: startByte,
          };
        }
      }

      throw error;
    }
  }

  function enqueueDownloadTask(args, waiter) {
    const { id, url, directory, fileName } = args || {};
    if (!id || typeof id !== "string") {
      throw new Error("Invalid download identifier");
    }
    if (!url || typeof url !== "string") {
      throw new Error("Invalid URL for download");
    }
    if (!directory || typeof directory !== "string") {
      throw new Error("Invalid download directory");
    }

    const activeController = activeDownloads.get(id);
    if (activeController && !activeController.signal?.aborted) {
      if (waiter?.reject) {
        waiter.reject(new Error("Download already in progress"));
      }
      return { queued: false, alreadyRunning: true };
    }

    const existing = downloadTasks.get(id);
    const task = existing || { id, url, directory, fileName, waiters: [] };
    task.url = url;
    task.directory = directory;
    task.fileName = fileName;
    if (!existing) {
      downloadTasks.set(id, task);
    }

    if (waiter) {
      task.waiters.push(waiter);
    }

    if (!queuedDownloadIds.has(id)) {
      downloadQueue.push(id);
      queuedDownloadIds.add(id);
    }

    scheduleDownloads();
    return { queued: true, alreadyRunning: false };
  }

  function scheduleDownloads() {
    if (downloadQueue.length === 0) return;

    let safety = downloadQueue.length;

    while (
      activeDownloads.size < DOWNLOAD_CONCURRENCY &&
      downloadQueue.length > 0 &&
      safety-- > 0
    ) {
      const nextId = downloadQueue.shift();
      if (!nextId) break;

      if (activeDownloads.has(nextId)) {
        downloadQueue.push(nextId);
        continue;
      }

      queuedDownloadIds.delete(nextId);
      const task = downloadTasks.get(nextId);
      if (!task) continue;
      downloadTasks.delete(nextId);
      void runDownloadTask(nextId, task);
    }
  }

  async function runDownloadTask(id, task) {
    const controller = new AbortController();
    activeDownloads.set(id, controller);

    try {
      sendDownloadProgress({
        id,
        receivedBytes: 0,
        totalBytes: null,
        progress: 0,
        speedBytes: 0,
      });

      const result = await downloadFileInternal(controller, task);
      sendDownloadResult({ id, ...result });

      if (Array.isArray(task.waiters)) {
        task.waiters.forEach(({ resolve }) => {
          try {
            resolve(result);
          } catch {
            // ignore
          }
        });
      }
    } catch (error) {
      const message =
        typeof error?.message === "string"
          ? error.message
          : typeof error === "string"
            ? error
            : "Unknown download error";

      sendDownloadResult({ id, ok: false, status: "error", error: message });

      if (Array.isArray(task.waiters)) {
        task.waiters.forEach(({ reject }) => {
          try {
            reject(error);
          } catch {
            // ignore
          }
        });
      }
    } finally {
      activeDownloads.delete(id);
      scheduleDownloads();
    }
  }

  // Annule un téléchargement en cours
  ipcMain.handle("fs:cancelDownload", async (_, id) => {
    if (!id || typeof id !== "string") return false;

    let cancelled = false;

    if (queuedDownloadIds.has(id)) {
      queuedDownloadIds.delete(id);
      for (let i = downloadQueue.length - 1; i >= 0; i--) {
        if (downloadQueue[i] === id) downloadQueue.splice(i, 1);
      }
      cancelled = true;
    }

    if (downloadTasks.has(id)) {
      const task = downloadTasks.get(id);
      const abortResult = await resolveAbortResult(task);
      sendDownloadResult({ id, ...abortResult });

      if (Array.isArray(task?.waiters)) {
        task.waiters.forEach(({ resolve }) => {
          try {
            resolve(abortResult);
          } catch {
            // ignore
          }
        });
      }

      downloadTasks.delete(id);
      cancelled = true;
    }

    if (activeDownloads.has(id)) {
      try {
        activeDownloads.get(id).abort();
      } catch (e) {
        console.error("Error cancelling download:", e);
      }
      cancelled = true;
    }

    scheduleDownloads();
    return cancelled;
  });

  // Télécharge un fichier dans le dossier choisi
  ipcMain.handle("fs:queueDownload", async (_event, args) => {
    const { queued, alreadyRunning } = enqueueDownloadTask(args);
    return { ok: true, queued, alreadyRunning };
  });

  ipcMain.handle("fs:clearDownloadQueue", async () => {
    queuedDownloadIds.clear();
    downloadQueue.splice(0, downloadQueue.length);

    for (const [id, task] of downloadTasks.entries()) {
      const abortResult = await resolveAbortResult(task);
      sendDownloadResult({ id, ...abortResult });

      if (Array.isArray(task?.waiters)) {
        task.waiters.forEach(({ resolve }) => {
          try {
            resolve(abortResult);
          } catch {
            // ignore
          }
        });
      }
    }
    downloadTasks.clear();

    for (const controller of activeDownloads.values()) {
      try {
        controller.abort();
      } catch {
        // ignore
      }
    }

    scheduleDownloads();
    return true;
  });

  ipcMain.handle("fs:downloadFile", async (event, args) => {
    return await new Promise((resolve, reject) => {
      enqueueDownloadTask(args, { resolve, reject });
    });

    const { id, url, directory, fileName } = args || {};
    if (!id || typeof id !== "string") {
      throw new Error("Invalid download identifier");
    }
    if (!url || typeof url !== "string") {
      throw new Error("Invalid URL for download");
    }
    if (!directory || typeof directory !== "string") {
      throw new Error("Invalid download directory");
    }

    const safeDirectory = directory;

    let finalName =
      typeof fileName === "string" && fileName.trim().length > 0
        ? fileName.trim()
        : undefined;

    try {
      if (!finalName) {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname || "";
        const lastSegment =
          pathname.split("/").filter(Boolean).pop() || "download";
        finalName = decodeURIComponent(lastSegment);
      }
    } catch {
      if (!finalName) finalName = "download";
    }

    const sanitizedName =
      finalName.replace(/[<>:"/\\|?*]+/g, "").trim() || "download";
    const targetPath = path.join(safeDirectory, sanitizedName);

    // Vérifier si le fichier existe déjà pour reprise
    let startByte = 0;
    try {
      const stats = await fs.promises.stat(targetPath);
      startByte = stats.size;
    } catch (e) {
      // Le fichier n'existe pas, on commence à 0
      startByte = 0;
    }

    const controller = new AbortController();
    activeDownloads.set(id, controller);

    try {
      const headers = {};
      if (startByte > 0) {
        headers["Range"] = `bytes=${startByte}-`;
      }

      const res = await fetch(url, {
        signal: controller.signal,
        headers: headers,
      });

      if (!res.ok && res.status !== 206) {
        // HTTP 416 = Range Not Satisfiable
        // Cela arrive quand le fichier est DÉJÀ entièrement téléchargé (startByte >= taille distante)
        if (res.status === 416) {
          // Envoie directement le signal de complétion (emitProgress n'est pas encore définie ici)
          event.sender.send("fs:downloadProgress", {
            id,
            receivedBytes: startByte,
            totalBytes: startByte,
            progress: 100,
            speedBytes: 0,
          });
          return { ok: true, path: targetPath, size: startByte };
        }
        throw new Error(`Failed to download file (HTTP ${res.status})`);
      }

      // Si le serveur ne supporte pas le Range (200 OK au lieu de 206), on repart de 0
      if (res.status === 200) {
        startByte = 0;
      }

      await fs.promises.mkdir(safeDirectory, { recursive: true });

      let receivedBytes = 0; // Octets reçus dans CETTE session
      const contentLengthHeader = res.headers.get("content-length");
      const chunkLength = contentLengthHeader
        ? parseInt(contentLengthHeader, 10)
        : null;

      // La taille totale est la taille déjà téléchargée + la taille restante (chunk)
      // Si status 200, startByte est 0, donc totalBytes = chunkLength
      const totalBytes = chunkLength ? startByte + chunkLength : null;

      const startedAt = Date.now();

      const emitProgress = (forceComplete = false) => {
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
        const speedBytes = receivedBytes / elapsedSeconds;

        const currentTotalBytes = startByte + receivedBytes;

        const progressValue =
          forceComplete || (totalBytes && currentTotalBytes >= totalBytes)
            ? 100
            : totalBytes
              ? Math.min(100, (currentTotalBytes / totalBytes) * 100)
              : null;

        event.sender.send("fs:downloadProgress", {
          id,
          receivedBytes: currentTotalBytes, // On envoie le total cumulé
          totalBytes,
          progress: progressValue,
          speedBytes,
        });
      };

      // Émettre immédiatement la progression initiale pour éviter d'afficher 0%
      // lors de la reprise d'un téléchargement
      if (startByte > 0) {
        emitProgress();
      }

      const reader =
        typeof res.body?.getReader === "function" ? res.body.getReader() : null;

      if (!reader) {
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        receivedBytes = buffer.length;
        // Si pas de stream, on écrit tout (mode 'w' si startByte=0, sinon 'a' mais fetch sans stream c'est rare pour des gros fichiers)
        // Pour simplifier, si pas de reader, on écrase tout (cas rare ici)
        await fs.promises.writeFile(targetPath, buffer);
        emitProgress(true);
        return { ok: true, path: targetPath, size: receivedBytes };
      }

      // Mode 'a' (append) si on reprend (206), sinon 'w' (write)
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
            const now = Date.now();
            if (now - lastEmit >= 250) {
              emitProgress();
              lastEmit = now;
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
        // IMPORTANT: On ne supprime PAS le fichier si c'est une annulation (AbortError)
        // Cela permet de reprendre le téléchargement plus tard
        if (error.name === "AbortError") {
          return {
            ok: false,
            status: "aborted",
            path: targetPath,
            size: startByte + receivedBytes,
          };
        }

        await fs.promises.rm(targetPath, { force: true }).catch(() => { });
        throw error;
      }

      return { ok: true, path: targetPath, size: startByte + receivedBytes };
    } catch (error) {
      // Gestion de l'annulation (AbortError) au niveau global
      // Vérifier plusieurs propriétés car l'erreur peut avoir différents formats
      const isAbortError =
        error.name === "AbortError" ||
        error.code === "ABORT_ERR" ||
        error.message?.includes("aborted");

      if (isAbortError) {
        try {
          const stats = await fs.promises.stat(targetPath);
          return {
            ok: false,
            status: "aborted",
            path: targetPath,
            size: stats.size,
          };
        } catch {
          return {
            ok: false,
            status: "aborted",
            path: targetPath,
            size: startByte,
          };
        }
      }
      // Pour toute autre erreur, on la propage
      throw error;
    } finally {
      activeDownloads.delete(id);
    }
  });

  // Ouvre un fichier/dossier dans le système
  ipcMain.handle("fs:openPath", async (_, targetPath) => {
    if (!targetPath || typeof targetPath !== "string") {
      return;
    }
    await shell.openPath(targetPath);
  });

  // Ping VK depuis le processus principal
  ipcMain.handle("vk:ping", async (_, token) => {
    if (!token) {
      return { ok: false, latency: null };
    }
    const start = Date.now();
    try {
      const url = `https://api.vk.com/method/utils.getServerTime?access_token=${token}&v=5.131`;
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      const data = await res.json();

      if (data.error) {
        return { ok: false, latency: null };
      }

      return { ok: true, latency: Date.now() - start };
    } catch (err) {
      return { ok: false, latency: null };
    }
  });

  // Nouvelle méthode générique pour faire les requêtes API VK proprement
  ipcMain.handle("vk:request", async (_, url) => {
    try {
      // On utilise fetch côté Node.js (pas de CORS, pas de JSONP)
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Vkomic/1.0",
        },
      });

      const json = await res.json();
      return json;
    } catch (error) {
      console.error("VK Request Failed:", error);
      // On renvoie une structure d'erreur similaire à celle de VK pour que le front gère
      return { error: { error_code: -1, error_msg: error.message } };
    }
  });

  ipcMain.handle("vk:fetchRootIndex", async (_event, args) => {
    const { token, groupId, topicId } = args || {};
    return vkFetchRootIndex(token, groupId, topicId);
  });

  ipcMain.handle("vk:fetchNodeContent", async (_event, args) => {
    const { token, node } = args || {};
    return vkFetchNodeContent(token, node);
  });

  ipcMain.handle("vk:fetchFolderTreeUpToDepth", async (_event, args) => {
    const { token, groupId, topicId, maxDepth } = args || {};
    const safeDepth = typeof maxDepth === "number" ? maxDepth : undefined;
    return vkFetchFolderTreeUpToDepth(token, groupId, topicId, safeDepth);
  });

  // Récupère la version de l'application
  ipcMain.handle("app:getVersion", () => {
    return app.getVersion();
  });

  // Vérifie et prépare les mises à jour via electron-updater (GitHub)
  ipcMain.handle("app:checkUpdate", async () => {
    if (!app.isPackaged) return { updateAvailable: false };

    try {
      ensureUpdateFeed();
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo;
      const latestVersion = info?.version;
      const currentVersion = app.getVersion();
      const updateAvailable =
        Boolean(latestVersion) && latestVersion !== currentVersion;

      return {
        updateAvailable,
        version: latestVersion,
        notes: normalizeReleaseNotes(info?.releaseNotes),
        url: `https://github.com/${GITHUB_REPO}/releases`,
      };
    } catch (error) {
      console.error("Update check failed:", error);
      return { updateAvailable: false, error: error.message };
    }
  });

  ipcMain.handle("app:downloadUpdate", async () => {
    if (!app.isPackaged) return { ok: false, error: "Dev mode" };

    try {
      ensureUpdateFeed();
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      console.error("Update download failed:", error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("app:installUpdate", () => {
    if (!app.isPackaged) return false;
    try {
      autoUpdater.quitAndInstall(false, true);
      return true;
    } catch (error) {
      console.error("Failed to install update:", error);
      return false;
    }
  });

  // Ouvre le dossier contenant et s��lectionne le fichier si possible
  ipcMain.handle("fs:revealPath", async (_, targetPath) => {
    if (!targetPath || typeof targetPath !== "string") {
      return;
    }
    try {
      shell.showItemInFolder(targetPath);
    } catch {
      try {
        const dir = path.dirname(targetPath);
        await shell.openPath(dir);
      } catch {
        // ignore
      }
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
// Updated
