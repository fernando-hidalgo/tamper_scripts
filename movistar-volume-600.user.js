/* eslint-disable userscripts/no-invalid-headers -- Tampermonkey @allFrames */
// ==UserScript==
// @name         Movistar+ volume 600%
// @namespace    https://github.com/tamper-scripts
// @version      1.3.1
// @description  Boost Movistar+ tab audio to 600% via Web Audio GainNode; K/Space toggles play/pause
// @match        *://*.movistarplus.es/*
// @match        *://movistarplus.es/*
// @run-at       document-idle
// @grant        none
// @allFrames    true
// ==/UserScript==

(() => {
  const GAIN = 6;
  const wired = new WeakSet();
  let ctx;
  let gain;
  /** Last media that fired timeupdate — for K/Space toggle. */
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
      if (
        (e.code !== "KeyK" && e.code !== "Space") ||
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
      if (media.paused) {
        media.play().catch(() => {});
      } else {
        media.pause();
      }
    },
    true
  );
})();
