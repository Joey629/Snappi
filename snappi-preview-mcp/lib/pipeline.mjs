/**
 * Shared PR preview pipeline — used by MCP server and Snappi Electron.
 * Runs git + package managers on the host (isolate in container later).
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { buildPrUxTour } from "./prUxTourFromPatch.mjs";
import { extractPfSlugsFromPrFiles } from "./patternFlyPrScan.mjs";

/** @typedef {{ workRoot: string; logsDir: string }} PreviewPaths */

const previewState = new Map();

/**
 * CRA / webpack first boot often exceeds 90s (e.g. Kiali runs i18n then react-scripts).
 * @param {string} projectPath
 * @param {string} script
 */
function devServerWaitTimeoutMs(projectPath, script) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectPath, "package.json"), "utf8")
    );
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const scripts = pkg.scripts || {};
    const body = String(scripts[script] || "");
    const blob = JSON.stringify(scripts);
    if (
      deps["react-scripts"] ||
      /react-scripts/i.test(body) ||
      /react-scripts/i.test(blob)
    ) {
      return 360000;
    }
    if (deps["next"] || /\bnext\s+dev\b/i.test(body)) return 180000;
    if (
      /\bwebpack(-cli)?\b/i.test(body) &&
      /\bserve\b/i.test(body)
    ) {
      return 180000;
    }
    if (
      deps["webpack-dev-server"] ||
      /\bwebpack-dev-server\b/i.test(blob)
    ) {
      return 180000;
    }
  } catch {
    /* ignore */
  }
  return 120000;
}

/**
 * Wait until 127.0.0.1:port accepts connections.
 * We use TCP (not HTTP GET /) because webpack-dev-server often holds the first request until the
 * initial bundle finishes; our short HTTP timeouts could loop until the overall wait expires even
 * though the server is already listening (see webpack-dev-middleware "wait until bundle finished").
 */
function waitForDevServer(port, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const attempt = () => {
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      const socket = net.connect({ port, host: "127.0.0.1" });
      const finish = (ok) => {
        socket.removeAllListeners();
        if (!socket.destroyed) socket.destroy();
        if (ok) resolve(true);
        else setTimeout(attempt, 400);
      };
      socket.setTimeout(2500);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
    };
    attempt();
  });
}

/**
 * First listenable port from startPort (inclusive), for running several dev servers.
 * Probes 127.0.0.1 to match typical dev server bind.
 */
export function findFreePort(startPort = 5173, maxAttempts = 80) {
  return new Promise((resolve, reject) => {
    const attempt = (p) => {
      if (p > startPort + maxAttempts) {
        reject(
          new Error(
            `No free TCP port between ${startPort} and ${startPort + maxAttempts}`
          )
        );
        return;
      }
      const server = net.createServer();
      server.once("error", () => attempt(p + 1));
      server.listen(p, "127.0.0.1", () => {
        server.close(() => resolve(p));
      });
    };
    attempt(startPort);
  });
}

function defaultWorkRoot() {
  const fromEnv = process.env.SNAPPI_MCP_WORK_ROOT;
  if (fromEnv) {
    const d = path.resolve(fromEnv);
    fs.mkdirSync(d, { recursive: true });
    return d;
  }
  const d = path.join(os.tmpdir(), "snappi-preview-mcp", "repos");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function defaultLogsDir(workRoot) {
  return path.join(path.dirname(workRoot), "logs");
}

/** @param {{ workRoot?: string; logsDir?: string } | undefined} overrides */
export function resolvePreviewPaths(overrides = {}) {
  const workRoot = overrides.workRoot
    ? path.resolve(overrides.workRoot)
    : defaultWorkRoot();
  const logsDir = overrides.logsDir
    ? path.resolve(overrides.logsDir)
    : defaultLogsDir(workRoot);
  fs.mkdirSync(workRoot, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  return { workRoot, logsDir };
}

/** @param {string} prUrl */
export function parsePrUrl(prUrl) {
  let u;
  try {
    u = new URL(prUrl.trim());
  } catch {
    throw new Error("Invalid PR URL");
  }
  if (u.hostname !== "github.com") {
    throw new Error("Only github.com PR URLs are supported");
  }
  const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length < 4 || parts[2] !== "pull") {
    throw new Error("Expected URL like https://github.com/owner/repo/pull/123");
  }
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  const pull = parseInt(parts[3], 10);
  if (!owner || !repo || !Number.isFinite(pull)) {
    throw new Error("Could not parse owner/repo/pull from URL");
  }
  return { owner, repo, pull };
}

function githubPullRequestHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Best-effort PR title/body/html_url/headSha from GitHub API (public repos work without token).
 * `headSha` is the commit GitHub shows for the PR head — used to verify local checkout matches preview.
 * @param {string} prUrl
 * @returns {Promise<{
 *   title: string;
 *   body: string;
 *   html_url: string;
 *   headSha: string;
 *   changedFilesCount: number | null;
 *   state: string | null;
 *   merged: boolean | null;
 *   prMissing: boolean;
 *   prHttpStatus: number;
 * }>}
 */
export async function fetchGithubPullMeta(prUrl) {
  let owner;
  let repo;
  let pull;
  const baseEmpty = () => ({
    title: "",
    body: "",
    html_url: "",
    headSha: "",
    changedFilesCount: null,
    state: null,
    merged: null,
    prMissing: false,
    prHttpStatus: 0,
  });
  try {
    ({ owner, repo, pull } = parsePrUrl(prUrl));
  } catch {
    return {
      ...baseEmpty(),
      html_url: String(prUrl || "").trim(),
    };
  }
  const htmlUrl = `https://github.com/${owner}/${repo}/pull/${pull}`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pull}`;
  const headers = githubPullRequestHeaders();
  try {
    const res = await fetch(apiUrl, { headers });
    if (res.status === 404) {
      return {
        ...baseEmpty(),
        html_url: htmlUrl,
        prMissing: true,
        prHttpStatus: 404,
      };
    }
    if (!res.ok) {
      return {
        ...baseEmpty(),
        html_url: htmlUrl,
        prHttpStatus: res.status,
      };
    }
    const j = await res.json();
    const headSha =
      j.head && typeof j.head.sha === "string" ? j.head.sha : "";
    const changedFilesCount =
      typeof j.changed_files === "number" ? j.changed_files : null;
    return {
      title: typeof j.title === "string" ? j.title : "",
      body: typeof j.body === "string" ? j.body : "",
      html_url: typeof j.html_url === "string" ? j.html_url : htmlUrl,
      headSha,
      changedFilesCount,
      state: typeof j.state === "string" ? j.state : null,
      merged: typeof j.merged === "boolean" ? j.merged : null,
      prMissing: false,
      prHttpStatus: 200,
    };
  } catch {
    return {
      ...baseEmpty(),
      html_url: htmlUrl,
      prHttpStatus: 0,
    };
  }
}

/**
 * List files touched by the PR (for UI hints when title/body are vague).
 * Paginates until `maxFiles` paths collected. Needs `GITHUB_TOKEN` for private repos.
 * @param {string} prUrl
 * @param {{ maxFiles?: number; includePatches?: boolean }} [opts]
 * @returns {Promise<{ files: { filename: string; status: string; additions: number; deletions: number; patch?: string }[]; truncated: boolean }>}
 */
export async function fetchGithubPullChangedFiles(prUrl, opts = {}) {
  const includePatches = opts.includePatches === true;
  const maxFiles = Math.min(
    200,
    Math.max(1, typeof opts.maxFiles === "number" ? opts.maxFiles : 60)
  );
  let owner;
  let repo;
  let pull;
  try {
    ({ owner, repo, pull } = parsePrUrl(prUrl));
  } catch {
    return { files: [], truncated: false };
  }
  const headers = githubPullRequestHeaders();
  const files = [];
  let page = 1;
  const maxPages = 15;
  try {
    while (files.length < maxFiles && page <= maxPages) {
      const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pull}/files?per_page=100&page=${page}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        break;
      }
      const arr = await res.json();
      if (!Array.isArray(arr) || arr.length === 0) {
        break;
      }
      for (const f of arr) {
        if (files.length >= maxFiles) {
          return { files, truncated: true };
        }
        if (f?.filename && typeof f.filename === "string") {
          const row = {
            filename: f.filename,
            status: typeof f.status === "string" ? f.status : "modified",
            additions: typeof f.additions === "number" ? f.additions : 0,
            deletions: typeof f.deletions === "number" ? f.deletions : 0,
          };
          if (
            includePatches &&
            typeof f.patch === "string" &&
            f.patch.length > 0
          ) {
            row.patch = f.patch;
          }
          files.push(row);
        }
      }
      if (arr.length < 100) {
        return { files, truncated: false };
      }
      page += 1;
    }
    return { files, truncated: files.length >= maxFiles };
  } catch {
    return { files: [], truncated: false };
  }
}

export function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...options,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...options.env },
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => {
      out += d.toString();
    });
    child.stderr?.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

function detectPackageManager(projectPath) {
  if (fs.existsSync(path.join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(projectPath, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(projectPath, "bun.lockb"))) return "bun";
  return "npm";
}

export function analyzePackageJson(projectPath) {
  const pkgPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { error: "package.json not found", packageManager: "npm" };
  }
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    return { error: "Invalid package.json", packageManager: "npm" };
  }
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };
  let framework = "unknown";
  if (deps.next) framework = "next";
  else if (deps.nuxt) framework = "nuxt";
  else if (deps.vite || deps["@vitejs/plugin-react"]) framework = "vite";
  else if (deps["@vue/cli-service"]) framework = "vue-cli";
  else if (deps["@angular/core"]) framework = "angular";
  else if (deps.react) framework = "react";
  else if (deps.vue) framework = "vue";

  const packageManager = detectPackageManager(projectPath);
  const sc = pkg.scripts || {};
  /** Script *name* (npm run key), not the shell command string in package.json. */
  const suggestedDevScript =
    String(sc.dev ?? "").trim() !== ""
      ? "dev"
      : String(sc.start ?? "").trim() !== ""
        ? "start"
        : String(sc.serve ?? "").trim() !== ""
          ? "serve"
          : "dev";
  return {
    framework,
    packageManager,
    suggestedDevScript,
    scripts: Object.keys(pkg.scripts || {}),
    name: pkg.name,
  };
}

/** True if this folder has a package.json with a plausible dev-server script. */
function hasRunnablePackageJson(dir) {
  const a = analyzePackageJson(dir);
  if (a.error) return false;
  const scripts = a.scripts || [];
  for (const k of scripts) {
    const low = String(k).toLowerCase();
    if (low === "dev" || low === "start" || low === "serve") return true;
    if (/^dev[:._-]/i.test(k) || /^start[:._-]/i.test(k)) return true;
  }
  return false;
}

const MONOREPO_UI_SUBDIRS = [
  "frontend",
  "ui",
  "web",
  "client",
  "console",
  "www",
  "app",
  "packages/frontend",
  "apps/web",
  "apps/frontend",
];

function prFileTouchesSubdir(rel, touchedFiles) {
  const base = String(rel || "").replace(/\/+$/, "");
  if (!base) return 0;
  const prefix = `${base}/`;
  let n = 0;
  for (const f of touchedFiles) {
    const fn = typeof f?.filename === "string" ? f.filename : "";
    if (!fn) continue;
    if (fn === base || fn.startsWith(prefix)) n++;
  }
  return n;
}

/**
 * Use repo root when it has a runnable package.json; else pick a subfolder (e.g. frontend/)
 * that has one, preferring dirs touched by the PR file list.
 * @param {string} repoRoot
 * @param {Array<{ filename?: string }>} touchedFiles
 * @returns {{ dir: string; subPath: string }}
 */
function resolvePreviewProjectDir(repoRoot, touchedFiles) {
  const root = path.resolve(repoRoot);
  const files = Array.isArray(touchedFiles) ? touchedFiles : [];
  if (hasRunnablePackageJson(root)) {
    return { dir: root, subPath: "" };
  }

  const ranked = MONOREPO_UI_SUBDIRS.map((rel) => ({
    rel,
    full: path.join(root, rel),
    score: prFileTouchesSubdir(rel, files),
  }));
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return MONOREPO_UI_SUBDIRS.indexOf(a.rel) - MONOREPO_UI_SUBDIRS.indexOf(b.rel);
  });
  for (const r of ranked) {
    if (hasRunnablePackageJson(r.full)) {
      return { dir: r.full, subPath: r.rel };
    }
  }

  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const extras = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const name = ent.name;
      if (name === "node_modules" || name.startsWith(".")) continue;
      if (MONOREPO_UI_SUBDIRS.includes(name)) continue;
      const full = path.join(root, name);
      extras.push({
        rel: name,
        full,
        score: prFileTouchesSubdir(name, files),
      });
    }
    extras.sort((a, b) => b.score - a.score);
    for (const e of extras) {
      if (hasRunnablePackageJson(e.full)) {
        return { dir: e.full, subPath: e.rel };
      }
    }
  } catch {
    /* ignore */
  }

  return { dir: root, subPath: "" };
}

function isYarnBerryProject(projectPath) {
  const root = path.resolve(projectPath);
  if (fs.existsSync(path.join(root, ".yarnrc.yml"))) return true;
  try {
    const lockPath = path.join(root, "yarn.lock");
    if (fs.existsSync(lockPath)) {
      const head = fs.readFileSync(lockPath, "utf8").slice(0, 600);
      if (/^__metadata:/m.test(head)) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function readPackageManagerField(projectPath) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectPath, "package.json"), "utf8")
    );
    return typeof pkg.packageManager === "string" ? pkg.packageManager : "";
  } catch {
    return "";
  }
}

/**
 * @param {string} pm
 * @param {string} projectPath
 * @returns {{ cmd: string; args: string[] }}
 */
function installCmd(pm, projectPath) {
  const root = path.resolve(projectPath);
  if (pm === "pnpm") return { cmd: "pnpm", args: ["install"] };
  if (pm === "yarn") {
    const pmField = readPackageManagerField(root);
    const berry = isYarnBerryProject(root);
    /** skip-build skips postinstall/prepare (e.g. Kiali husky) — fine for preview. */
    const installArgs = berry ? ["install", "--mode=skip-build"] : ["install"];
    if (/^yarn@[2-9]/i.test(pmField)) {
      return { cmd: "corepack", args: ["yarn", ...installArgs] };
    }
    return { cmd: "yarn", args: installArgs };
  }
  if (pm === "bun") return { cmd: "bun", args: ["install"] };
  return { cmd: "npm", args: ["install"] };
}

/** One-line-ish reason for UI when install fails (npm often prints ERR on stdout). */
function summarizeInstallLog(combined, exitCode, command) {
  const t = String(combined || "").trim();
  const lines = t.split(/\n/).map((l) => l.trimEnd());
  /** Yarn YN0000 is informational; real failures use other YNxxxx codes. */
  const hot = lines.filter((l) =>
    /npm ERR!|npm error|yarn error|error Error:|ERR_PNPM|ERESOLVE|ENOENT|E404|Command failed|error code|EACCES|gyp ERR!/i.test(
      l
    ) || /[➤›]?\s*YN(?!0000)\d{4}:/i.test(l)
  );
  if (hot.length) {
    const pick = hot.slice(-5).join(" · ");
    return pick.length > 320 ? "…" + pick.slice(-320) : pick;
  }
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  if (nonEmpty.length) {
    const last = nonEmpty.slice(-8).join(" ");
    return last.length > 280 ? "…" + last.slice(-280) : last;
  }
  return `${command} exited with code ${exitCode}`;
}

export function writeEnvFile(projectPath, envVarsRaw) {
  if (!envVarsRaw || !String(envVarsRaw).trim()) return;
  const raw = String(envVarsRaw).trim();
  let body;
  if (raw.startsWith("{")) {
    const o = JSON.parse(raw);
    body = Object.entries(o)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join("\n");
  } else {
    body = raw;
  }
  const envPath = path.join(projectPath, ".env");
  fs.writeFileSync(envPath, `${body}\n`, "utf8");
}

async function readGitHead(dest) {
  const r = await run("git", ["rev-parse", "HEAD"], { cwd: dest });
  if (r.code !== 0) return "";
  return r.out.trim();
}

/** Short English message for common git fetch failures (locale-independent UX). */
function humanizeGitFetchError(msg) {
  const m = String(msg || "");
  if (
    /couldn't find remote ref|could not find remote ref|unable to find|找不到远程引用|无法找到远程引用|pull\/\d+\/head/i.test(
      m
    )
  ) {
    return "Could not fetch this PR branch (wrong PR number, deleted PR, or network issue).";
  }
  if (
    /authentication failed|could not read username|repository not found|access denied|not found\b/i.test(
      m
    ) &&
    /401|403|private|denied/i.test(m)
  ) {
    return "Git could not access this repository (private repo or auth).";
  }
  return "";
}

/**
 * @param {string} prUrl
 * @param {PreviewPaths} paths
 * @param {{ expectedHeadSha?: string | null }} [opts]
 */
export async function cloneAndCheckout(prUrl, paths, opts = {}) {
  let owner;
  let repo;
  let pull;
  try {
    ({ owner, repo, pull } = parsePrUrl(prUrl));
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
  const dest = path.join(paths.workRoot, `${owner}-${repo}-pr${pull}`);
  const remote = `https://github.com/${owner}/${repo}.git`;
  const localRef = `snappi-pr-${pull}`;
  const pullRef = `pull/${pull}/head`;
  const expected =
    typeof opts.expectedHeadSha === "string" && opts.expectedHeadSha.length >= 7
      ? opts.expectedHeadSha.trim()
      : null;

  if (!fs.existsSync(path.join(dest, ".git"))) {
    const cl = await run("git", ["clone", "--depth", "1", remote, dest]);
    if (cl.code !== 0) {
      return {
        ok: false,
        step: "clone",
        error: cl.err || cl.out,
      };
    }
  } else {
    await run("git", ["remote", "set-url", "origin", remote], { cwd: dest });
    await run("git", ["fetch", "origin", "--prune"], { cwd: dest });
  }

  // Detach so no branch is checked out; avoids "refusing to fetch into checked-out branch".
  await run("git", ["checkout", "--detach"], { cwd: dest });

  async function fetchPull(depthFlag = null) {
    const args = ["fetch", "origin", pullRef];
    if (depthFlag != null) args.push("--depth", String(depthFlag));
    return run("git", args, { cwd: dest });
  }

  async function checkoutFromFetchHead() {
    return run("git", ["checkout", "-B", localRef, "FETCH_HEAD"], {
      cwd: dest,
    });
  }

  /** Shallow clones often need extra depth so FETCH_HEAD matches GitHub’s PR head after force-push. */
  async function syncWorkingTreeToPr() {
    let fe = await fetchPull(120);
    if (fe.code !== 0) {
      fe = await fetchPull(null);
    }
    if (fe.code !== 0) {
      const msg = `${fe.err || ""}${fe.out || ""}`;
      const authLike =
        /authentication|401|403|could not read Username|Repository not found|not found/i.test(
          msg
        );
      const shortGit = humanizeGitFetchError(msg);
      return {
        ok: false,
        step: "fetch_pr",
        error: shortGit || (fe.err || fe.out).trim(),
        hint: authLike
          ? "For private repos, configure Git (SSH key or gh auth login)."
          : "Quit Snappi, delete the PR cache clone for this repo, and try again.",
      };
    }
    const co = await checkoutFromFetchHead();
    if (co.code !== 0) {
      return { ok: false, step: "checkout", error: co.err || co.out };
    }
    return { ok: true };
  }

  let sync = await syncWorkingTreeToPr();
  if (!sync.ok) return sync;

  if (expected) {
    let head = await readGitHead(dest);
    if (head !== expected) {
      await fetchPull(500);
      await checkoutFromFetchHead();
      head = await readGitHead(dest);
    }
    if (head !== expected) {
      await run("git", ["fetch", "--unshallow"], { cwd: dest });
      const fe2 = await fetchPull(null);
      if (fe2.code === 0) {
        await checkoutFromFetchHead();
        head = await readGitHead(dest);
      }
    }
    if (head !== expected) {
      return {
        ok: false,
        step: "checkout_verify",
        error: `Local HEAD (${head || "?"}) does not match GitHub PR head (${expected.slice(0, 7)}…). Preview would show the wrong code. Delete folder and retry: ${dest}`,
        hint: "Remove that directory (or run Snappi after clearing the PR cache) so clone is fresh; ensure git can reach GitHub.",
      };
    }
  }

  return {
    ok: true,
    path: dest,
    owner,
    repo,
    pull,
  };
}

/**
 * @param {string} projectPath
 * @param {PreviewPaths} _paths
 */
export async function analyzeStack(projectPath, _paths) {
  const resolved = path.resolve(projectPath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `Path not found: ${resolved}` };
  }
  const analysis = analyzePackageJson(resolved);
  return { ok: true, path: resolved, ...analysis };
}

/**
 * @param {string} projectPath
 * @param {PreviewPaths} _paths
 * @param {string} [envVars]
 */
export async function prepareEnv(projectPath, _paths, envVars) {
  const resolved = path.resolve(projectPath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `Path not found: ${resolved}` };
  }
  try {
    if (envVars) writeEnvFile(resolved, envVars);
  } catch (e) {
    return {
      ok: false,
      step: "write_env",
      error: e.message || String(e),
    };
  }

  const { packageManager } = analyzePackageJson(resolved);
  const { cmd, args } = installCmd(packageManager, resolved);
  const installEnv = {
    ...process.env,
    /** CI=true makes npm/yarn treat peer warnings as errors; preview installs should stay lenient. */
    CI: "false",
    npm_config_loglevel: "warn",
  };
  if (packageManager === "npm") {
    installEnv.npm_config_legacy_peer_deps = "true";
  }
  if (packageManager === "yarn") {
    installEnv.YARN_ENABLE_IMMUTABLE_INSTALLS = "false";
    /** Yarn 4+ does not support ignoreEngines / YARN_IGNORE_ENGINES (it errors at startup). */
    installEnv.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";
  }
  let inst = await run(cmd, args, {
    cwd: resolved,
    env: installEnv,
  });
  if (
    inst.code !== 0 &&
    cmd === "corepack" &&
    args[0] === "yarn"
  ) {
    inst = await run("yarn", args.slice(1), {
      cwd: resolved,
      env: installEnv,
    });
  }

  const combined = [inst.err, inst.out].filter(Boolean).join("\n");
  const tail = combined.slice(-8000);
  if (inst.code !== 0) {
    const commandStr = `${cmd} ${args.join(" ")}`;
    return {
      ok: false,
      step: "install",
      packageManager,
      command: commandStr,
      exitCode: inst.code,
      error: summarizeInstallLog(combined, inst.code, commandStr),
      logTail: tail,
    };
  }

  return {
    ok: true,
    packageManager,
    command: `${cmd} ${args.join(" ")}`,
    logTail: tail.slice(-2000),
  };
}

/**
 * @param {string} projectPath
 * @param {PreviewPaths} paths
 * @param {{ port?: number; script?: string }} opts
 */
export async function startPreview(projectPath, paths, opts = {}) {
  const script = opts.script ?? "dev";
  const resolved = path.resolve(projectPath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `Path not found: ${resolved}` };
  }

  try {
    const viteCache = path.join(resolved, "node_modules", ".vite");
    if (fs.existsSync(viteCache)) {
      fs.rmSync(viteCache, { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }

  try {
    const pkgForDist = JSON.parse(
      fs.readFileSync(path.join(resolved, "package.json"), "utf8")
    );
    const devLineForDist = String(pkgForDist.scripts?.[script] ?? "");
    const webpackServeDev =
      /\bwebpack(-cli)?\b/i.test(devLineForDist) &&
      /\bserve\b/i.test(devLineForDist);
    if (!webpackServeDev) {
      const distDir = path.join(resolved, "dist");
      if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
      }
    }
  } catch {
    /* ignore */
  }

  let port =
    typeof opts.port === "number" && opts.port >= 1024 && opts.port <= 65535
      ? opts.port
      : await findFreePort(5173);

  const { packageManager, framework } = analyzePackageJson(resolved);
  let suppressDevServerOpenArgs = [];
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(resolved, "package.json"), "utf8")
    );
    const devLine = String(pkg.scripts?.[script] ?? "");
    const looksVite =
      /\bvite\b/i.test(devLine) || framework === "vite";
    const looksWebpackServe =
      /\bwebpack(-cli)?\b/i.test(devLine) && /\bserve\b/i.test(devLine);
    if (looksVite || looksWebpackServe) {
      suppressDevServerOpenArgs = ["--no-open"];
    }
  } catch {
    /* ignore */
  }

  const logFile = path.join(
    paths.logsDir,
    `${path.basename(resolved)}-${port}.log`
  );
  const fd = fs.openSync(logFile, "a");
  const prev = previewState.get(resolved);
  if (prev?.pid) {
    try {
      process.kill(prev.pid, "SIGTERM");
    } catch {
      /* ignore */
    }
  }

  let cmd;
  let args;
  const hostArg = "127.0.0.1";
  if (packageManager === "pnpm") {
    cmd = "pnpm";
    args = [
      "run",
      script,
      "--",
      "--port",
      String(port),
      "--host",
      hostArg,
      ...suppressDevServerOpenArgs,
    ];
  } else if (packageManager === "yarn") {
    const runArgs = [
      "run",
      script,
      "--",
      "--port",
      String(port),
      "--host",
      hostArg,
      ...suppressDevServerOpenArgs,
    ];
    if (/^yarn@[2-9]/i.test(readPackageManagerField(resolved))) {
      cmd = "corepack";
      args = ["yarn", ...runArgs];
    } else {
      cmd = "yarn";
      args = runArgs;
    }
  } else if (packageManager === "bun") {
    cmd = "bun";
    args = [
      "run",
      script,
      "--",
      "--port",
      String(port),
      "--host",
      hostArg,
      ...suppressDevServerOpenArgs,
    ];
  } else {
    cmd = "npm";
    args = [
      "run",
      script,
      "--",
      "--port",
      String(port),
      "--host",
      hostArg,
      ...suppressDevServerOpenArgs,
    ];
  }

  const child = spawn(cmd, args, {
    cwd: resolved,
    detached: true,
    stdio: ["ignore", fd, fd],
    env: {
      ...process.env,
      PORT: String(port),
      VITE_PORT: String(port),
      HOST: hostArg,
      /** Stops many dev servers (Vite, CRA, etc.) from launching the system browser — Snappi embeds the preview. */
      BROWSER: "none",
    },
    windowsHide: true,
  });
  child.unref();
  fs.closeSync(fd);

  const waitMs = devServerWaitTimeoutMs(resolved, script);
  const ready = await waitForDevServer(port, waitMs);
  if (!ready) {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      /* ignore */
    }
    previewState.delete(resolved);
    const sec = Math.round(waitMs / 1000);
    return {
      ok: false,
      error: `Dev server did not respond on http://127.0.0.1:${port}/ within ${sec}s. Check ${logFile} (wrong port, compile error, or first CRA/webpack build still running — try again after checking the log).`,
    };
  }

  previewState.set(resolved, {
    pid: child.pid,
    port,
    logFile,
    startedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    pid: child.pid,
    port,
    url: `http://127.0.0.1:${port}/`,
    logFile,
  };
}

/** Stop the dev server process for a cloned project (Snappi tab close / quit). */
export function stopPreview(projectPath) {
  const resolved = path.resolve(projectPath);
  const prev = previewState.get(resolved);
  if (prev?.pid) {
    try {
      process.kill(prev.pid, "SIGTERM");
    } catch {
      /* ignore */
    }
  }
  previewState.delete(resolved);
  return { ok: true };
}

/**
 * Full pipeline for Snappi app / agent.
 * @param {string} prUrl
 * @param {{
 *   port?: number;
 *   script?: string;
 *   envVars?: string;
 *   workRoot?: string;
 *   logsDir?: string;
 *   onProgress?: (p: { kind: 'status'; message: string } | { kind: 'log'; text: string }) => void;
 * }} [options]
 */
export async function runPrPreviewPipeline(prUrl, options = {}) {
  const paths = resolvePreviewPaths({
    workRoot: options.workRoot,
    logsDir: options.logsDir,
  });
  const onProgress = options.onProgress ?? (() => {});

  onProgress({
    kind: "status",
    message: "Fetching PR info and changed files from GitHub…",
  });
  const [prMeta, fileListResult] = await Promise.all([
    fetchGithubPullMeta(prUrl),
    fetchGithubPullChangedFiles(prUrl, { maxFiles: 80, includePatches: true }),
  ]);

  if (prMeta.prMissing) {
    throw new Error(
      "Pull request not found. Check the repository and PR number."
    );
  }
  if (prMeta.prHttpStatus === 401 || prMeta.prHttpStatus === 403) {
    throw new Error(
      "GitHub denied access (private repo or rate limit). Set GITHUB_TOKEN or fix credentials."
    );
  }
  if (prMeta.prHttpStatus === 0) {
    throw new Error("Could not reach GitHub. Check your network.");
  }
  if (prMeta.prHttpStatus !== 200) {
    throw new Error(
      `Could not load this pull request from GitHub (HTTP ${prMeta.prHttpStatus}).`
    );
  }
  if (prMeta.state === "closed" && prMeta.merged === false) {
    throw new Error(
      "This pull request is closed without merge. Only open or merged PRs can be previewed."
    );
  }

  const prUxTour = buildPrUxTour(fileListResult.files);
  const prChangedFilesStripped = fileListResult.files.map(
    ({ patch: _p, ...meta }) => meta
  );
  const listedCount = prChangedFilesStripped.length;
  const totalFromApi =
    typeof prMeta.changedFilesCount === "number"
      ? prMeta.changedFilesCount
      : listedCount;
  const prChangedFilesTruncated =
    fileListResult.truncated || totalFromApi > listedCount;

  const prPatternFlyScan = extractPfSlugsFromPrFiles(fileListResult.files, {
    maxFiles: 80,
    maxSlugs: 48,
  });

  onProgress({
    kind: "status",
    message: "Cloning repository and checking out PR branch…",
  });
  const clone = await cloneAndCheckout(prUrl, paths, {
    expectedHeadSha: prMeta.headSha || null,
  });
  if (!clone.ok) {
    const hint = clone.hint ? ` ${clone.hint}` : "";
    const err = clone.error || "Could not set up this repository.";
    throw new Error(`${err}${hint}`);
  }
  const repoRoot = clone.path;
  const resolved = resolvePreviewProjectDir(repoRoot, fileListResult.files);
  const projectPath = resolved.dir;

  const pkgProbe = analyzePackageJson(projectPath);
  if (pkgProbe.error) {
    throw new Error(
      "No package.json in repo root or common UI folders (frontend/, ui/, web/, client/, …)."
    );
  }
  if (!hasRunnablePackageJson(projectPath)) {
    throw new Error(
      "package.json has no dev/start/serve script. Snappi needs a script that starts a local dev server."
    );
  }
  const devScriptName =
    typeof options.script === "string" && options.script.trim()
      ? options.script.trim()
      : pkgProbe.suggestedDevScript || "dev";

  onProgress({
    kind: "status",
    message: resolved.subPath
      ? `Installing dependencies in ${resolved.subPath}/ (monorepo UI)…`
      : `Installing dependencies in ${path.basename(projectPath)}…`,
  });
  const prep = await prepareEnv(projectPath, paths, options.envVars);
  if (!prep.ok) {
    const tail = prep.logTail ? `\n${prep.logTail}` : "";
    const detail = (prep.error && String(prep.error).trim()) || "";
    throw new Error(
      `[${prep.step || "prepare"}] ${
        detail || "install exited with an error (see log tail below)"
      }${tail}`
    );
  }
  if (prep.logTail) {
    onProgress({ kind: "log", text: prep.logTail });
  }

  onProgress({
    kind: "status",
    message:
      typeof options.port === "number" && options.port > 0
        ? `Starting dev server on port ${options.port}…`
        : "Finding a free port (from 5173), then starting dev server…",
  });
  const start = await startPreview(projectPath, paths, {
    port:
      typeof options.port === "number" && options.port > 0
        ? options.port
        : undefined,
    script: devScriptName,
  });
  if (!start.ok) {
    throw new Error(start.error || "start_preview failed");
  }

  const analysis = analyzePackageJson(projectPath);
  return {
    path: projectPath,
    url: start.url,
    port: start.port,
    logFile: start.logFile,
    pid: start.pid,
    framework: analysis.framework,
    packageManager: analysis.packageManager,
    devScript: devScriptName,
    prTitle: prMeta.title,
    prBody: prMeta.body,
    prHtmlUrl: prMeta.html_url,
    prChangedFiles: prChangedFilesStripped,
    prChangedFilesTotal: totalFromApi,
    prChangedFilesTruncated,
    prUxTour,
    prPatternFlySlugs: prPatternFlyScan.slugs,
    prPatternFlyFiles: prPatternFlyScan.filesTouched,
  };
}
