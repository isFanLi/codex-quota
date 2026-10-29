const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("codexQuota", {
  getBackgroundOpacity: () => ipcRenderer.invoke("appearance:get"),
  setBackgroundOpacity: (value) => ipcRenderer.invoke("appearance:set", value),
  closeAppearance: () => ipcRenderer.invoke("appearance:close"),
  onBackgroundOpacityChanged: (callback) => ipcRenderer.on("appearance:changed", (_event, value) => callback(value)),
  getQuotaState: () => ipcRenderer.invoke("quota:state"),
  hide: () => ipcRenderer.invoke("window:hide"),
  moveWindow: (deltaX, deltaY) => ipcRenderer.invoke("window:move", deltaX, deltaY),
  onQuotaChanged: (callback) => ipcRenderer.on("quota:changed", (_event, value) => callback(value))
});
