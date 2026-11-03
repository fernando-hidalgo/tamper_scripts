// ==UserScript==
// @name         GDrive Bulk Download
// @namespace    https://github.com/tamper-scripts
// @version      1.2.0
// @description  Descarga archivos visibles de Drive uno a uno (sin zip) y acepta el modal de virus
// @match        https://drive.google.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const PREFIX = '[gdbd]';
  const HUD_ID = 'gdbd-hud';
  const STYLE_ID = 'gdbd-style';

  const BETWEEN_MS = 350;
  const MODAL_POLL_MS = 100;
  const MODAL_APPEAR_MS = 1800;
  const MODAL_TIMEOUT_MS = 8000;
  const UI_SETTLE_MS = 180;

  const DOWNLOAD_LABELS = [/descargar/i, /^download$/i];
  const ANYWAY_LABELS = [
    /descargar de todos modos/i,
    /download anyway/i,
  ];
  let running = false;
  let stopRequested = false;
  let lastAnywayAt = 0;
  let hud;
  let progressLabel;
  let progressFill;
  let startBtn;
  let stopBtn;

  function log(...args) {
    console.log(PREFIX, ...args);
  }

  function warn(...args) {
    console.warn(PREFIX, ...args);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normText(el) {
    if (!el) return '';
    return (
      (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('data-tooltip'))) ||
      el.textContent ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function ensureStyle() {
    let s = document.getElementById(STYLE_ID);
    if (!s) {
      s = document.createElement('style');
      s.id = STYLE_ID;
      document.documentElement.appendChild(s);
    }
    s.textContent = `
      #${HUD_ID} {
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 2147483647;
        box-sizing: border-box;
        width: 340px;
        background: #1a1a1a;
        color: #e8e8e8;
        font: 12px/1.4 Consolas, "Segoe UI Mono", monospace;
        padding: 10px 12px;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,.45);
      }
      #${HUD_ID} .gdbd-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
        min-height: 16px;
      }
      #${HUD_ID} .gdbd-title {
        flex: 0 0 auto;
        font-weight: 700;
        color: #8fd3ff;
        line-height: 1;
      }
      #${HUD_ID} .gdbd-progress {
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      #${HUD_ID} .gdbd-progress-label {
        flex: 0 0 auto;
        min-width: 3.5em;
        color: #cfcfcf;
        text-align: right;
        line-height: 1;
      }
      #${HUD_ID} .gdbd-progress-track {
        flex: 1 1 auto;
        height: 8px;
        border-radius: 4px;
        background: #333;
        overflow: hidden;
        min-width: 48px;
      }
      #${HUD_ID} .gdbd-progress-fill {
        height: 100%;
        width: 0%;
        background: #1a73e8;
        border-radius: 4px;
        transition: width .2s ease, background .2s ease;
      }
      #${HUD_ID} .gdbd-progress-fill.is-paused {
        background: #888;
      }
      #${HUD_ID} .gdbd-actions {
        display: flex;
        gap: 8px;
        align-items: stretch;
      }
      #${HUD_ID} button {
        flex: 1 1 0;
        height: 32px;
        border: 0;
        border-radius: 4px;
        padding: 0 8px;
        cursor: pointer;
        font: inherit;
        white-space: nowrap;
        line-height: 32px;
      }
      #${HUD_ID} .gdbd-start {
        background: #1a73e8;
        color: #fff;
      }
      #${HUD_ID} .gdbd-start:disabled {
        opacity: .5;
        cursor: default;
      }
      #${HUD_ID} .gdbd-stop {
        background: #444;
        color: #fff;
      }
      #${HUD_ID} .gdbd-stop:disabled {
        opacity: .5;
        cursor: default;
      }
    `;
  }

  function bindHudRefs() {
    progressLabel = hud.querySelector('.gdbd-progress-label');
    progressFill = hud.querySelector('.gdbd-progress-fill');
    startBtn = hud.querySelector('.gdbd-start');
    stopBtn = hud.querySelector('.gdbd-stop');
  }

  function setProgress(done, total, opts) {
    if (!progressFill || !progressLabel) return;
    const paused = !!(opts && opts.paused);
    const t = Math.max(0, total | 0);
    const d = Math.max(0, Math.min(done | 0, t));
    progressLabel.textContent = paused ? `${d}/${t}` : `${d}/${t}`;
    progressFill.style.width = t ? `${Math.round((d / t) * 100)}%` : '0%';
    progressFill.classList.toggle('is-paused', paused);
  }

  function clearHudMsg() {
    if (progressFill) {
      progressFill.style.width = '0%';
      progressFill.classList.remove('is-paused');
    }
    if (progressLabel) progressLabel.textContent = '';
  }

  function setRunningUi(isRunning) {
    running = isRunning;
    if (startBtn) startBtn.disabled = isRunning;
    if (stopBtn) stopBtn.disabled = !isRunning;
  }

  function ensureHud() {
    ensureStyle();
    const existing = document.getElementById(HUD_ID);
    if (existing && !existing.querySelector('.gdbd-header')) {
      existing.remove();
    } else if (existing) {
      hud = existing;
      bindHudRefs();
      return;
    }

    hud = document.createElement('div');
    hud.id = HUD_ID;
    hud.innerHTML = `
      <div class="gdbd-header">
        <div class="gdbd-title">GDBulk</div>
        <div class="gdbd-progress">
          <div class="gdbd-progress-track"><div class="gdbd-progress-fill"></div></div>
          <span class="gdbd-progress-label"></span>
        </div>
      </div>
      <div class="gdbd-actions">
        <button type="button" class="gdbd-start">Descargar visibles</button>
        <button type="button" class="gdbd-stop" disabled>Parar</button>
      </div>
    `;
    document.documentElement.appendChild(hud);
    bindHudRefs();

    startBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      startQueue();
    });
    stopBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      stopRequested = true;
      log('stop requested');
    });
  }

  function isFolderRow(row) {
    const mime =
      row.getAttribute('data-mime-type') ||
      row.getAttribute('data-mime') ||
      '';
    if (/google-apps\.folder/i.test(mime)) return true;

    if (
      row.querySelector(
        '[aria-label*="Carpeta" i], [aria-label*="Folder" i], img[alt*="Carpeta" i], img[alt*="Folder" i]'
      )
    ) {
      return true;
    }

    const mimeEl = row.querySelector('[data-mime-type]');
    if (mimeEl && /google-apps\.folder/i.test(mimeEl.getAttribute('data-mime-type') || '')) {
      return true;
    }

    return false;
  }

  function rowLabel(row) {
    const named =
      row.getAttribute('aria-label') ||
      row.querySelector('[aria-label]')?.getAttribute('aria-label') ||
      row.querySelector('[data-tooltip]')?.getAttribute('data-tooltip');
    if (named) return named.replace(/\s+/g, ' ').trim().slice(0, 120);
    return (row.getAttribute('data-id') || 'archivo').slice(0, 40);
  }

  function collectFileRows() {
    const seen = new Set();
    const rows = [];

    const candidates = document.querySelectorAll('[data-id]');
    for (const el of candidates) {
      const id = el.getAttribute('data-id');
      if (!id || seen.has(id)) continue;
      // Prefer the outermost actionable row for this id
      const row =
        el.closest('[role="row"]') ||
        el.closest('[role="option"]') ||
        el.closest('[data-id]') ||
        el;
      if (!isVisible(row)) continue;
      if (isFolderRow(row) || isFolderRow(el)) continue;
      // Skip Drive chrome / shared-drive roots with empty-looking ids that are not files
      if (id.length < 5) continue;

      seen.add(id);
      rows.push({ id, el: row, name: rowLabel(row) });
    }

    log('collected files:', rows.length, rows.map((r) => r.name));
    return rows;
  }

  function clearSelection() {
    // Escape clears selection in Drive; also click empty list area if available
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })
    );
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })
    );
  }

  function clickEl(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    if (typeof el.click === 'function') el.click();
    return true;
  }

  function selectRow(row) {
    clearSelection();
    // Focus and click the row; Drive needs a real click on the row body
    const target =
      row.querySelector('[role="checkbox"]') ||
      row.querySelector('[data-tooltip]') ||
      row;
    clickEl(target);
    // Second click on row itself helps when checkbox only toggles without focusing actions
    if (target !== row) clickEl(row);
  }

  function findToolbarDownload() {
    const candidates = document.querySelectorAll(
      'button, div[role="button"], span[role="button"]'
    );
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const t = normText(el);
      if (!t) continue;
      // "Descargar" / "Download" but not "Descargar de todos modos"
      if (/^descargar$/i.test(t) || /^download$/i.test(t)) return el;
      if (
        DOWNLOAD_LABELS.some((re) => re.test(t)) &&
        !ANYWAY_LABELS.some((re) => re.test(t)) &&
        t.length < 24
      ) {
        return el;
      }
    }
    return null;
  }

  function findRowMoreButton(row) {
    const btns = row.querySelectorAll('button, div[role="button"], span[role="button"]');
    for (const el of btns) {
      if (!isVisible(el)) continue;
      const t = normText(el);
      if (/más acciones|more actions|more options|menú|menu/i.test(t)) return el;
      if (t === '⋮' || t === '...') return el;
    }
    // Last icon-like button in the row
    const icons = [...btns].filter(isVisible);
    return icons.length ? icons[icons.length - 1] : null;
  }

  function findMenuDownload() {
    // Menus often render in a portal at document root
    const items = document.querySelectorAll(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="option"], span[role="menuitem"], div[role="menuitem"]'
    );
    for (const el of items) {
      if (!isVisible(el)) continue;
      const t = normText(el);
      if (/^descargar$/i.test(t) || /^download$/i.test(t)) return el;
      if (DOWNLOAD_LABELS.some((re) => re.test(t)) && !ANYWAY_LABELS.some((re) => re.test(t))) {
        return el;
      }
    }
    return null;
  }

  async function triggerDownload(row) {
    selectRow(row);
    await sleep(UI_SETTLE_MS);

    let btn = findToolbarDownload();
    if (btn) {
      log('toolbar download', normText(btn));
      clickEl(btn);
      return true;
    }

    warn('toolbar download not found, trying row menu');
    const more = findRowMoreButton(row);
    if (!more) {
      warn('row more-button not found');
      return false;
    }
    clickEl(more);
    await sleep(UI_SETTLE_MS);

    const menuDl = findMenuDownload();
    if (!menuDl) {
      warn('menu download item not found');
      return false;
    }
    log('menu download', normText(menuDl));
    clickEl(menuDl);
    return true;
  }

  function findAnywayButton() {
    const nodes = document.querySelectorAll(
      'button, div[role="button"], span[role="button"], a[role="button"]'
    );
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const t = normText(el);
      if (ANYWAY_LABELS.some((re) => re.test(t))) return el;
    }
    return null;
  }

  function clickAnywayIfPresent() {
    const btn = findAnywayButton();
    if (!btn) return false;
    log('clicking virus modal:', normText(btn));
    clickEl(btn);
    lastAnywayAt = Date.now();
    return true;
  }

  async function waitForAnywayOrTimeout() {
    const start = Date.now();
    const sinceBefore = lastAnywayAt;
    let clicked = false;

    while (Date.now() - start < MODAL_TIMEOUT_MS) {
      if (stopRequested) break;

      if (lastAnywayAt > sinceBefore) {
        clicked = true;
        await sleep(150);
        break;
      }

      if (clickAnywayIfPresent()) {
        clicked = true;
        await sleep(150);
        const goneDeadline = Date.now() + 1500;
        while (Date.now() < goneDeadline && findAnywayButton()) {
          clickAnywayIfPresent();
          await sleep(MODAL_POLL_MS);
        }
        break;
      }

      if (!clicked && Date.now() - start >= MODAL_APPEAR_MS) {
        log('no virus modal (fast path)');
        break;
      }

      await sleep(MODAL_POLL_MS);
    }

    return clicked;
  }

  async function startQueue() {
    if (running) return;
    stopRequested = false;
    setRunningUi(true);
    clearHudMsg();

    const files = collectFileRows();
    if (!files.length) {
      if (progressLabel) progressLabel.textContent = '0';
      setRunningUi(false);
      return;
    }

    const total = files.length;
    setProgress(0, total);
    log('starting queue of', total);

    let done = 0;
    for (let i = 0; i < total; i++) {
      if (stopRequested) break;

      const file = files[i];
      setProgress(done, total);
      log(`file ${i + 1}/${total}`, file.id, file.name);

      try {
        const ok = await triggerDownload(file.el);
        if (!ok) {
          warn('could not trigger download for', file.name);
        } else {
          await waitForAnywayOrTimeout();
        }
      } catch (e) {
        warn('error on file', file.name, e);
      }

      done = i + 1;
      setProgress(done, total);

      if (stopRequested) break;
      if (i < total - 1) await sleep(BETWEEN_MS);
    }

    if (stopRequested) {
      setProgress(done, total, { paused: true });
    } else {
      setProgress(total, total);
      setTimeout(() => clearHudMsg(), 1500);
    }
    setRunningUi(false);
    stopRequested = false;
    log('queue finished');
  }

  // Always-on modal auto-accept (also helps manual downloads)
  function watchModal() {
    const tick = () => {
      try {
        clickAnywayIfPresent();
      } catch (_) {}
    };
    setInterval(tick, MODAL_POLL_MS);
    new MutationObserver(() => tick()).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function boot() {
    ensureHud();
    watchModal();
    log('ready');
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
