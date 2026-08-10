// ==UserScript==
// @name         MV hide hilos relacionados
// @namespace    https://github.com/tamper-scripts
// @version      1.0.0
// @description  Oculta la sección "Hilos relacionados" en hilos de Mediavida
// @match        *://www.mediavida.com/foro/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  const s = document.createElement('style');
  s.textContent = `.hilos-relacionados { display: none !important; }`;
  (document.head || document.documentElement).appendChild(s);
})();
