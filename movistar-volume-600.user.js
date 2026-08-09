// ==UserScript==
// @name         Movistar+ volume 600%
// @namespace    https://github.com/tamper-scripts
// @version      1.1.0
// @description  Boost Movistar+ tab audio to 600% via Web Audio GainNode
// @match        *://*.movistarplus.es/*
// @match        *://movistarplus.es/*
// @run-at       document-idle
// @grant        none
// @allFrames    true
// ==/UserScript==

(() => {
  const GAIN = 6; // 600% — same ceiling as Volume Master
  const wired = new WeakSet();
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {GainNode|null} */
  let gain = null;

  function graph() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      gain = ctx.createGain();
      gain.gain.value = GAIN;
      gain.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return gain;
  }

  // Attaching a MediaElementAudioSourceNode before the player calls
  // setMediaKeys() kills the Widevine session and the page hangs loading,
  // so only wire once frames are actually decoding.
  function wire(el) {
    if (wired.has(el) || el.readyState < 3 || !el.currentTime) return;
    const dest = graph();
    if (!dest) return;
    wired.add(el);
    try {
      ctx.createMediaElementSource(el).connect(dest);
    } catch {
      // element already routed elsewhere
    }
  }

  document.addEventListener(
    "timeupdate",
    (e) => {
      if (e.target instanceof HTMLMediaElement) wire(e.target);
    },
    true
  );
})();
