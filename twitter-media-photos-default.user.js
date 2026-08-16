// ==UserScript==
// @name         Twitter Media → Photos / Profile → Posts
// @namespace    https://github.com/tamper-scripts
// @version      1.2.0
// @description  Default Media to photos and profile tab to Posts (/all) on Twitter/X
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  const MEDIA = /\/media\/?$/;
  const PROFILE_ROOT = /^\/([A-Za-z0-9_]+)\/?$/;
  const FROM_POSTS_MENU = /^\/([A-Za-z0-9_]+)\/(all|highlights)\/?$/i;
  const RESERVED = new Set([
    "home",
    "explore",
    "notifications",
    "messages",
    "i",
    "settings",
    "compose",
    "search",
    "login",
    "logout",
    "signup",
    "intent",
    "hashtag",
    "jobs",
    "communities",
    "lists",
    "bookmarks",
    "grok",
    "following",
    "verified",
    "tos",
    "privacy",
    "help",
    "about",
    "download",
    "oauth",
    "account",
    "rules",
    "search-advanced",
    "share",
    "flow",
  ]);
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

  /** Profile root → /user/all (Posts). Skip if leaving Posts menu for All. */
  /** @returns {string|null} */
  function toPosts(url, fromPath) {
    try {
      const u = new URL(url, location.origin);
      const m = PROFILE_ROOT.exec(u.pathname);
      if (!m) return null;
      const user = m[1];
      if (RESERVED.has(user.toLowerCase())) return null;
      const from = FROM_POSTS_MENU.exec(fromPath);
      if (from && from[1].toLowerCase() === user.toLowerCase()) return null;
      return `/${user}/all` + u.search + u.hash;
    } catch {
      return null;
    }
  }

  /** @returns {string|null} */
  function prefer(url, fromPath) {
    return toPhotos(url, fromPath) || toPosts(url, fromPath);
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
