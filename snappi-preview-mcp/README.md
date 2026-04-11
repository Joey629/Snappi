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

## Snappi 桌面应用（已内嵌）

Snappi **不再依赖 Cursor** 即可跑同一流水线：在桌面版输入 GitHub **PR** 链接后，点 **「Run PR dev server」**。Electron 主进程直接 `import` 本目录下的 `lib/pipeline.mjs`（与 MCP 共用逻辑），克隆到 `userData/pr-preview/repos`，日志在 `userData/pr-preview/logs`。

Snappi 桌面版已去掉 Docker 线程 UI，只保留 **Run PR dev server**（本机真实项目 dev，如 5173）。

## Snappi “内嵌 + 桥接” 后续

- **Electron** 仍可额外启动 stdio MCP sidecar：`node snappi-preview-mcp/src/index.js`（给 Cursor 用）。
- **容器 + 反向代理**：将来可在 sidecar 内起隔离环境，把 dev 端口代理到 **webview**。
