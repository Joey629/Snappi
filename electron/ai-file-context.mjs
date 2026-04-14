/**
 * Load small source snippets from the active PR preview repo for AI context
 * (improves sourceEdits oldText accuracy).
 */

import fs from "fs";
import path from "path";
import { sanitizeRelativePath } from "./sourceEditApply.mjs";

const MAX_FILES = 3;
const MAX_CHARS_PER_FILE = 12_000;

/**
 * @param {string} projectRoot
 * @param {string} changedFilesPreview newline-separated relative paths (from preview tab)
 * @returns {Array<{ path: string; content: string }>}
 */
export function readProjectFileSnippetsForAi(projectRoot, changedFilesPreview) {
  const root = path.resolve(projectRoot);
  const lines = String(changedFilesPreview || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set();
  /** @type {Array<{ path: string; content: string }>} */
  const out = [];
  for (const line of lines) {
    if (out.length >= MAX_FILES) break;
    const rel = sanitizeRelativePath(line);
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    const resolved = path.resolve(path.join(root, rel));
    const relCheck = path.relative(root, resolved);
    if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) continue;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue;
    let content;
    try {
      content = fs.readFileSync(resolved, "utf8");
    } catch {
      continue;
    }
    if (content.length > MAX_CHARS_PER_FILE) {
      content =
        content.slice(0, MAX_CHARS_PER_FILE) +
        "\n\n/* … Snappi: truncated for AI context … */\n";
    }
    out.push({ path: rel.replace(/\\/g, "/"), content });
  }
  return out;
}
