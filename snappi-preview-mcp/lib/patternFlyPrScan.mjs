/**
 * Scan PR patches for PatternFly React class prefixes (pf-v6-c-*, pf-v5-c-*, pf-c-*).
 * Used for PR-level doc summaries (MCP batch search in Electron).
 */

const UI_EXT_RE =
  /\.(tsx?|jsx?|vue|svelte|css|scss|less|sass|html?|mdx)$/i;

/** @param {string} p */
function isUiLikePath(p) {
  return UI_EXT_RE.test(String(p || ""));
}

/**
 * Extract component slugs from text (e.g. text-input-group from pf-v6-c-text-input-group).
 * @param {string} text
 * @returns {string[]}
 */
export function extractPfComponentSlugsFromText(text) {
  if (!text || typeof text !== "string") return [];
  const set = new Set();
  let m;
  const reV = /\bpf-(?:v[56]-)?c-([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)\b/gi;
  while ((m = reV.exec(text))) {
    set.add(m[1].toLowerCase());
  }
  const reL = /\bpf-c-([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)\b/gi;
  while ((m = reL.exec(text))) {
    set.add(m[1].toLowerCase());
  }
  return [...set].sort();
}

/**
 * @param {{ filename?: string; patch?: string }[]} files
 * @param {{ maxFiles?: number; maxSlugs?: number }} [opts]
 * @returns {{ slugs: string[]; filesTouched: { filename: string; slugs: string[] }[] }}
 */
export function extractPfSlugsFromPrFiles(files, opts = {}) {
  const maxFiles = opts.maxFiles ?? 80;
  const maxSlugs = opts.maxSlugs ?? 48;
  const global = new Set();
  /** @type {{ filename: string; slugs: string[] }[]} */
  const filesTouched = [];
  let n = 0;
  for (const f of files || []) {
    if (n >= maxFiles) break;
    const name = f?.filename;
    if (!name || !isUiLikePath(name)) continue;
    const patch = f?.patch;
    if (typeof patch !== "string" || !patch.length) continue;
    const found = extractPfComponentSlugsFromText(patch);
    if (!found.length) continue;
    for (const s of found) global.add(s);
    filesTouched.push({ filename: name, slugs: found });
    n++;
  }
  const slugs = [...global].sort().slice(0, maxSlugs);
  return { slugs, filesTouched: filesTouched.slice(0, 24) };
}
