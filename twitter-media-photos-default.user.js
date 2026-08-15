// ==UserScript==
// @name         Twitter Media → Photos default
// @namespace    https://github.com/tamper-scripts
// @version      1.1.0
// @description  Default Media tab filter to photos instead of videos on Twitter
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  const MEDIA = /\/media\/?$/;
  let lock = false;

  /** @returns {string|null} */
  function toPhotos(url, fromPath) {
    try {
      const u = new URL(url, location.origin);
      if (!MEDIA.test(u.pathname)) return null;
      const f = u.searchParams.get("filter");
      // bare /media, or Twitter's default ?filter=video when entering Media
      if (f && !(f === "video" && !MEDIA.test(fromPath))) return null;
      u.searchParams.set("filter", "photo");
      return u.pathname + u.search + u.hash;
    } catch {
      return null;
    }
  }

  function go(next) {
    lock = true;
    location.replace(next);
  }

  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m].bind(history);
    history[m] = (state, title, url) => {
      if (lock || url == null) return orig(state, title, url);
      const next = toPhotos(url, location.pathname);
      return next ? go(next) : orig(state, title, url);
    };
  }

  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target?.closest?.('a[href*="/media"]');
      const next = a && toPhotos(a.href, location.pathname);
      if (!next) return;
      e.preventDefault();
      e.stopPropagation();
      go(next);
    },
    true
  );

  const boot = toPhotos(location.href, location.pathname);
  if (boot) go(boot);
})();
