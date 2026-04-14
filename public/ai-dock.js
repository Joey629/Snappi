const root = document.getElementById("aiDockRoot");
const keyHint = document.getElementById("aiDockKeyHint");
const messagesEl = document.getElementById("aiDockMessages");
const inputEl = document.getElementById("aiDockInput");
const metaEl = document.getElementById("aiDockMeta");
const btnSend = document.getElementById("aiDockSend");
const btnClear = document.getElementById("aiDockClear");
const btnFixPr = document.getElementById("aiDockFixPr");
const btnUndoPreview = document.getElementById("aiDockUndoPreview");

/** @type {{ role: string; content: string }[]} */
let history = [];
let sending = false;
/** @type {object | null} */
let pendingPick = null;
let lastPreviewUrl = "";

function pickForAnalyze(pick) {
  if (!pick || typeof pick !== "object") return {};
  const { previewDataUrl: _omit, ...rest } = pick;
  return rest;
}

function renderMessages() {
  if (!messagesEl) return;
  messagesEl.replaceChildren();
  for (const m of history) {
    const div = document.createElement("div");
    div.className = `ai-dock__bubble ai-dock__bubble--${
      m.role === "user" ? "user" : "assistant"
    }`;
    div.textContent = m.content;
    messagesEl.appendChild(div);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/** AI panel is fixed to the right strip (Electron layout). */
async function ensureRightDockLayout() {
  try {
    await window.snappi?.setAiDockMode?.("right");
  } catch {
    /* ignore */
  }
}

async function buildChangedFilesPreview() {
  try {
    const payload = await window.snappi?.listPreviewTabs?.();
    const tabs = payload?.tabs ?? [];
    const ac = tabs.find((t) => t.active) || tabs[tabs.length - 1];
    const files = Array.isArray(ac?.changedFiles) ? ac.changedFiles : [];
    return files
      .slice(0, 50)
      .map((f) => (typeof f?.filename === "string" ? f.filename : ""))
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

async function sendMessage() {
  if (!window.snappi?.inspectorAiChat || sending) return;
  const text = inputEl?.value?.trim() || "";
  if (!text) return;
  sending = true;
  if (inputEl) inputEl.value = "";
  history.push({ role: "user", content: text });
  renderMessages();
  if (metaEl) {
    metaEl.hidden = false;
    metaEl.textContent = "Thinking…";
  }
  if (btnSend) btnSend.disabled = true;
  try {
    const changedFilesPreview = await buildChangedFilesPreview();
    const r = await window.snappi.inspectorAiChat({
      messages: history.map((x) => ({ role: x.role, content: x.content })),
      pick: pendingPick ? pickForAnalyze(pendingPick) : null,
      pageUrl: lastPreviewUrl,
      changedFilesPreview,
    });
    if (!r?.ok) {
      history.push({
        role: "assistant",
        content: `Could not complete the request: ${r?.error || "unknown error"}`,
      });
      renderMessages();
      if (metaEl) {
        metaEl.hidden = true;
        metaEl.textContent = "";
      }
      return;
    }
    history.push({ role: "assistant", content: r.reply || "" });
    renderMessages();
    if (metaEl) {
      metaEl.hidden = true;
      metaEl.textContent = "";
    }
    const metaParts = [];
    if (Array.isArray(r.patches) && r.patches.length) {
      const ar = await window.snappi.applyDomPatches(r.patches);
      if (ar?.ok && ar.result) {
        const res = ar.result;
        const appliedN = Array.isArray(res.applied) ? res.applied.length : 0;
        const errN = Array.isArray(res.errors) ? res.errors.length : 0;
        if (appliedN > 0) {
          metaParts.push(
            errN > 0
              ? `Preview: applied ${appliedN} DOM patch(es); ${errN} selector(s) missed.`
              : `Preview: applied ${appliedN} DOM patch(es).`
          );
        }
      }
    }
    if (Array.isArray(r.sourceEdits) && r.sourceEdits.length) {
      const sr = await window.snappi.applySourceEdits(r.sourceEdits);
      if (sr?.ok && sr.result?.applied?.length) {
        metaParts.push(`Repo: saved ${sr.result.applied.length} file(s).`);
      }
    }
    if (metaEl && metaParts.length) {
      metaEl.hidden = false;
      metaEl.textContent = metaParts.join(" ");
    }
  } catch (e) {
    history.push({
      role: "assistant",
      content: `Error: ${e?.message || String(e)}`,
    });
    renderMessages();
    if (metaEl) {
      metaEl.hidden = true;
      metaEl.textContent = "";
    }
  } finally {
    sending = false;
    if (btnSend) btnSend.disabled = false;
  }
}

function clearChat() {
  history = [];
  if (inputEl) inputEl.value = "";
  if (metaEl) {
    metaEl.hidden = true;
    metaEl.textContent = "";
  }
  renderMessages();
}

btnSend?.addEventListener("click", () => void sendMessage());
btnClear?.addEventListener("click", () => clearChat());
btnFixPr?.addEventListener("click", async () => {
  if (!window.snappi?.createAiFixupPr) return;
  if (metaEl) {
    metaEl.hidden = false;
    metaEl.textContent = "Creating branch and PR…";
  }
  if (btnFixPr) btnFixPr.disabled = true;
  try {
    const r = await window.snappi.createAiFixupPr();
    if (metaEl) {
      if (r?.ok && r.pullRequestUrl) {
        metaEl.textContent = "Opened fix PR in browser.";
        await window.snappi.openExternal?.(r.pullRequestUrl);
      } else {
        metaEl.textContent = r?.error || "Could not open fix PR.";
      }
    }
  } catch (e) {
    if (metaEl) {
      metaEl.hidden = false;
      metaEl.textContent = `Fix PR failed: ${e?.message || String(e)}`;
    }
  } finally {
    if (btnFixPr) btnFixPr.disabled = false;
  }
});
btnUndoPreview?.addEventListener("click", async () => {
  if (!window.snappi?.undoLastDomPatches) return;
  if (metaEl) {
    metaEl.hidden = false;
    metaEl.textContent = "Undoing…";
  }
  try {
    const r = await window.snappi.undoLastDomPatches();
    const res = r?.result;
    if (metaEl) {
      if (r?.ok && res?.ok) {
        metaEl.textContent =
          res.undone > 0
            ? `Preview: undone last change (${res.undone} node(s)).`
            : "Preview: nothing to undo.";
      } else {
        metaEl.textContent =
          res?.error ||
          r?.error ||
          "Could not undo (reload preview if this persists).";
      }
    }
  } catch (e) {
    if (metaEl) {
      metaEl.hidden = false;
      metaEl.textContent = `Undo failed: ${e?.message || String(e)}`;
    }
  }
});
inputEl?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey) return;
  e.preventDefault();
  void sendMessage();
});

window.snappi?.onInspectorPick?.((payload) => {
  pendingPick = payload;
});

window.snappi?.onPreviewTabsUpdated?.((payload) => {
  const tabs = payload?.tabs ?? [];
  const ac = tabs.find((t) => t.active) || tabs[tabs.length - 1];
  lastPreviewUrl = ac?.url ? String(ac.url) : "";
});

void (async function boot() {
  try {
    const cfg = await window.snappi?.getConfig?.();
    if (keyHint) {
      keyHint.hidden = Boolean(cfg?.hasAiProvider);
    }
  } catch {
    /* ignore */
  }
  try {
    const initial = await window.snappi?.listPreviewTabs?.();
    const tabs = initial?.tabs ?? [];
    const ac = tabs.find((t) => t.active) || tabs[tabs.length - 1];
    if (ac?.url) lastPreviewUrl = String(ac.url);
  } catch {
    /* ignore */
  }
  await ensureRightDockLayout();
})();
