/**
 * Heuristic "alerts" for inspector picks: possible hardcoded values vs tokens.
 *
 * Important: computed styles are **always resolved** (e.g. `var(--pf-*)` → `rgb()`),
 * so literal-looking hex/px is **not** proof the author bypassed tokens. We suppress
 * color/spacing/PF-var nags when the pick looks like PatternFly / PF CSS-variable
 * context to avoid “everything is wrong” noise.
 */

/** PatternFly design foundations (stable entry points for "View Skill" links). */
export const PF_SKILL_URLS = {
  spacing: "https://www.patternfly.org/design-foundations/spacers",
  color: "https://www.patternfly.org/design-foundations/colors",
  fill: "https://www.patternfly.org/design-foundations/colors",
  radius: "https://www.patternfly.org/tokens/all-tokens",
  implementation: "https://www.patternfly.org/developer-resources/global-css-variables",
  tokens: "https://www.patternfly.org/tokens/all-tokens",
};

/** @param {string} v */
function looksLikeRawColor(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s || s === "inherit" || s === "transparent" || s === "currentcolor")
    return false;
  if (s.startsWith("var(")) return false;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return true;
  if (/^rgba?\(/.test(s)) return true;
  if (/^hsla?\(/.test(s)) return true;
  return false;
}

/** @param {string} v */
function looksLikeRawPxSpacing(v) {
  const s = String(v || "").trim();
  if (!s || s === "auto" || s === "inherit") return false;
  if (s.includes("var(")) return false;
  const parts = s.split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  for (const p of parts) {
    if (!/^-?[\d.]+px$/.test(p)) return false;
  }
  const allZero = parts.every((p) => /^-?0(?:\.0+)?px$/i.test(p));
  if (allZero) return false;
  return true;
}

/**
 * When PF classes or --pf-* custom props appear, computed rgb/px usually comes from
 * resolved tokens — flagging “literals” from computed style alone is misleading.
 * @param {unknown} pick
 */
function isLikelyPatternFlyDesignContext(pick) {
  if (pick?.patternFlyDesignContext === true) return true;
  const pf = Array.isArray(pick?.patternFlyClassTokens)
    ? pick.patternFlyClassTokens
    : [];
  if (pf.length) return true;
  const vars = Array.isArray(pick?.cssCustomProperties)
    ? pick.cssCustomProperties
    : [];
  return vars.some((x) => /^--pf-/i.test(String(x)));
}

/** @param {string} raw */
function suggestSpacingTokenDisplay(raw) {
  const parts = String(raw || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstPx = parts.find((p) => /^-?[\d.]+px$/.test(p)) || parts[0] || "";
  const n = parseFloat(firstPx);
  if (Number.isNaN(n)) {
    return {
      canonical: "16px",
      expectedLabel: '16px ($spacing-md or var(--pf-global--spacer--md))',
    };
  }
  const canon = [4, 8, 12, 16, 24, 32, 48, 64];
  let best = canon[0];
  for (const c of canon) {
    if (Math.abs(c - n) < Math.abs(best - n)) best = c;
  }
  const tokenByN = {
    4: "$spacing-xs",
    8: "$spacing-sm",
    12: "$spacing-minor",
    16: "$spacing-md",
    24: "$spacing-lg",
    32: "$spacing-xl",
    48: "$spacing-2xl",
    64: "$spacing-3xl",
  };
  const token = tokenByN[best] || "$spacing-md";
  return {
    canonical: `${best}px`,
    expectedLabel: `${best}px (${token})`,
  };
}

/**
 * @param {unknown} pick
 * @returns {Array<Record<string, unknown>>}
 */
export function runDesignTokenAlerts(pick) {
  const computed =
    pick?.computed && typeof pick.computed === "object" ? pick.computed : {};
  const alerts = [];
  const pfContext = isLikelyPatternFlyDesignContext(pick);

  const color = computed.color;
  if (!pfContext && looksLikeRawColor(color)) {
    alerts.push({
      level: "info",
      code: "COLOR_LITERAL",
      title: "Color may be a literal value",
      body: `computed color: ${color}. Prefer design tokens or CSS variables when your system defines them.`,
      semanticId: "color",
      currentValue: String(color),
      expectedValue:
        "Design token (e.g. $color-status-error or var(--pf-global--palette-red-50))",
      skillLabel: "View Skill: Color system ↗",
      skillUrl: PF_SKILL_URLS.color,
    });
  }

  const bg = computed["background-color"];
  if (!pfContext && looksLikeRawColor(bg)) {
    alerts.push({
      level: "info",
      code: "BG_LITERAL",
      title: "Background color may be a literal",
      body: `background-color: ${bg}`,
      semanticId: "fill",
      currentValue: String(bg),
      expectedValue:
        "Semantic fill token (e.g. var(--pf-global--BackgroundColor--100))",
      skillLabel: "View Skill: Color system ↗",
      skillUrl: PF_SKILL_URLS.fill,
    });
  }

  for (const key of ["margin", "padding"]) {
    const v = computed[key];
    if (!pfContext && v && looksLikeRawPxSpacing(v)) {
      const sug = suggestSpacingTokenDisplay(v);
      alerts.push({
        level: "info",
        code: "SPACING_LITERAL",
        title: `${key} uses pixel literals`,
        body: `${key}: ${v} — compare with your design system spacer scale.`,
        semanticId: "spacing",
        currentValue: String(v).trim(),
        expectedValue: sug.expectedLabel,
        skillLabel: "View Skill: Spacing system ↗",
        skillUrl: PF_SKILL_URLS.spacing,
      });
      break;
    }
  }

  const n = Number(pick?.inlineStyleDeclarationCount || 0);
  if (n > 0) {
    alerts.push({
      level: "info",
      code: "INLINE_STYLE",
      title: "Element has inline styles",
      body: `${n} inline declaration(s). Inline styles can bypass tokens and are harder to theme.`,
      semanticId: "implementation",
      currentValue: `${n} inline declaration(s)`,
      expectedValue: "Styles in classes or design-system utilities",
      skillLabel: "View Skill: Global CSS variables ↗",
      skillUrl: PF_SKILL_URLS.implementation,
    });
  }

  // Dropped PF_CLASS_NO_PF_VAR: same resolution issue — leaf nodes rarely show --pf in
  // extracted vars even when tokens were used.

  return alerts.slice(0, 12);
}
