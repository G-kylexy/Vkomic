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
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("fs:downloadProgress", listener);
    return () => ipcRenderer.removeListener("fs:downloadProgress", listener);
  },
  cancelDownload: (id) => ipcRenderer.invoke("fs:cancelDownload", id),
});

contextBridge.exposeInMainWorld("vk", {
  ping: (token) => ipcRenderer.invoke("vk:ping", token),
});

contextBridge.exposeInMainWorld("app", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  checkUpdate: (repo) => ipcRenderer.invoke("app:checkUpdate", repo),
});
