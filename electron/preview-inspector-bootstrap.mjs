/**
 * Injected into the preview page (main world) after load.
 * Depends on window.__SNAPPI_INSPECTOR_BRIDGE__ from preview-preload.cjs
 */
export const PREVIEW_INSPECTOR_BOOTSTRAP = `
(function () {
  if (window.__snappiInspectorInstalled) return;
  window.__snappiInspectorInstalled = true;
  var bridge = window.__SNAPPI_INSPECTOR_BRIDGE__;
  if (!bridge || typeof bridge.reportPick !== "function") return;

  var mode = false;
  var highlight = document.createElement("div");
  highlight.id = "__snappi_inspect_hl";
  highlight.setAttribute("data-snappi-overlay", "1");
  var hs = highlight.style;
  hs.position = "fixed";
  hs.pointerEvents = "none";
  /* Hover = amber dashed — stronger when nothing picked, softer while a pick exists (see applyHoverChrome). */
  hs.border = "2px dashed #d97706";
  hs.background = "rgba(217,119,6,0.14)";
  /* Hover outline — below pick so a large row-hover never paints over a tiny selection. */
  hs.zIndex = "2147483646";
  hs.display = "none";
  hs.boxSizing = "border-box";
  hs.borderRadius = "2px";

  /** Persists after click so the user always sees which node is the current pick (live UI). */
  var pickHighlight = document.createElement("div");
  pickHighlight.id = "__snappi_inspect_pick";
  pickHighlight.setAttribute("data-snappi-overlay", "1");
  var ps = pickHighlight.style;
  ps.position = "fixed";
  ps.pointerEvents = "none";
  /* Picked / locked selection = solid blue, stronger fill (always on top). */
  ps.border = "3px solid #1d4ed8";
  ps.background = "rgba(29,78,216,0.2)";
  ps.zIndex = "2147483647";
  ps.display = "none";
  ps.boxSizing = "border-box";
  ps.borderRadius = "2px";

  var pickedElement = null;
  var pickResizeObs = null;
  var pickPositionTimer = null;

  function ensurePickHighlightParent() {
    if (!pickHighlight.parentNode) {
      (document.body || document.documentElement).appendChild(pickHighlight);
    }
  }

  function stopPickHighlightTracking() {
    pickedElement = null;
    ps.display = "none";
    applyHoverChrome();
    if (pickResizeObs) {
      try {
        pickResizeObs.disconnect();
      } catch (eObs) {
        /* ignore */
      }
      pickResizeObs = null;
    }
    if (pickPositionTimer) {
      clearInterval(pickPositionTimer);
      pickPositionTimer = null;
    }
  }

  function updatePickHighlightRect() {
    if (!pickedElement) {
      ps.display = "none";
      return;
    }
    try {
      if (!pickedElement.isConnected) {
        stopPickHighlightTracking();
        return;
      }
    } catch (e0) {
      stopPickHighlightTracking();
      return;
    }
    var r = pickedElement.getBoundingClientRect();
    ensurePickHighlightParent();
    ps.display = "block";
    ps.left = r.left + "px";
    ps.top = r.top + "px";
    ps.width = r.width + "px";
    ps.height = r.height + "px";
  }

  function startPickHighlightTracking(el) {
    stopPickHighlightTracking();
    pickedElement = el;
    updatePickHighlightRect();
    if (typeof ResizeObserver !== "undefined") {
      pickResizeObs = new ResizeObserver(function () {
        updatePickHighlightRect();
      });
      try {
        pickResizeObs.observe(el);
      } catch (e1) {
        /* ignore */
      }
    }
    if (!pickPositionTimer) {
      pickPositionTimer = setInterval(updatePickHighlightRect, 280);
    }
  }

  function esc(s) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return "#" + esc(el.id);
    var parts = [];
    var cur = el;
    var depth = 0;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement && depth < 8) {
      var tag = cur.tagName.toLowerCase();
      var part = tag;
      if (typeof cur.className === "string" && cur.className.trim()) {
        var cls = cur.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2);
        if (cls.length) part += cls.map(function (c) { return "." + esc(c); }).join("");
      }
      var parent = cur.parentElement;
      if (parent) {
        var same = [].filter.call(parent.children, function (n) {
          return n.tagName === cur.tagName;
        });
        if (same.length > 1) {
          var idx = same.indexOf(cur) + 1;
          part += ":nth-of-type(" + idx + ")";
        }
      }
      parts.unshift(part);
      cur = parent;
      depth++;
    }
    return parts.join(" > ");
  }

  var STYLE_KEYS = [
    "display",
    "position",
    "box-sizing",
    "width",
    "height",
    "margin",
    "padding",
    "font-size",
    "font-weight",
    "line-height",
    "color",
    "background-color",
    "border",
    "border-radius",
    "opacity",
    "flex",
    "align-items",
    "justify-content",
    "gap",
    "outline",
    "outline-offset",
    "cursor",
    "text-transform",
    "visibility"
  ];

  function pickAttrs(el) {
    function ga(name) {
      try {
        var v = el.getAttribute(name);
        return v == null ? "" : String(v);
      } catch (e) {
        return "";
      }
    }
    var disabled = false;
    try {
      disabled = el.disabled === true;
    } catch (e2) {
      disabled = false;
    }
    return {
      alt: ga("alt"),
      role: ga("role"),
      ariaLabel: ga("aria-label"),
      ariaLabelledby: ga("aria-labelledby"),
      ariaHidden: ga("aria-hidden"),
      type: ga("type"),
      href: ga("href"),
      placeholder: ga("placeholder"),
      disabled: disabled,
      tabIndex: ga("tabindex")
    };
  }

  function pickComputed(el) {
    var cs = window.getComputedStyle(el);
    var out = {};
    for (var i = 0; i < STYLE_KEYS.length; i++) {
      var k = STYLE_KEYS[i];
      out[k] = cs.getPropertyValue(k);
    }
    return out;
  }

  function extractPfClassTokens(className) {
    var s = typeof className === "string" ? className : "";
    var out = [];
    var re = /\\bpf(?:-v[56]|-c)-[a-z0-9_-]+/gi;
    var m;
    while ((m = re.exec(s)) !== null) {
      if (out.indexOf(m[0]) === -1) out.push(m[0]);
    }
    return out.slice(0, 48);
  }

  function classNameFromElement(el) {
    if (!el) return "";
    if (typeof el.className === "string") return el.className;
    if (el.className && el.className.baseVal != null)
      return String(el.className.baseVal);
    return "";
  }

  /** True if this node or an ancestor (limited depth) carries PatternFly class tokens. */
  function patternFlyDesignContextInAncestors(el) {
    try {
      var cur = el;
      for (var d = 0; d < 32 && cur; d++) {
        if (extractPfClassTokens(classNameFromElement(cur)).length) return true;
        cur = cur.parentElement;
      }
    } catch (e) {}
    return false;
  }

  function extractCssVariablesFromElement(el) {
    var names = [];
    try {
      var cs = window.getComputedStyle(el);
      for (var i = 0; i < cs.length; i++) {
        var pname = cs[i];
        var val = cs.getPropertyValue(pname);
        if (!val || val.indexOf("var(") === -1) continue;
        var re = /var\\((--[a-zA-Z0-9_-]+)/g;
        var mm;
        while ((mm = re.exec(val)) !== null) {
          if (names.indexOf(mm[1]) === -1) names.push(mm[1]);
        }
      }
    } catch (e) {}
    return names.sort().slice(0, 96);
  }

  function pickDataAttributes(el) {
    var out = {};
    try {
      if (!el || !el.attributes) return out;
      for (var i = 0; i < el.attributes.length; i++) {
        var a = el.attributes[i];
        if (/^data-/i.test(a.name)) {
          out[a.name] = String(a.value || "").slice(0, 200);
        }
      }
    } catch (e2) {}
    return out;
  }

  function inlineStyleDeclarationCount(el) {
    try {
      return el.style && el.style.length ? el.style.length : 0;
    } catch (e3) {
      return 0;
    }
  }

  var lastEl = null;

  function ensureHighlightParent() {
    if (!highlight.parentNode) {
      (document.body || document.documentElement).appendChild(highlight);
    }
  }

  function applyHoverChrome() {
    if (pickedElement) {
      hs.border = "2px dashed #fcd34d";
      hs.background = "rgba(253,224,71,0.07)";
    } else {
      hs.border = "2px dashed #d97706";
      hs.background = "rgba(217,119,6,0.14)";
    }
  }

  function onMove(e) {
    if (!mode) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === highlight || (el.closest && el.closest("[data-snappi-overlay]")))
      return;
    applyHoverChrome();
    if (lastEl === el) return;
    lastEl = el;
    var r = el.getBoundingClientRect();
    ensureHighlightParent();
    hs.display = "block";
    hs.left = r.left + "px";
    hs.top = r.top + "px";
    hs.width = r.width + "px";
    hs.height = r.height + "px";
  }

  function onClick(e) {
    if (!mode) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === highlight || (el.closest && el.closest("[data-snappi-overlay]")))
      return;
    var selector = cssPath(el);
    var computed = pickComputed(el);
    var tag = el.tagName.toLowerCase();
    var className = classNameFromElement(el);
    var text = (el.innerText || "").trim().slice(0, 240);
    var r = el.getBoundingClientRect();
    var vw = 0;
    var vh = 0;
    try {
      vw = window.innerWidth || 0;
      vh = window.innerHeight || 0;
    } catch (e3) {
      vw = vh = 0;
    }
    bridge.reportPick({
      selector: selector,
      tag: tag,
      className: className,
      patternFlyClassTokens: extractPfClassTokens(className),
      patternFlyDesignContext: patternFlyDesignContextInAncestors(el),
      cssCustomProperties: extractCssVariablesFromElement(el),
      dataAttributes: pickDataAttributes(el),
      inlineStyleDeclarationCount: inlineStyleDeclarationCount(el),
      textSample: text,
      computed: computed,
      attrs: pickAttrs(el),
      viewport: { width: vw, height: vh },
      rect: {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height
      }
    });
    startPickHighlightTracking(el);
    applyHoverChrome();
  }

  window.__snappiInspectorSetMode = function (on) {
    mode = !!on;
    if (!mode) {
      hs.display = "none";
      lastEl = null;
      stopPickHighlightTracking();
      document.body && (document.body.style.cursor = "");
    } else {
      document.body && (document.body.style.cursor = "crosshair");
    }
  };

  var domPatchUndoStack = [];
  var DOM_PATCH_UNDO_MAX = 24;

  function capturePatchSnapshot(el, p) {
    var s = {};
    if (p.text != null && p.text !== undefined) {
      try {
        s.text = el.textContent;
      } catch (eT) {
        s.text = "";
      }
    }
    if (p.style && typeof p.style === "object") {
      s.style = {};
      for (var sk in p.style) {
        if (Object.prototype.hasOwnProperty.call(p.style, sk)) {
          try {
            s.style[sk] = el.style[sk];
          } catch (eS) {
            s.style[sk] = "";
          }
        }
      }
    }
    if (p.attributes && typeof p.attributes === "object") {
      s.attributes = {};
      for (var ak in p.attributes) {
        if (Object.prototype.hasOwnProperty.call(p.attributes, ak)) {
          try {
            s.attributes[ak] = el.getAttribute(ak);
          } catch (eA) {
            s.attributes[ak] = null;
          }
        }
      }
    }
    if (p.classList && typeof p.classList === "object") {
      try {
        s.className = el.className;
      } catch (eC) {
        s.className = "";
      }
    }
    return s;
  }

  function applySnapshotToElement(el, s) {
    if ("text" in s) {
      el.textContent = s.text;
    }
    if (s.style) {
      for (var sk in s.style) {
        if (Object.prototype.hasOwnProperty.call(s.style, sk)) {
          try {
            el.style[sk] = s.style[sk];
          } catch (e1) {
            /* ignore */
          }
        }
      }
    }
    if (s.attributes) {
      for (var ak in s.attributes) {
        if (Object.prototype.hasOwnProperty.call(s.attributes, ak)) {
          var v = s.attributes[ak];
          try {
            if (v === null) el.removeAttribute(ak);
            else el.setAttribute(ak, v);
          } catch (e2) {
            /* ignore */
          }
        }
      }
    }
    if ("className" in s) {
      try {
        el.className = s.className;
      } catch (e3) {
        /* ignore */
      }
    }
  }

  window.__snappiUndoLastDomPatchBatch = function () {
    if (!domPatchUndoStack.length) {
      return { ok: false, error: "nothing to undo", undone: 0 };
    }
    var batch = domPatchUndoStack.pop();
    var undone = 0;
    for (var j = batch.length - 1; j >= 0; j--) {
      var item = batch[j];
      var el = null;
      try {
        el = document.querySelector(item.selector);
      } catch (e0) {
        continue;
      }
      if (!el) continue;
      try {
        applySnapshotToElement(el, item.snapshot);
        undone++;
      } catch (e1) {
        /* ignore */
      }
    }
    try {
      updatePickHighlightRect();
    } catch (ePh) {
      /* ignore */
    }
    return {
      ok: undone > 0,
      undone: undone,
      error: undone ? "" : "could not restore (nodes missing?)",
    };
  };

  window.__snappiApplyDomPatches = function (patches) {
    if (!Array.isArray(patches)) {
      return { ok: false, error: "patches must be an array", applied: [], errors: [] };
    }
    var applied = [];
    var errors = [];
    var undoBatch = [];
    for (var i = 0; i < patches.length; i++) {
      var p = patches[i];
      if (!p || !p.selector) {
        errors.push({ index: i, error: "missing selector" });
        continue;
      }
      var el = null;
      try {
        el = document.querySelector(p.selector);
      } catch (e0) {
        errors.push({ index: i, error: "invalid selector: " + String(e0.message || e0) });
        continue;
      }
      if (!el) {
        errors.push({ index: i, error: "not found: " + p.selector });
        continue;
      }
      try {
        var snap = capturePatchSnapshot(el, p);
        if (p.text != null && p.text !== undefined) {
          el.textContent = String(p.text);
        }
        if (p.style && typeof p.style === "object") {
          for (var sk in p.style) {
            if (Object.prototype.hasOwnProperty.call(p.style, sk)) {
              try {
                el.style[sk] = String(p.style[sk]);
              } catch (e1) {
                /* ignore bad keys */
              }
            }
          }
        }
        if (p.attributes && typeof p.attributes === "object") {
          for (var ak in p.attributes) {
            if (Object.prototype.hasOwnProperty.call(p.attributes, ak)) {
              el.setAttribute(ak, String(p.attributes[ak]));
            }
          }
        }
        if (p.classList && typeof p.classList === "object") {
          var adds = p.classList.add;
          var rems = p.classList.remove;
          if (Array.isArray(adds)) {
            for (var ai = 0; ai < adds.length; ai++) {
              try {
                el.classList.add(String(adds[ai]));
              } catch (eAdd) {
                /* ignore */
              }
            }
          }
          if (Array.isArray(rems)) {
            for (var ri = 0; ri < rems.length; ri++) {
              try {
                el.classList.remove(String(rems[ri]));
              } catch (eRem) {
                /* ignore */
              }
            }
          }
        }
        undoBatch.push({ selector: p.selector, snapshot: snap });
        applied.push({ selector: p.selector });
      } catch (e2) {
        errors.push({ index: i, error: String(e2.message || e2) });
      }
    }
    if (undoBatch.length) {
      domPatchUndoStack.push(undoBatch);
      while (domPatchUndoStack.length > DOM_PATCH_UNDO_MAX) {
        domPatchUndoStack.shift();
      }
    }
    try {
      updatePickHighlightRect();
    } catch (ePh) {
      /* ignore */
    }
    return {
      ok: errors.length === 0,
      applied: applied,
      errors: errors,
    };
  };

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener(
    "scroll",
    function () {
      updatePickHighlightRect();
    },
    true
  );
  window.addEventListener("resize", function () {
    updatePickHighlightRect();
  });

  try {
    window.__snappiRefreshPickHighlight = updatePickHighlightRect;
  } catch (eW) {
    /* ignore */
  }
})();
`;
