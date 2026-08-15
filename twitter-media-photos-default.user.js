// ==UserScript==
// @name         Twitter Media → Photos default
// @namespace    https://github.com/tamper-scripts
// @version      1.0.2
// @description  Default Media tab filter to photos instead of videos on Twitter
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  const MEDIA_RE = /\/media\/?$/;
  let forcing = false;

  function parseUrl(url) {
    try {
      return typeof url === "string"
        ? new URL(url, location.origin)
        : new URL(url.href || String(url), location.origin);
    } catch {
      return null;
    }
  }

  /** @returns {string|null} rewritten path+search+hash, or null if no change */
  function photoTarget(url, fromPath) {
    const u = parseUrl(url);
    if (!u || !MEDIA_RE.test(u.pathname)) return null;

    const filter = u.searchParams.get("filter");
    if (!filter) {
      u.searchParams.set("filter", "photo");
      return u.pathname + u.search + u.hash;
    }
    if (filter === "video" && !MEDIA_RE.test(fromPath)) {
      u.searchParams.set("filter", "photo");
      return u.pathname + u.search + u.hash;
    }
    return null;
  }

  function patch(method) {
    const orig = history[method].bind(history);
    history[method] = function (state, title, url) {
      if (forcing || url == null) return orig(state, title, url);

      const next = photoTarget(url, location.pathname);
      if (!next) return orig(state, title, url);

      // URL-only rewrite leaves SPA on video timeline — hard nav loads photos.
      forcing = true;
      try {
        location.replace(next);
      } finally {
        // leave forcing true until unload; replace navigates away
      }
      return undefined;
    };
  }

  patch("pushState");
  patch("replaceState");

  // Rewrite Media tab links before Twitter's SPA handles the click.
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target && e.target.closest && e.target.closest('a[href*="/media"]');
      if (!a) return;
      const next = photoTarget(a.href, location.pathname);
      if (!next) return;
      e.preventDefault();
      e.stopPropagation();
      forcing = true;
      location.assign(next);
    },
    true
  );

  if (MEDIA_RE.test(location.pathname) && !new URLSearchParams(location.search).get("filter")) {
    forcing = true;
    location.replace(location.pathname + "?filter=photo" + location.hash);
  }
})();
