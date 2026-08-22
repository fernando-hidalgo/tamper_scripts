// ==UserScript==
// @name         YT Control
// @description  Compact YT sidebar thumbs; hide endcards, branding; captions off
// @version      1.0.2
// @match        *://www.youtube.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  const s = document.createElement('style');
  s.textContent = `
    ytd-watch-flexy #secondary { width: 450px !important; max-width: 450px !important; }
    ytd-watch-flexy #secondary-inner .ytLockupViewModelHost {
      display: flex !important; flex-direction: row !important; align-items: flex-start !important;
    }
    ytd-watch-flexy #secondary-inner .ytLockupViewModelContentImage {
      width: 200px !important; min-width: 200px !important; flex-shrink: 0 !important;
    }
    .branding-img, #attributed-channel-name, .ytp-ce-element { display: none !important; }
  `;
  (document.head || document.documentElement).appendChild(s);

  const mo = new MutationObserver(endOff);
  function endOff() {
    const p = document.getElementById('movie_player');
    if (!p) {
      return;
    }
    if (!p.dataset.ytc) {
      p.dataset.ytc = '1';
      mo.observe(p, { childList: true, subtree: true });
    }
    for (const el of p.querySelectorAll('button, [role="button"]')) {
      if (/^(Ocultar|Hide|Mostrar|Show)$/.test(el.textContent.replace(/\s+/g, ' ').trim())) {
        el.hidden = true;
      }
    }
  }

  let capsT;
  function onNav() {
    endOff();
    clearTimeout(capsT);
    capsT = setTimeout(() => {
      try { document.getElementById('movie_player')?.unloadModule?.('captions'); } catch {}
      document.querySelector('.ytp-subtitles-button[aria-pressed="true"]')?.click();
    }, 1000);
  }

  document.addEventListener('yt-navigate-finish', onNav);
  onNav();
})();
