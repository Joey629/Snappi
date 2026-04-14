const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("snappi", {
  isDesktop: true,
  getConfig: () => ipcRenderer.invoke("app:getConfig"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  setShellPanelCollapsed: (collapsed) =>
    ipcRenderer.invoke("shell:setShellPanelCollapsed", { collapsed }),
  writeClipboardText: (text) =>
    ipcRenderer.invoke("clipboard:writeText", text),
  startPrPreview: (prUrl, options) =>
    ipcRenderer.invoke("preview:startPr", {
      prUrl,
      port: options?.port,
      envVars: options?.envVars,
    }),
  startPrPreviewBatch: (options) =>
    ipcRenderer.invoke("preview:startPrBatch", {
      prUrls: options?.prUrls,
      envVars: options?.envVars,
    }),
  onPreviewProgress: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("preview:progress", listener);
    return () => ipcRenderer.removeListener("preview:progress", listener);
  },
  setPreviewInspectorMode: (enabled) =>
    ipcRenderer.invoke("preview:setInspectorMode", enabled),
  onPreviewAttached: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("preview:attached", listener);
    return () => ipcRenderer.removeListener("preview:attached", listener);
  },
  onInspectorPick: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("snappi-inspector-pick", listener);
    return () => ipcRenderer.removeListener("snappi-inspector-pick", listener);
  },
  onPatternFlyInsights: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("snappi-pf-insights", listener);
    return () => ipcRenderer.removeListener("snappi-pf-insights", listener);
  },
  gitFileHistory: (opts) =>
    ipcRenderer.invoke("preview:gitFileHistory", opts ?? {}),
  analyzePickForReview: (pick) =>
    ipcRenderer.invoke("preview:analyzePickForReview", { pick }),
  inspectorAiChat: (payload) => ipcRenderer.invoke("ai:inspectorChat", payload),
  applyDomPatches: (patches) =>
    ipcRenderer.invoke("preview:applyDomPatches", { patches }),
  undoLastDomPatches: () => ipcRenderer.invoke("preview:undoDomPatches"),
  applySourceEdits: (edits) =>
    ipcRenderer.invoke("preview:applySourceEdits", { edits }),
  listPreviewTabs: () => ipcRenderer.invoke("preview:listTabs"),
  switchPreviewTab: (tabId) =>
    ipcRenderer.invoke("preview:switchTab", { tabId }),
  closePreviewTab: (tabId) =>
    ipcRenderer.invoke("preview:closeTab", { tabId }),
  applyPrHighlights: () => ipcRenderer.invoke("preview:applyPrHighlights"),
  clearPrHighlights: () => ipcRenderer.invoke("preview:clearPrHighlights"),
  onPreviewTabsUpdated: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("preview:tabsUpdated", listener);
    return () =>
      ipcRenderer.removeListener("preview:tabsUpdated", listener);
  },
  setAiDockMode: (mode) => ipcRenderer.invoke("shell:setAiDockMode", { mode }),
  getAiDockMode: () => ipcRenderer.invoke("shell:getAiDockMode"),
  setAiDockVisible: (visible) =>
    ipcRenderer.invoke("shell:setAiDockVisible", { visible }),
  getAiDockVisible: () => ipcRenderer.invoke("shell:getAiDockVisible"),
  postPrComment: (opts) => ipcRenderer.invoke("github:postPrComment", opts ?? {}),
  createAiFixupPr: () => ipcRenderer.invoke("github:createAiFixupPr"),
});
