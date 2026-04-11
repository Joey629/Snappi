/**
 * PatternFly MCP: stdio client to @patternfly/patternfly-mcp (npx).
 * Tools: searchPatternFlyDocs, usePatternFlyDocs (see patternfly-mcp docs).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let mcpClient = null;
let connecting = null;

function toolResultText(result) {
  if (!result?.content) return "";
  return result.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n\n");
}

export async function warmPatternFlyMcp() {
  try {
    await ensureMcpClient();
  } catch {
    /* non-fatal at startup */
  }
}

async function ensureMcpClient() {
  if (mcpClient) return mcpClient;
  if (connecting) return connecting;
  const c = new Client({ name: "snappi", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["-y", "@patternfly/patternfly-mcp@latest"],
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
    stderr: "ignore",
  });
  connecting = (async () => {
    await c.connect(transport);
    mcpClient = c;
    connecting = null;
    return c;
  })();
  try {
    return await connecting;
  } catch (e) {
    connecting = null;
    mcpClient = null;
    throw e;
  }
}

export async function shutdownPatternFlyMcp() {
  try {
    await mcpClient?.close();
  } catch {
    /* ignore */
  }
  mcpClient = null;
  connecting = null;
}

/** PF v5 global spacers at default 16px root (approx). */
const PF5_SPACERS = [
  { token: "--pf-v5-global--spacer--xs", px: 4 },
  { token: "--pf-v5-global--spacer--sm", px: 8 },
  { token: "--pf-v5-global--spacer--md", px: 16 },
  { token: "--pf-v5-global--spacer--lg", px: 24 },
  { token: "--pf-v5-global--spacer--xl", px: 32 },
  { token: "--pf-v5-global--spacer--2xl", px: 48 },
];

/** PF v6 uses the same scale; token names use --pf-v6-global--… */
const PF6_SPACERS = [
  { token: "--pf-v6-global--spacer--xs", px: 4 },
  { token: "--pf-v6-global--spacer--sm", px: 8 },
  { token: "--pf-v6-global--spacer--md", px: 16 },
  { token: "--pf-v6-global--spacer--lg", px: 24 },
  { token: "--pf-v6-global--spacer--xl", px: 32 },
  { token: "--pf-v6-global--spacer--2xl", px: 48 },
];

function spacerTableForClassName(className) {
  return /\bpf-v6-/i.test(String(className)) ? PF6_SPACERS : PF5_SPACERS;
}

function nearestSpacer(px, table) {
  const spacers = table || PF5_SPACERS;
  let best = spacers[0];
  let d = Math.abs(px - best.px);
  for (const s of spacers) {
    const dd = Math.abs(px - s.px);
    if (dd < d) {
      d = dd;
      best = s;
    }
  }
  return { ...best, delta: d };
}

function parsePxTokens(str) {
  if (!str || str === "none" || str === "auto") return [];
  return String(str)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = t.match(/^([\d.]+)px$/i);
      return m ? Number(m[1]) : null;
    })
    .filter((n) => n != null && !Number.isNaN(n));
}

function analyzeSpacing(computed, className) {
  const table = spacerTableForClassName(className);
  const ver = table === PF6_SPACERS ? "v6" : "v5";
  const insights = [];
  /** margin, padding, gap — all map to PatternFly global spacer scale when expressed in px. */
  const keys = ["margin", "padding", "gap"];
  for (const k of keys) {
    const raw = computed?.[k];
    if (!raw) continue;
    for (const px of parsePxTokens(raw)) {
      if (px === 0) continue;
      const { token, px: canon, delta } = nearestSpacer(px, table);
      if (delta > 1) {
        insights.push({
          level: "warning",
          title: `Non-standard ${k}: ${px}px`,
          body: `Prefer \`var(${token})\` (~${canon}px) — closest PF ${ver} global spacer.`,
        });
      }
    }
  }
  return insights;
}

const PF_ORG_ORIGIN = "https://www.patternfly.org";

/**
 * @typedef {{ slug: string; kind: "component" | "layout" | "utility" }} PfDocTarget
 * @param {string} className
 * @returns {PfDocTarget | null}
 */
function pfDocTargetFromClassName(className) {
  const s = String(className);
  let m = s.match(
    /\bpf-(?:(?:v5|v6)-)?c-([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)\b/i
  );
  if (m) return { slug: m[1], kind: "component" };
  m = s.match(
    /\bpf-(?:(?:v5|v6)-)?l-([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)\b/i
  );
  if (m) return { slug: m[1], kind: "layout" };
  m = s.match(
    /\bpf-(?:(?:v5|v6)-)?u-([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)\b/i
  );
  return m ? { slug: m[1], kind: "utility" } : null;
}

/** @returns {string | null} */
function pfSlugFromClassName(className) {
  return pfDocTargetFromClassName(className)?.slug ?? null;
}

/**
 * Best-effort official docs URL when MCP text does not include one.
 * @param {string} slug
 * @param {PfDocTarget["kind"]} kind
 */
function buildPatternFlyDocUrl(slug, kind) {
  if (!slug) return null;
  if (kind === "layout") return `${PF_ORG_ORIGIN}/layouts/${slug}`;
  if (kind === "utility") return `${PF_ORG_ORIGIN}/utilities/${slug}`;
  return `${PF_ORG_ORIGIN}/components/${slug}`;
}

/** @param {string} slug @param {PfDocTarget["kind"]} kind */
function pfDocsPathSegment(slug, kind) {
  if (kind === "layout") return `layouts/${slug}`;
  if (kind === "utility") return `utilities/${slug}`;
  return `components/${slug}`;
}

/**
 * @param {{ slug: string; kind: PfDocTarget["kind"] } | null} target
 * @param {string} docTopicName
 */
function buildOfficialDocLabel(target, docTopicName) {
  if (!target?.slug) return "Open PatternFly documentation";
  const pathSeg = pfDocsPathSegment(target.slug, target.kind);
  return `Open patternfly.org/${pathSeg} (${docTopicName})`;
}

/**
 * Prefer links returned by PatternFly MCP; fall back to constructed topic URL.
 * @param {string[]} chunks
 * @returns {string | null}
 */
function extractPatternFlyOrgUrlFromMcpText(...chunks) {
  const text = chunks.filter(Boolean).join("\n");
  const re =
    /https:\/\/(?:www\.)?patternfly\.org\/[a-z0-9][a-z0-9/._-]*/gi;
  const raw = text.match(re) || [];
  const clean = (u) => u.replace(/[.,;:!?)\]'">]+$/u, "");
  const urls = [...new Set(raw.map(clean))];
  const pick =
    urls.find((u) => /\/components\//i.test(u)) ||
    urls.find((u) => /\/layouts\//i.test(u)) ||
    urls.find((u) => /\/utilities\//i.test(u)) ||
    urls.find((u) => /\/patterns\//i.test(u)) ||
    urls[0];
  return pick || null;
}

/** First concrete PF class token (for MCP search disambiguation, esp. v6). */
function primaryPfClassToken(className) {
  const m = String(className).match(
    /\bpf-(?:(?:v5|v6)-[clu]-|c-)[a-z0-9_-]+/i
  );
  return m ? m[0] : "";
}

export function slugToDocName(slug) {
  return String(slug || "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Sync summary for inspector UI (no MCP round-trip).
 * @param {string} className
 */
export function describePfPick(className) {
  const cn = String(className || "");
  const isPf = /\bpf-(?:v[56]-|c-)/i.test(cn);
  if (!isPf) {
    return {
      isPf: false,
      identity: null,
      notPfMessage:
        "No PatternFly component classes (`pf-v6-*`, `pf-v5-*`, `pf-c-*`) on this element.",
    };
  }
  const target = pfDocTargetFromClassName(cn);
  const primary = primaryPfClassToken(cn);
  if (!target) {
    return {
      isPf: true,
      identity: {
        displayName: "Unmapped",
        kind: "unknown",
        pathSeg: "",
        docUrl: `${PF_ORG_ORIGIN}/`,
        docLabel: "Open PatternFly",
        primaryClass: primary,
        hint: "Pick a node with a clearer `pf-*-c-*` class to map to one doc topic.",
      },
    };
  }
  const docTopicName = slugToDocName(target.slug);
  const docPathSeg = pfDocsPathSegment(target.slug, target.kind);
  const docUrl = buildPatternFlyDocUrl(target.slug, target.kind) || `${PF_ORG_ORIGIN}/`;
  let hint = `Maps to PatternFly ${target.kind} “${docTopicName}” (not your PR title).`;
  if (String(target.slug).toLowerCase() === "title") {
    hint =
      "PatternFly “Title” = typography component for headings, not the page title.";
  }
  return {
    isPf: true,
    identity: {
      displayName: docTopicName,
      kind: target.kind,
      pathSeg: docPathSeg,
      docUrl,
      docLabel: buildOfficialDocLabel(target, docTopicName),
      primaryClass: primary,
      hint,
    },
  };
}

/**
 * Auto “green checks” from the DOM snapshot (not hover simulation).
 * @param {{ tag?: string; textSample?: string; attrs?: Record<string, unknown> }} pick
 * @returns {{ id: string; label: string }[]}
 */
function collectPfPassesFromPick(pick) {
  const passes = [];
  const tag = String(pick?.tag || "").toLowerCase();
  const attrs =
    pick?.attrs && typeof pick.attrs === "object" ? pick.attrs : {};
  const text = String(pick?.textSample || "").trim();
  const hasName =
    text.length > 0 ||
    String(attrs.ariaLabel || "").trim().length > 0 ||
    String(attrs.ariaLabelledby || "").trim().length > 0;
  if (tag === "button" && hasName) {
    passes.push({
      id: "acc-name",
      label: "Control has an accessible name (visible text or aria).",
    });
  }
  if (tag === "a") {
    const h = String(attrs.href != null ? attrs.href : "").trim();
    if (h && !/^javascript:/i.test(h)) {
      passes.push({
        id: "a-href",
        label: "Link has a real href.",
      });
    }
  }
  if (tag === "img" && attrs.alt != null) {
    passes.push({
      id: "img-alt",
      label: "Image has an alt attribute (use alt=\"\" if decorative).",
    });
  }
  if (tag === "input") {
    const ty = String(attrs.type || "text").toLowerCase();
    if (
      !["hidden", "button", "submit", "reset", "image"].includes(ty) &&
      hasName
    ) {
      passes.push({
        id: "input-name",
        label: "Field appears labeled (text or aria).",
      });
    }
  }
  return passes;
}

function identityHintFromTarget(target, docTopicName, mcpUsed) {
  if (!target?.slug) {
    return mcpUsed
      ? "Could not map one topic — try a child with a clearer `pf-*` class."
      : "MCP offline; link is a best guess.";
  }
  if (String(target.slug).toLowerCase() === "title") {
    return "“Title” = PatternFly heading component, not the page title.";
  }
  return `Docs path: ${pfDocsPathSegment(target.slug, target.kind)}`;
}

/**
 * Rule-based handoff text for designers / a future LLM (pick + MCP doc text).
 * @param {{ tag?: string; className?: string; textSample?: string }} pick
 * @param {string} docSnippet
 * @param {string} docTopicName
 */
export function buildPickNextStepsTemplate(
  pick,
  docSnippet,
  docTopicName,
  docPathSegment
) {
  const tag = pick?.tag ? String(pick.tag) : "element";
  const cls = String(pick?.className || "").trim().slice(0, 260);
  const text = String(pick?.textSample || "").trim().slice(0, 180);
  const excerpt = String(docSnippet || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 1200);
  const topic = (docTopicName || "this PatternFly component").trim();
  const pathLine = docPathSegment
    ? `Official doc path: patternfly.org/${docPathSegment} (${topic}).`
    : `PatternFly topic: ${topic}.`;
  let out = "";
  out += `${pathLine} If the topic name looks odd (e.g. “Title”), it is the PatternFly component name, not your page title.\n\n`;
  out += `Selected element:\n`;
  out += `- Tag: <${tag}>`;
  if (cls) out += `\n- Classes: ${cls}`;
  if (text) out += `\n- Visible text: "${text}"`;
  out += `\n\n`;
  if (excerpt) {
    out += `Excerpt from PatternFly docs (via MCP):\n${excerpt}\n\n`;
  } else {
    out += `(No doc excerpt returned from MCP for this pick.)\n\n`;
  }
  out += `Suggested next step: Compare structure, spacing tokens, and accessibility with the official PatternFly page linked above — then adjust implementation or capture feedback for the team.`;
  return out;
}

/**
 * Batch searchPatternFlyDocs for PR-scanned component slugs (sequential + small delay to be gentle on MCP).
 * @param {string[]} slugs
 * @param {{ maxSlugs?: number; delayMs?: number }} [opts]
 */
export async function batchPatternFlySearchForSlugs(slugs, opts = {}) {
  const maxSlugs = opts.maxSlugs ?? 12;
  const delayMs = opts.delayMs ?? 150;
  const unique = [
    ...new Set(
      (slugs || [])
        .map((s) => String(s || "").toLowerCase().trim())
        .filter(Boolean)
    ),
  ].slice(0, maxSlugs);

  if (!unique.length) {
    return { items: [], markdown: "" };
  }

  const c = await ensureMcpClient();
  /** @type {{ slug: string; title: string; excerpt: string; docUrl: string }[]} */
  const items = [];

  for (const slug of unique) {
    const title = slugToDocName(slug);
    let excerpt = "";
    let docUrl = `${PF_ORG_ORIGIN}/components/${encodeURI(slug)}`;
    try {
      const searchRes = await c.callTool({
        name: "searchPatternFlyDocs",
        arguments: { searchQuery: `${title} ${slug}` },
      });
      const searchText = toolResultText(searchRes);
      excerpt = searchText.replace(/\s+/g, " ").trim().slice(0, 420);
      const fromMcp = extractPatternFlyOrgUrlFromMcpText(searchText);
      if (fromMcp) docUrl = fromMcp;
    } catch (e) {
      excerpt = `(Search failed: ${String(e?.message || e).slice(0, 120)})`;
    }
    items.push({ slug, title, excerpt, docUrl });
    await new Promise((r) => setTimeout(r, delayMs));
  }

  const lines = items.map((i) => {
    const bit = i.excerpt ? ` — ${i.excerpt}` : "";
    return `- **${i.title}** — [PatternFly docs](${i.docUrl})${bit}`;
  });
  const markdown = `### PatternFly touchpoints in this PR\n\n${lines.join("\n")}\n`;

  return { items, markdown };
}

async function fetchDocsForPick(className) {
  const c = await ensureMcpClient();
  const target = pfDocTargetFromClassName(className);
  const slug = target?.slug ?? null;
  const primary = primaryPfClassToken(className);
  const searchQuery = slug ? slugToDocName(slug) : "PatternFly";
  const mcpSearch =
    slug && primary
      ? `${searchQuery} ${primary}`
      : primary || (slug ? searchQuery : "PatternFly");
  const searchRes = await c.callTool({
    name: "searchPatternFlyDocs",
    arguments: { searchQuery: mcpSearch },
  });
  const searchText = toolResultText(searchRes).slice(0, 4000);

  let docText = "";
  if (slug) {
    const tryNames = [
      slugToDocName(slug),
      slug
        .split("-")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(""),
    ];
    for (const name of tryNames) {
      try {
        const useRes = await c.callTool({
          name: "usePatternFlyDocs",
          arguments: { name },
        });
        docText = toolResultText(useRes).slice(0, 7000);
        if (docText.length > 200) break;
      } catch {
        /* try next */
      }
    }
  }

  const fromMcp = extractPatternFlyOrgUrlFromMcpText(searchText, docText);
  const fallback =
    target && slug ? buildPatternFlyDocUrl(slug, target.kind) : null;
  const suggestedUrl = fromMcp || fallback || `${PF_ORG_ORIGIN}/`;

  return { searchText, docText, searchQuery, suggestedUrl };
}

/**
 * @param {{ className?: string; computed?: Record<string,string>; tag?: string; selector?: string }} pick
 */
export async function runPatternFlyAudit(pick) {
  const className = pick.className || "";
  const computed = pick.computed || {};
  const passes = collectPfPassesFromPick(pick);

  const isPf = /\bpf-(?:v[56]-|c-)/i.test(className);
  if (!isPf) {
    return {
      identity: null,
      notPfMessage:
        "No PatternFly classes on this pick — doc mapping and spacer checks apply only to `pf-v6-*` / `pf-v5-*` / `pf-c-*` nodes.",
      anomalies: [],
      passes,
      insights: [],
      docSnippet: "",
      mcpUsed: false,
      nextStepsTemplate: "",
    };
  }

  let docSnippet = "";
  let mcpUsed = true;
  const target = pfDocTargetFromClassName(className);
  /** @type {{ level: string; title: string; body: string }[]} */
  const anomalies = [];
  let suggestedUrl = "";
  try {
    const r = await fetchDocsForPick(className);
    docSnippet = [r.docText, r.searchText].filter(Boolean).join("\n\n---\n\n");
    suggestedUrl = r.suggestedUrl || "";
  } catch (e) {
    mcpUsed = false;
    anomalies.push({
      level: "warning",
      title: "PatternFly MCP unavailable",
      body: String(e?.message || e),
    });
    if (target?.slug) {
      const fb = buildPatternFlyDocUrl(target.slug, target.kind);
      if (fb) suggestedUrl = fb;
    }
  }

  const docUrl =
    suggestedUrl ||
    (target?.slug
      ? buildPatternFlyDocUrl(target.slug, target.kind)
      : "") ||
    `${PF_ORG_ORIGIN}/`;
  const docTopicName = target?.slug
    ? slugToDocName(target.slug)
    : "PatternFly";
  const docPathSeg = target?.slug
    ? pfDocsPathSegment(target.slug, target.kind)
    : "";

  anomalies.push(...analyzeSpacing(computed, className));

  const identity = {
    displayName: docTopicName,
    kind: target?.kind ?? "component",
    pathSeg: docPathSeg,
    docUrl,
    docLabel: buildOfficialDocLabel(target, docTopicName),
    primaryClass: primaryPfClassToken(className),
    hint: identityHintFromTarget(target, docTopicName, mcpUsed),
    mcpReachable: mcpUsed,
  };

  const nextStepsTemplate = buildPickNextStepsTemplate(
    pick,
    docSnippet.slice(0, 12000),
    docTopicName,
    docPathSeg
  );

  return {
    identity,
    notPfMessage: null,
    anomalies,
    passes,
    insights: [],
    docSnippet: docSnippet.slice(0, 12000),
    mcpUsed,
    nextStepsTemplate,
  };
}
