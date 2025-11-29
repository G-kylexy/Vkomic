import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  // IPC handlers for window controls
  ipcMain.on('win:min', () => mainWindow.minimize());

  ipcMain.on('win:max', () =>
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(),
  );

  ipcMain.on('win:close', () => mainWindow.close());

  // IPC handler for opening external links
  ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
  });

  // Sélecteur natif pour choisir un dossier de téléchargement
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Lecture d'un dossier local (Bibliothèque)
  ipcMain.handle('fs:listDirectory', async (_, targetPath) => {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new Error('Invalid path');
    }

    const stats = await fs.promises.stat(targetPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
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
      }),
    );

    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return { path: targetPath, entries };
  });

  // Télécharge un fichier dans le dossier choisi
  ipcMain.handle('fs:downloadFile', async (event, args) => {
    const { id, url, directory, fileName } = args || {};
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid download identifier');
    }
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL for download');
    }
    if (!directory || typeof directory !== 'string') {
      throw new Error('Invalid download directory');
    }

    const safeDirectory = directory;

    let finalName =
      typeof fileName === 'string' && fileName.trim().length > 0
        ? fileName.trim()
        : undefined;

    try {
      if (!finalName) {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname || '';
        const lastSegment = pathname.split('/').filter(Boolean).pop() || 'download';
        finalName = decodeURIComponent(lastSegment);
      }
    } catch {
      if (!finalName) finalName = 'download';
    }

    const sanitizedName = finalName.replace(/[<>:"/\\|?*]+/g, '').trim() || 'download';
    const targetPath = path.join(safeDirectory, sanitizedName);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download file (HTTP ${res.status})`);
    }

    await fs.promises.mkdir(safeDirectory, { recursive: true });
    let receivedBytes = 0;
    const totalBytesHeader = res.headers.get('content-length');
    const totalBytes = totalBytesHeader ? parseInt(totalBytesHeader, 10) : null;
    const startedAt = Date.now();
    const emitProgress = (forceComplete = false) => {
      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
      const speedBytes = receivedBytes / elapsedSeconds;
      const progressValue =
        forceComplete || totalBytes === 0
          ? 100
          : totalBytes
          ? Math.min(100, (receivedBytes / totalBytes) * 100)
          : null;
      event.sender.send('fs:downloadProgress', {
        id,
        receivedBytes,
        totalBytes,
        progress: progressValue,
        speedBytes,
      });
    };

    const reader =
      typeof res.body?.getReader === 'function' ? res.body.getReader() : null;

    if (!reader) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      receivedBytes = buffer.length;
      await fs.promises.writeFile(targetPath, buffer);
      emitProgress(true);
      return { ok: true, path: targetPath, size: receivedBytes };
    }

    const fileStream = fs.createWriteStream(targetPath);
    let lastEmit = Date.now();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          const chunk = Buffer.from(value);
          receivedBytes += chunk.length;
          if (!fileStream.write(chunk)) {
            await new Promise((resolve) => fileStream.once('drain', resolve));
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
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });
      emitProgress(true);
    } catch (error) {
      fileStream.destroy();
      await fs.promises.rm(targetPath, { force: true }).catch(() => {});
      throw error;
    }

    return { ok: true, path: targetPath, size: receivedBytes };
  });

  // Ouvre un fichier/dossier dans le système
  ipcMain.handle('fs:openPath', async (_, targetPath) => {
    if (!targetPath || typeof targetPath !== 'string') {
      return;
    }
    await shell.openPath(targetPath);
  });

  // Ping VK depuis le processus principal (évite les erreurs CORB côté renderer)
  ipcMain.handle('vk:ping', async (_, token) => {
    const start = Date.now();
    try {
      const url = token
        ? `https://api.vk.com/method/utils.getServerTime?access_token=${token}&v=5.131`
        : 'https://vk.com/favicon.ico';
      await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return { ok: true, latency: Date.now() - start };
    } catch (err) {
      return { ok: false, latency: null };
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
