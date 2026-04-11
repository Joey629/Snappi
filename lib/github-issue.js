const ISSUE_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/i;

/** Issue or pull request page URL (GitHub treats PRs as issues in the API). */
const THREAD_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)\/?$/i;

export function parseIssueUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const m = trimmed.match(ISSUE_RE);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: m[3] };
}

export function parseGithubThreadUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const m = trimmed.match(THREAD_RE);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: m[3] };
}

export async function githubFetch(pathname, token) {
  const url = `https://api.github.com${pathname}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Snappi-local-review",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text || res.statusText };
  }
  if (!res.ok) {
    const msg =
      body?.message || body?.error || res.statusText || "GitHub API error";
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function loadIssueFromUrl(issuePageUrl, token) {
  const parsed = parseGithubThreadUrl(issuePageUrl);
  if (!parsed) {
    const err = new Error(
      "Invalid GitHub URL. Expected: .../issues/123 or .../pull/123"
    );
    err.status = 400;
    throw err;
  }
  const { owner, repo, number } = parsed;
  const [issue, comments] = await Promise.all([
    githubFetch(`/repos/${owner}/${repo}/issues/${number}`, token),
    githubFetch(
      `/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`,
      token
    ),
  ]);
  return {
    parsed: { owner, repo, number },
    issue,
    comments: Array.isArray(comments) ? comments : [],
  };
}
