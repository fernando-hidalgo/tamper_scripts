// ==UserScript==
// @name         Carrefour Pokémon Sniper
// @description  Watch PDP stock → click add-to-cart → jump to cesta
// @version      1.0.1
// @match        https://www.carrefour.es/*VC4A-34530761/p*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
  'use strict';

  const POLL_MS = 1200;
  const JITTER_MS = 400;
  const QTY = 2;
  const AUTO_CHECKOUT = true;
  const CART_FALLBACK = '/cesta';
  const FLAG = 'cf_sniper_armed';
  const BTN = 'add-to-cart-button__button';
  const SOLD = 'add-to-cart-button__button--sold-out';

  let polls = 0;
  let hud;

  function isBuyable(html) {
    if (!html || !html.includes(BTN)) return false;
    return !html.includes(SOLD);
  }

  function liveBtn() {
    return document.querySelector('button.' + BTN);
  }

  function acceptCookies() {
    const b = document.querySelector('#onetrust-accept-btn-handler');
    if (b) b.click();
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = 880;
      g.gain.value = 0.25;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close();
      }, 600);
      setTimeout(beep, 800);
      setTimeout(beep, 1600);
    } catch (_) {}
  }

  function cartUrl() {
    const a =
      document.querySelector('a.cart-header__item[href]') ||
      document.querySelector('a[href*="/cesta"]');
    return (a && a.href) || CART_FALLBACK;
  }

  function setHud(msg) {
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'cf-sniper-hud';
      Object.assign(hud.style, {
        position: 'fixed',
        bottom: '12px',
        right: '12px',
        zIndex: '2147483647',
        background: '#111',
        color: '#0f0',
        font: '12px/1.4 monospace',
        padding: '8px 10px',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0,0,0,.4)',
        maxWidth: '280px',
        whiteSpace: 'pre-wrap',
      });
      document.documentElement.appendChild(hud);
    }
    const t = new Date().toLocaleTimeString('es-ES');
    hud.textContent = `[CF sniper] ${t}\npolls=${polls}\n${msg}`;
  }

  function qtyInput() {
    return (
      document.querySelector(
        '.add-to-cart-button input[type="number"], input[name*="qty" i], input[aria-label*="cantidad" i], [class*="quantity"] input'
      ) || null
    );
  }

  function qtyPlus() {
    return (
      document.querySelector(
        'button[aria-label*="aument" i], button[aria-label*="increas" i], button[aria-label*="más" i], [class*="quantity"] button:last-of-type, [class*="qty"] button:last-of-type'
      ) || null
    );
  }

  function setQty(n) {
    const input = qtyInput();
    if (input) {
      input.focus();
      input.value = String(n);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 'input';
    }
    const plus = qtyPlus();
    if (plus) {
      for (let i = 1; i < n; i++) plus.click();
      return 'plus';
    }
    return null;
  }

  function clickBuy() {
    acceptCookies();
    const b = liveBtn();
    if (!b || b.classList.contains(SOLD)) {
      setHud('reload: aún sold-out, re-poll');
      sessionStorage.removeItem(FLAG);
      schedulePoll();
      return;
    }
    beep();

    const how = setQty(QTY);
    if (how === 'input') {
      setHud(`qty=${QTY} input; CLICK`);
      liveBtn().click();
      goCartSoon();
      return;
    }
    if (how === 'plus') {
      setHud(`qty=${QTY} plus; CLICK`);
      const btn = liveBtn();
      if (btn && !btn.classList.contains(SOLD)) btn.click();
      goCartSoon();
      return;
    }

    // Sin selector: 1er click, luego + o 2º click
    setHud(`qty=${QTY}: 1er click…`);
    b.click();
    setTimeout(() => {
      const bumped = setQty(QTY);
      if (bumped) {
        setHud(`qty=${QTY} post-add vía ${bumped}`);
      } else {
        const btn = liveBtn();
        if (btn && !btn.classList.contains(SOLD)) {
          btn.click();
          setHud(`qty=${QTY}: 2º click`);
        } else {
          setHud(`qty bump falló; 1 en cesta?`);
        }
      }
      goCartSoon();
    }, 500);
  }

  function goCartSoon() {
    if (!AUTO_CHECKOUT) return;
    setTimeout(() => {
      setHud('→ cesta');
      location.href = cartUrl();
    }, 1500 + (QTY - 1) * 700);
  }

  function nextDelay(backoff) {
    if (backoff) return 5000;
    return POLL_MS + Math.floor(Math.random() * JITTER_MS);
  }

  let timer;
  function schedulePoll(backoff) {
    clearTimeout(timer);
    timer = setTimeout(poll, nextDelay(backoff));
  }

  async function poll() {
    acceptCookies();
    polls++;
    setHud('sondeando…');
    try {
      const r = await fetch(location.href, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'text/html' },
      });
      if (r.status === 403 || r.status === 429) {
        setHud(`HTTP ${r.status} → backoff 5s`);
        schedulePoll(true);
        return;
      }
      if (!r.ok) {
        setHud(`HTTP ${r.status}`);
        schedulePoll();
        return;
      }
      const html = await r.text();
      if (isBuyable(html)) {
        setHud('STOCK! reload…');
        sessionStorage.setItem(FLAG, '1');
        beep();
        location.reload();
        return;
      }
      setHud('sold-out');
      schedulePoll();
    } catch (e) {
      setHud('fetch err: ' + (e && e.message));
      schedulePoll(true);
    }
  }

  function start() {
    acceptCookies();
    const armed = sessionStorage.getItem(FLAG) === '1';
    if (armed) {
      sessionStorage.removeItem(FLAG);
      setHud('post-reload: intentando buy');
      // SPA/hydration may lag a beat
      const tryClick = (n) => {
        const b = liveBtn();
        if (b && !b.classList.contains(SOLD)) {
          clickBuy();
          return;
        }
        if (n < 20) setTimeout(() => tryClick(n + 1), 200);
        else {
          setHud('post-reload falló → poll');
          schedulePoll();
        }
      };
      tryClick(0);
      return;
    }

    const b = liveBtn();
    if (b && !b.classList.contains(SOLD)) {
      clickBuy();
      return;
    }
    setHud('vigilando sold-out');
    schedulePoll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
