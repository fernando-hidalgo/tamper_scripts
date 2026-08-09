// ==UserScript==
// @name         YT sidebar thumbs compact
// @match        *://www.youtube.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function(){
  const s = document.createElement('style');
  s.textContent = `
    /* Sidebar: ancho fijo */
    ytd-watch-flexy #secondary {
      width: 450px !important;
      max-width: 450px !important;
    }

    /* Miniaturas: layout horizontal (thumb izq, texto der) */
    ytd-watch-flexy #secondary-inner .ytLockupViewModelHost {
      display: flex !important;
      flex-direction: row !important;
      align-items: flex-start !important;
    }

    /* Miniaturas: tamaño medio ~200px */
    ytd-watch-flexy #secondary-inner .ytLockupViewModelContentImage {
      width: 200px !important;
      min-width: 200px !important;
      flex-shrink: 0 !important;
    }

    /* Overlay: logo del canal encima del vídeo */
    .branding-img { display: none !important; }

    /* Nombre de canal duplicado bajo el título */
    #attributed-channel-name { display: none !important; }
  `;
  (document.head || document.documentElement).appendChild(s);
})();