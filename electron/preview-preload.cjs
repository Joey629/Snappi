const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__SNAPPI_INSPECTOR_BRIDGE__", {
  reportPick: (payload) => ipcRenderer.send("snappi-inspector-pick", payload),
});
