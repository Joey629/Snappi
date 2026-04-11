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
  onUiReviewHints: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("snappi-ui-review-hints", listener);
    return () =>
      ipcRenderer.removeListener("snappi-ui-review-hints", listener);
  },
  setPreviewSimulatedViewport: (width) =>
    ipcRenderer.invoke("preview:setSimulatedViewportWidth", { width }),
  analyzePickForReview: (pick) =>
    ipcRenderer.invoke("preview:analyzePickForReview", { pick }),
  describePfPick: (className) =>
    ipcRenderer.invoke("preview:describePfPick", { className }),
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
});
