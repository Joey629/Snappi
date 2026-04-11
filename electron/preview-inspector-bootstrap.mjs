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
  hs.border = "2px solid #2563eb";
  hs.background = "rgba(37,99,235,0.1)";
  hs.zIndex = "2147483646";
  hs.display = "none";
  hs.boxSizing = "border-box";
  hs.borderRadius = "2px";

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

  var lastEl = null;

  function ensureHighlightParent() {
    if (!highlight.parentNode) {
      (document.body || document.documentElement).appendChild(highlight);
    }
  }

  function onMove(e) {
    if (!mode) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === highlight || (el.closest && el.closest("[data-snappi-overlay]")))
      return;
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
    var className =
      typeof el.className === "string"
        ? el.className
        : el.className && el.className.baseVal != null
          ? String(el.className.baseVal)
          : "";
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
  }

  window.__snappiInspectorSetMode = function (on) {
    mode = !!on;
    if (!mode) {
      hs.display = "none";
      lastEl = null;
      document.body && (document.body.style.cursor = "");
    } else {
      document.body && (document.body.style.cursor = "crosshair");
    }
  };

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
})();
`;
