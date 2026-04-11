import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { parseGithubThreadUrl, loadIssueFromUrl } from "./lib/github-issue.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const DEFAULT_ISSUE_URL = process.env.ISSUE_URL || "";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json({ defaultIssueUrl: DEFAULT_ISSUE_URL || null });
});

app.get("/api/parse", (req, res) => {
  const url = req.query.url || "";
  const parsed = parseGithubThreadUrl(url);
  if (!parsed) {
    return res.status(400).json({
      error:
        "Invalid GitHub URL. Expected: .../issues/123 or .../pull/123",
    });
  }
  res.json(parsed);
});

app.get("/api/issue", async (req, res) => {
  const url = req.query.url || "";
  try {
    const payload = await loadIssueFromUrl(url, GITHUB_TOKEN);
    res.json(payload);
  } catch (e) {
    const status =
      e.status && e.status >= 400 && e.status < 600 ? e.status : 502;
    res.status(status).json({ error: e.message || "Request failed" });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Snappi listening on http://localhost:${PORT}`);
  if (DEFAULT_ISSUE_URL) {
    // eslint-disable-next-line no-console
    console.log(`Default issue URL: ${DEFAULT_ISSUE_URL}`);
  }
});
