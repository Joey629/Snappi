# Snappi Preview MCP (Step 1)

Standalone **Model Context Protocol** server with four tools for the “PR → clone → stack → install → dev server” pipeline. Intended to be:

1. **Now:** wired into **Cursor** (or any MCP client) for agent-driven local preview.
2. **Later:** launched by **Snappi Electron** (“In-App Preview”) as a **sidecar** process, with optional **container isolation** and **reverse proxy → webview** (your Step 2–3).

## Security

This Step 1 build runs **`git` and package managers on your host** in `SNAPPI_MCP_WORK_ROOT` (default: system temp). Only clone repos you trust. Production Snappi integration should run the same tools **inside an isolated container**.

## Tools

| Tool | Role |
|------|------|
| `clone_and_checkout` | Parse `pr_url`, `git clone`, `fetch pull/N/head`, checkout |
| `analyze_stack` | Read `package.json` + lockfiles → framework guess, package manager, dev script |
| `prepare_env` | Optional `.env` (dotenv lines or JSON), then `npm/pnpm/yarn/bun install` |
| `start_preview` | Detached `npm run <script>`; opens **`http://localhost:PORT/`** (omit `port` to auto from 5173 for parallel PRs); logs to file |

## Setup

```bash
cd snappi-preview-mcp
npm install
```

## Cursor MCP config

Use an **absolute path** to `src/index.js` on your machine.

**macOS / Linux** (`~/.cursor/mcp.json` or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "snappi-preview": {
      "command": "node",
      "args": ["/Users/yxing/UXD-demo/Snappi/snappi-preview-mcp/src/index.js"]
    }
  }
}
```

Restart Cursor after saving.

## Environment

| Variable | Meaning |
|----------|---------|
| `SNAPPI_MCP_WORK_ROOT` | Parent directory for clones (default: `$TMPDIR/snappi-preview-mcp/repos`) |
| Logs | Written under `$SNAPPI_MCP_WORK_ROOT/../logs` when using default root |

## Limits (Step 1)

- **Next.js / custom dev CLIs** may ignore `--port` / `--host`; check `logFile` from `start_preview` or run the dev command manually.
- **Private repos** need working `git` credentials on the machine.
- **Env / API** for apps like `dev-portal-OCP`: use `prepare_env` with real keys or a follow-up **mock/MSW** tool (your roadmap).

## Snappi desktop app (embedded)

The Snappi desktop app runs the same pipeline **without requiring Cursor**: paste a GitHub **PR** URL and click **Run PR dev server**. The Electron main process imports `lib/pipeline.mjs` from this directory (shared with MCP), clones into `userData/pr-preview/repos`, and writes logs under `userData/pr-preview/logs`.

The desktop UI no longer includes the Docker thread UI; it only offers **Run PR dev server** for a real local dev server (e.g. port 5173).

## Embedded + bridge (future)

- **Electron** can still launch the stdio MCP sidecar: `node snappi-preview-mcp/src/index.js` (e.g. for Cursor).
- **Containers + reverse proxy**: a future sidecar could run an isolated environment and proxy the dev port into the **webview**.
