// ==UserScript==
// @name         Twitter Media → Photos / Profile → Posts
// @namespace    https://github.com/tamper-scripts
// @version      1.2.1
// @description  Default Media to photos and profile tab to Posts (/all) on Twitter/X
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  const RESERVED = new Set(
    "home explore notifications messages i settings compose search login logout signup intent hashtag jobs communities lists bookmarks grok following verified tos privacy help about download oauth account rules search-advanced share flow".split(
      " "
    )
  );
  let lock = false;

  function prefer(url, from) {
    try {
      const u = new URL(url, location.origin);
      const p = u.pathname;
      if (/\/media\/?$/.test(p)) {
        const f = u.searchParams.get("filter");
        if (f && !(f === "video" && !/\/media\/?$/.test(from))) return null;
        u.searchParams.set("filter", "photo");
        return p + u.search + u.hash;
      }
      const m = /^\/([A-Za-z0-9_]+)\/?$/.exec(p);
      if (!m || RESERVED.has(m[1].toLowerCase())) return null;
      const prev = /^\/([A-Za-z0-9_]+)\/(all|highlights)\/?$/i.exec(from);
      if (prev && prev[1].toLowerCase() === m[1].toLowerCase()) return null;
      return `/${m[1]}/all` + u.search + u.hash;
    } catch {
      return null;
    }
  }

  function go(next) {
    lock = true;
    location.replace(next);
  }

  function wrapHistory(method) {
    const orig = history[method].bind(history);
    history[method] = (state, title, url) => {
      if (lock || url == null) return orig(state, title, url);
      const next = prefer(url, location.pathname);
      return next ? go(next) : orig(state, title, url);
    };
  }
  wrapHistory("pushState");
  wrapHistory("replaceState");

  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target?.closest?.("a[href]");
      const next = a && prefer(a.href, location.pathname);
      if (!next) return;
      e.preventDefault();
      e.stopPropagation();
      go(next);
    },
    true
  );

  const boot = prefer(location.href, location.pathname);
  if (boot) go(boot);
})();
