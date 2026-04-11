/**
 * Injected into the preview page (main world). Uses fixed-position overlay
 * frames (max z-index) so outlines are not clipped by overflow. Optional
 * regionHints target specific cards from patch-derived titles.
 */
export const PREVIEW_CHANGE_HIGHLIGHTS_BOOTSTRAP = `
(function () {
  if (window.__snappiPrChangeHighlightsInstalled) return;
  window.__snappiPrChangeHighlightsInstalled = true;

  var STYLE_ID = "__snappi_pr_change_styles";
  var scrollHandler = null;
  var routeHookInstalled = false;

  function currentPathNorm() {
    var p = location.pathname || "/";
    if (location.hash && location.hash.charAt(1) === "/") {
      var hp = location.hash.slice(1).split("?")[0];
      if (hp) p = hp;
    }
    return pathNorm(p);
  }

  function tourScopePaths(spec) {
    var p = spec && spec.navPaths;
    return p && p.length ? p : [];
  }

  function tourMatchesCurrentRoute(spec) {
    var paths = tourScopePaths(spec);
    if (!paths.length) return true;
    var cur = currentPathNorm().toLowerCase();
    var cs = cur.split("/").filter(Boolean);
    for (var i = 0; i < paths.length; i++) {
      var t = pathNorm(paths[i]).toLowerCase();
      if (!t || t === "/") continue;
      if (cur === t) return true;
      if (t.length > 1 && cur.startsWith(t + "/")) return true;
      var ts = t.split("/").filter(Boolean);
      if (ts.length && cs.length && ts[ts.length - 1] === cs[cs.length - 1])
        return true;
      if (cur.endsWith(t)) {
        var before = cur.length > t.length ? cur.charAt(cur.length - t.length - 1) : "/";
        if (before === "/" || cur === t) return true;
      }
    }
    return false;
  }

  function onSnappiLocationChange() {
    var spec = window.__snappiPrTourSpec;
    if (!spec) return;
    if (!tourMatchesCurrentRoute(spec)) {
      removeTourVisuals();
      return;
    }
    function runApply() {
      var s = window.__snappiPrTourSpec;
      if (!s) return;
      if (!tourMatchesCurrentRoute(s)) return;
      window.__snappiApplyPrTour(s);
    }
    runApply();
    setTimeout(runApply, 50);
    setTimeout(runApply, 160);
    setTimeout(runApply, 420);
  }

  function installRouteGuardOnce() {
    if (routeHookInstalled) return;
    routeHookInstalled = true;
    function bump() {
      setTimeout(onSnappiLocationChange, 0);
    }
    window.addEventListener("popstate", bump);
    window.addEventListener("hashchange", bump);
    var _ps = history.pushState;
    var _rs = history.replaceState;
    history.pushState = function () {
      var r = _ps.apply(history, arguments);
      bump();
      return r;
    };
    history.replaceState = function () {
      var r = _rs.apply(history, arguments);
      bump();
      return r;
    };
  }

  window.__snappiNotifyHostNavigation = function () {
    onSnappiLocationChange();
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent =
      "[hidden]{display:none!important}" +
      ".snappi-pr-change-frame{position:fixed;box-sizing:border-box;border:3px solid #ea580c;border-radius:8px;pointer-events:none;z-index:2147483645;box-shadow:0 0 0 1px rgba(255,255,255,0.95),0 0 0 5px rgba(234,88,12,0.38),0 10px 36px rgba(234,88,12,0.14);animation:snappi-pr-fr 2.4s ease-in-out infinite}" +
      "@keyframes snappi-pr-fr{50%{border-color:#fb923c;box-shadow:0 0 0 1px rgba(255,255,255,0.95),0 0 0 6px rgba(251,146,60,0.32),0 10px 36px rgba(251,146,60,0.12)}}" +
      ".snappi-pr-change-cluster{position:fixed;z-index:2147483646;display:flex;align-items:flex-start;gap:8px;pointer-events:none;max-width:calc(100vw - 24px)}" +
      ".snappi-pr-change-marker-btn{pointer-events:auto;flex-shrink:0;width:16px;height:16px;border-radius:50%;border:2px solid #fff;background:#dc2626;box-shadow:0 0 0 1px rgba(0,0,0,0.2),0 2px 8px rgba(220,38,38,0.45);cursor:help;padding:0;margin:0}" +
      ".snappi-pr-change-marker-btn:focus-visible{outline:2px solid #2563eb;outline-offset:2px}" +
      ".snappi-pr-change-popover{pointer-events:auto;max-width:min(320px,calc(100vw - 48px));padding:10px 12px;background:#111827;color:#f9fafb;font-size:13px;line-height:1.45;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.35);margin:0}" +
      ".snappi-pr-change-popover--caret{margin-top:2px}";
    (document.head || document.documentElement).appendChild(st);
  }

  function ensureOverlayList() {
    if (!window.__snappiHlOverlayList) window.__snappiHlOverlayList = [];
    return window.__snappiHlOverlayList;
  }

  function syncOverlayPositions() {
    var list = window.__snappiHlOverlayList;
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var el = item.targetEl;
      if (!el || !el.isConnected) {
        item.root.remove();
        list.splice(i, 1);
        i--;
        continue;
      }
      var r = el.getBoundingClientRect();
      var w = Math.max(1, r.width);
      var h = Math.max(1, r.height);
      item.frame.style.left = r.left + "px";
      item.frame.style.top = r.top + "px";
      item.frame.style.width = w + "px";
      item.frame.style.height = h + "px";
      var ae = item.anchorEl;
      if (!ae || !ae.isConnected) ae = el;
      var ar = ae.getBoundingClientRect();
      item.cluster.style.left = ar.left + 6 + "px";
      item.cluster.style.top = ar.top + 6 + "px";
    }
  }

  function wirePopover(marker, popover, hintText) {
    var hideT = null;
    var text = String(hintText || "").slice(0, 500);
    popover.textContent = text;
    popover.setAttribute("hidden", "");
    function show() {
      popover.removeAttribute("hidden");
    }
    function hide() {
      popover.setAttribute("hidden", "");
    }
    function schedHide(ms) {
      clearTimeout(hideT);
      hideT = setTimeout(hide, ms);
    }
    marker.addEventListener("mouseenter", function () {
      clearTimeout(hideT);
      show();
    });
    marker.addEventListener("mouseleave", function () {
      schedHide(180);
    });
    popover.addEventListener("mouseenter", function () {
      clearTimeout(hideT);
      show();
    });
    popover.addEventListener("mouseleave", function () {
      schedHide(180);
    });
  }

  function mountHighlight(targetEl, hint, anchorEl) {
    if (!targetEl || !document.contains(targetEl)) return false;
    var list = ensureOverlayList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].targetEl === targetEl) return false;
    }
    var useAnchor =
      anchorEl && document.contains(anchorEl) && targetEl.contains(anchorEl)
        ? anchorEl
        : targetEl;
    injectStyles();
    var root = document.createElement("div");
    root.className = "snappi-pr-change-overlay-root";
    root.setAttribute("data-snappi-overlay", "1");

    var frame = document.createElement("div");
    frame.className = "snappi-pr-change-frame";
    frame.setAttribute("aria-hidden", "true");

    var cluster = document.createElement("div");
    cluster.className = "snappi-pr-change-cluster";

    var marker = document.createElement("button");
    marker.type = "button";
    marker.className = "snappi-pr-change-marker-btn";
    marker.setAttribute("aria-label", "What changed in this area");

    var popover = document.createElement("div");
    popover.className =
      "snappi-pr-change-popover snappi-pr-change-popover--caret";
    popover.setAttribute("role", "tooltip");

    cluster.appendChild(marker);
    cluster.appendChild(popover);
    root.appendChild(frame);
    root.appendChild(cluster);
    document.body.appendChild(root);

    list.push({
      targetEl: targetEl,
      anchorEl: useAnchor,
      root: root,
      frame: frame,
      cluster: cluster,
    });

    wirePopover(marker, popover, hint);
    syncOverlayPositions();
    return true;
  }

  function removeTourVisuals() {
    var list = window.__snappiHlOverlayList;
    if (list) {
      for (var i = 0; i < list.length; i++) list[i].root.remove();
      list.length = 0;
    }
    if (scrollHandler) {
      window.removeEventListener("scroll", scrollHandler, true);
      window.removeEventListener("resize", scrollHandler);
      scrollHandler = null;
    }
    document.querySelectorAll(".snappi-pr-change-glow").forEach(function (el) {
      el.classList.remove("snappi-pr-change-glow");
    });
    document.querySelectorAll(".snappi-pr-change-marker").forEach(function (m) {
      m.remove();
    });
  }

  function clearHighlights() {
    window.__snappiPrTourSpec = null;
    removeTourVisuals();
  }

  function ensureScrollListener() {
    if (scrollHandler) return;
    scrollHandler = function () {
      syncOverlayPositions();
    };
    window.addEventListener("scroll", scrollHandler, true);
    window.addEventListener("resize", scrollHandler);
  }

  function escapeRe(s) {
    return String(s).replace(/[.*+?^\\u0024{}()|[\\]\\\\]/g, "\\\\$&");
  }

  function tourHintText(spec) {
    var t =
      spec && typeof spec.uxSummary === "string"
        ? spec.uxSummary.trim()
        : "";
    if (t) return t.slice(0, 450);
    return "Area related to this PR (navigation or main content).";
  }

  function regionPopoverText(sectionTitle, globalHint) {
    var title = String(sectionTitle || "").trim().slice(0, 96);
    var g = String(globalHint || "").trim().slice(0, 300);
    if (title) {
      return (
        "This outline matches the section title “" +
        title +
        "” from the PR. " +
        g
      );
    }
    return g;
  }

  function navPopoverText(label, globalHint) {
    var l = String(label || "").trim().slice(0, 56);
    var g = String(globalHint || "").trim().slice(0, 280);
    if (l) return "Sidebar item “" + l + "” for this PR. " + g;
    return g;
  }

  function scrollTargetsIntoView() {
    var list = window.__snappiHlOverlayList;
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      var el = list[i].targetEl;
      try {
        el.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "instant",
        });
      } catch (e0) {
        try {
          el.scrollIntoView(true);
        } catch (e1) {}
      }
    }
    syncOverlayPositions();
  }

  function navRootSelector() {
    return (
      'nav, [role="navigation"], aside, ' +
      '[data-testid*="nav" i], [data-testid*="sidebar" i], ' +
      '[class*="sidebar" i], [class*="SideNav" i], [class*="sidenav" i], ' +
      '[class*="side-nav" i], [class*="sidebar-nav" i], ' +
      '[class*="pf-c-page__sidebar" i], [class*="pf-v5-c-page__sidebar" i], ' +
      '[class*="pf-v6-c-page__sidebar" i], ' +
      '[class*="pf-c-nav" i], [class*="pf-v5-c-nav" i], ' +
      '[class*="pf-v6-c-nav" i], ' +
      '[class*="mantine-AppShell-navbar" i], [class*="mantine-Navbar" i], ' +
      '[class*="AppShell-navbar" i], [class*="app-shell-nav" i], ' +
      '[class*="Layout__Sidebar" i], [class*="layout-sidebar" i], ' +
      '[class*="app-layout" i][class*="nav" i]'
    );
  }

  function navPickRow(el) {
    return (
      el.closest("li") ||
      el.closest("[class*='pf-v5-c-nav__item']") ||
      el.closest("[class*='pf-v6-c-nav__item']") ||
      el.closest("[class*='pf-c-nav__item']") ||
      el.closest("[class*='nav__item']") ||
      el.closest("[class*='menu-item']") ||
      el.closest("[class*='MuiListItem-root']") ||
      el.closest("[class*='ListItem']") ||
      el.closest("[role='listitem']") ||
      el.closest("[role='row']") ||
      el.closest("tr") ||
      el
    );
  }

  function pathNorm(p) {
    var s = String(p || "").trim().split("?")[0];
    if (!s) return "";
    if (s.charAt(0) !== "/") s = "/" + s.replace(/^\\/+/, "");
    s = s.replace(/\\/+$/, "");
    return s || "/";
  }

  function hrefMatchesPath(hrefRaw, targetPath) {
    if (!hrefRaw) return false;
    var want = pathNorm(targetPath).toLowerCase();
    if (!want || want === "/") return false;
    var h = String(hrefRaw).trim();
    var hashIdx = h.indexOf("#");
    if (hashIdx >= 0) {
      var hashPart = h.slice(hashIdx + 1).split("?")[0] || "";
      if (hashPart) {
        var hn = pathNorm(hashPart).toLowerCase();
        if (hn === want || hn.endsWith(want) || want.endsWith(hn)) return true;
      }
    }
    try {
      var u = new URL(h, document.baseURI);
      var pn = pathNorm(u.pathname || "").toLowerCase();
      if (pn === want) return true;
      if (pn.endsWith(want)) return true;
      if (want.length >= 3 && pn.indexOf(want) >= 0) return true;
      var ws = want.split("/").filter(Boolean);
      var ps = pn.split("/").filter(Boolean);
      if (ws.length && ps.length && ws[ws.length - 1] === ps[ps.length - 1])
        return true;
    } catch (e1) {}
    var low = h.toLowerCase();
    if (want.length >= 3 && low.indexOf(want) >= 0) return true;
    return false;
  }

  function highlightNavForPath(routePath, hint) {
    if (!routePath || typeof routePath !== "string") return 0;
    var roots = document.querySelectorAll(navRootSelector());
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      var links = root.querySelectorAll("a[href]");
      var i;
      for (i = 0; i < links.length; i++) {
        var a = links[i];
        var href = a.getAttribute("href") || "";
        if (!hrefMatchesPath(href, routePath)) continue;
        var row = navPickRow(a);
        if (row && mountHighlight(row, hint)) return 1;
      }
    }
    return 0;
  }

  function highlightNavForLabel(label, hint) {
    if (!label || typeof label !== "string") return 0;
    var trimmed = label.trim();
    if (trimmed.length < 2) return 0;
    var roots = document.querySelectorAll(navRootSelector());
    var reWord = new RegExp("\\\\b" + escapeRe(trimmed) + "\\\\b", "i");
    var reLoose =
      trimmed.length > 32 ? null : new RegExp(escapeRe(trimmed), "i");
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      var candidates = root.querySelectorAll(
        "a, button, [role='menuitem'], [role='tab']"
      );
      for (var c = 0; c < candidates.length; c++) {
        var el = candidates[c];
        var txt = (el.textContent || "").replace(/\\s+/g, " ").trim();
        if (txt.length > 160) continue;
        var tlo = txt.toLowerCase();
        var mlo = trimmed.toLowerCase();
        var exact = tlo === mlo;
        var starts =
          mlo.length <= 24 &&
          tlo.length <= mlo.length + 6 &&
          tlo.indexOf(mlo) === 0;
        var word = reWord.test(txt);
        var loose = reLoose && reLoose.test(txt);
        if (!exact && !starts && !word && !loose) continue;
        var row = navPickRow(el);
        if (row && mountHighlight(row, hint)) return 1;
      }
    }
    return 0;
  }

  function isNarrowSidebar(el) {
    var aside = el.closest("aside");
    if (aside) {
      var w = aside.getBoundingClientRect().width;
      if (w > 0 && w < 340 && aside.querySelector("nav, [role=navigation]"))
        return true;
    }
    var sb = el.closest('[class*="sidebar" i]');
    if (sb) {
      var w2 = sb.getBoundingClientRect().width;
      if (w2 > 0 && w2 < 340) return true;
    }
    return false;
  }

  /** Skip nav / narrow sidebar / identity chrome when matching region highlights. */
  function isInMainContentRegion(el) {
    if (!el || !document.contains(el)) return false;
    if (el.closest("nav")) return false;
    if (el.closest("[role='navigation']")) return false;
    if (el.closest("#nav-identity")) return false;
    if (isNarrowSidebar(el)) return false;
    return true;
  }

  /** Prefer highlights inside app main when the same hint could match elsewhere. */
  function mainLandElement(el) {
    if (!el) return null;
    return (
      el.closest("main") ||
      el.closest("[role='main']") ||
      el.closest("#main-content") ||
      el.closest("[class*='pf-v5-c-page__main']") ||
      el.closest("[class*='pf-v6-c-page__main']") ||
      el.closest("[class*='pf-c-page__main']") ||
      el.closest("[class*='page__main']") ||
      el.closest("[class*='app-main']")
    );
  }

  function viewportArea() {
    return Math.max(1, window.innerWidth * window.innerHeight);
  }

  /** Large dashboard cards (e.g. full-width Sankey) exceed tiny caps and got no outline. */
  function maxHighlightRegionArea() {
    return viewportArea() * 0.82;
  }

  function regionRootTooLarge(el) {
    if (!el) return true;
    var r = el.getBoundingClientRect();
    return r.width * r.height > maxHighlightRegionArea();
  }

  /** If the matched root is a tiny strip (span/link), climb to card/section/panel. */
  function promoteSmallHighlightRoot(root, anchorEl) {
    if (!root || !document.contains(root)) return root;
    if (regionRootTooLarge(root)) return root;
    var tag = root.tagName;
    if (tag === "TH" || tag === "TD") return root;
    var r = root.getBoundingClientRect();
    var w = r.width;
    var h = r.height;
    var area = w * h;
    var minW = 100;
    var minH = 36;
    var minArea = 3200;
    if (w >= minW && h >= minH && area >= minArea) return root;

    var shellSel =
      ".pf-c-card, .pf-v5-c-card, .pf-v6-c-card, " +
      "[class*='pf-v5-c-card'], [class*='pf-v6-c-card'], " +
      "[data-ouia-component-type='Card'], [class*='MuiCard-root'], " +
      "[class*='MuiPaper-root'], [class*='mantine-Card-root'], " +
      "article, [class*='PageSection'], [class*='page-section'], section, " +
      "[class*='panel' i]";
    var cur = root.parentElement;
    var steps = 0;
    while (cur && cur !== document.body && steps < 16) {
      if (
        cur.matches &&
        cur.matches(shellSel) &&
        !cur.closest("[data-snappi-overlay]") &&
        !regionRootTooLarge(cur)
      )
        return cur;
      cur = cur.parentElement;
      steps++;
    }
    return root;
  }

  function highlightRootFromHeading(el, card) {
    if (card && !card.closest("[data-snappi-overlay]")) {
      if (!regionRootTooLarge(card)) return { root: card, anchor: el };
      var hdr = el.closest(
        "[class*='CardHeader'], [class*='card-header'], [class*='card__header'], " +
          "[class*='Card-Header'], .pf-c-card__header, .pf-v5-c-card__header, " +
          ".pf-v6-c-card__header, [class*='MuiCardHeader']"
      );
      if (
        hdr &&
        document.contains(hdr) &&
        card.contains(hdr) &&
        !regionRootTooLarge(hdr)
      )
        return { root: hdr, anchor: el };
      if (!regionRootTooLarge(el)) return { root: el, anchor: el };
      var pr = el.parentElement;
      if (
        pr &&
        pr !== document.body &&
        card.contains(pr) &&
        !regionRootTooLarge(pr)
      )
        return { root: pr, anchor: el };
    }
    return null;
  }

  function hintSearchStrings(hint) {
    var q = String(hint || "").trim();
    if (!q) return [];
    var out = [];
    var seen = {};
    function push(s) {
      var t = String(s || "").trim().toLowerCase();
      if (t.length < 3) return;
      if (seen[t]) return;
      seen[t] = 1;
      out.push(t);
    }
    push(q);
    var p = q.indexOf("(");
    if (p > 1) push(q.slice(0, p).trim());
    var sp = q.indexOf(" ");
    if (sp > 2) push(q.slice(0, sp).trim());
    return out;
  }

  /** Match hint to a card by visible text, or by id/class containing the token (e.g. sankey). */
  function elementMatchesHintToken(el, low) {
    if (!el || !low) return false;
    var t = (el.textContent || "").replace(/\\s+/g, " ").toLowerCase();
    if (t.indexOf(low) >= 0) return true;
    var id = (el.getAttribute && el.getAttribute("id")) || "";
    if (id && String(id).toLowerCase().indexOf(low) >= 0) return true;
    var cl = el.className;
    if (typeof cl === "string" && cl.toLowerCase().indexOf(low) >= 0)
      return true;
    if (el.classList && el.classList.length) {
      var ci;
      for (ci = 0; ci < el.classList.length; ci++) {
        if (el.classList[ci].toLowerCase().indexOf(low) >= 0) return true;
      }
    }
    return false;
  }

  function headingMatches(tl, low) {
    if (tl.indexOf(low) >= 0) return true;
    if (low.length >= 8 && tl.indexOf(low.slice(0, 8)) >= 0) return true;
    if (low.length >= 4 && low.length <= 20) {
      var parts = low.split(/\\s+/);
      if (parts.length >= 2) {
        if (tl.indexOf(parts[0]) >= 0 && tl.indexOf(parts[1]) >= 0)
          return true;
      }
    }
    return false;
  }

  function findRegionByHeadings(low) {
    var sel =
      "h1,h2,h3,h4,h5,h6," +
      "[class*='CardTitle' i],[class*='card-title' i],[class*='card__title' i]," +
      "[class*='c-card__title' i],[class*='CardHeader' i]," +
      "[class*='PageSection' i],[class*='page-section' i]";
    var heads;
    try {
      heads = document.querySelectorAll(sel);
    } catch (e0) {
      return null;
    }
    var collected = [];
    var hi;
    for (hi = 0; hi < heads.length; hi++) {
      var el = heads[hi];
      if (el.closest("[data-snappi-overlay]")) continue;
      if (!isInMainContentRegion(el)) continue;
      var txt = (el.textContent || "").replace(/\\s+/g, " ").trim();
      if (txt.length > 200) continue;
      var tl = txt.toLowerCase();
      if (!headingMatches(tl, low)) continue;
      var card = el.closest(
        ".pf-c-card, .pf-v5-c-card, .pf-v6-c-card, " +
          "[class*='pf-c-card'], [class*='pf-v5-c-card'], [class*='pf-v6-c-card'], " +
          "[data-ouia-component-type='Card'], [class*='MuiCard-root'], " +
          "[class*='MuiPaper-root'], " +
          "article, [class*='mantine-Card-root'], [data-testid*='card' i]"
      );
      var fromCard = highlightRootFromHeading(el, card);
      if (fromCard) {
        collected.push(fromCard);
        continue;
      }
      var sec = el.closest(
        "[class*='PageSection'], [class*='page-section'], section"
      );
      if (
        sec &&
        !sec.closest("[data-snappi-overlay]") &&
        !regionRootTooLarge(sec)
      ) {
        collected.push({ root: sec, anchor: el });
        continue;
      }
      var pr = el.parentElement;
      if (
        pr &&
        pr !== document.body &&
        !regionRootTooLarge(pr)
      )
        collected.push({ root: pr, anchor: el });
    }
    if (!collected.length) return null;
    function hitInMainLand(hit) {
      var a = hit.anchor || hit.root;
      return !!(mainLandElement(a) || mainLandElement(hit.root));
    }
    var inMain = [];
    var rest = [];
    var ci;
    for (ci = 0; ci < collected.length; ci++) {
      if (hitInMainLand(collected[ci])) inMain.push(collected[ci]);
      else rest.push(collected[ci]);
    }
    var use = inMain.length ? inMain : rest;
    var best = null;
    var bestArea = 1e15;
    for (ci = 0; ci < use.length; ci++) {
      var one = use[ci];
      var rr = one.root.getBoundingClientRect();
      var ar = rr.width * rr.height;
      if (ar < bestArea) {
        bestArea = ar;
        best = one;
      }
    }
    return best;
  }

  function findRegionByCardScan(fullHint) {
    var low = String(fullHint || "").trim().toLowerCase();
    if (!low) return null;
    var sel =
      ".pf-c-card, .pf-v5-c-card, .pf-v6-c-card, " +
      "[class*='pf-v5-c-card'], [class*='pf-v6-c-card'], " +
      "[class*='pf-c-table'], [class*='pf-v5-c-table'], [class*='pf-v6-c-table'], " +
      "table, [role='grid'], [role='table'], " +
      "[class*='gallery__item'], [class*='GridItem'], [class*='grid-item'], " +
      "[class*='MuiPaper-root'], [class*='mantine-Card-root'], " +
      "[class*='sankey' i], [class*='chart-card' i]";
    var cards;
    try {
      cards = document.querySelectorAll(sel);
    } catch (e1) {
      return null;
    }
    var weakToks = { sankey: 1, chart: 1 };
    var isWeakTok = weakToks[low] === 1;
    var disableWeakClassMatch = false;
    if (isWeakTok) {
      var nClassOnly = 0;
      var jx;
      for (jx = 0; jx < cards.length; jx++) {
        var cj = cards[jx];
        if (cj.closest("[data-snappi-overlay]")) continue;
        if (!isInMainContentRegion(cj)) continue;
        var tj = (cj.textContent || "").replace(/\\s+/g, " ").toLowerCase();
        var vj = hintSearchStrings(fullHint);
        var textHitJ = false;
        var ik;
        for (ik = 0; ik < vj.length; ik++) {
          if (tj.indexOf(vj[ik]) >= 0) {
            textHitJ = true;
            break;
          }
        }
        if (textHitJ) continue;
        if (elementMatchesHintToken(cj, low)) nClassOnly++;
      }
      if (nClassOnly > 5) disableWeakClassMatch = true;
    }
    function cardScanOk(el) {
      var tx = (el.textContent || "").replace(/\\s+/g, " ").toLowerCase();
      var vars = hintSearchStrings(fullHint);
      var textHit = false;
      var ix;
      for (ix = 0; ix < vars.length; ix++) {
        if (tx.indexOf(vars[ix]) >= 0) {
          textHit = true;
          break;
        }
      }
      if (textHit) return true;
      if (!elementMatchesHintToken(el, low)) return false;
      if (!isWeakTok) return true;
      if (disableWeakClassMatch) return false;
      var ar = el.getBoundingClientRect();
      if (ar.width * ar.height > viewportArea() * 0.8) return false;
      return true;
    }
    function pickBestCardScan(cardsList, allowOversize) {
      var cand = [];
      var ci;
      for (ci = 0; ci < cardsList.length; ci++) {
        var c = cardsList[ci];
        if (c.closest("[data-snappi-overlay]")) continue;
        if (!isInMainContentRegion(c)) continue;
        if (!cardScanOk(c)) continue;
        var r = c.getBoundingClientRect();
        var area = r.width * r.height;
        if (area < 2500) continue;
        if (!allowOversize && area > maxHighlightRegionArea()) continue;
        cand.push({
          el: c,
          area: area,
          inMain: !!mainLandElement(c),
        });
      }
      cand.sort(function (a, b) {
        if (a.inMain !== b.inMain) return a.inMain ? -1 : 1;
        return a.area - b.area;
      });
      return cand.length ? cand[0].el : null;
    }
    var best = pickBestCardScan(cards, false);
    if (!best) {
      var cand2 = [];
      var ci;
      for (ci = 0; ci < cards.length; ci++) {
        var c2 = cards[ci];
        if (c2.closest("[data-snappi-overlay]")) continue;
        if (!isInMainContentRegion(c2)) continue;
        if (!cardScanOk(c2)) continue;
        var r2 = c2.getBoundingClientRect();
        var a2 = r2.width * r2.height;
        if (a2 < 2500) continue;
        var tn2 =
          c2.querySelector(
            "h2,h3,h4,[class*='CardTitle' i],[class*='card__title' i],[class*='c-card__title' i]"
          ) || null;
        if (tn2) {
          var sub2 = highlightRootFromHeading(tn2, c2);
          if (sub2) return sub2;
        }
        cand2.push({
          el: c2,
          area: a2,
          inMain: !!mainLandElement(c2),
        });
      }
      cand2.sort(function (a, b) {
        if (a.inMain !== b.inMain) return a.inMain ? -1 : 1;
        return a.area - b.area;
      });
      best = cand2.length ? cand2[0].el : null;
    }
    if (!best) return null;
    var titleNd =
      best.querySelector(
        "[class*='card__title' i], [class*='CardTitle' i], [class*='c-card__title' i], h2, h3, h4"
      ) || best;
    return { root: best, anchor: titleNd };
  }

  function findRegionByTextInMain(fullHint) {
    var variants = hintSearchStrings(fullHint);
    if (!variants.length) return null;
    var scope =
      document.querySelector(
        "main,[role='main'],[class*='page__main'],[class*='Page__main']"
      ) || document.body;
    var nodes = scope.querySelectorAll(
      "h2,h3,h4,h5,legend,[class*='title' i],[class*='Title' i],[class*='c-card__title' i]"
    );
    var ni;
    for (ni = 0; ni < nodes.length; ni++) {
      var nd = nodes[ni];
      if (nd.closest("[data-snappi-overlay]")) continue;
      if (!isInMainContentRegion(nd)) continue;
      var tx = (nd.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
      if (tx.length > 140) continue;
      var vi;
      var matched = false;
      for (vi = 0; vi < variants.length; vi++) {
        if (tx.indexOf(variants[vi]) >= 0) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;
      var card = nd.closest(
        ".pf-c-card, .pf-v5-c-card, .pf-v6-c-card, " +
          "[class*='pf-v5-c-card'], [class*='pf-v6-c-card'], " +
          "[data-ouia-component-type='Card'], [class*='MuiPaper-root']"
      );
      var fromCardNd = highlightRootFromHeading(nd, card);
      if (fromCardNd) return fromCardNd;
      var pr = nd.parentElement;
      if (pr && pr !== document.body && !regionRootTooLarge(pr))
        return { root: pr, anchor: nd };
    }
    return null;
  }

  function findRegionMatch(hint) {
    var variants = hintSearchStrings(hint);
    var i;
    for (i = 0; i < variants.length; i++) {
      var hit = findRegionByHeadings(variants[i]);
      if (hit) return hit;
    }
    var byScan = findRegionByCardScan(hint);
    if (byScan) return byScan;
    return findRegionByTextInMain(hint);
  }

  /** additionLabels: exact <th> / PF header cell match (small target, not whole table). */
  function highlightAdditionColumnHeaders(labels, globalHint) {
    var n = 0;
    var arr = labels && labels.length ? labels : [];
    var ii;
    var tail = String(globalHint || "").trim().slice(0, 240);
    for (ii = 0; ii < arr.length && n < 6; ii++) {
      var lab = String(arr[ii] || "").trim();
      if (lab.length < 1 || lab.length > 44) continue;
      var want = lab.toLowerCase();
      var candidates;
      try {
        candidates = document.querySelectorAll(
          "th, [class*='table__th' i], [class*='__th' i]"
        );
      } catch (eTh) {
        continue;
      }
      var hi;
      for (hi = 0; hi < candidates.length; hi++) {
        var th = candidates[hi];
        if (!isInMainContentRegion(th)) continue;
        var tx = (th.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
        if (tx !== want) continue;
        var cap =
          "Adds table column '" + lab + "'" + (tail ? ". " + tail : "");
        if (mountHighlight(th, cap, th)) n++;
        break;
      }
    }
    return n;
  }

  function highlightRegions(hints, globalHint) {
    var n = 0;
    var arr = hints && hints.length ? hints : [];
    for (var i = 0; i < arr.length && n < 8; i++) {
      var m = findRegionMatch(arr[i]);
      var cap = regionPopoverText(arr[i], globalHint);
      var rootDraw =
        m && m.root ? promoteSmallHighlightRoot(m.root, m.anchor || m.root) : null;
      if (
        m &&
        m.root &&
        rootDraw &&
        !regionRootTooLarge(rootDraw) &&
        mountHighlight(rootDraw, cap, m.anchor || m.root)
      )
        n++;
    }
    return n;
  }

  function highlightMainBlock(hint) {
    var selectors = [
      "main",
      "[role='main']",
      "[id='main-content']",
      "[class*='pf-v5-c-page__main']",
      "[class*='pf-v6-c-page__main']",
      "[class*='pf-c-page__main']",
      "[class*='page__main']",
      "[class*='app-main']",
      "[class*='main-content']",
      "[class*='App-main']",
      "[class*='layout__main']",
      "[class*='content-area']",
    ];
    var candidates = [];
    var seen = {};
    for (var s = 0; s < selectors.length; s++) {
      try {
        document.querySelectorAll(selectors[s]).forEach(function (el) {
          if (!el || seen[el]) return;
          if (isNarrowSidebar(el)) return;
          var r = el.getBoundingClientRect();
          if (r.width < 200 || r.height < 100) return;
          seen[el] = 1;
          candidates.push(el);
        });
      } catch (e2) {}
    }
    var best = null;
    var bestArea = 0;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var r = el.getBoundingClientRect();
      var area = r.width * r.height;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    }
    if (best && mountHighlight(best, hint)) return 1;
    var root = document.getElementById("root") || document.getElementById("app");
    if (!root) return 0;
    var layout = root.firstElementChild;
    if (!layout) return 0;
    var header =
      document.querySelector("header") ||
      document.querySelector("[role='banner']") ||
      layout.querySelector("header");
    var inner =
      layout.querySelector("main") ||
      layout.querySelector("[role='main']") ||
      layout.querySelector("[class*='content' i]");
    if (inner && !isNarrowSidebar(inner) && mountHighlight(inner, hint))
      return 1;
    if (layout.children.length >= 2 && header && layout.contains(header)) {
      for (var j = 0; j < layout.children.length; j++) {
        var ch = layout.children[j];
        if (ch === header || ch.contains(header)) {
          if (j + 1 < layout.children.length) {
            var next = layout.children[j + 1];
            if (!isNarrowSidebar(next) && mountHighlight(next, hint)) return 1;
          }
          break;
        }
      }
    }
    if (layout.classList && !isNarrowSidebar(layout) && mountHighlight(layout, hint))
      return 1;
    return 0;
  }

  window.__snappiApplyPrTour = function (spec) {
    window.__snappiPrTourSpec = spec;
    installRouteGuardOnce();
    removeTourVisuals();
    if (!spec || typeof spec !== "object") return { applied: 0 };
    if (!tourMatchesCurrentRoute(spec)) {
      return { applied: 0, offRoute: true };
    }
    var hint = tourHintText(spec);
    var applied = 0;
    var fullPage = spec.fullPageHighlight === true;
    var addList =
      spec.additionLabels && spec.additionLabels.length
        ? spec.additionLabels
        : [];
    var addSet = {};
    for (var ai = 0; ai < addList.length; ai++) {
      var ak = String(addList[ai] || "").trim().toLowerCase();
      if (ak) addSet[ak] = 1;
    }
    var rh = spec.regionHints || [];
    var rhFiltered = [];
    for (var ri = 0; ri < rh.length; ri++) {
      var hrk = String(rh[ri] || "").trim().toLowerCase();
      if (addSet[hrk]) continue;
      rhFiltered.push(rh[ri]);
    }
    var regionApplied = 0;
    if (addList.length) {
      applied += highlightAdditionColumnHeaders(addList, hint);
    }
    if (!fullPage) {
      regionApplied = highlightRegions(rhFiltered, hint);
      applied += regionApplied;
    }
    var hasRegions = !fullPage && rhFiltered && rhFiltered.length > 0;
    var scopedRoute = tourScopePaths(spec).length > 0;
    if (fullPage) {
      applied += highlightMainBlock(hint);
    } else if (
      spec.highlightMain &&
      regionApplied === 0 &&
      !hasRegions &&
      !scopedRoute
    ) {
      applied += highlightMainBlock(hint);
    }
    var navApplied = 0;
    var navPathsArr = spec.navPaths && spec.navPaths.length ? spec.navPaths : [];
    var navLabelsArr =
      spec.navLabels && spec.navLabels.length ? spec.navLabels : [];
    var pi;
    for (pi = 0; pi < navPathsArr.length && navApplied < 2; pi++) {
      navApplied += highlightNavForPath(
        navPathsArr[pi],
        navPopoverText(navPathsArr[pi], hint)
      );
    }
    var li;
    for (li = 0; li < navLabelsArr.length && navApplied < 2; li++) {
      navApplied += highlightNavForLabel(
        navLabelsArr[li],
        navPopoverText(navLabelsArr[li], hint)
      );
    }
    applied += navApplied;
    ensureScrollListener();
    scrollTargetsIntoView();
    return {
      applied: applied,
      pathsTried: navPathsArr.length,
      navTried: navApplied,
      regions: rh ? rh.length : 0,
      regionApplied: regionApplied,
      main: !!spec.highlightMain || fullPage,
      fullPageHighlight: fullPage,
    };
  };

  window.__snappiClearPrHighlights = clearHighlights;
})();
`;
