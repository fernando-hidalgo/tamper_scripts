// ==UserScript==
// @name         YT Tinkered
// @description  Compact YT sidebar thumbs; hide endcards, branding; captions off
// @version      1.0.0
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

  function off() {
    const p = document.getElementById('movie_player');
    if (p?.unloadModule) try { p.unloadModule('captions'); } catch {}
    document.querySelector('.ytp-subtitles-button[aria-pressed="true"]')?.click();
    if (!p) return;
    for (const el of p.querySelectorAll('button, [role="button"]')) {
      if (/^(Ocultar|Hide|Mostrar|Show)$/.test(el.textContent.replace(/\s+/g, ' ').trim()))
        el.style.setProperty('display', 'none', 'important');
    }
  }

  const mo = new MutationObserver(off);
  function hook() {
    const p = document.getElementById('movie_player');
    if (!p || p.dataset.ytc) return;
    p.dataset.ytc = '1';
    mo.observe(p, { childList: true, subtree: true });
    off();
  }

  document.addEventListener('yt-navigate-finish', hook);
  hook();
})();
