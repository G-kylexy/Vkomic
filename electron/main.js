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
        mainWindow.isMaximized()
            ? mainWindow.unmaximize()
            : mainWindow.maximize()
    );

    ipcMain.on('win:close', () => mainWindow.close());

    // IPC handler for opening external links
    ipcMain.on('open-external', (event, url) => {
        shell.openExternal(url);
    });

    ipcMain.handle('dialog:selectFolder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory']
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        return result.filePaths[0];
    });

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
                    modifiedAt: entryStats.mtimeMs
                };
            })
        );

        entries.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        return { path: targetPath, entries };
    });

    ipcMain.handle('fs:openPath', async (_, targetPath) => {
        if (!targetPath || typeof targetPath !== 'string') {
            return;
        }
        await shell.openPath(targetPath);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
