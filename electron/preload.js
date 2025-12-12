const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("win", {
  minimize: () => ipcRenderer.send("win:min"),
  maximize: () => ipcRenderer.send("win:max"),
  close: () => ipcRenderer.send("win:close"),
});

contextBridge.exposeInMainWorld("shell", {
  openExternal: (url) => ipcRenderer.send("open-external", url),
});

contextBridge.exposeInMainWorld("dialog", {
  selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
});

contextBridge.exposeInMainWorld("fs", {
  listDirectory: (path) => ipcRenderer.invoke("fs:listDirectory", path),
  openPath: (path) => ipcRenderer.invoke("fs:openPath", path),
  revealPath: (path) => ipcRenderer.invoke("fs:revealPath", path),
  downloadFile: (id, url, directory, fileName) =>
    ipcRenderer.invoke("fs:downloadFile", { id, url, directory, fileName }),
  onDownloadProgress: (callback) => {
    if (typeof callback !== "function") return () => { };
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("fs:downloadProgress", listener);
    return () => ipcRenderer.removeListener("fs:downloadProgress", listener);
  },
  cancelDownload: (id) => ipcRenderer.invoke("fs:cancelDownload", id),
});

contextBridge.exposeInMainWorld("vk", {
  ping: (token) => ipcRenderer.invoke("vk:ping", token),
  request: (url) => ipcRenderer.invoke("vk:request", url),
});

contextBridge.exposeInMainWorld("app", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  checkUpdate: () => ipcRenderer.invoke("app:checkUpdate"),
  downloadUpdate: () => ipcRenderer.invoke("app:downloadUpdate"),
  installUpdate: () => ipcRenderer.invoke("app:installUpdate"),
  onUpdateAvailable: (callback) => {
    if (typeof callback !== "function") return () => { };
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:update-available", listener);
    return () => ipcRenderer.removeListener("app:update-available", listener);
  },
  onUpdateProgress: (callback) => {
    if (typeof callback !== "function") return () => { };
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:update-progress", listener);
    return () => ipcRenderer.removeListener("app:update-progress", listener);
  },
  onUpdateReady: (callback) => {
    if (typeof callback !== "function") return () => { };
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:update-downloaded", listener);
    return () =>
      ipcRenderer.removeListener("app:update-downloaded", listener);
  },
  onUpdateError: (callback) => {
    if (typeof callback !== "function") return () => { };
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:update-error", listener);
    return () => ipcRenderer.removeListener("app:update-error", listener);
  },
});
