# Snappi

**Snappi** is a desktop app (Electron) for **reviewing GitHub pull requests in a real dev-server preview**: clone the PR branch, install dependencies, run the project’s dev script, and inspect the UI in-app—with **Inspector mode**, **PatternFly-aware hints**, and an optional **AI assistant** for quick DOM tweaks or guided source edits.

Use it when you want to see **what the PR actually does in the browser** without juggling terminals and browser windows by hand.

---

## Features

- **PR preview pipeline** — Parses a `https://github.com/owner/repo/pull/N` URL, fetches the PR head, runs install + dev server (npm / pnpm / yarn / bun), and opens the preview in an embedded view.
- **Multi-tab previews** — Open several PRs side by side in the shell.
- **Inspector mode** — Crosshair pick of DOM nodes; persistent pick highlight; hover vs pick styling; structured context (selector, text sample, PatternFly class tokens, design-token alerts) for review tools.
- **AI assistant panel** — OpenAI-compatible API (cloud or local e.g. Ollama): natural language requests with optional **DOM patches** (preview) and **source edits** (repo files), plus **undo** for preview-only patches.
- **“Open fix PR”** — With `GITHUB_TOKEN`, commit local changes on a branch, push, and open a follow-up GitHub PR (stacked on the PR branch for same-repo PRs).
- **UI** — PatternFly 6–aligned shell; vendored CSS/fonts under `public/vendor/` for offline-friendly layout.

---

## Download & install

Prebuilt artifacts are produced with **electron-builder** (see [Build](#build-from-source)).

- **macOS (Apple Silicon, arm64)** — Grab **`Snappi-*-arm64.dmg`** or **`*-arm64-mac.zip`** from [GitHub Releases](https://github.com/yxing/snappi/releases) (update the org/name if you fork).
- **First launch (macOS)** — Unsigned builds may trigger **Gatekeeper**. Right-click the app → **Open**, or use **System Settings → Privacy & Security** to allow it once. For distribution to others, set up **Apple Developer ID** signing and notarization (see [electron.build code signing](https://www.electron.build/code-signing)).

**Intel Mac / Windows / Linux** — Run `npm run dist` on the target OS or use CI (e.g. matrix build) to generate `x64` installers; this repo’s default `dist/` output on an arm64 Mac is **arm64** only unless you configure targets or build on other runners.

---

## Development

### Prerequisites

- **Node.js 20+**
- **Git** on `PATH` (used for cloning and fix-PR flow)

### Clone and run from source

```bash
git clone https://github.com/yxing/snappi.git
cd snappi
npm install
cp .env.example .env   # optional: configure AI / GitHub
npm start
```

The shell loads **`.env`** from the project root (same folder as `package.json`). Restart the app after changing environment variables.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` / `SNAPPI_OPENAI_BASE_URL` | AI assistant: cloud key or local OpenAI-compatible base URL (e.g. Ollama). |
| `SNAPPI_AI_MODEL` | Model name when using a local or custom endpoint. |
| `GITHUB_TOKEN` | **Optional** for private PR API access, posting PR comments, and **Open fix PR** (needs `repo` scope for classic PATs). |
| `ISSUE_URL` | Optional default issue URL for the web shell (see `server.js` / `npm run web`). |

Copy **`.env.example`** to **`.env`** and fill in values. **Never commit `.env`** (it is gitignored).

---

## Using Snappi (quick flow)

1. Paste a **GitHub PR URL** and start the preview; wait for install + dev server (progress is shown in the shell).
2. Toggle **Inspector mode**, **click** the element you care about (blue pick outline), then open the **AI assistant** if you want help.
3. Use **Send** to chat; Snappi applies **preview patches** and/or **source file edits** when the model returns them.
4. Use **Undo preview** for the last preview-only DOM batch; use Git for persisted file changes.
5. Use **Open fix PR** when you have **real repo changes** and a configured `GITHUB_TOKEN`.

---

## Build from source / packaging

```bash
npm run pack    # unpacked app under dist/ (quick sanity check)
npm run dist    # distributables: macOS .dmg + .zip (on mac), etc.
```

Artifacts appear under **`dist/`** (gitignored). Upload release binaries to **GitHub Releases** for download links.

---

## Repository layout (high level)

| Path | Role |
|------|------|
| `electron/main.js` | Electron main process: BrowserViews, IPC, PR pipeline, AI dock. |
| `electron/*.mjs` | Inspector bootstrap, AI chat, source edits, GitHub fix-PR helper, PatternFly MCP bridge, etc. |
| `public/` | Shell UI, AI dock HTML/CSS/JS, vendored PatternFly + Inter. |
| `snappi-preview-mcp/lib/pipeline.mjs` | Shared git/install/dev-server logic (also used by MCP tooling). |

---

## Security

- Treat **PATs and API keys as secrets**; use `.env` locally and rotate any token that was exposed.
- Preview runs **arbitrary project code** from the PR; only open PRs from sources you trust.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Acknowledgements

- [Electron](https://www.electronjs.org/), [PatternFly](https://www.patternfly.org/), and the open-source projects Snappi previews in your PRs.
