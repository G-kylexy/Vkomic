const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('win', {
    minimize: () => ipcRenderer.send('win:min'),
    maximize: () => ipcRenderer.send('win:max'),
    close: () => ipcRenderer.send('win:close')
});

contextBridge.exposeInMainWorld('shell', {
    openExternal: (url) => ipcRenderer.send('open-external', url)
});

contextBridge.exposeInMainWorld('dialog', {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder')
});

contextBridge.exposeInMainWorld('fs', {
    listDirectory: (path) => ipcRenderer.invoke('fs:listDirectory', path),
    openPath: (path) => ipcRenderer.invoke('fs:openPath', path)
});

contextBridge.exposeInMainWorld('vk', {
    ping: (token) => ipcRenderer.invoke('vk:ping', token)
});
