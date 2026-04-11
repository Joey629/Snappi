/**
 * Rule-based UX / a11y hints from a single inspector pick (no cloud).
 * Conservative: prefer informational items over false-positive warnings.
 */

/**
 * @param {Record<string, unknown> | undefined} attrs
 * @param {string} [textSample]
 */
function hasAccessibleName(attrs, textSample) {
  if (String(textSample || "").trim().length > 0) return true;
  if (String(attrs?.ariaLabel || "").trim().length > 0) return true;
  if (String(attrs?.ariaLabelledby || "").trim().length > 0) return true;
  return false;
}

/**
 * @param {string} tag
 * @param {Record<string, unknown> | undefined} attrs
 */
function isFocusableHeuristic(tag, attrs) {
  const t = String(tag || "").toLowerCase();
  if (attrs?.disabled === true) return false;
  if (t === "button" || t === "select" || t === "textarea") return true;
  if (t === "a") {
    const h = String(attrs?.href || "").trim();
    return h.length > 0 && !/^javascript:/i.test(h);
  }
  if (t === "input") {
    const ty = String(attrs?.type || "text").toLowerCase();
    if (ty === "hidden") return false;
    return true;
  }
  const role = String(attrs?.role || "").toLowerCase();
  if (
    (role === "button" || role === "link" || role === "checkbox") &&
    hasAccessibleName(attrs, "")
  ) {
    /* still need tabIndex for div role=button — weak */
  }
  const ti = attrs?.tabIndex;
  if (ti != null && ti !== "") {
    const n = parseInt(String(ti), 10);
    if (!Number.isNaN(n) && n >= 0) return true;
  }
  if (role === "button" || role === "tab") return true;
  return false;
}

/** @param {string | undefined} v */
function outlineLooksRemoved(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (!s || s === "none") return true;
  const m = s.match(/^([\d.]+)px/u);
  if (m && parseFloat(m[1]) === 0) return true;
  return false;
}

/** @param {string | undefined} w */
function parsePx(w) {
  const m = String(w || "").match(/^([\d.]+)px$/u);
  if (!m) return null;
  return parseFloat(m[1]);
}

/**
 * @param {{
 *   tag?: string;
 *   className?: string;
 *   textSample?: string;
 *   computed?: Record<string,string>;
 *   rect?: { x?: number; y?: number; width?: number; height?: number };
 *   attrs?: Record<string, unknown>;
 *   viewport?: { width?: number; height?: number };
 * }} pick
 * @returns {{ id: string; category: string; level: string; title: string; detail: string }[]}
 */
export function runUiReviewHeuristics(pick) {
  /** @type {{ id: string; category: string; level: string; title: string; detail: string }[]} */
  const items = [];
  const tag = String(pick?.tag || "").toLowerCase();
  const attrs = pick?.attrs && typeof pick.attrs === "object" ? pick.attrs : {};
  const text = String(pick?.textSample || "").trim();
  const cs = pick?.computed && typeof pick.computed === "object" ? pick.computed : {};
  const rect = pick?.rect && typeof pick.rect === "object" ? pick.rect : {};
  const vw = Math.max(0, Number(pick?.viewport?.width) || 0);
  const vh = Math.max(0, Number(pick?.viewport?.height) || 0);
  const rw = Number(rect.width) || 0;
  const rh = Number(rect.height) || 0;

  const push = (id, category, level, title, detail) => {
    items.push({ id, category, level, title, detail });
  };

  if (!tag) {
    return items;
  }

  /* —— A11y —— */
  if (tag === "img") {
    const altRaw = attrs.alt;
    if (altRaw == null) {
      push(
        "a11y-img-alt-missing",
        "a11y",
        "warn",
        "Image may be missing alternative text",
        "This <img> has no `alt` attribute. Add a short description, or use `alt=\"\"` only if the image is purely decorative."
      );
    }
  }

  if (tag === "button" && !hasAccessibleName(attrs, text)) {
    push(
      "a11y-button-name",
      "a11y",
      "warn",
      "Button may lack an accessible name",
      "Screen readers need visible text, `aria-label`, or `aria-labelledby`. Icon-only buttons usually need `aria-label`."
    );
  }

  if (tag === "a") {
    const href = String(attrs.href != null ? attrs.href : "").trim();
    if (!href || href === "#") {
      push(
        "a11y-a-href",
        "a11y",
        "warn",
        "Link has no real destination",
        "Empty or lone `#` links are often used as buttons; consider `<button type=\"button\">` or a real URL."
      );
    } else if (/^javascript:/i.test(href)) {
      push(
        "a11y-a-js-href",
        "a11y",
        "info",
        "javascript: URL on a link",
        "Prefer real URLs or buttons with click handlers for security and accessibility."
      );
    }
  }

  if (String(attrs.ariaHidden || "").toLowerCase() === "true") {
    push(
      "a11y-aria-hidden",
      "a11y",
      "info",
        "Element is hidden from assistive tech",
      "`aria-hidden=\"true\"` removes this node from the accessibility tree. Ensure no important controls or text are inside."
    );
  }

  if (isFocusableHeuristic(tag, attrs)) {
    const oc = outlineLooksRemoved(cs.outline);
    const osw = parsePx(cs["outline-offset"]);
    if (oc && osw !== null && osw <= 0) {
      push(
        "a11y-focus-ring",
        "a11y",
        "info",
        "Focus indicator may be hard to see",
        "Outline is removed or very tight. Confirm :focus-visible still shows a clear ring for keyboard users."
      );
    } else if (oc) {
      push(
        "a11y-focus-ring",
        "a11y",
        "info",
        "Focus indicator may be removed",
        "`outline: none` is common but risky unless you provide a visible :focus-visible style."
      );
    }
  }

  if (tag === "input") {
    const ty = String(attrs.type || "text").toLowerCase();
    const skip = new Set([
      "hidden",
      "button",
      "submit",
      "reset",
      "image",
      "checkbox",
      "radio",
    ]);
    if (!skip.has(ty)) {
      const ph = String(attrs.placeholder || "").trim();
      if (!hasAccessibleName(attrs, text) && !ph) {
        push(
          "a11y-input-label",
          "a11y",
          "info",
          "Consider an explicit label for this field",
          "Placeholder alone is a weak label. Prefer `<label for=…>` or `aria-label` / `aria-labelledby`."
        );
      }
    }
  }

  /* —— Interaction —— */
  const interactiveTag =
    tag === "button" ||
    tag === "a" ||
    tag === "input" ||
    tag === "select" ||
    tag === "textarea" ||
    String(attrs.role || "").toLowerCase() === "button";
  if (interactiveTag && !attrs.disabled) {
    const cur = String(cs.cursor || "").toLowerCase();
    if (cur && cur !== "pointer" && cur !== "default" && tag === "a") {
      /* links often default — skip */
    } else if (
      cur &&
      cur !== "pointer" &&
      (tag === "button" || String(attrs.role || "").toLowerCase() === "button")
    ) {
      push(
        "ix-cursor",
        "interaction",
        "info",
        "Cursor may not signal clickability",
        "Buttons often use `cursor: pointer` so users recognize them as clickable (pattern varies by design system)."
      );
    }
  }

  const op = parseFloat(String(cs.opacity || "1")) || 1;
  if (interactiveTag && op < 0.45) {
    push(
      "ix-opacity",
      "interaction",
      "info",
      "Low opacity on an interactive control",
      "Very transparent controls can look disabled. Confirm hover/focus/disabled states are distinct."
    );
  }

  if (attrs.disabled === true) {
    push(
      "ix-disabled",
      "interaction",
      "info",
      "Control is disabled",
      "Verify disabled styling (contrast, cursor, tooltip) matches your design system and intent."
    );
  }

  /* —— Responsive —— */
  if (vw > 0 && rw > vw * 0.92) {
    push(
      "resp-wide",
      "responsive",
      "info",
      "Element spans most of the viewport width",
      "On narrow screens this may cause horizontal scroll or cramped content. Try the mobile viewport preset in Snappi."
    );
  }

  const cw = parsePx(cs.width);
  if (vw > 0 && vw < 480 && cw != null && cw > vw) {
    push(
      "resp-fixed-overflow",
      "responsive",
      "warn",
      "Fixed width may overflow on small viewports",
      `Computed width is about ${Math.round(cw)}px while the preview is ~${Math.round(vw)}px wide.`
    );
  }

  if (vw > 0 && vw < 600 && interactiveTag && rw > 0 && rh > 0 && rw < 40 && rh < 40) {
    push(
      "resp-touch-target",
      "responsive",
      "info",
      "Small tap target on a narrow preview",
      "Many HIGs recommend ~44×44px minimum touch targets on mobile; this control appears smaller at the current preview width."
    );
  }

  /* —— Copy / content —— */
  if (text.length > 220) {
    push(
      "copy-long",
      "copy",
      "info",
      "Long visible text in one node",
      "Check truncation, wrapping, and how this reads on small screens."
    );
  }

  const tt = String(cs["text-transform"] || "").toLowerCase();
  if (text.length > 15 && tt === "uppercase") {
    push(
      "copy-allcaps-style",
      "copy",
      "info",
      "Uppercase styling on a longer string",
      "All-caps can hurt readability; confirm it matches voice guidelines."
    );
  }

  if (tag === "button" || tag === "a") {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length === 0 && !hasAccessibleName(attrs, "")) {
      /* already covered for button; for empty link with href maybe ok */
    } else if (t.length > 0 && t.length < 2) {
      push(
        "copy-short-label",
        "copy",
        "info",
        "Very short control label",
        "Single-character labels can be ambiguous; ensure meaning is clear in context."
      );
    }
  }

  return items;
}
