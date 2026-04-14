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
const btnAiAssistantToggle = document.getElementById("btnAiAssistantToggle");
const inspectorPickPanel = document.getElementById("inspectorPickPanel");
const inspectorPickThumb = document.getElementById("inspectorPickThumb");
const inspectorPickPlaceholder = document.getElementById("inspectorPickPlaceholder");
const inspectorGitFile = document.getElementById("inspectorGitFile");
const btnInspectorGitLoad = document.getElementById("btnInspectorGitLoad");
const inspectorAuditContext = document.getElementById("inspectorAuditContext");
const inspectorSemanticHint = document.getElementById("inspectorSemanticHint");
const btnInspectorToggleAllProps = document.getElementById(
  "btnInspectorToggleAllProps"
);
const inspectorSemanticCards = document.getElementById("inspectorSemanticCards");
const inspectorPickWorkflow = document.getElementById("inspectorPickWorkflow");
const inspectorWorkflowDeviation = document.getElementById(
  "inspectorWorkflowDeviation"
);
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
const inspectorSessionCount = document.getElementById("inspectorSessionCount");
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
/** Persists whether the AI assistant BrowserView is shown ("1" / absent). */
const AI_DOCK_VISIBLE_KEY = "snappiAiDockVisible";

/** @type {{ title?: string; htmlUrl?: string; previewUrl?: string; previewSimulatedWidth?: number | null; changedFiles?: { filename: string; status?: string }[]; changedFilesTotal?: number; changedFilesTruncated?: boolean; filesDiffUrl?: string } | null} */
let lastPrExportMeta = null;

const btnPostFeedbackToPr = document.getElementById("btnPostFeedbackToPr");
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
/** Last PatternFly insight payload for system verdict (silent scan). */
let lastPfInsightPayload = null;
/** When false, semantic list shows up to SEMANTIC_ISSUE_CAP worst issues (merged color+fill). */
let inspectorSemanticShowAll = false;

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

function mapAlertsBySemantic(alerts) {
  /** @type {Record<string, object>} */
  const m = Object.create(null);
  if (!Array.isArray(alerts)) return m;
  for (const a of alerts) {
    const id = a?.semanticId;
    if (id && m[id] == null) m[id] = a;
  }
  return m;
}

/** Prefer hex for literals; keep short if already token-like. */
function humanizeColorForDisplay(s) {
  const raw = String(s || "").trim();
  if (!raw || raw === "—") return "—";
  const m = raw.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (m) {
    const r = Math.min(255, Math.max(0, Number(m[1])));
    const g = Math.min(255, Math.max(0, Number(m[2])));
    const b = Math.min(255, Math.max(0, Number(m[3])));
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }
  return raw.length > 48 ? `${raw.slice(0, 45)}…` : raw;
}

function relativeTimeFromYmd(ymd) {
  const s = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "";
  const t = new Date(`${s}T12:00:00`).getTime();
  if (Number.isNaN(t)) return s;
  const day = 86400000;
  const diff = Math.round((Date.now() - t) / day);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 14) return `${diff} days ago`;
  if (diff < 45) return `${Math.round(diff / 7)} weeks ago`;
  return s;
}

function extractIssueRef(subject) {
  const m = String(subject || "").match(/(?:#|issue\s*)(\d+)/i);
  return m ? m[1] : "";
}

/** Default issue list length (after merging color + fill). */
const SEMANTIC_ISSUE_CAP = 3;

function semanticIssueSeverity(card) {
  if (!card?.warn || !card?.alert) return 0;
  switch (card.id) {
    case "implementation":
      return 100;
    case "spacing":
      return 85;
    case "colorFill":
      return 82;
    case "color":
      return 72;
    case "fill":
      return 68;
    case "radius":
      return 60;
    case "tokens":
      return 45;
    default:
      return 40;
  }
}

/**
 * When both text and fill colors are flagged, show one combined row.
 * @param {Array} cards from buildSemanticCardModelsRaw
 */
function mergeColorFillCards(cards) {
  const color = cards.find((c) => c.id === "color");
  const fill = cards.find((c) => c.id === "fill");
  const rest = cards.filter((c) => c.id !== "color" && c.id !== "fill");
  if (color?.warn && fill?.warn && color.alert && fill.alert) {
    rest.push({
      id: "colorFill",
      label: "Color & fill",
      valueDisplay: `${color.valueDisplay} / ${fill.valueDisplay}`,
      currentSemantic: `Text: ${color.currentSemantic} · Fill: ${fill.currentSemantic}`,
      standardSemantic: "Semantic tokens for text and surface",
      warn: true,
      alert: color.alert,
      secondaryAlert: fill.alert,
    });
    return rest;
  }
  if (color) rest.push(color);
  if (fill) rest.push(fill);
  return rest;
}

function buildSemanticCardModelsRaw(pick) {
  const computed =
    pick?.computed && typeof pick.computed === "object" ? pick.computed : {};
  const alerts = Array.isArray(pick?.designAlerts) ? pick.designAlerts : [];
  const by = mapAlertsBySemantic(alerts);

  const pad = String(computed.padding || "").trim();
  const margin = String(computed.margin || "").trim();
  const spacingDisplay =
    pad && pad !== "0px" && pad !== "0px 0px 0px 0px"
      ? pad
      : margin || "—";

  const colorDisp = String(computed.color || "—").trim() || "—";
  const fillDisp = String(computed["background-color"] || "—").trim() || "—";
  const radDisp = String(computed["border-radius"] || "—").trim() || "—";

  const cards = [
    {
      id: "spacing",
      label: "Spacing",
      valueDisplay: spacingDisplay,
      currentSemantic: spacingDisplay,
      standardSemantic: by.spacing?.expectedValue || "—",
      warn: Boolean(by.spacing),
      alert: by.spacing || null,
    },
    {
      id: "color",
      label: "Color",
      valueDisplay: colorDisp,
      currentSemantic: humanizeColorForDisplay(computed.color),
      standardSemantic: by.color?.expectedValue || "Semantic color token",
      warn: Boolean(by.color),
      alert: by.color || null,
    },
    {
      id: "fill",
      label: "Fill color",
      valueDisplay: fillDisp,
      currentSemantic: humanizeColorForDisplay(computed["background-color"]),
      standardSemantic: by.fill?.expectedValue || "Semantic fill token",
      warn: Boolean(by.fill),
      alert: by.fill || null,
    },
    {
      id: "radius",
      label: "Corner radius",
      valueDisplay: radDisp,
      currentSemantic: radDisp,
      standardSemantic: by.radius?.expectedValue || "—",
      warn: Boolean(by.radius),
      alert: by.radius || null,
    },
  ];

  const inlineN = Number(pick?.inlineStyleDeclarationCount || 0);
  if (by.implementation || inlineN > 0) {
    cards.push({
      id: "implementation",
      label: "Implementation",
      valueDisplay:
        inlineN > 0
          ? `${inlineN} inline declaration(s)`
          : "Styles from stylesheet",
      currentSemantic:
        inlineN > 0
          ? `${inlineN} inline declaration(s)`
          : "Stylesheet rules",
      standardSemantic:
        by.implementation?.expectedValue || "Tokenized / class-based styles",
      warn: Boolean(by.implementation),
      alert: by.implementation || null,
    });
  }

  if (by.tokens) {
    const pf = Array.isArray(pick?.patternFlyClassTokens)
      ? pick.patternFlyClassTokens
      : [];
    const n = pf.length;
    cards.push({
      id: "tokens",
      label: "PatternFly & CSS vars",
      valueDisplay: n
        ? `${n} pf-* class token(s) on node`
        : "PF-related; few --pf vars in computed",
      currentSemantic: n
        ? `${n} PatternFly class token(s)`
        : "PatternFly classes present",
      standardSemantic: by.tokens?.expectedValue || "PF CSS variables visible in cascade",
      warn: true,
      alert: by.tokens,
    });
  }

  return cards;
}

function buildSemanticCardModels(pick) {
  return mergeColorFillCards(buildSemanticCardModelsRaw(pick));
}

function buildInspectorAtomicHtml(c, atomicId) {
  const a = c.alert;
  const b = c.secondaryAlert;
  if (!a) return "";
  const line = (alert) =>
    `<p class="inspector-atomic-alert__line"><span class="inspector-atomic-alert__k">Current</span> ${escapeHtml(
      String(alert.currentValue ?? "")
    )} <span class="inspector-atomic-alert__sep">|</span> <span class="inspector-atomic-alert__k">Expected</span> ${escapeHtml(
      String(alert.expectedValue ?? "")
    )}</p>`;
  const scope = (label) =>
    label
      ? `<p class="inspector-atomic-alert__scope">${escapeHtml(label)}</p>`
      : "";
  let body = "";
  if (c.id === "colorFill" && b) {
    body += scope("Text color");
    body += line(a);
    body += scope("Fill / surface");
    body += line(b);
  } else {
    body += line(a);
  }
  return `<div class="inspector-atomic-alert" id="${atomicId}" hidden role="region" aria-labelledby="${atomicId}-title">
        <div class="inspector-atomic-alert__title" id="${atomicId}-title">Deviation detail</div>
        ${body}
      </div>`;
}

function renderInspectorSemanticCards(payload) {
  if (!inspectorSemanticCards) return;
  const pick = payload || {};
  const cards = buildSemanticCardModels(pick);
  const showAll = inspectorSemanticShowAll;
  const issueRows = cards
    .filter((c) => c.warn && c.alert)
    .sort((a, b) => semanticIssueSeverity(b) - semanticIssueSeverity(a));
  const hasIssues = issueRows.length > 0;

  if (inspectorSemanticHint) {
    inspectorSemanticHint.textContent = showAll
      ? "Full list: every sampled property, sorted with issues first."
      : hasIssues
        ? `Up to ${SEMANTIC_ISSUE_CAP} highest-severity issues. “Show all properties” lists everything.`
        : "No heuristic deviations on this pick — toggle below to inspect raw values.";
  }

  let filtered;
  if (showAll) {
    const passes = cards.filter((c) => !c.warn || !c.alert);
    filtered = [...issueRows, ...passes];
  } else {
    filtered = issueRows.slice(0, SEMANTIC_ISSUE_CAP);
  }
  const parts = [];

  if (!filtered.length && !showAll) {
    parts.push(
      `<p class="inspector-semantic-empty">No flagged deviations — values likely align with tokens (heuristic).</p>`
    );
  }

  for (const c of filtered) {
    const warn = Boolean(c.warn && c.alert);
    const cur = escapeHtml(String(c.currentSemantic ?? ""));
    const std = escapeHtml(
      String(
        c.id === "colorFill" && c.secondaryAlert
          ? `Text: ${c.alert?.expectedValue ?? "—"} · Fill: ${c.secondaryAlert.expectedValue ?? "—"}`
          : c.alert?.expectedValue ?? c.standardSemantic ?? "—"
      )
    );
    const atomicId = `atomic-${c.id}`;
    const atomic = warn && c.alert ? buildInspectorAtomicHtml(c, atomicId) : "";

    if (warn) {
      parts.push(`<div class="inspector-semantic-issue" role="listitem" data-semantic="${escapeHtml(
        c.id
      )}">
        <button type="button" class="inspector-semantic-hit" aria-expanded="false" aria-controls="${atomicId}">
          <span class="inspector-semantic-issue__label">${escapeHtml(
            c.label
          )}</span>
          <span class="inspector-semantic-issue__cmp">
            <span class="inspector-semantic-issue__cur"><em>Current</em> ${cur}</span>
            <span class="inspector-semantic-issue__arr" aria-hidden="true">→</span>
            <span class="inspector-semantic-issue__std"><em>Standard</em> ${std}</span>
            <span class="inspector-semantic-issue__flag" aria-hidden="true">⚠️</span>
          </span>
        </button>
        ${atomic}
      </div>`);
    } else {
      parts.push(`<div class="inspector-semantic-pass" role="listitem" data-semantic="${escapeHtml(
        c.id
      )}">
        <span class="inspector-semantic-pass__label">${escapeHtml(
          c.label
        )}</span>
        <span class="inspector-semantic-pass__line"><em>Aligned</em> — ${escapeHtml(
          String(c.currentSemantic ?? c.valueDisplay)
        )}</span>
      </div>`);
    }
  }
  inspectorSemanticCards.innerHTML = parts.join("");
}

function initSemanticInspectorDelegation() {
  if (!inspectorSemanticCards || inspectorSemanticCards.dataset.delegationBound)
    return;
  inspectorSemanticCards.dataset.delegationBound = "1";
  inspectorSemanticCards.addEventListener("click", (e) => {
    const btn = e.target.closest(".inspector-semantic-hit");
    if (!btn) return;
    const card = btn.closest(".inspector-semantic-issue");
    const panel = card?.querySelector(".inspector-atomic-alert");
    if (!panel) return;
    const wasHidden = panel.hidden;
    for (const el of inspectorSemanticCards.querySelectorAll(
      ".inspector-atomic-alert"
    )) {
      el.hidden = true;
    }
    for (const b of inspectorSemanticCards.querySelectorAll(
      ".inspector-semantic-hit"
    )) {
      b.setAttribute("aria-expanded", "false");
    }
    if (wasHidden) {
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
    }
  });
}

function renderSystemVerdictStrip(pick, pfPayload) {
  const strip = document.getElementById("inspectorVerdictStrip");
  const stateEl = document.getElementById("inspectorVerdictState");
  if (!strip || !stateEl) return;
  strip.hidden = false;
  const alerts = pick?.designAlerts;
  const hasDesign = Array.isArray(alerts) && alerts.length > 0;
  const pfLoading =
    pfPayload == null ||
    (typeof pfPayload === "object" && pfPayload.loading === true);
  const pfErr =
    pfPayload &&
    typeof pfPayload === "object" &&
    !pfPayload.loading &&
    pfPayload.error;
  const pfAn =
    pfPayload &&
    typeof pfPayload === "object" &&
    !pfPayload.loading &&
    !pfErr
      ? pfPayload.anomalies || []
      : [];
  const pfWarn = pfAn.some((x) =>
    /warn/i.test(String(x?.level || ""))
  );

  if (hasDesign || pfWarn) {
    strip.className = "inspector-verdict inspector-verdict--deviation";
    stateEl.textContent = "Deviation";
    return;
  }

  if (pfLoading) {
    strip.className = "inspector-verdict inspector-verdict--loading";
    stateEl.textContent = "Scanning…";
    return;
  }

  strip.className = "inspector-verdict inspector-verdict--aligned";
  stateEl.textContent = "Aligned";
}

function generateCartSummaryLine(pick) {
  const p = pick || {};
  const tag = String(p.tag || "element");
  const sample = String(p.textSample || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 28);
  const alerts = Array.isArray(p.designAlerts) ? p.designAlerts : [];
  const label = sample ? `"${sample}"` : `<${tag}>`;
  if (alerts.length === 0) {
    return `Added to queue: ${label} (no literal-value warnings)`;
  }
  const a = alerts[0];
  const map = {
    SPACING_LITERAL: "hardcoded spacing",
    COLOR_LITERAL: "hardcoded text color",
    BG_LITERAL: "hardcoded background color",
    INLINE_STYLE: "inline styles",
    PF_CLASS_NO_PF_VAR: "PatternFly classes vs CSS variables",
  };
  const bit =
    map[String(a.code)] ||
    String(a.title || "").slice(0, 40) ||
    "design-token mismatch";
  return `Added: address ${bit} for ${label}`;
}

function renderWorkflowDeviationStrip(payload) {
  if (!inspectorWorkflowDeviation) return;
  const alerts = payload?.designAlerts;
  if (!Array.isArray(alerts) || alerts.length === 0) {
    inspectorWorkflowDeviation.hidden = true;
    inspectorWorkflowDeviation.innerHTML = "";
    return;
  }
  const priority = [
    "spacing",
    "color",
    "fill",
    "implementation",
    "tokens",
  ];
  let a = null;
  for (const id of priority) {
    a = alerts.find((x) => x.semanticId === id);
    if (a && (a.currentValue != null || a.expectedValue != null)) break;
  }
  if (!a) a = alerts[0];
  const cur = a?.currentValue != null ? String(a.currentValue) : "";
  const exp = a?.expectedValue != null ? String(a.expectedValue) : "";
  if (!cur && !exp) {
    inspectorWorkflowDeviation.hidden = true;
    inspectorWorkflowDeviation.innerHTML = "";
    return;
  }
  inspectorWorkflowDeviation.hidden = false;
  inspectorWorkflowDeviation.innerHTML = `<div class="inspector-workflow__body"><span class="inspector-workflow__kv"><strong>Current:</strong> ${escapeHtml(
    cur
  )}</span><span class="inspector-workflow__sep"> · </span><span class="inspector-workflow__kv"><strong>Expected:</strong> ${escapeHtml(
    exp
  )}</span></div>`;
}

function formatAuditEntriesHtml(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '<p class="inspector-audit-empty">No commits for this path in this clone.</p>';
  }
  const head = entries[0];
  const rel = relativeTimeFromYmd(head.date);
  const issue = extractIssueRef(head.subject);
  const subj = escapeHtml(head.subject || "");
  const issueBit = issue
    ? ` <span class="inspector-audit-issue">· Issue #${escapeHtml(issue)}</span>`
    : "";
  const more = entries
    .slice(1, 6)
    .map(
      (e) =>
        `<li><span class="inspector-audit-meta">${escapeHtml(
          e.date || ""
        )}</span> · ${escapeHtml(e.subject || "")}</li>`
    )
    .join("");
  return `<div class="inspector-audit-highlight">
    <p class="inspector-audit-line"><strong>Last touch:</strong> ${escapeHtml(
      head.author || "—"
    )} <span class="inspector-audit-when">(${escapeHtml(rel)})</span></p>
    <p class="inspector-audit-line"><strong>Purpose:</strong> <span class="inspector-audit-subj">${subj}</span>${issueBit}</p>
  </div>
  ${
    more
      ? `<p class="inspector-audit-earlier"><strong>Earlier:</strong></p><ul class="inspector-audit-list">${more}</ul>`
      : ""
  }`;
}

function populateInspectorGitFileSelect() {
  if (!inspectorGitFile) return;
  const files = Array.isArray(lastPrExportMeta?.changedFiles)
    ? lastPrExportMeta.changedFiles
    : [];
  const prev = inspectorGitFile.value;
  inspectorGitFile.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = files.length
    ? "Select a PR file…"
    : "No changed files (load a PR preview)";
  inspectorGitFile.appendChild(opt0);
  const sorted = [...files].sort((a, b) => {
    const fa = a?.filename || "";
    const fb = b?.filename || "";
    const ua = isLikelyUiPath(fa) ? 0 : 1;
    const ub = isLikelyUiPath(fb) ? 0 : 1;
    if (ua !== ub) return ua - ub;
    return String(fa).localeCompare(String(fb));
  });
  for (const f of sorted) {
    const fn = f?.filename;
    if (!fn) continue;
    const o = document.createElement("option");
    o.value = fn;
    const st = (f.status && String(f.status)) || "";
    o.textContent = st ? `${st} · ${fn}` : fn;
    inspectorGitFile.appendChild(o);
  }
  if (prev && [...inspectorGitFile.options].some((op) => op.value === prev)) {
    inspectorGitFile.value = prev;
  }
}

function clearInspectorInsightPanels() {
  if (inspectorSemanticCards) inspectorSemanticCards.innerHTML = "";
  if (inspectorAuditContext) inspectorAuditContext.innerHTML = "";
  const strip = document.getElementById("inspectorVerdictStrip");
  if (strip) strip.hidden = true;
  if (inspectorWorkflowDeviation) {
    inspectorWorkflowDeviation.hidden = true;
    inspectorWorkflowDeviation.innerHTML = "";
  }
}

function renderPendingPickUi(payload) {
  if (!inspectorPickPanel) return;
  lastPfInsightPayload = null;
  inspectorSemanticShowAll = false;
  if (btnInspectorToggleAllProps) {
    btnInspectorToggleAllProps.setAttribute("aria-pressed", "false");
    btnInspectorToggleAllProps.textContent = "Show all properties";
  }
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
  renderSystemVerdictStrip(payload || {}, null);
  renderInspectorSemanticCards(payload || {});
  initSemanticInspectorDelegation();
  renderWorkflowDeviationStrip(payload || {});
  populateInspectorGitFileSelect();
}

function clearPendingPickUi() {
  if (inspectorPickPanel) inspectorPickPanel.hidden = true;
  if (inspectorPickThumb) {
    inspectorPickThumb.removeAttribute("src");
    inspectorPickThumb.hidden = true;
  }
  if (inspectorPickPlaceholder) inspectorPickPlaceholder.hidden = false;
  clearInspectorInsightPanels();
}

function syncPendingPickUi() {
  const hasPick = pendingPick != null;
  if (inspectorSessionAddWrap) inspectorSessionAddWrap.hidden = true;
  if (inspectorPickWorkflow) inspectorPickWorkflow.hidden = !hasPick;
  if (hasPick && sessionPickFeedback && !sessionPickFeedback.value.trim()) {
    /* keep placeholder focus optional */
  }
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

function pickForAnalyze(pick) {
  if (!pick || typeof pick !== "object") return {};
  const { previewDataUrl: _omit, ...rest } = pick;
  return rest;
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
      if (it.cartSummary) {
        lines.push(`**Auto summary:** ${it.cartSummary}`);
        lines.push("");
      }
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
      lines.push("---");
      lines.push("");
    }
  }

  const draftFeedback = sessionPickFeedback?.value?.trim() || "";
  if (pendingPick && draftFeedback) {
    let draftHints = [];
    try {
      const r = await window.snappi?.analyzePickForReview?.(
        pickForAnalyze(pendingPick)
      );
      draftHints = Array.isArray(r?.items) ? r.items : [];
    } catch {
      draftHints = [];
    }
    lines.push("### Draft (not yet added to session)");
    lines.push("");
    lines.push(pickSummaryLines(pendingPick));
    lines.push("");
    lines.push("**Feedback (draft):**");
    lines.push(draftFeedback);
    lines.push("");
    lines.push("**Automated UI hints (current pick):**");
    lines.push("");
    lines.push(formatUiHintsForMarkdown(draftHints));
    lines.push("");
  }

  lines.push("—");
  lines.push("*Sent from Snappi.*");
  return lines.join("\n");
}

function updateExportButtonsState() {
  const hasPr = Boolean(lastPrExportMeta?.htmlUrl);
  if (btnPostFeedbackToPr) {
    btnPostFeedbackToPr.disabled = !hasPr;
  }
}

function clearPendingPick() {
  pendingPick = null;
  clearPendingPickUi();
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
    li.className = "inspector-session-item inspector-cart-item";
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

    const summaryLine = document.createElement("p");
    summaryLine.className = "inspector-cart-item__summary";
    summaryLine.textContent =
      it.cartSummary || generateCartSummaryLine(p);

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

    body.appendChild(summaryLine);
    body.appendChild(ta);
    body.appendChild(rm);

    li.appendChild(thumbWrap);
    li.appendChild(body);
    inspectorSessionList.appendChild(li);
  }
  if (inspectorSessionCount) {
    inspectorSessionCount.textContent = String(items.length);
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

function updateAiDockToggleUi(visible) {
  if (!btnAiAssistantToggle) return;
  const on = Boolean(visible);
  btnAiAssistantToggle.setAttribute("aria-pressed", on ? "true" : "false");
  btnAiAssistantToggle.classList.toggle("ai-toggle--on", on);
  btnAiAssistantToggle.textContent = on ? "Hide AI assistant" : "AI assistant";
}

async function applyStoredAiDockVisibility() {
  if (!isDesktopShell || !window.snappi?.setAiDockVisible) return;
  const stored = localStorage.getItem(AI_DOCK_VISIBLE_KEY);
  const visible = stored === "1";
  try {
    await window.snappi.setAiDockVisible(visible);
  } catch {
    /* ignore */
  }
  updateAiDockToggleUi(visible);
}

/**
 * Preview & inspector only apply to an active PR preview (BrowserView + dev server).
 * Without a running preview tab, keep the card hidden — e.g. stale session in
 * localStorage must not open this panel on cold start.
 */
function hasActivePrPreview() {
  return document.documentElement.classList.contains("snappi-has-preview");
}

/** Show inspector shell only when a preview is running and the user is engaged. */
function inspectorShellShouldBeVisible() {
  if (!isDesktopShell) return false;
  if (!hasActivePrPreview()) return false;
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
    changedFiles: Array.isArray(meta.changedFiles) ? meta.changedFiles : [],
    changedFilesTotal:
      typeof meta.changedFilesTotal === "number"
        ? meta.changedFilesTotal
        : (meta.changedFiles || []).length,
    changedFilesTruncated: Boolean(meta.changedFilesTruncated),
    filesDiffUrl: String(meta.filesDiffUrl || "").trim(),
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
  populateInspectorGitFileSelect();
  updateExportButtonsState();
  if (isDesktopShell && previewPrMetaBar && !previewPrMetaBar.hidden) {
    void applyStoredAiDockVisibility();
  }
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
  void applyStoredAiDockVisibility();
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
    void (async () => {
      if (isDesktopShell && window.snappi?.setAiDockVisible) {
        try {
          await window.snappi.setAiDockVisible(false);
        } catch {
          /* ignore */
        }
      }
      updateAiDockToggleUi(false);
    })();
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
    /couldn't find remote ref|could not find remote ref|unable to find|pull\/\d+\/head/.test(
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

btnSessionAdd?.addEventListener("click", async () => {
  if (!pendingPick) {
    showError("Pick an element in inspector mode first.");
    return;
  }
  const feedback = sessionPickFeedback?.value?.trim() || "";
  let hintItems = [];
  try {
    const r = await window.snappi?.analyzePickForReview?.(
      pickForAnalyze(pendingPick)
    );
    hintItems = Array.isArray(r?.items) ? r.items : [];
  } catch {
    hintItems = [];
  }
  const items = loadSessionItems();
  items.push({
    id: sessionItemId(),
    pick: pendingPick,
    feedback,
    at: new Date().toISOString(),
    uiHintsSnapshot: { items: hintItems },
    cartSummary: generateCartSummaryLine(pendingPick),
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

btnPostFeedbackToPr?.addEventListener("click", async () => {
  if (!window.snappi?.postPrComment) return;
  const prUrl = String(lastPrExportMeta?.htmlUrl || "").trim();
  if (!prUrl) {
    showError("No GitHub PR is loaded.");
    return;
  }
  btnPostFeedbackToPr.disabled = true;
  try {
    const md = await buildSessionExportMarkdown();
    const res = await window.snappi.postPrComment({
      prHtmlUrl: prUrl,
      body: md,
    });
    if (!res?.ok) {
      showError(res?.error || "Could not post comment.");
      return;
    }
    showError("");
    showInfo("Feedback posted to the PR on GitHub.", 4000);
  } catch (e) {
    showError(String(e?.message || e));
  } finally {
    updateExportButtonsState();
  }
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

btnAiAssistantToggle?.addEventListener("click", async () => {
  if (!window.snappi?.getAiDockVisible || !window.snappi?.setAiDockVisible) return;
  let cur = false;
  try {
    const r = await window.snappi.getAiDockVisible();
    cur = Boolean(r?.visible);
  } catch {
    cur = false;
  }
  const next = !cur;
  try {
    await window.snappi.setAiDockVisible(next);
  } catch {
    showError("Could not toggle AI assistant.");
    return;
  }
  localStorage.setItem(AI_DOCK_VISIBLE_KEY, next ? "1" : "0");
  updateAiDockToggleUi(next);
  showError("");
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
    if (inspectorExportWrap) inspectorExportWrap.hidden = true;
  }

  if (isDesktopShell) {
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
      pendingPick = payload;
      renderPendingPickUi(payload);
      syncPendingPickUi();
      syncInspectorSessionCardVisibility();
      updateExportButtonsState();
      sessionPickFeedback?.focus();
    });

    window.snappi?.onPatternFlyInsights?.((payload) => {
      lastPfInsightPayload = payload || {};
      if (pendingPick) {
        renderSystemVerdictStrip(pendingPick, lastPfInsightPayload);
      }
    });

    btnInspectorToggleAllProps?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      inspectorSemanticShowAll = !inspectorSemanticShowAll;
      btnInspectorToggleAllProps.setAttribute(
        "aria-pressed",
        inspectorSemanticShowAll ? "true" : "false"
      );
      btnInspectorToggleAllProps.textContent = inspectorSemanticShowAll
        ? "Issues only"
        : "Show all properties";
      if (pendingPick) renderInspectorSemanticCards(pendingPick);
    });

    btnInspectorGitLoad?.addEventListener("click", async () => {
      const fn = inspectorGitFile?.value?.trim();
      if (!fn || !window.snappi?.gitFileHistory) return;
      if (inspectorAuditContext) {
        inspectorAuditContext.innerHTML =
          '<p class="inspector-audit-empty">Loading…</p>';
      }
      try {
        const r = await window.snappi.gitFileHistory({
          filename: fn,
          limit: 20,
        });
        if (!r?.ok) {
          if (inspectorAuditContext) {
            inspectorAuditContext.innerHTML = `<p class="inspector-audit-empty">${escapeHtml(
              r?.error || "Request failed."
            )}</p>`;
          }
          return;
        }
        const entries = Array.isArray(r.entries) ? r.entries : [];
        if (inspectorAuditContext) {
          inspectorAuditContext.innerHTML = formatAuditEntriesHtml(entries);
        }
      } catch (e) {
        if (inspectorAuditContext) {
          inspectorAuditContext.innerHTML = `<p class="inspector-audit-empty">${escapeHtml(
            String(e?.message || e)
          )}</p>`;
        }
      }
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
