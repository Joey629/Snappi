import {
  app,
  BrowserView,
  BrowserWindow,
  clipboard,
  ipcMain,
  session,
  shell,
} from "electron";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  runPrPreviewPipeline,
  parsePrUrl,
  stopPreview,
} from "../snappi-preview-mcp/lib/pipeline.mjs";
import { PREVIEW_INSPECTOR_BOOTSTRAP } from "./preview-inspector-bootstrap.mjs";
import {
  runInspectorAiChat,
  sanitizeDomPatches,
  isInspectorAiConfigured,
} from "./inspector-ai.mjs";
import {
  sanitizeSourceEdits,
  applySourceEditsToProject,
} from "./sourceEditApply.mjs";
import { readProjectFileSnippetsForAi } from "./ai-file-context.mjs";
import { runDesignTokenAlerts } from "./designTokenAudit.mjs";
import { gitLogForPath } from "./gitFileHistory.mjs";
import { createAiFixupPullRequest } from "./github-ai-fixup-pr.mjs";
import { PREVIEW_CHANGE_HIGHLIGHTS_BOOTSTRAP } from "./preview-change-highlights.mjs";
import { runUiReviewHeuristics } from "./uiReviewHeuristics.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
dotenv.config({ path: path.join(__dirname, "..", ".env") });

/** Must match shell UI: `public/styles.css` --preview-shell-width */
const PREVIEW_SHELL_WIDTH = 400;
/** Narrow strip when the user collapses the shell panel (must match renderer fallback). */
const PREVIEW_SHELL_COLLAPSED_WIDTH = 60;

/** Live width of the shell HTML column; BrowserView x-offset follows this. */
let shellPanelContentWidth = PREVIEW_SHELL_WIDTH;
/** Must match `public/styles.css` --preview-tab-bar-height */
const PREVIEW_TAB_BAR_HEIGHT = 40;
/** Must match `public/styles.css` --preview-pr-meta-height */
const PREVIEW_PR_META_STRIP_HEIGHT = 104;
const PREVIEW_TOP_CHROME =
  PREVIEW_TAB_BAR_HEIGHT + PREVIEW_PR_META_STRIP_HEIGHT;

/** AI panel BrowserView: strip under preview, fixed right column, or floating corner. */
const AI_DOCK_HEIGHT = 240;
const AI_FLOAT_WIDTH = 400;
const AI_FLOAT_HEIGHT = 300;
/** Fixed strip on the right; preview uses remaining width (min width enforced in layout). */
const AI_RIGHT_PANEL_WIDTH = 380;

/** @type {import("electron").BrowserView | null} */
let globalAiDockView = null;
/** Enriched inspector pick; replay to AI dock when its page finishes loading (avoids dropped IPC). */
let lastInspectorPickForAiDock = null;

function broadcastInspectorPick(enriched) {
  lastInspectorPickForAiDock = enriched;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("snappi-inspector-pick", enriched);
  }
  if (globalAiDockView && !globalAiDockView.webContents.isDestroyed()) {
    try {
      globalAiDockView.webContents.send("snappi-inspector-pick", enriched);
    } catch (e) {
      console.warn("[snappi] send pick to AI dock:", e?.message || e);
    }
  }
}
/** @type {"docked" | "floating" | "right"} */
let aiDockMode = "right";
/** When false, AI BrowserView gets zero bounds (user opens from shell UI). */
let aiDockVisible = false;

let mainWindow = null;

/** @type {Map<string, { id: string; label: string; url: string; projectPath: string; prUrl: string; prTitle?: string; prBody?: string; prHtmlUrl?: string; prChangedFiles?: { filename: string; status: string; additions: number; deletions: number }[]; prChangedFilesTotal?: number; prChangedFilesTruncated?: boolean; prUxTour?: object; prPatternFlySlugs?: string[]; prPatternFlyFiles?: unknown[]; prPatternFlyDocSummary?: unknown; previewSimulatedWidth?: number | null; browserView: import('electron').BrowserView }>} */
const previewTabs = new Map();
let activeTabId = null;
let previewTabCounter = 0;
let previewInspectorEnabled = false;

function makeTabId() {
  previewTabCounter += 1;
  return `pr-${previewTabCounter}`;
}

/** Always return a non-empty string for IPC (empty messages show as "url: failed" in the shell). */
function previewFailureMessage(err) {
  if (err == null) return "Unknown error (no exception object).";
  if (typeof err === "string") {
    const t = err.trim();
    return t || "Unknown error (empty string thrown).";
  }
  if (err instanceof Error) {
    const m = (err.message && String(err.message).trim()) || "";
    if (m) return m;
    const head = err.stack ? String(err.stack).split("\n")[0].trim() : "";
    return head || "Error with no message (check Electron console).";
  }
  const s = String(err);
  if (s && s !== "[object Object]") return s;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error (non-serializable throw value).";
  }
}

function tabLabel(projectPath, prUrl) {
  const base = path.basename(projectPath);
  let pullTag = "";
  try {
    if (typeof prUrl === "string" && prUrl.trim()) {
      pullTag = `#${parsePrUrl(prUrl.trim()).pull} · `;
    }
  } catch {
    /* ignore */
  }
  const s = `${pullTag}${base}`;
  return s.length > 40 ? `${s.slice(0, 38)}…` : s;
}

function getActiveTab() {
  if (!activeTabId) return null;
  return previewTabs.get(activeTabId) ?? null;
}

function prFilesDiffUrl(htmlUrl) {
  const u = String(htmlUrl || "").trim().replace(/\/+$/, "");
  if (!u) return "";
  return `${u}/files`;
}

function normalizePrUxTour(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      uxSummary: "",
      navLabels: [],
      navPaths: [],
      regionHints: [],
      removalLabels: [],
      additionLabels: [],
      highlightMain: false,
      fullPageHighlight: false,
    };
  }
  const navLabels = Array.isArray(raw.navLabels)
    ? raw.navLabels
        .filter((x) => typeof x === "string" && x.trim())
        .map((x) => x.trim())
        .slice(0, 8)
    : [];
  const navPaths = Array.isArray(raw.navPaths)
    ? raw.navPaths
        .filter((x) => typeof x === "string" && x.trim())
        .map((x) => x.trim().split("?")[0])
        .slice(0, 8)
    : [];
  const regionHints = Array.isArray(raw.regionHints)
    ? raw.regionHints
        .filter((x) => typeof x === "string" && x.trim())
        .map((x) => x.trim())
        .slice(0, 8)
    : [];
  const removalLabels = Array.isArray(raw.removalLabels)
    ? raw.removalLabels
        .filter((x) => typeof x === "string" && x.trim())
        .map((x) => x.trim())
        .slice(0, 8)
    : [];
  const additionLabels = Array.isArray(raw.additionLabels)
    ? raw.additionLabels
        .filter((x) => typeof x === "string" && x.trim())
        .map((x) => x.trim())
        .slice(0, 8)
    : [];
  const highlightMain = Boolean(raw.highlightMain);
  const fullPageHighlight = Boolean(raw.fullPageHighlight);
  let uxSummary =
    typeof raw.uxSummary === "string" ? raw.uxSummary.trim() : "";
  return {
    uxSummary,
    navLabels,
    navPaths,
    regionHints,
    removalLabels,
    additionLabels,
    highlightMain,
    fullPageHighlight,
  };
}

/** Open preview on first inferred route so nav highlights and main region match the PR screen. */
function joinPreviewUrlWithTourPath(baseUrl, prUxTourRaw) {
  const tour = normalizePrUxTour(prUxTourRaw);
  if (!tour.navPaths.length) return baseUrl;
  const p = tour.navPaths[0].trim();
  if (!p.startsWith("/")) return baseUrl;
  try {
    return new URL(p, baseUrl).href;
  } catch {
    return baseUrl;
  }
}

function serializeTabsPayload() {
  const tabs = [...previewTabs.values()].map((t) => ({
    id: t.id,
    label: t.label,
    url: t.url,
    projectPath: t.projectPath,
    prUrl: t.prUrl,
    prTitle: t.prTitle ?? "",
    prBody: t.prBody ?? "",
    prHtmlUrl: t.prHtmlUrl ?? t.prUrl,
    changedFiles: t.prChangedFiles ?? [],
    changedFilesTotal:
      typeof t.prChangedFilesTotal === "number"
        ? t.prChangedFilesTotal
        : (t.prChangedFiles ?? []).length,
    changedFilesTruncated: Boolean(t.prChangedFilesTruncated),
    filesDiffUrl: prFilesDiffUrl(t.prHtmlUrl || t.prUrl),
    uxTour: normalizePrUxTour(t.prUxTour),
    patternFlySlugs: t.prPatternFlySlugs ?? [],
    patternFlyDocSummary: t.prPatternFlyDocSummary ?? null,
    previewSimulatedWidth:
      typeof t.previewSimulatedWidth === "number" &&
      t.previewSimulatedWidth >= 320
        ? t.previewSimulatedWidth
        : null,
    active: t.id === activeTabId,
  }));
  const active = getActiveTab();
  const activePrMeta = active
    ? {
        title: active.prTitle || "",
        body: active.prBody || "",
        htmlUrl: active.prHtmlUrl || active.prUrl,
        changedFiles: active.prChangedFiles ?? [],
        changedFilesTotal:
          typeof active.prChangedFilesTotal === "number"
            ? active.prChangedFilesTotal
            : (active.prChangedFiles ?? []).length,
        changedFilesTruncated: Boolean(active.prChangedFilesTruncated),
        filesDiffUrl: prFilesDiffUrl(active.prHtmlUrl || active.prUrl),
        uxTour: normalizePrUxTour(active.prUxTour),
        patternFlySlugs: active.prPatternFlySlugs ?? [],
        patternFlyDocSummary: active.prPatternFlyDocSummary ?? null,
        previewSimulatedWidth:
          typeof active.previewSimulatedWidth === "number" &&
          active.previewSimulatedWidth >= 320
            ? active.previewSimulatedWidth
            : null,
      }
    : null;
  return { tabs, activeTabId, activePrMeta };
}

function broadcastTabsUpdated() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const payload = serializeTabsPayload();
  mainWindow.webContents.send("preview:tabsUpdated", payload);
  if (globalAiDockView && !globalAiDockView.webContents.isDestroyed()) {
    globalAiDockView.webContents.send("preview:tabsUpdated", payload);
  }
}

function detachAllBrowserViews() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  for (const v of mainWindow.getBrowserViews()) {
    mainWindow.removeBrowserView(v);
  }
}

function ensureAiDockView() {
  if (globalAiDockView && !globalAiDockView.webContents.isDestroyed()) return;
  const v = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  globalAiDockView = v;
  const wc = v.webContents;
  wc.once("did-finish-load", () => {
    if (lastInspectorPickForAiDock && !wc.isDestroyed()) {
      try {
        wc.send("snappi-inspector-pick", lastInspectorPickForAiDock);
      } catch (e) {
        console.warn("[snappi] replay inspector pick to AI dock:", e?.message || e);
      }
    }
  });
  void wc.loadFile(path.join(publicDir, "ai-dock.html"));
}

function attachActiveBrowserViews() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  detachAllBrowserViews();
  const tab = getActiveTab();
  if (tab?.browserView && !tab.browserView.webContents.isDestroyed()) {
    mainWindow.addBrowserView(tab.browserView);
  }
  if (
    tab &&
    globalAiDockView &&
    !globalAiDockView.webContents.isDestroyed()
  ) {
    mainWindow.addBrowserView(globalAiDockView);
  }
  layoutBrowserViews();
}

function layoutBrowserViews() {
  const tab = getActiveTab();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!tab?.browserView || tab.browserView.webContents.isDestroyed()) {
    if (globalAiDockView && !globalAiDockView.webContents.isDestroyed()) {
      globalAiDockView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
    return;
  }

  const [w, h] = mainWindow.getContentSize();
  const x0 = shellPanelContentWidth;
  const available = Math.max(320, w - x0);
  const desired =
    typeof tab.previewSimulatedWidth === "number" &&
    tab.previewSimulatedWidth >= 320
      ? tab.previewSimulatedWidth
      : null;
  const bvWidth = desired != null ? Math.min(desired, available) : available;

  const H = Math.max(0, h - PREVIEW_TOP_CHROME);
  let previewHeight = Math.max(200, H);

  const hasAiView =
    globalAiDockView && !globalAiDockView.webContents.isDestroyed();
  const aiActive = Boolean(hasAiView && aiDockVisible);

  /** Right strip width when `aiDockMode === "right"` (preview uses the remainder). */
  let aiRightStripW = 0;
  let previewSlotW = available;

  if (aiActive && aiDockMode === "right") {
    const minPreview = 300;
    aiRightStripW = Math.min(
      AI_RIGHT_PANEL_WIDTH,
      Math.max(260, available - minPreview)
    );
    previewSlotW = available - aiRightStripW;
  }

  if (aiActive && aiDockMode === "docked") {
    previewHeight = Math.max(200, H - AI_DOCK_HEIGHT);
  }

  let previewW = bvWidth;
  if (aiActive && aiDockMode === "right") {
    previewW =
      desired != null ? Math.min(desired, previewSlotW) : previewSlotW;
    previewHeight = Math.max(200, H);
  }

  tab.browserView.setBounds({
    x: x0,
    y: PREVIEW_TOP_CHROME,
    width: previewW,
    height: previewHeight,
  });

  if (!hasAiView) return;

  if (!aiActive) {
    globalAiDockView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }

  if (aiDockMode === "docked") {
    globalAiDockView.setBounds({
      x: x0,
      y: PREVIEW_TOP_CHROME + previewHeight,
      width: bvWidth,
      height: AI_DOCK_HEIGHT,
    });
  } else if (aiDockMode === "right") {
    globalAiDockView.setBounds({
      x: x0 + previewSlotW,
      y: PREVIEW_TOP_CHROME,
      width: aiRightStripW,
      height: H,
    });
  } else {
    globalAiDockView.setBounds({
      x: x0 + bvWidth - AI_FLOAT_WIDTH - 10,
      y: h - AI_FLOAT_HEIGHT - 10,
      width: AI_FLOAT_WIDTH,
      height: AI_FLOAT_HEIGHT,
    });
  }
}

function destroyAllPreviewTabs() {
  for (const tab of previewTabs.values()) {
    stopPreview(tab.projectPath);
    try {
      if (tab.browserView?.webContents && !tab.browserView.webContents.isDestroyed()) {
        tab.browserView.webContents.destroy();
      }
    } catch {
      /* ignore */
    }
  }
  previewTabs.clear();
  activeTabId = null;
  previewInspectorEnabled = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    attachActiveBrowserViews();
  }
}

function tabForWebContents(webContents) {
  for (const t of previewTabs.values()) {
    if (t.browserView?.webContents === webContents) return t;
  }
  return null;
}

async function injectPreviewInspector(webContents) {
  if (!webContents || webContents.isDestroyed()) return;
  const url = webContents.getURL();
  if (!url.startsWith("http://") && !url.startsWith("https://")) return;
  const tab = tabForWebContents(webContents);
  try {
    await webContents.executeJavaScript(
      PREVIEW_CHANGE_HIGHLIGHTS_BOOTSTRAP,
      true
    );
    await webContents.executeJavaScript(PREVIEW_INSPECTOR_BOOTSTRAP, true);
    await webContents.executeJavaScript(
      `window.__snappiInspectorSetMode && window.__snappiInspectorSetMode(${JSON.stringify(
        previewInspectorEnabled
      )});`,
      true
    );
  } catch (e) {
    console.warn("[snappi] preview inspector inject:", e.message || e);
  }
}

function attachPreviewWebContentsListeners(webContents) {
  const onLoad = () => {
    void injectPreviewInspector(webContents);
  };
  const onInPageNav = () => {
    if (webContents.isDestroyed()) return;
    void webContents
      .executeJavaScript(
        "try{window.__snappiNotifyHostNavigation&&window.__snappiNotifyHostNavigation()}catch(e){}",
        true
      )
      .catch(() => {});
    void injectPreviewInspector(webContents);
  };
  webContents.on("did-finish-load", onLoad);
  webContents.on("did-navigate-in-page", onInPageNav);
}

/** One partition per tab so localhost:5173 cache/storage never bleeds between PR previews. */
function createPreviewBrowserView(tabId) {
  const partition = `persist:snappi-pr-tab-${tabId}`;
  const ses = session.fromPartition(partition, { cache: true });
  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, "preview-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: ses,
    },
  });
  attachPreviewWebContentsListeners(view.webContents);
  return view;
}

async function setActiveTab(tabId) {
  const tab = previewTabs.get(tabId);
  if (!tab || tab.browserView.webContents.isDestroyed()) return;
  activeTabId = tabId;
  if (mainWindow && !mainWindow.isDestroyed()) {
    ensureAiDockView();
    attachActiveBrowserViews();
    await injectPreviewInspector(tab.browserView.webContents);
  }
  broadcastTabsUpdated();
}

function destroyTab(tabId) {
  const tab = previewTabs.get(tabId);
  if (!tab) return { ok: false, error: "Unknown tab" };

  const wasActive = activeTabId === tabId;
  stopPreview(tab.projectPath);

  previewTabs.delete(tabId);

  try {
    if (tab.browserView?.webContents && !tab.browserView.webContents.isDestroyed()) {
      tab.browserView.webContents.destroy();
    }
  } catch (e) {
    console.warn("[snappi] destroy tab webContents:", e);
  }

  if (wasActive) {
    activeTabId = null;
    const ids = [...previewTabs.keys()];
    if (ids.length > 0) {
      void setActiveTab(ids[ids.length - 1]);
    } else {
      previewInspectorEnabled = false;
      broadcastTabsUpdated();
    }
  } else {
    broadcastTabsUpdated();
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    attachActiveBrowserViews();
  }

  return { ok: true };
}

function schedulePatternFlyPrDocSummary(projectPathNormalized, slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return;
  const resolved = path.resolve(projectPathNormalized);
  void (async () => {
    try {
      const { batchPatternFlySearchForSlugs } = await import(
        "./patternfly-mcp.mjs"
      );
      const summary = await batchPatternFlySearchForSlugs(slugs);
      for (const t of previewTabs.values()) {
        if (path.resolve(t.projectPath) === resolved) {
          t.prPatternFlyDocSummary = summary;
          broadcastTabsUpdated();
          return;
        }
      }
    } catch (e) {
      for (const t of previewTabs.values()) {
        if (path.resolve(t.projectPath) === resolved) {
          t.prPatternFlyDocSummary = {
            error: String(e?.message || e),
            items: [],
            markdown: "",
          };
          broadcastTabsUpdated();
          return;
        }
      }
    }
  })();
}

async function addOrFocusPreviewTab({
  url: rawUrl,
  projectPath,
  prUrl,
  prTitle,
  prBody,
  prHtmlUrl,
  prChangedFiles,
  prChangedFilesTotal,
  prChangedFilesTruncated,
  prUxTour,
  prPatternFlySlugs,
  prPatternFlyFiles,
}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const u = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!u || !/^https?:\/\//i.test(u)) return;

  const normalizedPath = path.resolve(projectPath);
  const title = typeof prTitle === "string" ? prTitle : "";
  const body = typeof prBody === "string" ? prBody : "";
  const htmlU =
    typeof prHtmlUrl === "string" && prHtmlUrl.trim()
      ? prHtmlUrl.trim()
      : typeof prUrl === "string"
        ? prUrl.trim()
        : "";

  const changedFiles = Array.isArray(prChangedFiles) ? prChangedFiles : [];
  const changedFilesTotal =
    typeof prChangedFilesTotal === "number"
      ? prChangedFilesTotal
      : changedFiles.length;
  const changedFilesTruncated = Boolean(prChangedFilesTruncated);
  const uxTour = normalizePrUxTour(prUxTour);
  const pfSlugs = Array.isArray(prPatternFlySlugs) ? prPatternFlySlugs : [];
  const pfFiles = Array.isArray(prPatternFlyFiles) ? prPatternFlyFiles : [];
  const loadUrl = joinPreviewUrlWithTourPath(u, prUxTour);

  const [cw, ch] = mainWindow.getContentSize();
  if (cw < PREVIEW_SHELL_WIDTH + 400) {
    mainWindow.setSize(Math.max(1280, cw), Math.max(820, ch));
  }
  mainWindow.setMinimumSize(720, 560);

  let existing = null;
  for (const t of previewTabs.values()) {
    if (path.resolve(t.projectPath) === normalizedPath) {
      existing = t;
      break;
    }
  }

  previewInspectorEnabled = false;

  if (existing) {
    existing.url = loadUrl;
    existing.prUrl = prUrl;
    existing.prTitle = title;
    existing.prBody = body;
    existing.prHtmlUrl = htmlU;
    existing.prChangedFiles = changedFiles;
    existing.prChangedFilesTotal = changedFilesTotal;
    existing.prChangedFilesTruncated = changedFilesTruncated;
    existing.prUxTour = uxTour;
    existing.prPatternFlySlugs = pfSlugs;
    existing.prPatternFlyFiles = pfFiles;
    existing.prPatternFlyDocSummary = pfSlugs.length
      ? { loading: true }
      : null;
    existing.previewSimulatedWidth = null;
    existing.label = tabLabel(projectPath, prUrl);
    activeTabId = existing.id;
    ensureAiDockView();
    attachActiveBrowserViews();
    await existing.browserView.webContents.loadURL(loadUrl);
    await injectPreviewInspector(existing.browserView.webContents);
  } else {
    const id = makeTabId();
    const browserView = createPreviewBrowserView(id);
    const tab = {
      id,
      label: tabLabel(projectPath, prUrl),
      url: loadUrl,
      projectPath: normalizedPath,
      prUrl,
      prTitle: title,
      prBody: body,
      prHtmlUrl: htmlU,
      prChangedFiles: changedFiles,
      prChangedFilesTotal: changedFilesTotal,
      prChangedFilesTruncated: changedFilesTruncated,
      prUxTour: uxTour,
      prPatternFlySlugs: pfSlugs,
      prPatternFlyFiles: pfFiles,
      prPatternFlyDocSummary: pfSlugs.length ? { loading: true } : null,
      previewSimulatedWidth: null,
      browserView,
    };
    previewTabs.set(id, tab);
    activeTabId = id;
    ensureAiDockView();
    attachActiveBrowserViews();
    await browserView.webContents.loadURL(loadUrl);
    await injectPreviewInspector(browserView.webContents);
  }

  mainWindow.show();
  mainWindow.focus();
  broadcastTabsUpdated();
  mainWindow.webContents.send("preview:attached", { url: loadUrl });
  if (pfSlugs.length > 0) {
    schedulePatternFlyPrDocSummary(normalizedPath, pfSlugs);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 680,
    minWidth: 360,
    minHeight: 560,
    show: false,
    title: "Snappi",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = win;

  const lockShellZoom = () => {
    try {
      win.webContents.setZoomFactor(1);
      win.webContents.setVisualZoomLevelLimits(1, 1);
    } catch {
      /* ignore */
    }
  };
  win.webContents.on("did-finish-load", lockShellZoom);

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (!(input.control || input.meta)) return;
    const c = input.code;
    if (
      c === "Equal" ||
      c === "Minus" ||
      c === "Digit0" ||
      c === "NumpadAdd" ||
      c === "NumpadSubtract" ||
      c === "Numpad0"
    ) {
      event.preventDefault();
    }
  });

  win.once("ready-to-show", () => win.show());

  win.on("resize", () => layoutBrowserViews());
  win.on("closed", () => {
    destroyAllPreviewTabs();
    mainWindow = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) return;
    event.preventDefault();
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
  });

  win.loadFile(path.join(publicDir, "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  import("./patternfly-mcp.mjs")
    .then((m) => m.warmPatternFlyMcp())
    .catch(() => {});
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void import("./patternfly-mcp.mjs").then((m) => m.shutdownPatternFlyMcp());
});

ipcMain.handle("app:getConfig", async () => ({
  defaultIssueUrl: process.env.ISSUE_URL || null,
  hasAiProvider: isInspectorAiConfigured(),
  hasGithubToken: Boolean(process.env.GITHUB_TOKEN?.trim()),
}));

ipcMain.handle("github:createAiFixupPr", async () => {
  const tab = getActiveTab();
  if (!tab?.projectPath || !tab?.prUrl?.trim()) {
    return {
      ok: false,
      error: "No active preview tab with a PR URL.",
    };
  }
  try {
    return await createAiFixupPullRequest({
      projectPath: tab.projectPath,
      prUrl: tab.prUrl,
    });
  } catch (e) {
    return { ok: false, error: previewFailureMessage(e) };
  }
});

ipcMain.handle("github:postPrComment", async (_event, { prHtmlUrl, body } = {}) => {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    return {
      ok: false,
      error:
        "Set GITHUB_TOKEN in the environment (PAT with repo scope) to post PR comments.",
    };
  }
  const urlStr = typeof prHtmlUrl === "string" ? prHtmlUrl.trim() : "";
  const text = typeof body === "string" ? body : "";
  if (!urlStr || !text.trim()) {
    return { ok: false, error: "Missing PR URL or comment body." };
  }
  let owner;
  let repo;
  let pull;
  try {
    ({ owner, repo, pull } = parsePrUrl(urlStr));
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
  const api = `https://api.github.com/repos/${owner}/${repo}/issues/${pull}/comments`;
  try {
    const res = await fetch(api, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: text.slice(0, 65000) }),
    });
    const raw = await res.text();
    if (!res.ok) {
      let msg = raw.slice(0, 500);
      try {
        const j = JSON.parse(raw);
        msg = j.message || msg;
      } catch {
        /* ignore */
      }
      return { ok: false, error: msg || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("shell:openExternal", async (_event, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
  }
});

ipcMain.handle("shell:setShellPanelCollapsed", async (_event, { collapsed } = {}) => {
  shellPanelContentWidth = collapsed
    ? PREVIEW_SHELL_COLLAPSED_WIDTH
    : PREVIEW_SHELL_WIDTH;
  layoutBrowserViews();
  return {
    width: shellPanelContentWidth,
    collapsed: Boolean(collapsed),
  };
});

ipcMain.handle("clipboard:writeText", async (_event, text) => {
  if (typeof text !== "string") {
    return { ok: false, error: "Invalid text" };
  }
  try {
    clipboard.writeText(text);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle("preview:listTabs", async () => serializeTabsPayload());

ipcMain.handle("preview:switchTab", async (_event, { tabId } = {}) => {
  if (typeof tabId !== "string" || !previewTabs.has(tabId)) {
    return { ok: false, error: "Invalid tab" };
  }
  await setActiveTab(tabId);
  return { ok: true };
});

ipcMain.handle("preview:closeTab", async (_event, { tabId } = {}) => {
  if (typeof tabId !== "string" || !previewTabs.has(tabId)) {
    return { ok: false, error: "Invalid tab" };
  }
  return destroyTab(tabId);
});

ipcMain.handle("preview:setInspectorMode", async (_event, enabled) => {
  const on = !!enabled;
  previewInspectorEnabled = on;
  const tab = getActiveTab();
  if (!tab || tab.browserView.webContents.isDestroyed()) {
    return on ? { ok: false, error: "No preview loaded" } : { ok: true };
  }
  try {
    await tab.browserView.webContents.executeJavaScript(
      `window.__snappiInspectorSetMode && window.__snappiInspectorSetMode(${JSON.stringify(on)});`,
      true
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle("preview:setSimulatedViewportWidth", async (_event, { width } = {}) => {
  const tab = getActiveTab();
  if (!tab || tab.browserView.webContents.isDestroyed()) {
    return { ok: false, error: "No preview loaded" };
  }
  if (width == null) {
    tab.previewSimulatedWidth = null;
  } else {
    const n = Number(width);
    if (!Number.isFinite(n) || n < 320 || n > 4096) {
      return { ok: false, error: "Width must be between 320 and 4096, or null to fill." };
    }
    tab.previewSimulatedWidth = Math.round(n);
  }
  layoutBrowserViews();
  broadcastTabsUpdated();
  return { ok: true, width: tab.previewSimulatedWidth };
});

ipcMain.handle("preview:analyzePickForReview", async (_event, { pick } = {}) => {
  if (!pick || typeof pick !== "object") {
    return { items: [] };
  }
  const slim = { ...pick };
  delete slim.previewDataUrl;
  return { items: runUiReviewHeuristics(slim) };
});

/**
 * Capture a JPEG thumbnail of the picked element. Uses a full-viewport capture then
 * crops in image space using innerWidth/innerHeight scale — fixes mis-aligned crops
 * on HiDPI / BrowserView where capturePage(rect) CSS coords do not match the bitmap.
 * @param {import("electron").WebContents} webContents
 * @param {{ x?: number; y?: number; width?: number; height?: number } | undefined} rect
 * @returns {Promise<string>}
 */
async function captureInspectorPickThumbnail(webContents, rect) {
  if (!webContents || webContents.isDestroyed()) return "";
  const r = rect || {};
  const w = Number(r.width);
  const h = Number(r.height);
  if (!(w >= 1 && h >= 1)) return "";
  const pad = 3;
  const vx = Math.max(0, Number(r.x) - pad);
  const vy = Math.max(0, Number(r.y) - pad);
  const vw = Math.min(w + pad * 2, 8192);
  const vh = Math.min(h + pad * 2, 8192);

  let full;
  try {
    full = await webContents.capturePage();
  } catch {
    return "";
  }
  if (!full || full.isEmpty()) return "";

  const layout = await webContents
    .executeJavaScript(
      `({ iw: window.innerWidth, ih: window.innerHeight })`,
      true
    )
    .catch(() => ({ iw: 0, ih: 0 }));

  const iw = Math.max(1, Math.round(Number(layout.iw) || 1));
  const ih = Math.max(1, Math.round(Number(layout.ih) || 1));
  const is = full.getSize();
  const scaleX = is.width / iw;
  const scaleY = is.height / ih;

  let x = Math.floor(vx * scaleX);
  let y = Math.floor(vy * scaleY);
  let cw = Math.ceil(vw * scaleX);
  let ch = Math.ceil(vh * scaleY);

  x = Math.max(0, Math.min(x, is.width - 1));
  y = Math.max(0, Math.min(y, is.height - 1));
  cw = Math.max(1, Math.min(cw, is.width - x));
  ch = Math.max(1, Math.min(ch, is.height - y));

  let img;
  try {
    img = full.crop({ x, y, width: cw, height: ch });
  } catch {
    return "";
  }
  if (!img || img.isEmpty()) return "";

  const size = img.getSize();
  const maxDim = 320;
  let tw = size.width;
  let th = size.height;
  if (tw > maxDim || th > maxDim) {
    const s = maxDim / Math.max(tw, th);
    tw = Math.max(1, Math.round(tw * s));
    th = Math.max(1, Math.round(th * s));
  }
  const resized =
    tw === size.width && th === size.height ? img : img.resize({ width: tw, height: th });
  const buf = resized.toJPEG(78);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

function pickPayloadWithoutThumbnail(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const { previewDataUrl: _omit, ...rest } = payload;
  return rest;
}

async function sendPatternFlyInsights(pick) {
  const wc = mainWindow?.webContents;
  const aiWc = globalAiDockView?.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.send("snappi-pf-insights", { loading: true });
  if (aiWc && !aiWc.isDestroyed()) {
    aiWc.send("snappi-pf-insights", { loading: true });
  }
  try {
    const { runPatternFlyAudit } = await import("./patternfly-mcp.mjs");
    const result = await runPatternFlyAudit(pick);
    if (!wc.isDestroyed()) {
      wc.send("snappi-pf-insights", { loading: false, ...result });
    }
    if (aiWc && !aiWc.isDestroyed()) {
      aiWc.send("snappi-pf-insights", { loading: false, ...result });
    }
  } catch (e) {
    if (!wc.isDestroyed()) {
      wc.send("snappi-pf-insights", {
        loading: false,
        error: e?.message || String(e),
        insights: [],
        identity: null,
        notPfMessage: null,
        anomalies: [],
        passes: [],
        docSnippet: "",
        mcpUsed: false,
        nextStepsTemplate: "",
      });
    }
    if (aiWc && !aiWc.isDestroyed()) {
      aiWc.send("snappi-pf-insights", {
        loading: false,
        error: e?.message || String(e),
        insights: [],
        identity: null,
        notPfMessage: null,
        anomalies: [],
        passes: [],
        docSnippet: "",
        mcpUsed: false,
        nextStepsTemplate: "",
      });
    }
  }
}

ipcMain.on("snappi-inspector-pick", (event, payload) => {
  const tab = getActiveTab();
  if (!tab || event.sender !== tab.browserView.webContents) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void (async () => {
    const base = payload && typeof payload === "object" ? { ...payload } : {};
    let enriched = { ...base };
    try {
      enriched.designAlerts = runDesignTokenAlerts(enriched);
    } catch (e) {
      console.warn("[snappi] design alerts:", e?.message || e);
      enriched.designAlerts = [];
    }
    /** Send selector/text to AI dock before thumbnail — avoids race with slow capture or late panel load. */
    if (!mainWindow.isDestroyed()) {
      broadcastInspectorPick(enriched);
    }
    try {
      const thumb = await captureInspectorPickThumbnail(
        tab.browserView.webContents,
        base.rect
      );
      if (thumb) enriched = { ...enriched, previewDataUrl: thumb };
    } catch (e) {
      console.warn("[snappi] inspector thumbnail:", e?.message || e);
    }
    if (!mainWindow.isDestroyed()) {
      broadcastInspectorPick(enriched);
    }
    void sendPatternFlyInsights(pickPayloadWithoutThumbnail(enriched));
  })();
});

ipcMain.handle("preview:gitFileHistory", async (_event, { filename, limit } = {}) => {
  const tab = getActiveTab();
  if (!tab?.projectPath) {
    return { ok: false, error: "No active preview tab" };
  }
  const f = typeof filename === "string" ? filename.trim() : "";
  if (!f) return { ok: false, error: "Missing filename" };
  return gitLogForPath(tab.projectPath, f, Math.min(40, Number(limit) || 12));
});

ipcMain.handle("preview:applyDomPatches", async (_event, { patches } = {}) => {
  const tab = getActiveTab();
  if (!tab || tab.browserView.webContents.isDestroyed()) {
    return { ok: false, error: "No preview loaded" };
  }
  const safe = sanitizeDomPatches(patches);
  const injected = JSON.stringify(safe);
  const js = `(function(){ if (typeof window.__snappiApplyDomPatches !== "function") {
    return { ok: false, error: "Preview script not ready — reload the preview tab", applied: [], errors: [] };
  }
  return window.__snappiApplyDomPatches(${injected});
})()`;
  try {
    const result = await tab.browserView.webContents.executeJavaScript(js, true);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle("preview:undoDomPatches", async () => {
  const tab = getActiveTab();
  if (!tab || tab.browserView.webContents.isDestroyed()) {
    return { ok: false, error: "No preview loaded" };
  }
  const js = `(function(){ if (typeof window.__snappiUndoLastDomPatchBatch !== "function") {
    return { ok: false, error: "Preview script not ready — reload the preview tab", undone: 0 };
  }
  return window.__snappiUndoLastDomPatchBatch();
})()`;
  try {
    const result = await tab.browserView.webContents.executeJavaScript(js, true);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle("ai:inspectorChat", async (_event, payload = {}) => {
  try {
    const tab = getActiveTab();
    let fileContexts = [];
    if (
      tab?.projectPath &&
      typeof payload.changedFilesPreview === "string" &&
      payload.changedFilesPreview.trim()
    ) {
      fileContexts = readProjectFileSnippetsForAi(
        tab.projectPath,
        payload.changedFilesPreview
      );
    }
    const { reply, patches, sourceEdits } = await runInspectorAiChat({
      messages: payload.messages,
      pick: payload.pick || null,
      pageUrl: typeof payload.pageUrl === "string" ? payload.pageUrl : "",
      model: process.env.SNAPPI_AI_MODEL,
      changedFilesPreview:
        typeof payload.changedFilesPreview === "string"
          ? payload.changedFilesPreview
          : "",
      fileContexts,
    });
    const safePatches = sanitizeDomPatches(patches);
    const safeSource = sanitizeSourceEdits(sourceEdits);
    return {
      ok: true,
      reply,
      patches: safePatches,
      sourceEdits: safeSource,
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("preview:applySourceEdits", async (_event, { edits } = {}) => {
  const tab = getActiveTab();
  if (!tab?.projectPath) {
    return { ok: false, error: "No active preview tab with a project path." };
  }
  try {
    const result = applySourceEditsToProject(tab.projectPath, edits);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("shell:setAiDockMode", async (_event, _payload = {}) => {
  aiDockMode = "right";
  layoutBrowserViews();
  return { ok: true, mode: aiDockMode };
});

ipcMain.handle("shell:getAiDockMode", async () => ({ mode: aiDockMode }));

ipcMain.handle("shell:setAiDockVisible", async (_event, { visible } = {}) => {
  if (typeof visible === "boolean") {
    aiDockVisible = visible;
    layoutBrowserViews();
  }
  return { ok: true, visible: aiDockVisible };
});

ipcMain.handle("shell:getAiDockVisible", async () => ({
  visible: aiDockVisible,
}));

function prPreviewPaths() {
  const base = path.join(app.getPath("userData"), "pr-preview");
  return {
    workRoot: path.join(base, "repos"),
    logsDir: path.join(base, "logs"),
  };
}

ipcMain.handle("preview:startPr", async (event, { prUrl, port, envVars } = {}) => {
  const url = typeof prUrl === "string" ? prUrl.trim() : "";
  if (!url) {
    return { ok: false, error: "Paste a GitHub PR URL first." };
  }
  try {
    parsePrUrl(url);
  } catch (e) {
    return {
      ok: false,
      error:
        e.message ||
        "Use a PR link like https://github.com/org/repo/pull/1 (not issues-only).",
    };
  }
  const sender = event.sender;
  const progress = (payload) => {
    if (!sender.isDestroyed()) sender.send("preview:progress", payload);
  };
  try {
    const paths = prPreviewPaths();
    const result = await runPrPreviewPipeline(url, {
      port: typeof port === "number" && port > 0 ? port : undefined,
      envVars: typeof envVars === "string" ? envVars : undefined,
      workRoot: paths.workRoot,
      logsDir: paths.logsDir,
      onProgress: progress,
    });
    await addOrFocusPreviewTab({
      url: result.url,
      projectPath: result.path,
      prUrl: url,
      prTitle: result.prTitle,
      prBody: result.prBody,
      prHtmlUrl: result.prHtmlUrl,
      prChangedFiles: result.prChangedFiles,
      prChangedFilesTotal: result.prChangedFilesTotal,
      prChangedFilesTruncated: result.prChangedFilesTruncated,
      prUxTour: result.prUxTour,
      prPatternFlySlugs: result.prPatternFlySlugs,
      prPatternFlyFiles: result.prPatternFlyFiles,
    });
    const active = getActiveTab();
    return { ok: true, ...result, tabId: active?.id ?? null };
  } catch (e) {
    console.error("[preview:startPr]", e);
    return { ok: false, error: previewFailureMessage(e) };
  }
});

ipcMain.handle("preview:applyPrHighlights", async () => {
  const tab = getActiveTab();
  if (!tab) return { ok: false, error: "No preview tab" };
  const tour = normalizePrUxTour(tab.prUxTour);
  const canTour =
    tour.navLabels.length > 0 ||
    tour.navPaths.length > 0 ||
    tour.regionHints.length > 0 ||
    tour.removalLabels.length > 0 ||
    tour.additionLabels.length > 0 ||
    tour.highlightMain ||
    tour.fullPageHighlight;
  if (!canTour) {
    return {
      ok: false,
      error:
        "No highlight targets for this PR (no new/updated screens or navigation cues in the changed files). Open the full diff on GitHub if you need line-level detail.",
    };
  }
  const wc = tab.browserView.webContents;
  if (wc.isDestroyed()) return { ok: false, error: "Preview closed" };
  try {
    await wc.executeJavaScript(PREVIEW_CHANGE_HIGHLIGHTS_BOOTSTRAP, true);
    const r = await wc.executeJavaScript(
      `window.__snappiApplyPrTour && window.__snappiApplyPrTour(${JSON.stringify(
        tour
      )})`,
      true
    );
    return { ok: true, ...(typeof r === "object" && r ? r : { applied: 0 }) };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle("preview:clearPrHighlights", async () => {
  const tab = getActiveTab();
  if (!tab) return { ok: false, error: "No preview tab" };
  const wc = tab.browserView.webContents;
  if (wc.isDestroyed()) return { ok: false, error: "Preview closed" };
  try {
    await wc.executeJavaScript(
      `window.__snappiClearPrHighlights && window.__snappiClearPrHighlights()`,
      true
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

const PR_BATCH_MAX = 5;

ipcMain.handle("preview:startPrBatch", async (event, { prUrls, envVars } = {}) => {
  const raw = Array.isArray(prUrls) ? prUrls : [];
  const urls = [...new Set(raw.map((u) => String(u).trim()).filter(Boolean))];
  if (urls.length === 0) {
    return { ok: false, error: "Add at least one PR URL (one per line)." };
  }
  if (urls.length > PR_BATCH_MAX) {
    return {
      ok: false,
      error: `At most ${PR_BATCH_MAX} PRs per batch. Split into multiple runs.`,
    };
  }
  const sender = event.sender;
  const paths = prPreviewPaths();
  /** @type {{ prUrl: string; ok: boolean; error?: string; tabId?: string; url?: string; port?: number }[]} */
  const results = [];

  for (let i = 0; i < urls.length; i++) {
    const prUrl = urls[i];
    const batchMeta = {
      batchIndex: i + 1,
      batchTotal: urls.length,
      batchPrUrl: prUrl,
    };
    const progress = (payload) => {
      if (!sender.isDestroyed()) {
        sender.send("preview:progress", { ...payload, ...batchMeta });
      }
    };

    try {
      parsePrUrl(prUrl);
    } catch (e) {
      const msg = previewFailureMessage(e);
      results.push({ prUrl, ok: false, error: msg });
      progress({
        kind: "status",
        message: `[${i + 1}/${urls.length}] Skip — not a PR URL: ${msg}`,
      });
      continue;
    }

    progress({
      kind: "status",
      message: `[${i + 1}/${urls.length}] Starting… ${prUrl}`,
    });

    try {
      const result = await runPrPreviewPipeline(prUrl, {
        envVars: typeof envVars === "string" ? envVars : undefined,
        workRoot: paths.workRoot,
        logsDir: paths.logsDir,
        onProgress: progress,
      });
      await addOrFocusPreviewTab({
        url: result.url,
        projectPath: result.path,
        prUrl,
        prTitle: result.prTitle,
        prBody: result.prBody,
        prHtmlUrl: result.prHtmlUrl,
        prChangedFiles: result.prChangedFiles,
        prChangedFilesTotal: result.prChangedFilesTotal,
        prChangedFilesTruncated: result.prChangedFilesTruncated,
        prUxTour: result.prUxTour,
        prPatternFlySlugs: result.prPatternFlySlugs,
        prPatternFlyFiles: result.prPatternFlyFiles,
      });
      const active = getActiveTab();
      results.push({
        prUrl,
        ok: true,
        tabId: active?.id ?? null,
        url: result.url,
        port: result.port,
      });
      progress({
        kind: "status",
        message: `[${i + 1}/${urls.length}] Ready — ${result.url}`,
      });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("preview:attached", { url: result.url });
      }
    } catch (e) {
      const msg = previewFailureMessage(e);
      console.error("[preview:startPrBatch]", prUrl, e);
      results.push({ prUrl, ok: false, error: msg });
      progress({
        kind: "status",
        message: `[${i + 1}/${urls.length}] Failed: ${msg}`,
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  return {
    ok: failCount === 0,
    okCount,
    failCount,
    results,
  };
});
