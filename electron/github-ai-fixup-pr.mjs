import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { parsePrUrl } from "../snappi-preview-mcp/lib/pipeline.mjs";

const execFileAsync = promisify(execFile);

/**
 * @param {string} cwd
 * @param {string[]} args
 * @param {{ maxBuffer?: number }} [opts]
 */
async function runGit(cwd, args, opts = {}) {
  const maxBuffer = opts.maxBuffer ?? 12 * 1024 * 1024;
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      maxBuffer,
      encoding: "utf8",
    });
    return {
      ok: true,
      out: `${stdout || ""}${stderr || ""}`.trimEnd(),
    };
  } catch (e) {
    const stdout = e?.stdout ? String(e.stdout) : "";
    const stderr = e?.stderr ? String(e.stderr) : "";
    const msg = `${stderr || ""}${stdout || ""}`.trim() || e?.message || String(e);
    return { ok: false, error: msg.slice(0, 4000) };
  }
}

/**
 * @param {string} prUrl
 * @param {string} token
 */
async function fetchPullJson(prUrl, token) {
  let owner;
  let repo;
  let pull;
  try {
    ({ owner, repo, pull } = parsePrUrl(prUrl.trim()));
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pull}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(apiUrl, { headers });
    const raw = await res.text();
    if (!res.ok) {
      let msg = raw.slice(0, 400);
      try {
        const j = JSON.parse(raw);
        msg = j.message || msg;
      } catch {
        /* ignore */
      }
      return { ok: false, error: msg || `HTTP ${res.status}` };
    }
    const j = JSON.parse(raw);
    const headRef = j.head?.ref && typeof j.head.ref === "string" ? j.head.ref : "";
    const baseRef = j.base?.ref && typeof j.base.ref === "string" ? j.base.ref : "";
    const headRepoFull =
      j.head?.repo?.full_name && typeof j.head.repo.full_name === "string"
        ? j.head.repo.full_name
        : "";
    let headOwnerLogin =
      j.head?.repo?.owner?.login && typeof j.head.repo.owner.login === "string"
        ? j.head.repo.owner.login
        : "";
    if (!headOwnerLogin && headRepoFull.includes("/")) {
      headOwnerLogin = headRepoFull.split("/")[0];
    }
    const title = typeof j.title === "string" ? j.title : "";
    const htmlUrl = typeof j.html_url === "string" ? j.html_url : "";
    if (!headRef || !headRepoFull || !baseRef) {
      return { ok: false, error: "Incomplete PR metadata from GitHub API." };
    }
    return {
      ok: true,
      owner,
      repo,
      pull,
      title,
      htmlUrl,
      headRef,
      baseRef,
      headRepoFull,
      headOwnerLogin,
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Commit current working tree changes and open a GitHub PR (stacked on the PR branch when same-repo).
 *
 * @param {{ projectPath: string; prUrl: string }} opts
 */
export async function createAiFixupPullRequest(opts) {
  const projectPath =
    typeof opts.projectPath === "string" ? path.resolve(opts.projectPath) : "";
  const prUrl = typeof opts.prUrl === "string" ? opts.prUrl.trim() : "";
  const token = process.env.GITHUB_TOKEN?.trim() || "";

  if (!projectPath || !prUrl) {
    return { ok: false, error: "Missing project path or PR URL." };
  }
  if (!token) {
    return {
      ok: false,
      error:
        "Set GITHUB_TOKEN (PAT with repo scope) to push branches and create pull requests.",
    };
  }

  const st = await runGit(projectPath, ["status", "--porcelain=v1"]);
  if (!st.ok) return { ok: false, error: st.error || "git status failed" };
  const lines = (st.out || "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);
  if (lines.length === 0) {
    return {
      ok: false,
      error:
        "No file changes in the preview repo. Preview-only DOM tweaks are not saved to disk — ask the assistant for source edits, or edit files yourself, then try again.",
    };
  }

  const meta = await fetchPullJson(prUrl, token);
  if (!meta.ok) return { ok: false, error: meta.error || "GitHub API error" };

  const targetRepoFull = `${meta.owner}/${meta.repo}`;
  const sameRepo = meta.headRepoFull === targetRepoFull;
  /** Stacked PR into the existing PR branch when both sides are the same repo; otherwise merge into the original base (e.g. main). */
  const baseBranch = sameRepo ? meta.headRef : meta.baseRef;
  const branchName = `snappi-ai-fixup-${Date.now()}`;

  const curBr = await runGit(projectPath, ["branch", "--show-current"]);
  const branchBefore = curBr.ok ? curBr.out.trim() : "";

  const co = await runGit(projectPath, ["checkout", "-b", branchName]);
  if (!co.ok) {
    return {
      ok: false,
      error: `Could not create branch: ${co.error || ""}`,
    };
  }

  const add = await runGit(projectPath, ["add", "-A"]);
  if (!add.ok) {
    if (branchBefore) await runGit(projectPath, ["checkout", branchBefore]);
    await runGit(projectPath, ["branch", "-D", branchName]);
    return { ok: false, error: add.error || "git add failed" };
  }

  const commitMsg = `Snappi: AI assistant fixup

Follow-up for ${meta.htmlUrl || prUrl} (#${meta.pull}).
`;
  const ci = await runGit(projectPath, ["commit", "-m", commitMsg]);
  if (!ci.ok) {
    if (branchBefore) await runGit(projectPath, ["checkout", branchBefore]);
    await runGit(projectPath, ["branch", "-D", branchName]);
    return {
      ok: false,
      error:
        ci.error?.includes("nothing to commit") || ci.error?.includes("nothing added")
          ? "No changes to commit (check .gitignore or file permissions)."
          : ci.error || "git commit failed",
    };
  }

  const pushUrl = `https://x-access-token:${encodeURIComponent(token)}@github.com/${meta.headRepoFull}.git`;
  let pu = await runGit(projectPath, ["push", pushUrl, `HEAD:refs/heads/${branchName}`]);
  if (!pu.ok) {
    await runGit(projectPath, ["fetch", "--unshallow"], { maxBuffer: 24 * 1024 * 1024 });
    pu = await runGit(projectPath, ["push", pushUrl, `HEAD:refs/heads/${branchName}`]);
  }
  if (!pu.ok) {
    return {
      ok: false,
      error: `git push failed: ${pu.error || ""}`.slice(0, 2000),
    };
  }

  const headParam = sameRepo ? branchName : `${meta.headOwnerLogin}:${branchName}`;
  const createUrl = `https://api.github.com/repos/${meta.owner}/${meta.repo}/pulls`;
  const prTitle = `Snappi AI fixup for #${meta.pull}`;
  const prBody = `Automated follow-up from [Snappi](https://github.com/Joey629/Snappi) preview / AI assistant.

- Related PR: ${meta.htmlUrl || prUrl}
- Original PR title: ${meta.title || "(untitled)"}

_Base branch for this PR: \`${baseBranch}\` (${sameRepo ? "stacked on the PR head branch" : "fork PR — opens against the same target branch as the original PR"})._
`;

  try {
    const res = await fetch(createUrl, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: prTitle,
        body: prBody,
        head: headParam,
        base: baseBranch,
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      let msg = raw.slice(0, 800);
      try {
        const j = JSON.parse(raw);
        msg = Array.isArray(j.errors)
          ? j.errors.map((e) => e.message || "").filter(Boolean).join("; ") || j.message
          : j.message || msg;
      } catch {
        /* ignore */
      }
      return { ok: false, error: msg || `Create PR failed (HTTP ${res.status})` };
    }
    const created = JSON.parse(raw);
    const newUrl = typeof created.html_url === "string" ? created.html_url : "";
    return {
      ok: true,
      pullRequestUrl: newUrl,
      branchName,
      baseBranch,
      headParam,
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
