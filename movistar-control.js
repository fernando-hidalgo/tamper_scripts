/* eslint-disable userscripts/no-invalid-headers -- Tampermonkey @allFrames */
// ==UserScript==
// @name         Movistar+ Control
// @namespace    https://github.com/tamper-scripts
// @version      1.5.0
// @description  Boost Movistar+ tab audio to 600%; K/Space play/pause; arrows seek ±15s; force max video rung
// @match        *://*.movistarplus.es/*
// @match        *://movistarplus.es/*
// @run-at       document-start
// @grant        none
// @allFrames    true
// ==/UserScript==

(() => {
  const GAIN = 3;
  const SEEK = 15;
  /** Raise stored caps; only increases. 20 Mbps covers 1080p whether unit is bps or a low kbps cap. */
  const MAX_BITRATE = 20_000_000;

  function liftBitrate(v) {
    if (!v || typeof v !== "object") {
      return false;
    }
    let changed = false;
    for (const k of Object.keys(v)) {
      if (/max[_-]?bit[_-]?rate/i.test(k) && typeof v[k] === "number" && v[k] < MAX_BITRATE) {
        v[k] = MAX_BITRATE;
        changed = true;
      } else if (v[k] && typeof v[k] === "object") {
        changed = liftBitrate(v[k]) || changed;
      }
    }
    return changed;
  }

  function patchStored(raw) {
    try {
      const o = JSON.parse(raw);
      return liftBitrate(o) ? JSON.stringify(o) : raw;
    } catch {
      return raw;
    }
  }

  function hookStorage(store) {
    const rawGet = store.getItem.bind(store);
    const rawSet = store.setItem.bind(store);
    store.getItem = (k) => patchStored(rawGet(k));
    store.setItem = (k, v) => rawSet(k, patchStored(String(v)));
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      const v = rawGet(k);
      const n = patchStored(v);
      if (n !== v) {
        rawSet(k, n);
      }
    }
  }

  function stripToMaxVideo(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) {
      return xml;
    }
    for (const set of [...doc.getElementsByTagName("AdaptationSet")]) {
      for (const a of ["maxWidth", "maxHeight", "maxBandwidth", "maxFrameRate"]) {
        set.removeAttribute(a);
      }
      const reps = [...set.getElementsByTagName("Representation")].filter(
        (r) => r.parentNode === set
      );
      if (reps.length < 2) {
        continue;
      }
      const mime = (set.getAttribute("mimeType") || set.getAttribute("contentType") || "").toLowerCase();
      const video =
        mime.includes("video") ||
        reps.some((r) => r.getAttribute("width") || r.getAttribute("height"));
      if (!video) {
        continue;
      }
      let best = reps[0];
      let bw = +best.getAttribute("bandwidth") || 0;
      for (const r of reps) {
        const b = +r.getAttribute("bandwidth") || 0;
        if (b > bw) {
          best = r;
          bw = b;
        }
      }
      for (const r of reps) {
        if (r !== best) {
          set.removeChild(r);
        }
      }
    }
    return new XMLSerializer().serializeToString(doc);
  }

  function looksMpd(url, body) {
    if (/\.mpd([?#]|$)/i.test(String(url || ""))) {
      return true;
    }
    return typeof body === "string" && body.includes("<MPD") && body.includes("AdaptationSet");
  }

  try {
    hookStorage(localStorage);
    hookStorage(sessionStorage);
  } catch {
    /* sandboxed */
  }

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.call(this, input, init);
    const url = typeof input === "string" ? input : input?.url || "";
    if (!looksMpd(url)) {
      return res;
    }
    const text = await res.clone().text();
    if (!text.includes("<MPD")) {
      return res;
    }
    return new Response(stripToMaxVideo(text), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };

  const rt = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText");
  const resp = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "response");
  const patchXhr = (xhr, t) => {
    if (xhr.readyState !== 4 || typeof t !== "string" || !t.includes("<MPD")) {
      return t;
    }
    if (!xhr.__maxMpd) {
      xhr.__maxMpd = stripToMaxVideo(t);
    }
    return xhr.__maxMpd;
  };
  if (rt?.get) {
    Object.defineProperty(XMLHttpRequest.prototype, "responseText", {
      configurable: true,
      enumerable: true,
      get() {
        return patchXhr(this, rt.get.call(this));
      },
    });
  }
  if (resp?.get) {
    Object.defineProperty(XMLHttpRequest.prototype, "response", {
      configurable: true,
      enumerable: true,
      get() {
        const v = resp.get.call(this);
        return typeof v === "string" ? patchXhr(this, v) : v;
      },
    });
  }

  const wired = new WeakSet();
  let ctx;
  let gain;
  /** Last media that fired timeupdate — for K/Space/arrows. */
  let media;

  // Don't attach MediaElementSource before setMediaKeys() — kills Widevine.
  document.addEventListener(
    "timeupdate",
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLMediaElement)) {
        return;
      }
      media = el;
      if (wired.has(el) || el.readyState < 3 || !el.currentTime) {
        return;
      }
      if (!gain) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
          return;
        }
        ctx = new AC();
        gain = ctx.createGain();
        gain.gain.value = GAIN;
        gain.connect(ctx.destination);
      }
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      wired.add(el);
      try {
        ctx.createMediaElementSource(el).connect(gain);
      } catch {
        /* already routed */
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    (e) => {
      const seekLeft = e.code === "ArrowLeft";
      const seekRight = e.code === "ArrowRight";
      const toggle = e.code === "KeyK" || e.code === "Space";
      if (
        (!toggle && !seekLeft && !seekRight) ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      ) {
        return;
      }
      if (e.target.closest?.("input,textarea,select,[contenteditable]")) {
        return;
      }
      if (!media || media.ended) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (seekLeft || seekRight) {
        const t = media.currentTime + (seekRight ? SEEK : -SEEK);
        const max = Number.isFinite(media.duration) ? media.duration : t;
        media.currentTime = Math.min(max, Math.max(0, t));
        return;
      }
      if (media.paused) {
        media.play().catch(() => {});
      } else {
        media.pause();
      }
    },
    true
  );
})();
