/**
 * OpenAI-compatible chat for inspector: structured reply + DOM patches.
 * Supports OpenAI Cloud and local servers (Ollama, LM Studio, etc.).
 */

const DEFAULT_CLOUD_MODEL = "gpt-4o-mini";
const DEFAULT_LOCAL_MODEL = "llama3.2";
const MAX_MESSAGES = 12;

/**
 * Resolve API URL and headers from environment.
 * Local base URLs (localhost / SNAPPI_AI_LOCAL=1) do not require an API key.
 */
export function resolveInspectorAiEndpoint() {
  const base = (
    process.env.SNAPPI_OPENAI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1"
  )
    .trim()
    .replace(/\/$/, "");

  const key = (process.env.OPENAI_API_KEY || process.env.SNAPPI_OPENAI_API_KEY || "").trim();

  const looksLocal =
    process.env.SNAPPI_AI_LOCAL === "1" ||
    /127\.0\.0\.1|localhost|0\.0\.0\.0/i.test(base);

  const url = `${base}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  else if (!looksLocal) {
    return {
      ok: false,
      error:
        "Set OPENAI_API_KEY (or SNAPPI_OPENAI_API_KEY), or point SNAPPI_OPENAI_BASE_URL at a local OpenAI-compatible server (e.g. Ollama at http://127.0.0.1:11434/v1) and restart Snappi.",
    };
  }

  const defaultModel = looksLocal
    ? process.env.SNAPPI_AI_MODEL || DEFAULT_LOCAL_MODEL
    : DEFAULT_CLOUD_MODEL;

  return {
    ok: true,
    url,
    headers,
    useJsonObjectMode: !looksLocal,
    defaultModel,
  };
}

export function isInspectorAiConfigured() {
  return resolveInspectorAiEndpoint().ok === true;
}

/**
 * @param {object} pick
 * @param {string} [pageUrl]
 * @param {{ changedFilesPreview?: string }} [opts]
 */
function buildSystemPrompt(pick, pageUrl, opts = {}) {
  const pickJson = pick
    ? JSON.stringify(
        (() => {
          const p = { ...pick };
          delete p.previewDataUrl;
          return p;
        })(),
        null,
        2
      ).slice(0, 12000)
    : "(none — user has not picked an element yet)";
  const filesHint =
    typeof opts.changedFilesPreview === "string" && opts.changedFilesPreview.trim()
      ? `\nPR changed files (hint — prefer these paths when editing source):\n${opts.changedFilesPreview.trim().slice(0, 8000)}\n`
      : "";

  const fileContexts = Array.isArray(opts.fileContexts) ? opts.fileContexts : [];
  const snippetsBlock =
    fileContexts.length > 0
      ? `\n**Repository file snippets (READ-ONLY — copy oldText from these verbatim for sourceEdits):**\n${fileContexts
          .map(
            (f) =>
              `\n<<< FILE ${String(f.path).replace(/>>>|<<</g, "")} >>>\n${String(f.content || "").slice(0, 16000)}\n<<< END FILE >>>\n`
          )
          .join("\n")}\n`
      : "";

  return `You are Snappi's in-app UI assistant. The user is reviewing a pull request in a BrowserView preview.

Current preview URL: ${pageUrl || "(unknown)"}
${filesHint}${snippetsBlock}
Last picked element (CSS selector + snapshot fields):
${pickJson}

**Two mechanisms:**

1) **"patches"** — instant, preview-only (may be overwritten on the next React render). Each patch targets **pick.selector** or another valid CSS selector.
   - **text** — replace element textContent.
   - **style** — inline style object (camelCase keys).
   - **attributes** — setAttribute for each pair. Use **title** for native browser tooltip (hover). Use **data-*** for data attributes.
   - **classList** — { "add": ["pf-v6-c-…"], "remove": ["…"] } to add/remove CSS classes on the node (PatternFly / utility classes).

2) **"sourceEdits"** — persist changes: replace **exactly one** occurrence of **oldText** with **newText** in **path** (repo-relative, forward slashes). **oldText** must match the real file **byte-for-byte** — when snippets are provided above, **copy-paste** the smallest unique span from them. Use this for real components (e.g. PatternFly **Tooltip**, new JSX, imports).

**Rules for sourceEdits:**
- If file snippets are present, never invent oldText — quote from snippets.
- Paths must exist under the repo; prefer changed-file paths from the hint.
- If you cannot match uniquely, return [] and explain in "reply".

**Action bias:** Quick hover text / color / class on the picked node → **patches** (title, classList, attributes). Real PatternFly components / imports / new elements → **sourceEdits**.

**React note:** Preview DOM patches can be lost on re-render; durable UI needs sourceEdits.

Respond with a single JSON object ONLY (no markdown fences, no prose outside JSON). Schema:
{
  "reply": "Brief message in the user's language.",
  "patches": [
    {
      "selector": "css selector",
      "text": "optional",
      "style": { },
      "attributes": { "title": "optional native tooltip" },
      "classList": { "add": ["class-a"], "remove": [] }
    }
  ],
  "sourceEdits": [
    { "path": "relative/path.tsx", "oldText": "exact unique substring from file", "newText": "replacement" }
  ]
}

Rules:
- Keep "reply" short.
- Each patch needs at least one of: text, style, attributes, classList (non-empty add/remove).
- "sourceEdits" may be [].
- Never claim code was saved unless you return valid sourceEdits.`;
}

/**
 * @param {string} text
 */
export function parseInspectorAiJson(text) {
  const t = String(text || "").trim();
  if (!t) throw new Error("Empty model response");
  let inner = t;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) inner = fence[1].trim();
  /** @type {Record<string, unknown>} */
  let parsed;
  try {
    parsed = JSON.parse(inner);
  } catch {
    const brace = t.match(/\{[\s\S]*\}/);
    if (!brace) throw new Error("Response is not valid JSON");
    parsed = JSON.parse(brace[0]);
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON shape");
  const reply = typeof parsed.reply === "string" ? parsed.reply : "";
  const patches = Array.isArray(parsed.patches) ? parsed.patches : [];
  const sourceEdits = Array.isArray(parsed.sourceEdits)
    ? parsed.sourceEdits
    : [];
  return { reply, patches, sourceEdits };
}

/**
 * @param {{ role: string; content: string }[]} messages
 * @param {object | null} pick
 * @param {string} [pageUrl]
 * @param {string} [model]
 * @param {string} [changedFilesPreview]
 */
export async function runInspectorAiChat({
  messages,
  pick,
  pageUrl,
  model,
  changedFilesPreview,
  fileContexts,
}) {
  const ep = resolveInspectorAiEndpoint();
  if (!ep.ok) {
    throw new Error(ep.error);
  }

  const m =
    typeof model === "string" && model.trim()
      ? model.trim()
      : ep.defaultModel;

  const trimmed = (Array.isArray(messages) ? messages : [])
    .filter((x) => x && typeof x.content === "string")
    .slice(-MAX_MESSAGES)
    .map((x) => ({
      role: x.role === "assistant" ? "assistant" : "user",
      content: String(x.content).slice(0, 12000),
    }));

  const hasFileSnippets = Array.isArray(fileContexts) && fileContexts.length > 0;
  const body = {
    model: m,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(pick, pageUrl, {
          changedFilesPreview,
          fileContexts: hasFileSnippets ? fileContexts : undefined,
        }),
      },
      ...trimmed,
    ],
    temperature: 0.35,
    max_tokens: hasFileSnippets ? 6144 : 4096,
  };

  if (ep.useJsonObjectMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(ep.url, {
    method: "POST",
    headers: ep.headers,
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw.slice(0, 500);
    try {
      const j = JSON.parse(raw);
      detail = j.error?.message || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Chat API HTTP ${res.status}`);
  }

  const data = JSON.parse(raw);
  const content = data.choices?.[0]?.message?.content;
  return parseInspectorAiJson(content);
}

/**
 * @param {unknown[]} patches
 */
export function sanitizeDomPatches(patches) {
  if (!Array.isArray(patches)) return [];
  const out = [];
  for (let i = 0; i < patches.length && out.length < 20; i++) {
    const p = patches[i];
    if (!p || typeof p !== "object") continue;
    const selector = String(p.selector || "").trim().slice(0, 2000);
    if (!selector) continue;
    /** @type {{ selector: string; text?: string; style?: Record<string,string>; attributes?: Record<string,string>; classList?: { add: string[]; remove: string[] } }} */
    const row = { selector };
    if (p.text != null) row.text = String(p.text).slice(0, 20000);
    if (p.style && typeof p.style === "object") {
      const st = {};
      for (const [k, v] of Object.entries(p.style)) {
        if (typeof k === "string" && k.length < 80 && typeof v === "string") {
          st[k.slice(0, 80)] = v.slice(0, 2000);
        }
      }
      if (Object.keys(st).length) row.style = st;
    }
    if (p.attributes && typeof p.attributes === "object") {
      const at = {};
      for (const [k, v] of Object.entries(p.attributes)) {
        if (typeof k === "string" && k && typeof v === "string") {
          at[k.slice(0, 80)] = v.slice(0, 4000);
        }
      }
      if (Object.keys(at).length) row.attributes = at;
    }
    if (p.classList && typeof p.classList === "object") {
      const cl = /** @type {{ add?: unknown; remove?: unknown }} */ (p.classList);
      const add = [];
      const remove = [];
      if (Array.isArray(cl.add)) {
        for (const c of cl.add) {
          if (typeof c !== "string") continue;
          const s = c.trim().slice(0, 128);
          if (/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(s) && add.length < 16) add.push(s);
        }
      }
      if (Array.isArray(cl.remove)) {
        for (const c of cl.remove) {
          if (typeof c !== "string") continue;
          const s = c.trim().slice(0, 128);
          if (/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(s) && remove.length < 16)
            remove.push(s);
        }
      }
      if (add.length || remove.length) row.classList = { add, remove };
    }
    const hasPatch =
      row.text != null ||
      row.style ||
      row.attributes ||
      row.classList;
    if (!hasPatch) continue;
    out.push(row);
  }
  return out;
}
