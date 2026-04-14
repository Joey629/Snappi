/**
 * Apply AI-proposed text replacements inside the active PR preview project root.
 * Paths are restricted to the repo; only common source extensions allowed.
 */

import fs from "fs";
import path from "path";

const ALLOWED_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".less",
  ".json",
  ".html",
  ".htm",
  ".vue",
  ".svelte",
  ".astro",
  ".md",
  ".mdx",
]);

/** @param {unknown} rel */
export function sanitizeRelativePath(rel) {
  const s = String(rel ?? "")
    .trim()
    .replace(/\\/g, "/");
  if (!s || s.includes("\0")) return null;
  const norm = path.normalize(s);
  if (norm.startsWith("..")) return null;
  if (path.isAbsolute(norm)) return null;
  const parts = norm.split(path.sep);
  if (parts.includes("..")) return null;
  const ext = path.extname(norm).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  return norm;
}

/** @param {string} haystack @param {string} needle */
function countOccurrences(haystack, needle) {
  if (needle === "") return 0;
  let n = 0;
  let i = 0;
  while (i < haystack.length) {
    const j = haystack.indexOf(needle, i);
    if (j === -1) break;
    n++;
    i = j + needle.length;
  }
  return n;
}

function isInsideRoot(rootResolved, fileResolved) {
  const rel = path.relative(rootResolved, fileResolved);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(
    dir,
    `.${base}.snappi-write-${process.pid}-${Date.now()}`
  );
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}

/**
 * @param {unknown[]} edits
 * @returns {Array<{ path: string; oldText: string; newText: string }>}
 */
export function sanitizeSourceEdits(edits) {
  if (!Array.isArray(edits)) return [];
  const out = [];
  for (let i = 0; i < edits.length && out.length < 12; i++) {
    const e = edits[i];
    if (!e || typeof e !== "object") continue;
    const rel = sanitizeRelativePath(/** @type {{ path?: string }} */ (e).path);
    if (!rel) continue;
    const oldText =
      /** @type {{ oldText?: unknown }} */ (e).oldText != null
        ? String(/** @type {{ oldText?: unknown }} */ (e).oldText)
        : "";
    const newText =
      /** @type {{ newText?: unknown }} */ (e).newText != null
        ? String(/** @type {{ newText?: unknown }} */ (e).newText)
        : "";
    if (oldText.length > 500_000 || newText.length > 500_000) continue;
    out.push({ path: rel, oldText, newText });
  }
  return out;
}

/**
 * @param {string} projectRoot
 * @param {unknown[]} edits
 */
export function applySourceEditsToProject(projectRoot, edits) {
  const root = path.resolve(projectRoot);
  const applied = [];
  /** @type {Array<{ path: string; error: string }>} */
  const errors = [];
  const safe = sanitizeSourceEdits(edits);

  for (const e of safe) {
    const full = path.join(root, e.path);
    const resolved = path.resolve(full);
    if (!isInsideRoot(root, resolved)) {
      errors.push({ path: e.path, error: "path escapes project root" });
      continue;
    }
    if (!fs.existsSync(resolved)) {
      errors.push({ path: e.path, error: "file not found" });
      continue;
    }
    let content;
    try {
      content = fs.readFileSync(resolved, "utf8");
    } catch (err) {
      errors.push({
        path: e.path,
        error: String(/** @type {Error} */ (err)?.message || err),
      });
      continue;
    }
    const c = countOccurrences(content, e.oldText);
    if (c === 0) {
      errors.push({ path: e.path, error: "oldText not found (exact match)" });
      continue;
    }
    if (c > 1) {
      errors.push({
        path: e.path,
        error: "oldText matches multiple times — narrow the snippet",
      });
      continue;
    }
    const next = content.replace(e.oldText, e.newText);
    try {
      atomicWrite(resolved, next);
      applied.push(e.path);
    } catch (err) {
      errors.push({
        path: e.path,
        error: String(/** @type {Error} */ (err)?.message || err),
      });
    }
  }

  return {
    ok: errors.length === 0,
    applied,
    errors,
  };
}
