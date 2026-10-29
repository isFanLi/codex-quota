const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("codexQuota", {
  getQuotaState: () => ipcRenderer.invoke("quota:state"),
  hide: () => ipcRenderer.invoke("window:hide"),
  moveWindow: (deltaX, deltaY) => ipcRenderer.invoke("window:move", deltaX, deltaY),
  onQuotaChanged: (callback) => ipcRenderer.on("quota:changed", (_event, value) => callback(value))
});
