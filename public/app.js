const prUrlsRows = document.getElementById("prUrlsRows");
const errorEl = document.getElementById("error");
const urlHintWeb = document.getElementById("urlHintWeb");
const btnWebLoad = document.getElementById("btnWebLoad");
const webThreadPanel = document.getElementById("webThreadPanel");
const webTitle = document.getElementById("webTitle");
const webMeta = document.getElementById("webMeta");
const webBody = document.getElementById("webBody");
const webCommentList = document.getElementById("webCommentList");
const viewHome = document.getElementById("viewHome");
const viewSettings = document.getElementById("viewSettings");
const linkSettings = document.getElementById("linkSettings");
const btnShellCollapse = document.getElementById("btnShellCollapse");
const btnSettingsBack = document.getElementById("btnSettingsBack");
const infoBanner = document.getElementById("infoBanner");
const prPreviewDesktopBlock = document.getElementById("prPreviewDesktopBlock");
const btnPrPreview = document.getElementById("btnPrPreview");
const prPreviewStatus = document.getElementById("prPreviewStatus");
const prPreviewLog = document.getElementById("prPreviewLog");
const prPreviewError = document.getElementById("prPreviewError");
const inspectorSessionCard = document.getElementById("inspectorSessionCard");
const btnInspectorToggle = document.getElementById("btnInspectorToggle");
const inspectorPickPanel = document.getElementById("inspectorPickPanel");
const inspectorPickThumb = document.getElementById("inspectorPickThumb");
const inspectorPickPlaceholder = document.getElementById("inspectorPickPlaceholder");
const inspectorPickJson = document.getElementById("inspectorPickJson");
const pfInsightsPanel = document.getElementById("pfInsightsPanel");
const pfInsightsStatus = document.getElementById("pfInsightsStatus");
const pfInsightsList = document.getElementById("pfInsightsList");
const pfInsightsNextSteps = document.getElementById("pfInsightsNextSteps");
const pfInsightsNextStepsPre = document.getElementById("pfInsightsNextStepsPre");
const pfIdentityBlock = document.getElementById("pfIdentityBlock");
const pfIdentityBody = document.getElementById("pfIdentityBody");
const pfIssuesBlock = document.getElementById("pfIssuesBlock");
const pfIssuesEmpty = document.getElementById("pfIssuesEmpty");
const pfPassesBlock = document.getElementById("pfPassesBlock");
const pfPassesList = document.getElementById("pfPassesList");
const handoffDraftTa = document.getElementById("handoffDraftTa");
const btnHandoffRefresh = document.getElementById("btnHandoffRefresh");
const btnHandoffCopy = document.getElementById("btnHandoffCopy");
const btnPostGithubPr = document.getElementById("btnPostGithubPr");
const prPatternFlyPrBlock = document.getElementById("prPatternFlyPrBlock");
const prPatternFlySlugHint = document.getElementById("prPatternFlySlugHint");
const prPatternFlyLoading = document.getElementById("prPatternFlyLoading");
const prPatternFlyErr = document.getElementById("prPatternFlyErr");
const prPatternFlyList = document.getElementById("prPatternFlyList");
const previewTabsBar = document.getElementById("previewTabsBar");
const previewTabsEl = document.getElementById("previewTabs");
const previewPrMetaBar = document.getElementById("previewPrMetaBar");
const previewPrMetaTitle = document.getElementById("previewPrMetaTitle");
const previewPrMetaBody = document.getElementById("previewPrMetaBody");
const previewPrMetaLinkBtn = document.getElementById("previewPrMetaLinkBtn");
const inspectorSessionAddWrap = document.getElementById("inspectorSessionAddWrap");
const sessionPickFeedback = document.getElementById("sessionPickFeedback");
const btnSessionAdd = document.getElementById("btnSessionAdd");
const inspectorSessionList = document.getElementById("inspectorSessionList");
const btnSessionClear = document.getElementById("btnSessionClear");
const prChangedFilesCard = document.getElementById("prChangedFilesCard");
const prChangedUxSummary = document.getElementById("prChangedUxSummary");
const prChangedUiHints = document.getElementById("prChangedUiHints");
const prHighlightSwitchWrap = document.getElementById("prHighlightSwitchWrap");
const prChangedHighlightSwitch = document.getElementById(
  "prChangedHighlightSwitch"
);
const prChangedFilesHint = document.getElementById("prChangedFilesHint");
const prChangedFilesList = document.getElementById("prChangedFilesList");

const LAST_PREVIEW_URL_KEY = "snappiLastPreviewUrl";
const SESSION_STORAGE_KEY = "snappiInspectorSessionV1";

/** @type {{ title?: string; htmlUrl?: string; previewUrl?: string; previewSimulatedWidth?: number | null } | null} */
let lastPrExportMeta = null;

/** @type {{ items: { id: string; category: string; level: string; title: string; detail: string }[]; viewport: object | null }} */
let lastUiReviewHints = { items: [], viewport: null };

/** @type {object | null} */
let lastPfInsightsForExport = null;

/** @type {object | null} */
let lastPfAuditPayload = null;

/** @type {object | null} */
let lastSyncPfDescribe = null;

const MANUAL_CHECKLIST_DEF = [
  {
    id: "a11y_keyboard",
    label: "Keyboard / focus order makes sense on this screen",
  },
  {
    id: "a11y_labels",
    label: "Visible labels and states are clear (not only color or position)",
  },
  {
    id: "states_all",
    label: "Hover, focus, active, and disabled states look intentional",
  },
  {
    id: "responsive_narrow",
    label: "Checked narrow layout (use ~390 preview width)",
  },
  {
    id: "responsive_wide",
    label: "Checked wide / desktop layout",
  },
  {
    id: "copy_voice",
    label: "Copy matches product tone; no obvious typos",
  },
  {
    id: "brand_visual",
    label: "Icons, colors, and spacing match brand / design system",
  },
];

const uiReviewCard = document.getElementById("uiReviewCard");
const uiReviewManualList = document.getElementById("uiReviewManualList");
const uiReviewViewportRow = document.getElementById("uiReviewViewportRow");
const btnCopyGithubMarkdown = document.getElementById("btnCopyGithubMarkdown");
const btnOpenPrOnGithub = document.getElementById("btnOpenPrOnGithub");
const inspectorExportWrap = document.getElementById("inspectorExportWrap");

const PR_URL_MAX = 5;

/** github.com/{owner}/… → show "https://.../" + editable tail */
const GITHUB_OWNER_TAIL_RE = /^https?:\/\/github\.com\/([^/]+)\/(.+)$/i;

/** @type {HTMLInputElement[]} */
let prUrlLineInputs = [];
/** How many numbered rows are shown (1..PR_URL_MAX). */
let prUrlsVisibleSlots = 1;

function prUrlRowEl(i) {
  return prUrlLineInputs[i]?.closest(".pr-urls-editor__row") ?? null;
}

function setRowUrlFromFull(row, raw) {
  if (!row) return;
  const line = row.querySelector(".pr-urls-editor__line");
  const squash = line?.querySelector(".pr-urls-editor__squash");
  const input = line?.querySelector(".pr-urls-editor__input");
  if (!input) return;
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    delete row.dataset.githubOwner;
    input.value = "";
    if (squash) squash.hidden = true;
    return;
  }
  const m = trimmed.match(GITHUB_OWNER_TAIL_RE);
  if (m && squash) {
    row.dataset.githubOwner = m[1];
    squash.hidden = false;
    input.value = m[2].replace(/^\//, "");
  } else {
    delete row.dataset.githubOwner;
    if (squash) squash.hidden = true;
    input.value = trimmed;
  }
}

function getFullUrlFromRow(row) {
  if (!row) return "";
  const input = row.querySelector(".pr-urls-editor__input");
  const v = input?.value.trim() || "";
  if (!v) return "";
  const owner = row.dataset.githubOwner;
  if (owner)
    return `https://github.com/${owner}/${v.replace(/^\//, "")}`;
  return v;
}

function onPrUrlLineInput(i) {
  const row = prUrlRowEl(i);
  const input = prUrlLineInputs[i];
  if (!row || !input) return;
  const raw = input.value.trim();
  if (GITHUB_OWNER_TAIL_RE.test(raw)) {
    setRowUrlFromFull(row, raw);
  }
  syncPrUrlRowVisibility();
}

/** Desktop + tour data + IPC: whether the highlight switch may apply. */
let lastPrCanHighlight = false;
let prTourHighlightDebounceTimer = null;
const PR_TOUR_HIGHLIGHT_DEBOUNCE_MS = 450;

let inspectorModeOn = false;
/** @type {object | null} */
let pendingPick = null;

function loadSessionItems() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessionItems(items) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function sessionItemId() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Omit huge data URLs from JSON panels / markdown code blocks. */
function sanitizePickForJsonDisplay(pick) {
  if (!pick || typeof pick !== "object") return {};
  const out = { ...pick };
  if (out.previewDataUrl) {
    out.previewDataUrl = "(jpeg thumbnail — shown above)";
  }
  return out;
}

function renderPendingPickUi(payload) {
  if (!inspectorPickPanel) return;
  inspectorPickPanel.hidden = false;
  const dataUrl = payload?.previewDataUrl;
  if (inspectorPickThumb && inspectorPickPlaceholder) {
    if (dataUrl) {
      inspectorPickThumb.src = dataUrl;
      inspectorPickThumb.hidden = false;
      inspectorPickPlaceholder.hidden = true;
    } else {
      inspectorPickThumb.removeAttribute("src");
      inspectorPickThumb.hidden = true;
      inspectorPickPlaceholder.hidden = false;
    }
  }
  if (inspectorPickJson) {
    inspectorPickJson.textContent = JSON.stringify(
      sanitizePickForJsonDisplay(payload || {}),
      null,
      2
    );
  }
  const det = inspectorPickPanel.querySelector(".inspector-pick-details");
  if (det) det.open = false;
}

function clearPendingPickUi() {
  if (inspectorPickPanel) inspectorPickPanel.hidden = true;
  if (inspectorPickThumb) {
    inspectorPickThumb.removeAttribute("src");
    inspectorPickThumb.hidden = true;
  }
  if (inspectorPickPlaceholder) inspectorPickPlaceholder.hidden = false;
  if (inspectorPickJson) inspectorPickJson.textContent = "";
}

function syncPendingPickUi() {
  const hasPick = pendingPick != null;
  if (inspectorSessionAddWrap) inspectorSessionAddWrap.hidden = !hasPick;
  if (hasPick && sessionPickFeedback && !sessionPickFeedback.value.trim()) {
    /* keep placeholder focus optional */
  }
}

function clearPfInsights() {
  lastPfAuditPayload = null;
  lastSyncPfDescribe = null;
  lastUiReviewHints = { items: [], viewport: null };
  if (pfInsightsPanel) pfInsightsPanel.hidden = true;
  if (pfInsightsStatus) {
    pfInsightsStatus.hidden = true;
    pfInsightsStatus.textContent = "";
    pfInsightsStatus.className = "pf-insights__status";
  }
  if (pfInsightsList) pfInsightsList.innerHTML = "";
  if (pfIssuesEmpty) pfIssuesEmpty.hidden = true;
  if (pfIssuesBlock) pfIssuesBlock.hidden = true;
  if (pfIdentityBlock) pfIdentityBlock.hidden = true;
  if (pfIdentityBody) pfIdentityBody.replaceChildren();
  if (pfPassesBlock) pfPassesBlock.hidden = true;
  if (pfPassesList) pfPassesList.innerHTML = "";
  if (handoffDraftTa) handoffDraftTa.value = "";
  if (pfInsightsNextSteps) pfInsightsNextSteps.hidden = true;
  if (pfInsightsNextStepsPre) pfInsightsNextStepsPre.textContent = "";
}

function initUiReviewManualList() {
  if (!uiReviewManualList) return;
  uiReviewManualList.innerHTML = "";
  for (const row of MANUAL_CHECKLIST_DEF) {
    const li = document.createElement("li");
    li.className = "ui-review-manual__item";
    const lab = document.createElement("label");
    lab.className = "ui-review-manual__label";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.checkId = row.id;
    cb.className = "ui-review-manual__cb";
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(` ${row.label}`));
    li.appendChild(lab);
    uiReviewManualList.appendChild(li);
  }
}

function resetManualChecklistUi() {
  if (!uiReviewManualList) return;
  uiReviewManualList.querySelectorAll('input[type="checkbox"]').forEach((el) => {
    el.checked = false;
  });
}

function getManualChecklistState() {
  /** @type {Record<string, boolean>} */
  const out = {};
  if (!uiReviewManualList) return out;
  uiReviewManualList.querySelectorAll('input[type="checkbox"]').forEach((el) => {
    const id = el.dataset.checkId;
    if (id) out[id] = el.checked;
  });
  return out;
}

const UI_REVIEW_CAT_LABEL = {
  a11y: "Accessibility",
  interaction: "Interaction",
  responsive: "Responsive",
  copy: "Copy & content",
};

function collectMergedAnomalies() {
  /** @type {{ source: string; title: string; body: string; level: string }[]} */
  const out = [];
  const pf = lastPfAuditPayload;
  if (pf && !pf.loading && Array.isArray(pf.anomalies)) {
    for (const a of pf.anomalies) {
      out.push({
        source: "patternfly",
        title: a.title || "",
        body: a.body || "",
        level: a.level || "warning",
      });
    }
  }
  for (const h of lastUiReviewHints.items || []) {
    const cat = UI_REVIEW_CAT_LABEL[h.category] || h.category || "check";
    out.push({
      source: "heuristic",
      title: `[${cat}] ${h.title || ""}`,
      body: h.detail || "",
      level: h.level === "warn" ? "warning" : "info",
    });
  }
  return out;
}

function refreshIssuesPanel() {
  if (!pfInsightsList || !pfIssuesBlock || !pfIssuesEmpty) return;
  if (!pendingPick) {
    pfIssuesBlock.hidden = true;
    pfInsightsList.innerHTML = "";
    return;
  }
  pfIssuesBlock.hidden = false;
  const items = collectMergedAnomalies();
  pfInsightsList.innerHTML = "";
  if (items.length === 0) {
    pfIssuesEmpty.hidden = false;
  } else {
    pfIssuesEmpty.hidden = true;
    for (const it of items) {
      const div = document.createElement("div");
      div.className = `pf-insights__item pf-insights__item--${
        it.level === "warning" ? "warn" : "info"
      }`;
      const h = document.createElement("strong");
      h.className = "pf-insights__item-title";
      h.textContent = it.title || "";
      const p = document.createElement("p");
      p.className = "pf-insights__item-body";
      p.textContent = it.body || "";
      div.appendChild(h);
      div.appendChild(p);
      pfInsightsList.appendChild(div);
    }
  }
}

function refreshIdentityBlock() {
  if (!pfIdentityBlock || !pfIdentityBody) return;
  const pick = pendingPick;
  if (!pick) {
    pfIdentityBlock.hidden = true;
    pfIdentityBody.replaceChildren();
    return;
  }
  pfIdentityBlock.hidden = false;
  pfIdentityBody.replaceChildren();

  const aud = lastPfAuditPayload;
  const loading = aud?.loading === true;
  const idFromAud =
    aud && !loading && aud.identity ? aud.identity : null;
  const idFromSync = lastSyncPfDescribe?.identity;
  const id = idFromAud || idFromSync;
  const notPfMsg =
    (aud && !loading && aud.notPfMessage) ||
    (lastSyncPfDescribe &&
      lastSyncPfDescribe.isPf === false &&
      lastSyncPfDescribe.notPfMessage);

  if (notPfMsg && !id) {
    const p = document.createElement("p");
    p.textContent = notPfMsg;
    pfIdentityBody.appendChild(p);
  } else if (id) {
    const t = document.createElement("p");
    const bold = document.createElement("strong");
    bold.textContent = id.displayName || "PatternFly";
    t.appendChild(bold);
    t.appendChild(
      document.createTextNode(` (${id.kind || "component"})`)
    );
    pfIdentityBody.appendChild(t);
    if (id.pathSeg) {
      const pp = document.createElement("p");
      pp.className = "pf-identity__path";
      const c = document.createElement("code");
      c.textContent = id.pathSeg;
      pp.appendChild(document.createTextNode("Docs path: "));
      pp.appendChild(c);
      pfIdentityBody.appendChild(pp);
    }
    const href = String(id.docUrl || "").trim();
    if (
      href.startsWith("https://www.patternfly.org") ||
      href.startsWith("https://patternfly.org")
    ) {
      const a = document.createElement("a");
      a.href = href;
      a.className = "pf-insights__doc-link";
      a.textContent = id.docLabel || "Open PatternFly documentation";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      pfIdentityBody.appendChild(a);
    }
    const hint = document.createElement("p");
    hint.className = "field-hint field-hint--tight";
    let ht =
      (idFromAud?.hint || id.hint || "").trim();
    if (loading) ht += (ht ? " " : "") + "Updating after MCP…";
    if (
      idFromAud &&
      idFromAud.mcpReachable === false
    ) {
      ht += (ht ? " " : "") + "MCP unreachable; link is a fallback.";
    }
    if (ht) {
      hint.textContent = ht;
      pfIdentityBody.appendChild(hint);
    }
    if (id.primaryClass) {
      const pc = document.createElement("p");
      pc.className = "pf-identity__meta";
      pc.appendChild(document.createTextNode("PF class token: "));
      const code = document.createElement("code");
      code.textContent = id.primaryClass;
      pc.appendChild(code);
      pfIdentityBody.appendChild(pc);
    }
  }

  const tagLine = document.createElement("p");
  tagLine.className = "pf-identity__meta";
  tagLine.textContent = `HTML <${pick.tag || "?"}> · selector: ${String(pick.selector || "").slice(0, 200) || "n/a"}`;
  pfIdentityBody.appendChild(tagLine);

  const src = document.createElement("p");
  src.className = "field-hint field-hint--tight";
  src.textContent =
    "Source file:line — not available yet (needs source maps / dev integration).";
  pfIdentityBody.appendChild(src);
}

function refreshPassesPanel() {
  if (!pfPassesBlock || !pfPassesList) return;
  const aud = lastPfAuditPayload;
  const passes =
    aud && !aud.loading && Array.isArray(aud.passes) ? aud.passes : [];
  if (!passes.length) {
    pfPassesBlock.hidden = true;
    pfPassesList.innerHTML = "";
    return;
  }
  pfPassesBlock.hidden = false;
  pfPassesList.innerHTML = "";
  for (const p of passes) {
    const li = document.createElement("li");
    li.className = "pf-passes-list__item";
    li.textContent = `✓ ${p.label || ""}`;
    pfPassesList.appendChild(li);
  }
}

function buildHandoffDraftText() {
  const lines = [];
  lines.push("### UX / design review (Snappi)");
  if (lastPrExportMeta?.htmlUrl) lines.push(`PR: ${lastPrExportMeta.htmlUrl}`);
  if (lastPrExportMeta?.previewUrl)
    lines.push(`Preview: ${lastPrExportMeta.previewUrl}`);
  if (pendingPick) {
    lines.push(
      `Pick: <${pendingPick.tag}> \`${String(pendingPick.className || "").slice(0, 220)}\``
    );
  }
  lines.push("");
  const id = lastPfAuditPayload?.identity || lastSyncPfDescribe?.identity;
  if (id?.displayName) {
    lines.push(
      `PatternFly topic: **${id.displayName}** (${id.kind || "component"})`
    );
  }
  if (lastPfAuditPayload?.notPfMessage) {
    lines.push(lastPfAuditPayload.notPfMessage);
  }
  lines.push("");
  lines.push("**Issues**");
  const merged = collectMergedAnomalies();
  if (!merged.length) lines.push("_None auto-detected._");
  else {
    for (const m of merged) {
      lines.push(`- **${m.title}** — ${m.body}`);
    }
  }
  lines.push("");
  lines.push("**Looks OK (auto)**");
  const passes = lastPfAuditPayload?.passes || [];
  if (!passes.length) lines.push("_None listed for this pick._");
  else {
    for (const p of passes) lines.push(`- ✓ ${p.label}`);
  }
  return lines.join("\n");
}

function refreshHandoffDraft() {
  if (!handoffDraftTa || !pendingPick) return;
  handoffDraftTa.value = buildHandoffDraftText();
}

async function hydratePfDescribeForPick() {
  if (!pendingPick || !window.snappi?.describePfPick) {
    lastSyncPfDescribe = null;
    refreshIdentityBlock();
    refreshHandoffDraft();
    return;
  }
  try {
    lastSyncPfDescribe = await window.snappi.describePfPick(
      pendingPick.className || ""
    );
  } catch {
    lastSyncPfDescribe = null;
  }
  refreshIdentityBlock();
  refreshHandoffDraft();
}

function syncViewportPresetButtons() {
  if (!uiReviewViewportRow) return;
  const w = lastPrExportMeta?.previewSimulatedWidth;
  uiReviewViewportRow.querySelectorAll("[data-snappi-vp]").forEach((btn) => {
    const raw = btn.getAttribute("data-snappi-vp");
    const active =
      raw === "fill" ? w == null : Number(raw) === w;
    btn.classList.toggle("ui-review-vp--active", Boolean(active));
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function initUiReviewViewportHandlers() {
  if (!uiReviewViewportRow || !window.snappi?.setPreviewSimulatedViewport) return;
  uiReviewViewportRow.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-snappi-vp]");
    if (!btn) return;
    const raw = btn.getAttribute("data-snappi-vp");
    const width = raw === "fill" ? null : Number(raw);
    void (async () => {
      const res = await window.snappi.setPreviewSimulatedViewport(width);
      if (!res?.ok) {
        showError(res?.error || "Could not resize preview.");
        return;
      }
      showError("");
      if (lastPrExportMeta) {
        lastPrExportMeta.previewSimulatedWidth =
          res.width !== undefined ? res.width : null;
      }
      syncViewportPresetButtons();
    })();
  });
}

/** @param {object | null} pf */
function clonePfForExport(pf) {
  if (!pf || pf.loading || typeof pf !== "object") return null;
  const nt = String(pf.nextStepsTemplate || "").trim();
  if (
    pf.identity ||
    (pf.anomalies && pf.anomalies.length) ||
    (pf.passes && pf.passes.length) ||
    pf.notPfMessage
  ) {
    return {
      identity: pf.identity || null,
      anomalies: Array.isArray(pf.anomalies) ? pf.anomalies : [],
      passes: Array.isArray(pf.passes) ? pf.passes : [],
      notPfMessage: pf.notPfMessage || null,
      nextStepsTemplate: nt ? nt.slice(0, 12000) : "",
    };
  }
  const insights = Array.isArray(pf.insights)
    ? pf.insights.map((i) => ({
        level: i.level,
        title: i.title,
        body: i.body,
        docUrl: i.docUrl,
      }))
    : [];
  if (!insights.length && !nt) return null;
  return {
    insights,
    nextStepsTemplate: nt ? nt.slice(0, 12000) : "",
  };
}

function formatManualForMarkdown(state) {
  const lines = [];
  for (const row of MANUAL_CHECKLIST_DEF) {
    const on = Boolean(state[row.id]);
    lines.push(`- [${on ? "x" : " "}] ${row.label}`);
  }
  return lines.join("\n");
}

function formatUiHintsForMarkdown(items) {
  if (!items?.length) return "_No automated hints (re-pick the element or run inspector on desktop)._";
  return items
    .map((it) => {
      const lv = it.level === "warn" ? "**Note:**" : "—";
      return `- **${it.title}** ${lv} ${it.detail || ""}`.trim();
    })
    .join("\n");
}

function formatPfSnapshotForMarkdown(pf) {
  if (!pf || typeof pf !== "object") {
    return "_No PatternFly snapshot for this pick._";
  }
  if (
    pf.identity ||
    (pf.anomalies && pf.anomalies.length) ||
    (pf.passes && pf.passes.length) ||
    pf.notPfMessage
  ) {
    const parts = [];
    if (pf.identity) {
      const id = pf.identity;
      parts.push(
        `**Component:** ${id.displayName || "?"} (${id.kind || "component"})`
      );
      if (id.docUrl) parts.push(`**Docs:** ${id.docUrl}`);
    }
    if (pf.notPfMessage) parts.push(pf.notPfMessage);
    if (pf.anomalies?.length) {
      parts.push("**Issues:**");
      for (const a of pf.anomalies) {
        parts.push(`- **${a.title}:** ${a.body || ""}`);
      }
    }
    if (pf.passes?.length) {
      parts.push("**Auto-OK:**");
      for (const p of pf.passes) parts.push(`- ✓ ${p.label || ""}`);
    }
    if (pf.nextStepsTemplate) {
      parts.push("");
      parts.push("**Full template:**");
      parts.push("```text");
      parts.push(pf.nextStepsTemplate);
      parts.push("```");
    }
    return parts.join("\n");
  }
  if (!pf.insights?.length && !pf.nextStepsTemplate) {
    return "_No PatternFly design hints captured for this pick._";
  }
  const parts = [];
  const rows = designerFriendlyPfInsights(pf.insights || []);
  for (const r of rows) {
    parts.push(`- **${r.title}:** ${r.body || ""}`);
  }
  if (pf.nextStepsTemplate) {
    parts.push("");
    parts.push("**Handoff template:**");
    parts.push("```text");
    parts.push(pf.nextStepsTemplate);
    parts.push("```");
  }
  return parts.join("\n");
}

function pickSummaryLines(pick) {
  const p = pick || {};
  const lines = [];
  lines.push(`- Tag: \`<${p.tag || "?"}\>`);
  if (p.className) {
    const c = String(p.className).trim().slice(0, 400);
    lines.push(`- Classes: \`${c.replace(/`/g, "'")}\``);
  }
  if (p.textSample) {
    const t = String(p.textSample).trim().replace(/\s+/g, " ").slice(0, 200);
    lines.push(`- Visible text: “${t}”`);
  }
  if (p.selector) {
    lines.push(`- Selector: \`${String(p.selector).slice(0, 280)}\``);
  }
  return lines.join("\n");
}

async function resolveHintsForSessionItem(it) {
  const snap = it?.uiHintsSnapshot?.items;
  if (Array.isArray(snap) && snap.length) return snap;
  const pick = it?.pick;
  if (!pick || typeof pick !== "object") return [];
  const clean = { ...pick };
  delete clean.previewDataUrl;
  try {
    const r = await window.snappi?.analyzePickForReview?.(clean);
    return Array.isArray(r?.items) ? r.items : [];
  } catch {
    return [];
  }
}

async function resolvePfForSessionItem(it) {
  if (it?.pfSnapshot && typeof it.pfSnapshot === "object") return it.pfSnapshot;
  return null;
}

async function buildSessionExportMarkdown() {
  const lines = [];
  lines.push("## UX review (Snappi)");
  lines.push("");
  lines.push(
    "_Automated hints are heuristics only — please verify in code and with your design system._"
  );
  lines.push("");
  if (lastPrExportMeta?.title) {
    lines.push(`**Context:** ${lastPrExportMeta.title}`);
  }
  if (lastPrExportMeta?.htmlUrl) {
    lines.push(`**PR / issue:** ${lastPrExportMeta.htmlUrl}`);
  }
  if (lastPrExportMeta?.previewUrl) {
    lines.push(`**Preview URL:** ${lastPrExportMeta.previewUrl}`);
  }
  const vp = lastPrExportMeta?.previewSimulatedWidth;
  if (vp != null) {
    lines.push(
      `**Simulated preview width:** ${vp}px (Snappi BrowserView — not the full window).`
    );
  }
  lines.push("");

  const items = loadSessionItems();
  if (items.length === 0) {
    lines.push("_No picks in session yet._");
    lines.push("");
  } else {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      lines.push(`### Pick ${i + 1}`);
      lines.push("");
      lines.push(pickSummaryLines(it.pick));
      lines.push("");
      if (it.feedback) {
        lines.push("**Feedback:**");
        lines.push(it.feedback);
        lines.push("");
      }
      lines.push("**Automated UI hints:**");
      lines.push("");
      const hints = await resolveHintsForSessionItem(it);
      lines.push(formatUiHintsForMarkdown(hints));
      lines.push("");
      lines.push("**Manual checklist (at save time):**");
      lines.push("");
      lines.push(formatManualForMarkdown(it.manualChecklist || {}));
      lines.push("");
      const pfs = await resolvePfForSessionItem(it);
      if (pfs) {
        lines.push("**Design system (PatternFly) notes:**");
        lines.push("");
        lines.push(formatPfSnapshotForMarkdown(pfs));
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
  }

  const draftFeedback = sessionPickFeedback?.value?.trim() || "";
  const draftManual = getManualChecklistState();
  const anyManual = Object.values(draftManual).some(Boolean);
  if (pendingPick && (draftFeedback || anyManual)) {
    lines.push("### Draft (not yet added to session)");
    lines.push("");
    lines.push(pickSummaryLines(pendingPick));
    lines.push("");
    if (draftFeedback) {
      lines.push("**Feedback (draft):**");
      lines.push(draftFeedback);
      lines.push("");
    }
    lines.push("**Automated UI hints (current pick):**");
    lines.push("");
    lines.push(formatUiHintsForMarkdown(lastUiReviewHints.items));
    lines.push("");
    lines.push("**Manual checklist (current):**");
    lines.push("");
    lines.push(formatManualForMarkdown(draftManual));
    lines.push("");
    if (lastPfInsightsForExport) {
      lines.push("**Design system (PatternFly) notes (current):**");
      lines.push("");
      lines.push(
        formatPfSnapshotForMarkdown(clonePfForExport(lastPfInsightsForExport))
      );
      lines.push("");
    }
  }

  lines.push("—");
  lines.push("*Exported from Snappi — paste into a GitHub PR comment or your issue tracker.*");
  return lines.join("\n");
}

/**
 * Map MCP/token-heavy insight rows to short, designer-friendly copy.
 * @param {{ level: string; title: string; body: string; docUrl?: string; docLabel?: string }[]} items
 */
function designerFriendlyPfInsights(items) {
  if (!items || !items.length) return [];
  const out = [];
  for (const it of items) {
    const title = String(it.title || "").trim();
    const level = it.level || "info";

    if (title === "Official documentation") {
      out.push({
        level: "info",
        title: "Which PatternFly page?",
        body: String(it.body || "").trim(),
        docUrl: it.docUrl,
        docLabel: it.docLabel,
      });
      continue;
    }
    if (title === "MCP documentation") {
      continue;
    }
    if (title === "PatternFly MCP unavailable") {
      out.push({
        level: "warning",
        title: "Docs did not load",
        body: "The PatternFly doc check could not run. Your pick is still saved—you can continue adding feedback.",
      });
      continue;
    }
    if (title === "PatternFly MCP") {
      out.push({
        level,
        title: "Not a PatternFly block",
        body: "This selection does not look like a standard PatternFly component. Pick a UI block with PatternFly styling if you want automatic checks.",
      });
      continue;
    }
    if (/^(padding|margin|gap)\b/i.test(title)) {
      out.push({
        level,
        title: title.replace(/px/g, " px"),
        body: String(it.body || "").trim(),
      });
      continue;
    }
    out.push({
      level,
      title,
      body: String(it.body || "").trim(),
      docUrl: it.docUrl,
      docLabel: it.docLabel,
    });
  }
  return out;
}

/**
 * @param {{
 *   loading?: boolean;
 *   error?: string;
 *   identity?: object | null;
 *   notPfMessage?: string | null;
 *   anomalies?: { level: string; title: string; body: string }[];
 *   passes?: { id: string; label: string }[];
 *   nextStepsTemplate?: string;
 * }} payload
 */
function renderPatternFlyInsights(payload) {
  if (!pfInsightsPanel) return;
  pfInsightsPanel.hidden = false;
  lastPfAuditPayload = payload;

  if (payload.loading) {
    lastPfInsightsForExport = null;
    if (pfInsightsStatus) {
      pfInsightsStatus.hidden = false;
      pfInsightsStatus.className =
        "pf-insights__status pf-insights__status--info";
      pfInsightsStatus.textContent = "Running PatternFly MCP…";
    }
    if (pfInsightsNextSteps) pfInsightsNextSteps.hidden = true;
    if (pfInsightsNextStepsPre) pfInsightsNextStepsPre.textContent = "";
    refreshIdentityBlock();
    refreshIssuesPanel();
    refreshPassesPanel();
    return;
  }

  if (pfInsightsStatus) {
    pfInsightsStatus.hidden = true;
    pfInsightsStatus.textContent = "";
    pfInsightsStatus.className = "pf-insights__status";
    const hasAny =
      (payload.anomalies && payload.anomalies.length > 0) ||
      payload.identity ||
      payload.notPfMessage;
    if (payload.error && !hasAny) {
      pfInsightsStatus.hidden = false;
      pfInsightsStatus.className =
        "pf-insights__status pf-insights__status--warn";
      pfInsightsStatus.textContent =
        "PatternFly check failed — see Issues if any.";
    }
  }

  refreshIdentityBlock();
  refreshIssuesPanel();
  refreshPassesPanel();
  refreshHandoffDraft();

  const ns = payload.nextStepsTemplate;
  if (
    pfInsightsNextSteps &&
    pfInsightsNextStepsPre &&
    typeof ns === "string" &&
    ns.trim()
  ) {
    pfInsightsNextSteps.hidden = false;
    pfInsightsNextStepsPre.textContent = ns.trim();
  } else if (pfInsightsNextSteps) {
    pfInsightsNextSteps.hidden = true;
    if (pfInsightsNextStepsPre) pfInsightsNextStepsPre.textContent = "";
  }
  lastPfInsightsForExport = { ...payload };
}

function updateExportButtonsState() {
  const hasPr = Boolean(lastPrExportMeta?.htmlUrl);
  const hasSession = loadSessionItems().length > 0;
  const draftText = sessionPickFeedback?.value?.trim() || "";
  const anyManual = Object.values(getManualChecklistState()).some(Boolean);
  const hasDraft = Boolean(pendingPick && (draftText || anyManual));
  if (btnOpenPrOnGithub) {
    btnOpenPrOnGithub.hidden = !hasPr;
    btnOpenPrOnGithub.disabled = !hasPr;
  }
  if (btnCopyGithubMarkdown) {
    btnCopyGithubMarkdown.disabled = !(hasSession || hasDraft || hasPr);
  }
}

function clearPendingPick() {
  pendingPick = null;
  clearPendingPickUi();
  clearPfInsights();
  lastPfInsightsForExport = null;
  resetManualChecklistUi();
  if (sessionPickFeedback) sessionPickFeedback.value = "";
  syncPendingPickUi();
  syncInspectorSessionCardVisibility();
  updateExportButtonsState();
}

function renderSessionList() {
  const items = loadSessionItems();
  if (!inspectorSessionList) return;
  inspectorSessionList.innerHTML = "";
  for (const it of items) {
    const li = document.createElement("li");
    li.className = "inspector-session-item";
    const p = it.pick || {};

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "inspector-session-item__thumb-wrap";
    if (p.previewDataUrl) {
      const img = document.createElement("img");
      img.className = "inspector-session-item__thumb";
      img.alt = "";
      img.src = p.previewDataUrl;
      thumbWrap.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className =
        "inspector-session-item__thumb inspector-session-item__thumb--empty";
      ph.textContent = "No preview";
      thumbWrap.appendChild(ph);
    }

    const body = document.createElement("div");
    body.className = "inspector-session-item__body";

    const details = document.createElement("details");
    details.className = "inspector-session-item__details";
    const sum = document.createElement("summary");
    sum.textContent = "Pick details (JSON)";
    const pre = document.createElement("pre");
    pre.className = "inspector-session-item__json";
    pre.textContent = JSON.stringify(sanitizePickForJsonDisplay(p), null, 2);
    details.appendChild(sum);
    details.appendChild(pre);

    const ta = document.createElement("textarea");
    ta.className = "inspector-session-item__feedback-input";
    ta.rows = 2;
    ta.spellcheck = true;
    ta.setAttribute("aria-label", "Feedback for this pick");
    ta.placeholder = "Feedback for this pick…";
    ta.value = it.feedback ?? "";
    ta.addEventListener("blur", () => {
      const v = ta.value;
      const all = loadSessionItems();
      const row = all.find((x) => x.id === it.id);
      if (row && row.feedback !== v) {
        row.feedback = v;
        saveSessionItems(all);
      }
    });

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "inspector-session-item__remove btn btn-ghost";
    rm.textContent = "Remove";
    rm.addEventListener("click", () => {
      const next = loadSessionItems().filter((x) => x.id !== it.id);
      saveSessionItems(next);
      renderSessionList();
      syncInspectorSessionCardVisibility();
    });

    body.appendChild(details);
    body.appendChild(ta);
    body.appendChild(rm);

    li.appendChild(thumbWrap);
    li.appendChild(body);
    inspectorSessionList.appendChild(li);
  }
}

function initPrUrlsEditor() {
  if (!prUrlsRows) return;
  prUrlsRows.innerHTML = "";
  prUrlLineInputs = [];
  prUrlsVisibleSlots = 1;
  const ph = "org/repo/pull/x";
  for (let i = 0; i < PR_URL_MAX; i++) {
    const row = document.createElement("div");
    row.className = "pr-urls-editor__row";
    row.dataset.index = String(i);
    if (i > 0) row.hidden = true;

    const num = document.createElement("span");
    num.className = "pr-urls-editor__num";
    num.textContent = `${i + 1}.`;

    const line = document.createElement("div");
    line.className = "pr-urls-editor__line";

    const squash = document.createElement("span");
    squash.className = "pr-urls-editor__squash";
    squash.textContent = "https://.../";
    squash.hidden = true;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "pr-urls-editor__input";
    input.id = `prUrlLine${i}`;
    input.spellcheck = false;
    input.autocomplete = "off";
    input.placeholder = ph;
    input.setAttribute("aria-label", `GitHub PR URL ${i + 1}`);

    line.appendChild(squash);
    line.appendChild(input);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "pr-urls-editor__clear";
    clearBtn.setAttribute("aria-label", `Clear PR URL line ${i + 1}`);
    clearBtn.textContent = "\u00d7";

    row.appendChild(num);
    row.appendChild(line);
    row.appendChild(clearBtn);
    prUrlsRows.appendChild(row);
    prUrlLineInputs.push(input);

    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      onPrUrlLineClear(i);
    });

    input.addEventListener("keydown", (e) => onPrUrlLineKeydown(e, i));
    input.addEventListener("input", () => onPrUrlLineInput(i));
    input.addEventListener("paste", (e) => onPrUrlLinePaste(e, i));
  }
}

function onPrUrlLineClear(i) {
  const row = prUrlRowEl(i);
  if (!row) return;
  setRowUrlFromFull(row, "");
  syncPrUrlRowVisibility();
  prUrlLineInputs[i]?.focus();
}

function findLastNonEmptyPrUrlIndex() {
  let last = -1;
  for (let i = 0; i < prUrlLineInputs.length; i++) {
    if (getFullUrlFromRow(prUrlRowEl(i))) last = i;
  }
  return last;
}

function syncPrUrlRowVisibility() {
  const lastNonEmpty = findLastNonEmptyPrUrlIndex();
  let nextSlots;
  if (lastNonEmpty < 0) {
    nextSlots = 1;
  } else {
    nextSlots = Math.min(
      PR_URL_MAX,
      Math.max(prUrlsVisibleSlots, lastNonEmpty + 1)
    );
  }
  prUrlsVisibleSlots = nextSlots;
  for (let j = 0; j < prUrlLineInputs.length; j++) {
    const row = prUrlRowEl(j);
    if (!row) continue;
    if (j >= prUrlsVisibleSlots) {
      setRowUrlFromFull(row, "");
    }
    row.hidden = j >= prUrlsVisibleSlots;
  }
}

function onPrUrlLineKeydown(e, i) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const v = getFullUrlFromRow(prUrlRowEl(i));
  if (!v) return;
  if (i >= PR_URL_MAX - 1) return;
  prUrlsVisibleSlots = Math.max(prUrlsVisibleSlots, i + 2);
  syncPrUrlRowVisibility();
  prUrlLineInputs[i + 1].focus();
}

function onPrUrlLinePaste(e, startIndex) {
  const text = e.clipboardData?.getData("text/plain") || "";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) return;
  e.preventDefault();
  let idx = startIndex;
  for (const line of lines) {
    if (idx >= PR_URL_MAX) break;
    setRowUrlFromFull(prUrlRowEl(idx), line);
    idx++;
  }
  syncPrUrlRowVisibility();
  const focusI = Math.min(Math.max(startIndex, idx - 1), PR_URL_MAX - 1);
  prUrlLineInputs[focusI].focus();
}

/** Non-empty unique URLs in row order (max PR_URL_MAX). */
function getPrUrlValues() {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < prUrlLineInputs.length; i++) {
    const full = getFullUrlFromRow(prUrlRowEl(i));
    if (!full || seen.has(full)) continue;
    seen.add(full);
    out.push(full);
    if (out.length >= PR_URL_MAX) break;
  }
  return out;
}

function getFirstPrUrl() {
  return getPrUrlValues()[0] || "";
}

function clearPrUrlsEditor() {
  for (let i = 0; i < prUrlLineInputs.length; i++) {
    setRowUrlFromFull(prUrlRowEl(i), "");
  }
  prUrlsVisibleSlots = 1;
  syncPrUrlRowVisibility();
}

function setFirstPrUrlIfEmpty(url) {
  const u = String(url || "").trim();
  if (!u || !prUrlLineInputs[0]) return;
  if (getPrUrlValues().length > 0) return;
  setRowUrlFromFull(prUrlRowEl(0), u);
  syncPrUrlRowVisibility();
}

function seedFirstPrUrl(url) {
  const u = String(url || "").trim();
  if (!u || !prUrlLineInputs[0]) return;
  setRowUrlFromFull(prUrlRowEl(0), u);
  prUrlsVisibleSlots = Math.max(prUrlsVisibleSlots, 1);
  syncPrUrlRowVisibility();
}

function syncPrHighlightSwitchAria() {
  const el = prChangedHighlightSwitch;
  if (!el) return;
  el.setAttribute("aria-checked", el.checked ? "true" : "false");
}

function schedulePrTourHighlightsFromSwitch() {
  if (prTourHighlightDebounceTimer) {
    clearTimeout(prTourHighlightDebounceTimer);
    prTourHighlightDebounceTimer = null;
  }
  if (!isDesktopShell || !lastPrCanHighlight) return;
  if (!prChangedHighlightSwitch?.checked) {
    void window.snappi?.clearPrHighlights?.();
    return;
  }
  prTourHighlightDebounceTimer = setTimeout(async () => {
    prTourHighlightDebounceTimer = null;
    if (!prChangedHighlightSwitch?.checked || !lastPrCanHighlight) return;
    await window.snappi?.applyPrHighlights?.();
  }, PR_TOUR_HIGHLIGHT_DEBOUNCE_MS);
}

/** Show inspector shell while picking, or when there is a draft pick / saved session rows. */
function inspectorShellShouldBeVisible() {
  if (inspectorModeOn) return true;
  if (pendingPick != null) return true;
  return loadSessionItems().length > 0;
}

function syncInspectorSessionCardVisibility() {
  if (!inspectorSessionCard) return;
  inspectorSessionCard.hidden = !inspectorShellShouldBeVisible();
}

function resetInspectorUiForNewRun() {
  inspectorModeOn = false;
  if (btnInspectorToggle) {
    btnInspectorToggle.classList.remove("inspector-toggle--on");
    btnInspectorToggle.setAttribute("aria-pressed", "false");
    btnInspectorToggle.textContent = "Inspector mode";
  }
  clearPendingPick();
  void window.snappi?.setPreviewInspectorMode?.(false);
  if (prChangedHighlightSwitch) {
    prChangedHighlightSwitch.checked = true;
    syncPrHighlightSwitchAria();
  }
  if (prTourHighlightDebounceTimer) {
    clearTimeout(prTourHighlightDebounceTimer);
    prTourHighlightDebounceTimer = null;
  }
  void window.snappi?.clearPrHighlights?.();
  syncInspectorSessionCardVisibility();
}

function isLikelyUiPath(filename) {
  const f = String(filename || "");
  const lower = f.toLowerCase();
  if (/\.(tsx?|jsx?|vue|svelte|css|scss|less|sass|astro|html?)$/.test(lower))
    return true;
  if (/(^|\/)components?(\/|$)/i.test(f)) return true;
  if (/(^|\/)pages?(\/|$)/i.test(f)) return true;
  if (/(^|\/)views?(\/|$)/i.test(f)) return true;
  if (/(^|\/)routes?(\/|$)/i.test(f)) return true;
  if (/(^|\/)layouts?(\/|$)/i.test(f)) return true;
  if (/(^|\/)screens?(\/|$)/i.test(f)) return true;
  if (/(^|\/)app\/.*\.(tsx?|jsx?|vue)$/i.test(f)) return true;
  return false;
}

function syncPrChangedFilesPanel(meta) {
  if (!prChangedFilesHint || !prChangedFilesList) return;

  const uxTour = meta?.uxTour || {};
  const uxSummary = String(uxTour.uxSummary || "").trim();
  const navLabels = Array.isArray(uxTour.navLabels) ? uxTour.navLabels : [];
  const navPaths = Array.isArray(uxTour.navPaths) ? uxTour.navPaths : [];
  const regionHints = Array.isArray(uxTour.regionHints)
    ? uxTour.regionHints
    : [];
  const removalLabels = Array.isArray(uxTour.removalLabels)
    ? uxTour.removalLabels
    : [];
  const additionLabels = Array.isArray(uxTour.additionLabels)
    ? uxTour.additionLabels
    : [];
  const highlightMain = Boolean(uxTour.highlightMain);
  const fullPageHighlight = Boolean(uxTour.fullPageHighlight);
  const canTourHl =
    navLabels.length > 0 ||
    navPaths.length > 0 ||
    regionHints.length > 0 ||
    removalLabels.length > 0 ||
    additionLabels.length > 0 ||
    highlightMain ||
    fullPageHighlight;

  if (prChangedUxSummary) {
    if (uxSummary) {
      prChangedUxSummary.textContent = uxSummary;
      prChangedUxSummary.hidden = false;
    } else {
      prChangedUxSummary.textContent = "";
      prChangedUxSummary.hidden = true;
    }
  }

  if (prChangedUiHints) {
    prChangedUiHints.innerHTML = "";
    prChangedUiHints.hidden = true;
  }

  const canHl = Boolean(
    isDesktopShell &&
      canTourHl &&
      window.snappi?.applyPrHighlights &&
      window.snappi?.clearPrHighlights
  );
  lastPrCanHighlight = canHl;
  if (prHighlightSwitchWrap) prHighlightSwitchWrap.hidden = !canHl;
  if (!canHl) {
    if (prTourHighlightDebounceTimer) {
      clearTimeout(prTourHighlightDebounceTimer);
      prTourHighlightDebounceTimer = null;
    }
    void window.snappi?.clearPrHighlights?.();
  } else {
    schedulePrTourHighlightsFromSwitch();
  }

  const files = Array.isArray(meta?.changedFiles)
    ? [...meta.changedFiles]
    : [];
  files.sort((a, b) => {
    const ua = isLikelyUiPath(a.filename) ? 0 : 1;
    const ub = isLikelyUiPath(b.filename) ? 0 : 1;
    if (ua !== ub) return ua - ub;
    return String(a.filename).localeCompare(b.filename);
  });

  const total =
    typeof meta?.changedFilesTotal === "number"
      ? meta.changedFilesTotal
      : files.length;
  const truncated = Boolean(meta?.changedFilesTruncated);
  const diffUrl = String(meta?.filesDiffUrl || "").trim();

  prChangedFilesHint.replaceChildren();
  const diffOk = diffUrl && /^https:\/\/github\.com\//i.test(diffUrl);

  if (files.length === 0) {
    prChangedFilesHint.appendChild(
      document.createTextNode(
        "Couldn’t load the file list from GitHub (private repo: set GITHUB_TOKEN, or rate limit)."
      )
    );
  } else {
    const uiCount = files.filter((f) => isLikelyUiPath(f.filename)).length;
    let hint = `${total} file${total === 1 ? "" : "s"} in this PR.`;
    if (uiCount > 0) {
      hint += ` ${uiCount} are often UI-related (blue rows).`;
    }
    if (total > files.length) {
      hint += ` Showing ${files.length} of ${total}.`;
    } else if (truncated && files.length >= 80) {
      hint += " List may be truncated.";
    }
    prChangedFilesHint.appendChild(document.createTextNode(hint));
    if (diffOk) {
      prChangedFilesHint.appendChild(document.createTextNode(" "));
      const diffA = document.createElement("a");
      diffA.className = "pr-changed-card__diff-link";
      diffA.href = diffUrl;
      diffA.textContent = "Full diff";
      diffA.rel = "noopener noreferrer";
      diffA.addEventListener("click", (e) => {
        e.preventDefault();
        void window.snappi?.openExternal?.(diffUrl);
      });
      prChangedFilesHint.appendChild(diffA);
    }
  }

  prChangedFilesList.innerHTML = "";
  for (const f of files) {
    const li = document.createElement("li");
    li.className = isLikelyUiPath(f.filename)
      ? "pr-changed-card__item pr-changed-card__item--ui"
      : "pr-changed-card__item";
    const st = document.createElement("span");
    st.className = "pr-changed-card__status";
    st.textContent = (f.status && String(f.status)) || "modified";
    li.appendChild(st);
    li.appendChild(document.createTextNode(f.filename));
    prChangedFilesList.appendChild(li);
  }

  syncPatternFlyPrBlock(meta);
}

function syncPatternFlyPrBlock(meta) {
  if (!prPatternFlyPrBlock) return;
  const slugs = Array.isArray(meta?.patternFlySlugs)
    ? meta.patternFlySlugs
    : [];
  const sum = meta?.patternFlyDocSummary;

  const showBlock =
    slugs.length > 0 ||
    sum?.loading ||
    (sum?.items && sum.items.length > 0) ||
    Boolean(sum?.error);
  prPatternFlyPrBlock.hidden = !showBlock;
  if (!showBlock) return;

  if (prPatternFlySlugHint) {
    const has = slugs.length > 0;
    prPatternFlySlugHint.hidden = !has;
    prPatternFlySlugHint.textContent = has
      ? `Components seen in PR diffs: ${slugs.join(", ")}`
      : "";
  }

  const loading = sum?.loading === true;
  if (prPatternFlyLoading) {
    prPatternFlyLoading.hidden = !loading;
  }

  if (prPatternFlyErr) {
    const err = sum?.error ? String(sum.error) : "";
    prPatternFlyErr.hidden = !err;
    prPatternFlyErr.textContent = err;
  }

  if (prPatternFlyList) {
    const items = Array.isArray(sum?.items) ? sum.items : [];
    const showList = !loading && !sum?.error && items.length > 0;
    prPatternFlyList.hidden = !showList;
    prPatternFlyList.innerHTML = "";
    for (const it of items) {
      const li = document.createElement("li");
      li.className = "pr-patternfly-list__item";
      const a = document.createElement("a");
      const href = String(it.docUrl || "").trim();
      if (
        href.startsWith("https://www.patternfly.org") ||
        href.startsWith("https://patternfly.org")
      ) {
        a.href = href;
      } else {
        a.href = "#";
        a.addEventListener("click", (e) => e.preventDefault());
      }
      a.textContent = it.title || it.slug || "Component";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      li.appendChild(a);
      const ex = String(it.excerpt || "").trim();
      if (ex) {
        const span = document.createElement("span");
        span.className = "pr-patternfly-list__excerpt";
        span.textContent = ` — ${ex}`;
        li.appendChild(span);
      }
      prPatternFlyList.appendChild(li);
    }
  }
}

function syncPreviewPrMetaBar(payload) {
  if (!previewPrMetaBar) return;
  const tabs = payload?.tabs ?? [];
  const meta = payload?.activePrMeta;
  if (tabs.length === 0 || !meta) {
    previewPrMetaBar.hidden = true;
    if (prChangedFilesCard) prChangedFilesCard.hidden = true;
    lastPrExportMeta = null;
    syncViewportPresetButtons();
    updateExportButtonsState();
    return;
  }
  const activeTab =
    tabs.find((t) => t.id === payload.activeTabId) || tabs[tabs.length - 1];
  lastPrExportMeta = {
    title: meta.title,
    htmlUrl: meta.htmlUrl,
    previewUrl: activeTab?.url || "",
    previewSimulatedWidth: meta.previewSimulatedWidth ?? null,
  };
  previewPrMetaBar.hidden = false;
  if (previewPrMetaTitle) {
    previewPrMetaTitle.textContent =
      (meta.title && String(meta.title).trim()) || "Pull request";
  }
  if (previewPrMetaBody) {
    const d = (meta.body && String(meta.body).trim()) || "";
    previewPrMetaBody.textContent = d || "No description on GitHub.";
  }
  const gh = (meta.htmlUrl && String(meta.htmlUrl).trim()) || "";
  if (previewPrMetaLinkBtn) {
    previewPrMetaLinkBtn.hidden = !gh;
    previewPrMetaLinkBtn.onclick = () => {
      if (gh) void window.snappi?.openExternal?.(gh);
    };
  }

  if (prChangedFilesCard) {
    prChangedFilesCard.hidden = !isDesktopShell;
    syncPrChangedFilesPanel(meta);
  }
  syncViewportPresetButtons();
  updateExportButtonsState();
}

function onPreviewPaneAttached() {
  const alreadyHad = document.documentElement.classList.contains(
    "snappi-has-preview"
  );
  document.documentElement.classList.add("snappi-has-preview");
  syncInspectorSessionCardVisibility();
  if (!alreadyHad) {
    inspectorModeOn = false;
    if (btnInspectorToggle) {
      btnInspectorToggle.classList.remove("inspector-toggle--on");
      btnInspectorToggle.setAttribute("aria-pressed", "false");
      btnInspectorToggle.textContent = "Inspector mode";
    }
    clearPendingPick();
  }
  renderSessionList();
  schedulePrTourHighlightsFromSwitch();
}

function applyPreviewTabsPayload(payload) {
  if (!previewTabsEl) return;
  const tabs = payload?.tabs ?? [];
  if (tabs.length === 0) {
    resetInspectorUiForNewRun();
    document.documentElement.classList.remove("snappi-has-preview");
    if (previewTabsBar) previewTabsBar.hidden = true;
    previewTabsEl.innerHTML = "";
    try {
      sessionStorage.removeItem(LAST_PREVIEW_URL_KEY);
    } catch {
      /* ignore */
    }
    syncPreviewPrMetaBar({ tabs: [], activePrMeta: null });
    syncInspectorSessionCardVisibility();
    return;
  }

  document.documentElement.classList.add("snappi-has-preview");
  if (previewTabsBar) previewTabsBar.hidden = false;
  syncInspectorSessionCardVisibility();
  renderSessionList();

  const activeTab =
    tabs.find((t) => t.id === payload.activeTabId) || tabs[tabs.length - 1];

  const url = activeTab?.url || "";
  if (url) {
    try {
      sessionStorage.setItem(LAST_PREVIEW_URL_KEY, url);
    } catch {
      /* ignore */
    }
  }

  previewTabsEl.innerHTML = "";
  for (const t of tabs) {
    const row = document.createElement("div");
    row.className = `preview-tab preview-tab--browser${
      t.active ? " preview-tab--active" : ""
    }`;
    row.dataset.tabId = t.id;
    row.setAttribute("role", "tab");
    row.setAttribute("aria-selected", t.active ? "true" : "false");
    row.tabIndex = t.active ? 0 : -1;

    const fav = document.createElement("span");
    fav.className = "preview-tab__favicon";
    fav.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "preview-tab__label";
    label.textContent = t.label || t.id;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "preview-tab__close";
    closeBtn.setAttribute(
      "aria-label",
      `Close preview tab ${t.label || t.id}`
    );
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      void window.snappi?.closePreviewTab?.(t.id);
    });

    row.addEventListener("click", (e) => {
      if (e.target.closest(".preview-tab__close")) return;
      void window.snappi?.switchPreviewTab?.(t.id);
    });

    row.appendChild(fav);
    row.appendChild(label);
    row.appendChild(closeBtn);
    previewTabsEl.appendChild(row);
  }

  syncPreviewPrMetaBar(payload);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdToHtml(md) {
  if (!md) return "";
  let html = escapeHtml(md);
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, _lang, code) => `<pre><code>${code.trim()}</code></pre>`
  );
  html = html.replace(
    /`([^`]+)`/g,
    (_, c) => `<code>${escapeHtml(c)}</code>`
  );
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    (_, t, u) =>
      `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(
        t
      )}</a>`
  );
  html = html.replace(/\n{2,}/g, "</p><p>");
  html = html.replace(/\n/g, "<br/>");
  return `<p>${html}</p>`;
}

function bindExternalLinks(root) {
  root.querySelectorAll("a[href^='http']").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
    });
  });
}

async function fetchWebIssue(url) {
  const res = await fetch(
    `/api/issue?${new URLSearchParams({ url }).toString()}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function renderWebThread(data) {
  const { issue, comments } = data;
  webTitle.textContent = issue.title || "(No title)";
  const state = issue.state || "";
  const user = issue.user?.login || "?";
  const metaText = `#${issue.number} · ${state} · @${user}`;
  webMeta.textContent = metaText;
  if (issue.html_url) {
    webMeta.innerHTML = `${escapeHtml(metaText)} · <a href="${escapeHtml(
      issue.html_url
    )}" class="issue-open-gh" target="_blank" rel="noopener">Open on GitHub</a>`;
  }
  webBody.innerHTML = mdToHtml(issue.body || "_No description_");
  bindExternalLinks(webBody);
  webCommentList.innerHTML = "";
  for (const c of comments || []) {
    const li = document.createElement("li");
    const who = c.user?.login || "?";
    const when = c.created_at
      ? new Date(c.created_at).toLocaleString()
      : "";
    li.innerHTML = `<div class="comment-meta">@${escapeHtml(
      who
    )} · ${escapeHtml(when)}</div><div class="comment-body md"></div>`;
    const bodyDiv = li.querySelector(".comment-body");
    bodyDiv.innerHTML = mdToHtml(c.body || "");
    bindExternalLinks(bodyDiv);
    webCommentList.appendChild(li);
  }
  webThreadPanel.hidden = false;
}

async function loadWebThread() {
  const url = getFirstPrUrl();
  if (!url) {
    showError("Enter a GitHub issue or PR URL");
    return;
  }
  showError("");
  hideInfo();
  try {
    const data = await fetchWebIssue(url);
    renderWebThread(data);
  } catch (e) {
    showError(e.message || "Request failed");
    webThreadPanel.hidden = true;
  }
}

function initUiMode() {
  if (prPreviewDesktopBlock) {
    prPreviewDesktopBlock.hidden = !isDesktopShell;
  }
  if (prChangedFilesCard && !isDesktopShell) {
    prChangedFilesCard.hidden = true;
  }
  if (isDesktopShell) {
    document.documentElement.classList.add("snappi-desktop");
    if (btnShellCollapse) btnShellCollapse.hidden = false;
    btnShellCollapse?.addEventListener("click", () => {
      const collapsed = !document.documentElement.classList.contains(
        "snappi-shell-panel-collapsed"
      );
      void setShellPanelCollapsed(collapsed);
    });
    if (urlHintWeb) urlHintWeb.hidden = true;
    btnWebLoad?.remove();
    if (webThreadPanel) {
      webThreadPanel.hidden = true;
      webThreadPanel.remove();
    }
  } else {
    if (urlHintWeb) urlHintWeb.hidden = false;
    if (btnWebLoad) btnWebLoad.hidden = false;
  }
}

btnWebLoad?.addEventListener("click", () => {
  if (!isDesktopShell) loadWebThread();
});

/** Electron (file://) or preload marks desktop, not http:// local web UI */
const isDesktopShell =
  location.protocol === "file:" || window.snappi?.isDesktop === true;

const SHELL_WIDTH_EXPANDED = 400;
const SHELL_WIDTH_COLLAPSED_FALLBACK = 60;

async function setShellPanelCollapsed(collapsed) {
  let widthPx = collapsed ? SHELL_WIDTH_COLLAPSED_FALLBACK : SHELL_WIDTH_EXPANDED;
  if (window.snappi?.setShellPanelCollapsed) {
    try {
      const res = await window.snappi.setShellPanelCollapsed(collapsed);
      if (typeof res?.width === "number" && Number.isFinite(res.width)) {
        widthPx = res.width;
      }
    } catch {
      /* ignore */
    }
  }
  document.documentElement.style.setProperty(
    "--preview-shell-width",
    `${widthPx}px`
  );
  document.documentElement.classList.toggle(
    "snappi-shell-panel-collapsed",
    collapsed
  );
  updateShellCollapseUi(collapsed);
}

function updateShellCollapseUi(collapsed) {
  if (!btnShellCollapse) return;
  btnShellCollapse.setAttribute("aria-expanded", String(!collapsed));
  btnShellCollapse.setAttribute(
    "aria-label",
    collapsed ? "Expand Snappi panel" : "Collapse Snappi panel"
  );
  btnShellCollapse.title = collapsed ? "Expand panel" : "Collapse panel";
}

let infoTimer = null;

function showError(msg) {
  errorEl.hidden = !msg;
  errorEl.textContent = msg || "";
  if (msg) hideInfo();
}

function showPrPreviewError(msg) {
  if (!prPreviewError) return;
  const t = String(msg || "").trim();
  prPreviewError.hidden = !t;
  prPreviewError.textContent = t;
  if (t) hideInfo();
}

function hidePrPreviewError() {
  if (!prPreviewError) return;
  prPreviewError.hidden = true;
  prPreviewError.textContent = "";
}

/** Max chars shown in the PR error panel (avoid freezing the UI on huge stacks). */
const PR_RUN_ERROR_MAX_CHARS = 48000;

/**
 * PR run failures: map a few noisy cases to short copy; otherwise show the full message
 * (install/dev-server errors are often multi-line and must not be cut at ~220 chars).
 */
function formatPrRunError(message) {
  const raw = String(message || "").trim();
  if (!raw) {
    return "Preview failed. Check the PR link, or quit Snappi and clear the PR preview cache.";
  }
  const m = raw.replace(/^https:\/\/github\.com\/[^\s]+:\s*/i, "").trim();

  if (/pull request not found/i.test(m)) {
    return "Pull request not found. Check the repository and PR number.";
  }
  if (/closed without merge|Only open or merged PRs/i.test(m)) {
    return "Closed without merge. Preview was not started.";
  }
  if (/GitHub denied access/i.test(m)) {
    return "GitHub denied access. Set GITHUB_TOKEN or fix credentials.";
  }
  if (/Could not load this pull request from GitHub/i.test(m)) {
    return m.length < 120 ? m : "Could not load this pull request from GitHub.";
  }

  const low = m.toLowerCase();
  if (
    /couldn't find remote ref|could not find remote ref|unable to find|找不到远程引用|无法找到远程引用|pull\/\d+\/head/.test(
      low
    )
  ) {
    return "That pull request does not exist, or Git cannot fetch it. Check the URL.";
  }
  if (
    /authentication|could not read username|repository not found|access denied/.test(
      low
    )
  ) {
    return "Git or GitHub denied access. For private repos, configure Git or GITHUB_TOKEN.";
  }

  if (/package\.json not found|enoent.*package\.json/i.test(m)) {
    return "No package.json at repo root — Snappi expects a Node app there (many monorepos use a subfolder like frontend/).";
  }

  if (m.length > PR_RUN_ERROR_MAX_CHARS) {
    return `${m.slice(0, PR_RUN_ERROR_MAX_CHARS)}\n\n…(truncated for UI; original ${m.length} characters. If a log file path appears above, open that file for the rest.)`;
  }
  return m;
}

/** Each failed PR: URL + formatted message (message may be multiple lines). */
function formatPrBatchFailureLine(prUrl, message) {
  const url = String(prUrl || "").trim();
  const raw =
    message != null && String(message).trim() !== ""
      ? String(message).trim()
      : "Snappi did not return an error detail (try again; if it repeats, check Terminal where you launched Snappi for [preview:startPrBatch] logs).";
  const reason = formatPrRunError(raw);
  if (!url) return reason;
  return `${url}: ${reason}`;
}

function hideInfo() {
  if (infoTimer) {
    clearTimeout(infoTimer);
    infoTimer = null;
  }
  if (infoBanner) {
    infoBanner.hidden = true;
    infoBanner.textContent = "";
  }
}

function showInfo(msg, ms = 4500) {
  if (!infoBanner) return;
  hideInfo();
  infoBanner.hidden = !msg;
  infoBanner.textContent = msg || "";
  if (msg && ms > 0) {
    infoTimer = setTimeout(hideInfo, ms);
  }
}

function clearPrPreviewProgress() {
  if (prPreviewStatus) {
    prPreviewStatus.hidden = true;
    prPreviewStatus.textContent = "";
  }
  if (prPreviewLog) {
    prPreviewLog.hidden = true;
    prPreviewLog.textContent = "";
  }
}

function setPrPreviewStatus(msg) {
  if (!prPreviewStatus) return;
  prPreviewStatus.hidden = !msg;
  prPreviewStatus.textContent = msg || "";
}

function showPrPreviewLog(text) {
  if (!prPreviewLog || !text) return;
  prPreviewLog.hidden = false;
  prPreviewLog.textContent = text;
  prPreviewLog.scrollTop = prPreviewLog.scrollHeight;
}

function appendPrPreviewLog(text) {
  if (!prPreviewLog || !text) return;
  prPreviewLog.hidden = false;
  const prev = prPreviewLog.textContent;
  prPreviewLog.textContent = prev ? `${prev}\n${text}` : text;
  prPreviewLog.scrollTop = prPreviewLog.scrollHeight;
}

async function openSettingsView() {
  if (
    isDesktopShell &&
    document.documentElement.classList.contains("snappi-shell-panel-collapsed")
  ) {
    await setShellPanelCollapsed(false);
  }
  if (viewHome) viewHome.hidden = true;
  if (viewSettings) viewSettings.hidden = false;
}

function closeSettingsView() {
  if (viewSettings) viewSettings.hidden = true;
  if (viewHome) viewHome.hidden = false;
}

linkSettings?.addEventListener("click", () => void openSettingsView());
btnSettingsBack?.addEventListener("click", () => closeSettingsView());

btnSessionAdd?.addEventListener("click", () => {
  if (!pendingPick) {
    showError("Pick an element in inspector mode first.");
    return;
  }
  const feedback = sessionPickFeedback?.value?.trim() || "";
  const items = loadSessionItems();
  items.push({
    id: sessionItemId(),
    pick: pendingPick,
    feedback,
    at: new Date().toISOString(),
    manualChecklist: getManualChecklistState(),
    uiHintsSnapshot: { items: [...(lastUiReviewHints.items || [])] },
    pfSnapshot: clonePfForExport(lastPfInsightsForExport),
  });
  saveSessionItems(items);
  renderSessionList();
  clearPendingPick();
  showInfo("Added to session.", 2500);
  showError("");
  updateExportButtonsState();
});

btnSessionClear?.addEventListener("click", () => {
  saveSessionItems([]);
  renderSessionList();
  syncInspectorSessionCardVisibility();
  updateExportButtonsState();
  showInfo("Session cleared.", 2500);
});

btnHandoffRefresh?.addEventListener("click", () => {
  refreshHandoffDraft();
  showInfo("Comment draft regenerated.", 2000);
});

btnHandoffCopy?.addEventListener("click", async () => {
  if (!window.snappi?.writeClipboardText || !handoffDraftTa) return;
  const text = handoffDraftTa.value.trim();
  if (!text) {
    showError("Nothing to copy — pick an element and wait for MCP.");
    return;
  }
  const res = await window.snappi.writeClipboardText(text);
  if (!res?.ok) {
    showError(res?.error || "Could not copy.");
    return;
  }
  showError("");
  showInfo("Comment text copied.", 2500);
});

btnCopyGithubMarkdown?.addEventListener("click", async () => {
  if (!window.snappi?.writeClipboardText) return;
  try {
    const md = await buildSessionExportMarkdown();
    const res = await window.snappi.writeClipboardText(md);
    if (!res?.ok) {
      showError(res?.error || "Could not copy to clipboard.");
      return;
    }
    showError("");
    showInfo("Markdown copied — paste into GitHub or your ticket.", 3500);
  } catch (e) {
    showError(String(e?.message || e));
  }
});

btnOpenPrOnGithub?.addEventListener("click", () => {
  const u = String(lastPrExportMeta?.htmlUrl || "").trim();
  if (u) void window.snappi?.openExternal?.(u);
});

sessionPickFeedback?.addEventListener("input", () => {
  updateExportButtonsState();
});

btnPrPreview?.addEventListener("click", async () => {
  if (!window.snappi?.startPrPreviewBatch) return;
  const lines = getPrUrlValues();
  if (lines.length === 0) {
    showPrPreviewError("Paste at least one GitHub PR URL.");
    showError("");
    return;
  }
  showError("");
  hidePrPreviewError();
  hideInfo();
  resetInspectorUiForNewRun();
  clearPrPreviewProgress();
  btnPrPreview.disabled = true;
  const off = window.snappi.onPreviewProgress?.((p) => {
    const multi =
      typeof p.batchTotal === "number" && p.batchTotal > 1 && p.batchIndex;
    const prefix = multi ? `[${p.batchIndex}/${p.batchTotal}] ` : "";
    if (p.kind === "status") setPrPreviewStatus(prefix + p.message);
    if (p.kind === "log" && p.text) {
      if (multi) appendPrPreviewLog(prefix + p.text);
      else showPrPreviewLog(prefix + p.text);
    }
  });
  try {
    const result = await window.snappi.startPrPreviewBatch({ prUrls: lines });
    if (result.okCount > 0) {
      const lastOk = [...(result.results || [])].reverse().find((r) => r.ok);
      if (lastOk?.url) {
        try {
          sessionStorage.setItem(LAST_PREVIEW_URL_KEY, lastOk.url);
        } catch {
          /* ignore */
        }
      }
    }
    if (!result.ok) {
      const fails = (result.results || []).filter((r) => !r.ok);
      const parts = fails
        .slice(0, PR_URL_MAX)
        .map((r) => formatPrBatchFailureLine(r.prUrl, r.error));
      let prMsg = parts.join("\n");
      if (fails.length > PR_URL_MAX) {
        prMsg += `\n(${fails.length - PR_URL_MAX} more failed.)`;
      }
      showPrPreviewError(
        prMsg || formatPrRunError(result.error || "Batch failed")
      );
      showError("");
    } else {
      hidePrPreviewError();
      showError("");
    }
    clearPrPreviewProgress();
    if (result.ok) {
      clearPrUrlsEditor();
      const n = result.okCount ?? 0;
      showInfo(
        n === 1
          ? `Preview ready (${result.results?.[0]?.url ?? ""})`
          : `${n} previews ready. Switch tabs above the preview.`,
        14000
      );
    } else if (result.okCount > 0) {
      showInfo(
        `${result.okCount} preview(s) ready, ${result.failCount} failed. Fix URLs and run again.`,
        16000
      );
    }
  } finally {
    off?.();
    btnPrPreview.disabled = false;
  }
});

btnInspectorToggle?.addEventListener("click", async () => {
  if (!window.snappi?.setPreviewInspectorMode) return;
  inspectorModeOn = !inspectorModeOn;
  const res = await window.snappi.setPreviewInspectorMode(inspectorModeOn);
  if (!res?.ok) {
    inspectorModeOn = false;
    showError(res?.error || "Open a preview first (Run PR dev server).");
    return;
  }
  showError("");
  btnInspectorToggle.classList.toggle("inspector-toggle--on", inspectorModeOn);
  btnInspectorToggle.setAttribute("aria-pressed", inspectorModeOn ? "true" : "false");
  btnInspectorToggle.textContent = inspectorModeOn ? "Exit inspector" : "Inspector mode";
  syncInspectorSessionCardVisibility();
});

function startDesktopConfigProbe() {
  if (!window.snappi?.getConfig) return;
  void window.snappi.getConfig().then((cfg) => {
    if (cfg?.defaultIssueUrl) setFirstPrUrlIfEmpty(cfg.defaultIssueUrl);
  });
}

async function boot() {
  initPrUrlsEditor();
  initUiMode();

  if (!isDesktopShell) {
    if (uiReviewCard) uiReviewCard.hidden = true;
    if (inspectorExportWrap) inspectorExportWrap.hidden = true;
  }

  if (isDesktopShell) {
    initUiReviewManualList();
    initUiReviewViewportHandlers();
    startDesktopConfigProbe();
    renderSessionList();
    syncInspectorSessionCardVisibility();
    updateExportButtonsState();
    window.snappi?.onPreviewAttached?.(onPreviewPaneAttached);
    window.snappi?.onPreviewTabsUpdated?.(applyPreviewTabsPayload);
    try {
      const initial = await window.snappi?.listPreviewTabs?.();
      if (initial?.tabs?.length) {
        applyPreviewTabsPayload(initial);
      }
    } catch {
      /* ignore */
    }
    window.snappi?.onInspectorPick?.((payload) => {
      lastPfInsightsForExport = null;
      lastSyncPfDescribe = null;
      lastUiReviewHints = { items: [], viewport: null };
      lastPfAuditPayload = { loading: true };
      pendingPick = payload;
      resetManualChecklistUi();
      if (pfInsightsPanel) pfInsightsPanel.hidden = false;
      if (pfInsightsStatus) {
        pfInsightsStatus.hidden = false;
        pfInsightsStatus.className =
          "pf-insights__status pf-insights__status--info";
        pfInsightsStatus.textContent = "Running PatternFly MCP…";
      }
      renderPendingPickUi(payload);
      syncPendingPickUi();
      syncInspectorSessionCardVisibility();
      updateExportButtonsState();
      void hydratePfDescribeForPick();
      refreshIssuesPanel();
      refreshPassesPanel();
      sessionPickFeedback?.focus();
    });
    window.snappi?.onUiReviewHints?.((payload) => {
      lastUiReviewHints = {
        items: Array.isArray(payload?.items) ? payload.items : [],
        viewport: payload?.viewport || null,
      };
      refreshIssuesPanel();
      refreshHandoffDraft();
    });
    window.snappi?.onPatternFlyInsights?.((payload) => {
      renderPatternFlyInsights(payload);
      updateExportButtonsState();
    });

    syncPrHighlightSwitchAria();
    prChangedHighlightSwitch?.addEventListener("change", () => {
      syncPrHighlightSwitchAria();
      if (!lastPrCanHighlight) return;
      if (prChangedHighlightSwitch.checked) {
        schedulePrTourHighlightsFromSwitch();
      } else {
        if (prTourHighlightDebounceTimer) {
          clearTimeout(prTourHighlightDebounceTimer);
          prTourHighlightDebounceTimer = null;
        }
        void window.snappi?.clearPrHighlights?.();
      }
    });
  }

  const params = new URLSearchParams(window.location.search);
  const qUrl = params.get("url");
  if (qUrl) {
    seedFirstPrUrl(qUrl);
    if (!isDesktopShell) {
      await loadWebThread();
    }
    return;
  }

  try {
    if (!isDesktopShell) {
      const cfg = await fetch("/api/config").then((r) => r.json());
      if (cfg?.defaultIssueUrl) {
        seedFirstPrUrl(cfg.defaultIssueUrl);
        await loadWebThread();
      }
    }
  } catch {
    /* ignore */
  }
}

boot();
