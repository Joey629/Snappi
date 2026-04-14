import { execFileSync } from "node:child_process";

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function safeRepoRelativePath(raw) {
  const s = String(raw || "")
    .trim()
    .replace(/\\/g, "/");
  if (!s || s.startsWith("/") || /^[a-z]:/i.test(s) || s.includes("..")) {
    return null;
  }
  return s;
}

/**
 * @param {string} line
 * @returns {{ hash: string; author: string; date: string; subject: string } | null}
 */
function parseGitLogLine(line) {
  const s = String(line || "").trim();
  if (!s) return null;
  const tab = "\t";
  const i1 = s.indexOf(tab);
  const i2 = s.indexOf(tab, i1 + 1);
  const i3 = s.indexOf(tab, i2 + 1);
  if (i1 === -1 || i2 === -1 || i3 === -1) {
    return { hash: s.slice(0, 7), author: "", date: "", subject: s };
  }
  const hash = s.slice(0, i1).trim();
  const author = s.slice(i1 + 1, i2).trim();
  const date = s.slice(i2 + 1, i3).trim();
  const subject = s.slice(i3 + 1).trim();
  return { hash, author, date, subject };
}

/**
 * @param {string} repoRoot
 * @param {string} relPath
 * @param {number} [limit]
 */
export function gitLogForPath(repoRoot, relPath, limit = 12) {
  const rel = safeRepoRelativePath(relPath);
  if (!rel) return { ok: false, error: "Invalid file path" };
  try {
    const out = execFileSync(
      "git",
      [
        "log",
        `-${limit}`,
        "--pretty=format:%h\t%an\t%ad\t%s",
        "--date=short",
        "--",
        rel,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 512 * 1024,
        timeout: 25000,
      }
    );
    const lines = out.trim().split("\n").filter(Boolean);
    const entries = [];
    for (const line of lines) {
      const e = parseGitLogLine(line);
      if (e) entries.push(e);
    }
    return { ok: true, entries, lines };
  } catch (e) {
    const msg =
      (e && typeof e.stderr === "string" && e.stderr.trim()) ||
      e?.message ||
      String(e);
    return { ok: false, error: msg.slice(0, 800) };
  }
}
