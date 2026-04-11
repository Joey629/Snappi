/**
 * Infer UX-review highlights from PR patches: navigation labels and whether to
 * outline the main content block—aligned with how reviewers scan the UI, not
 * raw diff strings (CSS, SVG paths, marketing copy).
 */

import path from "node:path";

function isPageFile(fn) {
  const n = String(fn).replace(/\\/g, "/");
  const b = path.basename(n);
  return (
    /\/(pages|views|screens)\//i.test(n) ||
    /(^|\/)components?\/.*[Pp]age\.(tsx|ts|jsx|js|vue)$/i.test(n) ||
    /\/[Pp]age\.(tsx|ts|jsx|js|vue)$/i.test(n) ||
    /[Pp]age\.(tsx|ts|jsx|js|vue)$/i.test(b)
  );
}

/** Higher score = process first (nav/sidebar before generic App). */
function navRelevanceScore(fn) {
  if (!fn) return 0;
  const n = String(fn).replace(/\\/g, "/");
  const b = path.basename(n);
  if (/\b(Nav|Sidebar|SideNav|Sidenav)\b/i.test(n)) return 4;
  if (/\bLayout\b/i.test(n) && /\.(tsx|jsx|vue)$/i.test(b)) return 3;
  if (/^App\.(tsx|jsx|vue)$/i.test(b)) return 2;
  if (/routes?\.(tsx|jsx|js|vue)$/i.test(b)) return 2;
  if (/(^|\/)router\.(tsx|jsx|js|vue)$/i.test(n)) return 2;
  if (/(header|shell|menu)/i.test(n) && /\.(tsx|jsx|vue)$/i.test(b)) return 1;
  return 0;
}

function plusLinesBlob(patch) {
  if (!patch || typeof patch !== "string") return "";
  const out = [];
  for (const ln of patch.split("\n")) {
    if (ln.startsWith("+") && !ln.startsWith("+++")) out.push(ln.slice(1));
  }
  return out.join("\n");
}

function minusLinesBlob(patch) {
  if (!patch || typeof patch !== "string") return "";
  const out = [];
  for (const ln of patch.split("\n")) {
    if (ln.startsWith("-") && !ln.startsWith("---")) out.push(ln.slice(1));
  }
  return out.join("\n");
}

function stripTags(html) {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isReasonableNavLabel(t) {
  if (!t || typeof t !== "string") return false;
  const s = t.trim();
  if (s.length < 2 || s.length > 40) return false;
  if (/^[.\d\s%pxrem,()#]+$/i.test(s)) return false;
  if (/^M[\d.\s,-]+[LZ]?$/i.test(s)) return false;
  if (/\d+m\s+\d+s/i.test(s)) return false;
  if (/min\s*\(|max\s*\(|clamp\s*\(|rgba?\(/i.test(s)) return false;
  if (/^[a-f0-9]{6,}$/i.test(s)) return false;
  const words = s.split(/\s+/).length;
  if (words === 1 && /^[a-z]+$/i.test(s) && s.length <= 16) return true;
  if (words >= 1 && words <= 6) {
    if (/\d{4}-\d{2}/.test(s)) return false;
    return true;
  }
  return false;
}

function isReasonablePath(p) {
  if (!p || typeof p !== "string") return false;
  const x = p.trim().split("?")[0];
  if (!x.startsWith("/")) return false;
  if (x === "/" || x === "/*") return false;
  if (/\.(tsx?|jsx?|vue|png|svg|jpe?g|webp|ico|css)$/i.test(x)) return false;
  return true;
}

function extractOrderedNavLabels(blob, fileScore) {
  if (fileScore < 1) return [];
  if (
    fileScore === 1 &&
    !/<NavLink\b/i.test(blob) &&
    !/<Link\b[^>]*\bto\s*=/i.test(blob) &&
    !/<RouterLink\b/i.test(blob) &&
    !/<router-link\b/i.test(blob) &&
    !/<NuxtLink\b/i.test(blob)
  ) {
    return [];
  }
  const ordered = [];
  const seen = new Set();
  const push = (raw) => {
    const t = stripTags(raw);
    if (!isReasonableNavLabel(t)) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    ordered.push(t);
  };

  const pushLinked = (pathStr, inner) => {
    if (!isReasonablePath(pathStr)) return;
    push(inner);
  };

  let m;
  const reNav = /<NavLink\b[^>]*>([\s\S]*?)<\/NavLink>/gi;
  while ((m = reNav.exec(blob))) push(m[1]);

  const reLink =
    /<Link\b[^>]*\bto\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/Link>/gi;
  while ((m = reLink.exec(blob))) pushLinked(m[1], m[2]);

  const reRouter =
    /<RouterLink\b[^>]*\bto\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/RouterLink>/gi;
  while ((m = reRouter.exec(blob))) pushLinked(m[1], m[2]);

  const reRouterLo =
    /<router-link\b[^>]*\bto\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/router-link>/gi;
  while ((m = reRouterLo.exec(blob))) pushLinked(m[1], m[2]);

  const reNuxt =
    /<NuxtLink\b[^>]*\bto\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/NuxtLink>/gi;
  while ((m = reNuxt.exec(blob))) pushLinked(m[1], m[2]);

  const reMenuLabel = /\blabel\s*:\s*["']([^"']{2,36})["']/g;
  while ((m = reMenuLabel.exec(blob))) push(m[1]);

  return ordered;
}

function extractPaths(blob) {
  const set = new Set();
  const patterns = [
    /\bpath\s*=\s*["']([^"']+)["']/g,
    /\bpath:\s*["']([^"']+)["']/g,
    /\bpath:\s*[`'"](\/[^`'"<>\s]+)[`'"']/g,
    /\bto\s*=\s*["'](\/[^"']+)["']/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(blob))) {
      if (isReasonablePath(m[1])) set.add(m[1].trim().split("?")[0]);
    }
  }
  return [...set];
}

function pageDisplayName(fn) {
  let base = path.basename(String(fn)).replace(/\.(tsx|ts|jsx|js|vue)$/i, "");
  base = base.replace(/Page$/i, "");
  base = base.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return base || path.basename(String(fn));
}

/**
 * Short factual summary only — no product-tutorial copy about Snappi UI.
 */
function buildWhatChangedNarrative(
  navLabels,
  touchedPageNames,
  addedPageNames,
  strictSectionHints,
  _pathsArr,
  additionLabels
) {
  const touched = (touchedPageNames || []).filter(Boolean);
  const added = (addedPageNames || []).filter(Boolean);
  const pageName = touched[0] || added[0] || "";
  const nav = navLabels && navLabels[0];
  const hints = (strictSectionHints || []).filter(Boolean).slice(0, 5);
  const addCols = (additionLabels || []).filter(Boolean).slice(0, 4);
  const colPhrase =
    addCols.length > 0
      ? `adds table column(s) ${addCols.map((h) => `“${h}”`).join(", ")}`
      : "";

  if (added.length && nav && touched.length === 0) {
    const sec =
      hints.length > 0
        ? ` - ${hints.map((h) => `“${h}”`).join(", ")} section${hints.length > 1 ? "s" : ""}`
        : "";
    const col = colPhrase ? ` - ${colPhrase}` : "";
    return `Adds a new screen (${added[0]}) with sidebar “${nav}”${col}${sec}.`;
  }

  if (!pageName && hints.length === 0 && addCols.length === 0) return "";

  const head = pageName
    ? `This PR updates the ${pageName} screen`
    : "This PR updates the UI";

  if (hints.length === 0) {
    if (colPhrase) return `${head} - ${colPhrase}.`;
    return `${head}.`;
  }

  const sec = hints.map((h) => `“${h}”`).join(", ");
  const plural = hints.length > 1 ? "s" : "";
  if (colPhrase) {
    return `${head} - ${colPhrase} - ${sec} section${plural}.`;
  }
  return `${head} - ${sec} section${plural}.`;
}

function buildUxSummary(
  navLabels,
  pageNames,
  pathsArr,
  regionHints,
  touchedPageNames,
  removalLabels,
  additiveRegionHints,
  regionHintsForSummary,
  additionLabels
) {
  const nav = navLabels[0];
  const pages = pageNames.filter(Boolean);
  const touched = (touchedPageNames || []).filter(Boolean);
  const regions = Array.isArray(regionHints) ? regionHints : [];
  const summaryRegions =
    Array.isArray(regionHintsForSummary) && regionHintsForSummary.length > 0
      ? regionHintsForSummary
      : regions;
  const removed = Array.isArray(removalLabels) ? removalLabels : [];
  const additive = Array.isArray(additiveRegionHints)
    ? additiveRegionHints
    : [];
  const addCols = Array.isArray(additionLabels) ? additionLabels : [];
  const colClause =
    addCols.length > 0
      ? `adds table column(s) ${addCols
          .slice(0, 3)
          .map((r) => `“${r}”`)
          .join(", ")}; `
      : "";

  if (nav && pages.length) {
    return `Adds navigation entry "${nav}" and a new full-page view (${pages[0]}).`;
  }
  if (removed.length >= 1 && touched.length >= 1) {
    const what = removed
      .slice(0, 3)
      .map((r) => `“${r}”`)
      .join(", ");
    if (additive.length >= 1) {
      return `On the ${touched[0]} screen: adds or updates “${additive[0]}” and removes ${what} from the UI.`;
    }
    if (regions.length >= 1) {
      return `On the ${touched[0]} screen: ${colClause}removes ${what} from the “${regions[0]}” area. Hover the red dot for this note.`;
    }
    return `On the ${touched[0]} screen: ${colClause}removes ${what} from the UI (it will not appear after this PR). The highlight shows where that change applies.`;
  }
  if (removed.length >= 1) {
    const what = removed
      .slice(0, 3)
      .map((r) => `“${r}”`)
      .join(", ");
    return `Removes ${what} from the UI. Open the matching page in the preview to see the highlighted area.`;
  }
  if (summaryRegions.length === 1 && touched.length >= 1) {
    return `On the ${touched[0]} screen: adds or updates the “${summaryRegions[0]}” section.`;
  }
  if (summaryRegions.length === 1) {
    return `Adds or updates the “${summaryRegions[0]}” section in the UI.`;
  }
  if (summaryRegions.length >= 2) {
    const head = summaryRegions
      .slice(0, 3)
      .map((r) => `“${r}”`)
      .join(", ");
    const more =
      summaryRegions.length > 3
        ? " Additional areas are outlined in the preview."
        : "";
    return `Updates these UI areas: ${head}.${more}`;
  }
  if (nav && pathsArr.length) {
    const p =
      pathsArr.find((x) => x.startsWith("/") && x.length > 1) || pathsArr[0];
    return `Adds "${nav}" to the navigation${p ? ` (path ${p})` : ""}.`;
  }
  if (pages.length === 1) {
    return `Introduces a new screen (${pages[0]}).`;
  }
  if (pages.length > 1) {
    const head = pages.slice(0, 4).join(", ");
    const more =
      pages.length > 4
        ? " (see file list for the rest)."
        : "";
    return `Introduces new screens: ${head}${more}.`;
  }
  if (touched.length === 1 && !nav && regions.length === 0) {
    return `Changes on the ${touched[0]} screen—open that page from the sidebar to review.`;
  }
  if (navLabels.length >= 2) {
    return `Updates navigation (${navLabels
      .slice(0, 3)
      .map((n) => `"${n}"`)
      .join(", ")}).`;
  }
  if (nav) {
    return `Updates navigation (includes "${nav}").`;
  }
  if (pathsArr.length) {
    return `Route updates (${pathsArr.slice(0, 4).join(", ")}). Review the highlighted areas in the preview.`;
  }
  return "";
}

function guessRoutePathFromPageName(name) {
  if (!name || typeof name !== "string") return "";
  const s = name.replace(/Page$/i, "").trim();
  if (!s) return "";
  const kebab = s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .replace(/_/g, "-")
    .toLowerCase();
  return `/${kebab.replace(/^-+/, "").replace(/-+/g, "-")}`;
}

function buildNavPaths(pathsArr, pageNamesForGuess) {
  const out = [];
  const seen = new Set();
  const guess = guessRoutePathFromPageName(pageNamesForGuess[0] || "");
  if (guess && guess !== "/") {
    out.push(guess);
    seen.add(guess.toLowerCase());
  }
  for (const p of pathsArr) {
    if (!/^\/[a-zA-Z0-9][a-zA-Z0-9/_-]*$/i.test(p) || p === "/") continue;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length >= 8) break;
  }
  return out.slice(0, 8);
}

function isUiSourceFile(fn) {
  return /\.(tsx|ts|jsx|js|mjs|cjs|vue)$/i.test(String(fn || ""));
}

/**
 * Section titles only — no generic title= / label= / children= (those catch chart
 * props, table columns, mock data like "API catalog", and are wrong for UX copy).
 */
function extractStrictSectionHints(files) {
  const hints = [];
  const seen = new Set();
  const add = (raw) => {
    const t = stripTags(String(raw || ""))
      .replace(/\s+/g, " ")
      .trim();
    if (t.length < 4 || t.length > 72) return;
    if (/^[\d./\\%pxrem,#${}()`'[\];:]+$/i.test(t)) return;
    if (/^[$_a-z][\w$]*$/i.test(t)) return;
    if (
      /^(true|false|null|undefined|void|return|import|export|className)$/i.test(
        t
      )
    )
      return;
    if (/title\s*=\s*["']|^\s*\/?>|^\s*=\s*["']|=>|dataKey|data-testid/i.test(t))
      return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    hints.push(t);
  };

  for (const f of files) {
    if (!f?.patch || !isUiSourceFile(f.filename)) continue;
    const blob = plusLinesBlob(f.patch).slice(0, 200000);
    let m;
    const reCardTitle =
      /<CardTitle[^>]*>\s*([\s\S]*?)<\s*\/\s*CardTitle/gi;
    while ((m = reCardTitle.exec(blob))) add(m[1]);

    const rePfTitle =
      /<Title[^>]*>\s*([^<]{3,72})\s*<\s*\/\s*Title>/gi;
    while ((m = rePfTitle.exec(blob))) add(m[1]);

    const reH = /^\s*\+\s*<h[1-6][^>]*>\s*([^<]{4,72})\s*<\/h[1-6]>/gim;
    while ((m = reH.exec(blob))) add(m[1]);

    extractCardHeaderMultilineHints(f.patch, add);
  }
  return hints.slice(0, 8);
}

/** Unified diff line body (strip leading diff marker). */
function patchLineBody(line) {
  if (!line || typeof line !== "string") return "";
  const c0 = line.charAt(0);
  if (c0 === " " || c0 === "+" || c0 === "-") return line.slice(1);
  return line;
}

/**
 * When `<CardHeader>` opens on a + line but does not close, merge up to 6 following
 * patch lines (stops at `</CardHeader>` or next hunk `@@`) and extract titles.
 */
function mergePatchLinesForOpenCardHeader(lines, startIdx, maxExtra) {
  const parts = [];
  const end = Math.min(lines.length, startIdx + maxExtra);
  for (let k = startIdx; k < end; k++) {
    const row = patchLineBody(lines[k]);
    if (row.startsWith("diff --git")) break;
    if (k > startIdx && /^@@\s/.test(row)) break;
    parts.push(row);
    if (/<\/\s*CardHeader\s*>/i.test(parts.join("\n"))) break;
  }
  return parts.join("\n");
}

function extractTitlesFromCardHeaderBlob(merged, push) {
  let m;
  const reCt = /<CardTitle[^>]*>\s*([\s\S]*?)<\s*\/\s*CardTitle/gi;
  while ((m = reCt.exec(merged))) push(m[1]);
  const rePf = /<Title[^>]*>\s*([^<]{3,72})\s*<\s*\/\s*Title>/gi;
  while ((m = rePf.exec(merged))) push(m[1]);
  const reH = /<h([1-6])[^>]*>\s*([^<]{3,72})\s*<\/h\1>/gi;
  while ((m = reH.exec(merged))) push(m[2]);
}

/** + lines with multi-line `<CardHeader>…</CardHeader>` (common in PF/MUI). */
function extractCardHeaderMultilineHints(patch, push) {
  const body = String(patch || "");
  if (!body) return;
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("+")) continue;
    const cur = patchLineBody(lines[i]);
    if (!/<\s*CardHeader\b/i.test(cur)) continue;
    if (/<\/\s*CardHeader\s*>/i.test(cur)) continue;
    const merged = mergePatchLinesForOpenCardHeader(lines, i, 6);
    if (merged.length < 8) continue;
    extractTitlesFromCardHeaderBlob(merged, push);
  }
}

/**
 * From each + line, scan up to 20 preceding lines (context / +/-) for
 * CardTitle / PF Title / h1–h6 — anchors for chart-only +lines (e.g. Sankey).
 */
function extractContextHeadingHints(patch) {
  const hints = [];
  const seen = new Set();
  const push = (raw) => {
    const t = stripTags(String(raw || ""))
      .replace(/\s+/g, " ")
      .trim();
    if (t.length < 4 || t.length > 72) return;
    if (/^[\d./\\%pxrem,#${}()`'[\];:]+$/i.test(t)) return;
    if (/^[$_a-z][\w$]*$/i.test(t)) return;
    if (
      /^(true|false|null|undefined|void|return|import|export|className)$/i.test(
        t
      )
    )
      return;
    if (/title\s*=\s*["']|^\s*\/?>|^\s*=\s*["']|=>|dataKey|data-testid/i.test(t))
      return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    hints.push(t);
  };

  const body = String(patch || "");
  if (!body) return hints;
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("+")) continue;
    const cur = patchLineBody(lines[i]);
    if (/^\s*import\s/.test(cur)) continue;
    if (cur.length > 240) continue;
    if (
      /<\s*CardHeader\b/i.test(cur) &&
      !/<\/\s*CardHeader\s*>/i.test(cur)
    ) {
      const mergedFwd = mergePatchLinesForOpenCardHeader(lines, i, 6);
      extractTitlesFromCardHeaderBlob(mergedFwd, push);
    }
    for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
      const row = patchLineBody(lines[j]);
      if (row.startsWith("@@") || row.startsWith("diff --git")) continue;
      let m;
      const reCt =
        /<CardTitle[^>]*>\s*([\s\S]*?)<\s*\/\s*CardTitle/gi;
      while ((m = reCt.exec(row))) push(m[1]);
      const rePf = /<Title[^>]*>\s*([^<]{3,72})\s*<\s*\/\s*Title>/gi;
      while ((m = rePf.exec(row))) push(m[1]);
      const reH = /<h([1-6])[^>]*>\s*([^<]{3,72})\s*<\/h\1>/gi;
      while ((m = reH.exec(row))) push(m[2]);
    }
    if (hints.length >= 8) break;
  }
  return hints.slice(0, 8);
}

function dedupeHintStrings(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const t = String(raw || "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

/** Inner text of <Th> / <th> cells in a patch blob (for net-removal detection). */
function thHeaderLabelsFromBlob(blob) {
  const set = new Set();
  const b = String(blob || "").slice(0, 200000);
  let m;
  const reTh = /<\s*(?:Th|th)\b[^>]*>\s*([^<]+?)\s*<\s*\//gi;
  while ((m = reTh.exec(b))) {
    const t = stripTags(String(m[1] || ""))
      .replace(/\s+/g, " ")
      .trim();
    if (t.length >= 2 && t.length <= 44) set.add(t.toLowerCase());
  }
  return set;
}

/**
 * Net-removed table column *titles* only: <Th>/<th> inner text that appears on
 * minus lines but not on any + line <Th>. No children=/aria-label=/column:
 * heuristics — those matched placeholders and unrelated copy (e.g. search hints).
 */
function extractRemovalLabels(files) {
  const out = [];
  const seen = new Set();
  const pushLabel = (t) => {
    if (t.length < 2 || t.length > 44) return;
    if (/^\d+$/.test(t)) return;
    if (/^(true|false|null|undefined|void|className)$/i.test(t)) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  for (const f of files) {
    if (!f?.patch || !isUiSourceFile(f.filename)) continue;
    const plusBlob = plusLinesBlob(f.patch).slice(0, 200000);
    const minusBlob = minusLinesBlob(f.patch).slice(0, 200000);
    const stillInTable = thHeaderLabelsFromBlob(plusBlob);

    let m;
    const reTh =
      /<\s*(?:Th|th)\b[^>]*>\s*([^<]+?)\s*<\s*\//gi;
    while ((m = reTh.exec(minusBlob))) {
      const t = stripTags(String(m[1] || ""))
        .replace(/\s+/g, " ")
        .trim();
      if (stillInTable.has(t.toLowerCase())) continue;
      pushLabel(t);
      if (out.length >= 6) return out.slice(0, 6);
    }
  }
  return out.slice(0, 6);
}

/**
 * Table header text that appears in + lines but not in - lines (net-new columns).
 * Symmetric to extractRemovalLabels; avoids children:/placeholder noise.
 */
function extractAdditionLabels(files) {
  const out = [];
  const seen = new Set();
  for (const f of files) {
    if (!f?.patch || !isUiSourceFile(f.filename)) continue;
    const plusBlob = plusLinesBlob(f.patch).slice(0, 200000);
    const minusBlob = minusLinesBlob(f.patch).slice(0, 200000);
    const minusTh = thHeaderLabelsFromBlob(minusBlob);
    let m;
    const reTh =
      /<\s*(?:Th|th)\b[^>]*>\s*([^<]+?)\s*<\s*\//gi;
    while ((m = reTh.exec(plusBlob))) {
      const t = stripTags(String(m[1] || ""))
        .replace(/\s+/g, " ")
        .trim();
      if (t.length < 2 || t.length > 44) continue;
      if (/^\d+$/.test(t)) continue;
      if (minusTh.has(t.toLowerCase())) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
      if (out.length >= 6) return out.slice(0, 6);
    }
  }
  return out.slice(0, 6);
}

/**
 * Low-risk DOM tokens from touched filenames (e.g. TrafficSankey → "sankey") for
 * highlight matching when title text is elsewhere; not shown in uxSummary.
 * Keep token names in sync with `weakToks` in electron/preview-change-highlights.mjs.
 */
function extractWeakFilenameTokens(files) {
  const out = [];
  const seen = new Set();
  const push = (t) => {
    if (t.length < 4 || t.length > 20) return;
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const f of files) {
    if (!f?.patch || !isUiSourceFile(f.filename)) continue;
    const base = path.basename(String(f.filename), path.extname(String(f.filename)));
    if (!base || base.length < 4) continue;
    if (/sankey/i.test(base)) push("sankey");
    else if (/chart/i.test(base) && /[a-z]/i.test(base.replace(/chart/gi, "")))
      push("chart");
  }
  return out.slice(0, 2);
}

/** File-name anchors to find the right card/table (not the deleted string). */
function extractFilenameRegionHints(files) {
  const raw = [];
  for (const f of files) {
    if (!f?.filename || !isUiSourceFile(f.filename)) continue;
    const base = path.basename(String(f.filename), path.extname(f.filename));
    let stem = base.replace(/Page$/i, "");
    const isTable = /Table$/i.test(stem);
    stem = stem.replace(/Table$/i, "");
    let words = stem.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
    if (isTable && words.length >= 2) words = `${words} table`;
    if (words.length >= 3 && words.length <= 42) raw.push(words);
  }
  return dedupeHintStrings(raw);
}

/**
 * @param {Array<{ filename?: string; status?: string; patch?: string }>} files
 * @returns {{ uxSummary: string; navLabels: string[]; navPaths: string[]; regionHints: string[]; removalLabels: string[]; additionLabels: string[]; highlightMain: boolean; fullPageHighlight: boolean }}
 */
export function buildPrUxTour(files) {
  const safeFiles = Array.isArray(files) ? files : [];

  const navLabels = [];
  const seenNav = new Set();
  const allPaths = new Set();

  const annotated = safeFiles.map((f) => ({
    ...f,
    score: navRelevanceScore(f.filename),
  }));

  const strong = annotated
    .filter((f) => f.patch && f.score >= 2)
    .sort((a, b) => b.score - a.score);

  const weak = annotated
    .filter((f) => f.patch && f.score === 1)
    .sort((a, b) => String(a.filename).localeCompare(b.filename));

  function absorbLabelsFrom(f) {
    const blob = plusLinesBlob(f.patch).slice(0, 200000);
    for (const lab of extractOrderedNavLabels(blob, f.score)) {
      const k = lab.toLowerCase();
      if (seenNav.has(k)) continue;
      seenNav.add(k);
      navLabels.push(lab);
      if (navLabels.length >= 8) return;
    }
  }

  for (const f of [...strong, ...weak]) {
    const blob = plusLinesBlob(f.patch).slice(0, 200000);
    for (const p of extractPaths(blob)) allPaths.add(p);
  }

  for (const f of strong) {
    absorbLabelsFrom(f);
    if (navLabels.length >= 8) break;
  }
  for (const f of weak) {
    if (navLabels.length >= 8) break;
    absorbLabelsFrom(f);
  }

  const addedPageNames = [];
  const touchedPageNames = [];
  for (const f of safeFiles) {
    const st = String(f.status || "").toLowerCase();
    if (!isPageFile(f.filename)) continue;
    const nm = pageDisplayName(f.filename);
    if (st === "added") addedPageNames.push(nm);
    if (/^(added|modified|renamed)$/i.test(st)) touchedPageNames.push(nm);
  }

  const pageTouchFiles = safeFiles.filter(
    (f) =>
      f?.patch &&
      isPageFile(f.filename) &&
      /^(added|modified|renamed)$/i.test(String(f.status || ""))
  );

  const strictBase =
    pageTouchFiles.length > 0
      ? extractStrictSectionHints(pageTouchFiles)
      : [];
  const contextFromPages =
    pageTouchFiles.length > 0
      ? pageTouchFiles.flatMap((f) =>
          extractContextHeadingHints(f.patch || "")
        )
      : [];
  const strictFromPages = dedupeHintStrings([
    ...strictBase,
    ...contextFromPages,
  ]);

  const strictFallback =
    strictFromPages.length === 0
      ? extractStrictSectionHints(
          safeFiles.filter((f) => f?.patch && isUiSourceFile(f.filename))
        )
      : [];

  const strictForHints =
    strictFromPages.length > 0 ? strictFromPages : strictFallback;
  const strictForSummary =
    strictFromPages.length > 0 ? strictFromPages : strictForHints;

  const fileAnchorFiles =
    pageTouchFiles.length > 0
      ? pageTouchFiles
      : safeFiles.filter((f) => isPageFile(f.filename));
  const fileAnchors = extractFilenameRegionHints(
    fileAnchorFiles.length ? fileAnchorFiles : safeFiles
  );

  const removalLabels = extractRemovalLabels(safeFiles);
  const additionLabels = extractAdditionLabels(safeFiles);
  const weakFilenameTokens = extractWeakFilenameTokens(safeFiles);
  const regionHints = dedupeHintStrings([
    ...strictForHints,
    ...fileAnchors,
    ...additionLabels,
    ...weakFilenameTokens,
  ]);

  const pathsArr = [...allPaths];
  let highlightMain =
    addedPageNames.length > 0 ||
    pathsArr.some((p) => /^\/[a-zA-Z][a-zA-Z0-9/_-]*$/i.test(p));

  if (navLabels.length === 0 && addedPageNames.length > 0) {
    navLabels.push(addedPageNames[0]);
  } else if (navLabels.length === 0 && touchedPageNames.length > 0) {
    navLabels.push(touchedPageNames[0]);
  }

  if (!highlightMain) {
    const anyPageTouch = safeFiles.some(
      (f) =>
        isPageFile(f.filename) &&
        /^(added|modified|renamed)$/i.test(String(f.status || ""))
    );
    if (anyPageTouch) highlightMain = true;
  }

  let pathSeed =
    addedPageNames.length > 0 ? addedPageNames : touchedPageNames;
  if (pathSeed.length === 0) {
    for (const f of safeFiles) {
      if (!f?.filename || !isUiSourceFile(f.filename)) continue;
      if (!/[Pp]age\.(tsx|ts|jsx|js|vue)$/i.test(String(f.filename)))
        continue;
      pathSeed = [pageDisplayName(f.filename)];
      break;
    }
  }
  const navPaths = buildNavPaths(pathsArr, pathSeed);

  let uxSummary = "";
  if (removalLabels.length >= 1) {
    uxSummary = buildUxSummary(
      navLabels,
      addedPageNames,
      pathsArr,
      regionHints,
      touchedPageNames,
      removalLabels,
      strictForHints,
      strictForSummary,
      additionLabels
    );
  } else {
    uxSummary = buildWhatChangedNarrative(
      navLabels,
      touchedPageNames,
      addedPageNames,
      strictForSummary,
      pathsArr,
      additionLabels
    );
    if (!uxSummary.trim()) {
      uxSummary = buildUxSummary(
        navLabels,
        addedPageNames,
        pathsArr,
        regionHints,
        touchedPageNames,
        removalLabels,
        strictForHints,
        strictForSummary,
        additionLabels
      );
    }
  }

  if (!uxSummary.trim() && strictForSummary.length > 0 && touchedPageNames[0]) {
    uxSummary = `On the ${touchedPageNames[0]} screen: adds or updates the “${strictForSummary[0]}” section.`;
  }
  if (!uxSummary.trim() && strictForSummary.length > 0) {
    uxSummary = `Adds or updates the “${strictForSummary[0]}” section in the UI.`;
  }
  if (!uxSummary.trim() && highlightMain) {
    uxSummary =
      "This PR changes visible layout or content—check the highlighted regions in the preview.";
  }

  const fullPageHighlight = addedPageNames.length > 0;

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
