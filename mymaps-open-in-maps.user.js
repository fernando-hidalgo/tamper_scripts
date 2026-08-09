// ==UserScript==
// @name         MyMaps → Abrir en Google Maps
// @namespace    https://github.com/mymaps-open-in-maps
// @version      1.0.1
// @description  Añade un botón ↗ junto a cada lugar del panel de My Maps para abrirlo en Google Maps
// @match        https://www.google.com/maps/d/edit*
// @match        https://www.google.com/maps/d/viewer*
// @match        https://www.google.com/maps/d/u/*/edit*
// @match        https://www.google.com/maps/d/u/*/viewer*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  const BTN_CLASS = "mmogm-open";
  const STYLE_ID = "mmogm-style";

  /** @type {Map<string, {name:string,lat:number,lng:number,occ:number}[]>} */
  let byName = new Map();
  let ready = false;

  function midFromUrl(href) {
    try {
      return new URL(href).searchParams.get("mid") || "";
    } catch {
      return "";
    }
  }

  function decodeXml(s) {
    return String(s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function parseKml(xmlText) {
    const places = [];
    const re = /<Placemark\b[\s\S]*?<\/Placemark>/gi;
    let m;
    while ((m = re.exec(xmlText))) {
      const block = m[0];
      if (!/<Point\b/i.test(block)) continue;
      const nameM = block.match(/<name\b[^>]*>([\s\S]*?)<\/name>/i);
      const coordM = block.match(/<coordinates\b[^>]*>\s*([^<\s,]+)\s*,\s*([^<\s,]+)/i);
      if (!nameM || !coordM) continue;
      const name = decodeXml(nameM[1]).trim();
      const lng = parseFloat(coordM[1]);
      const lat = parseFloat(coordM[2]);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      places.push({ name, lat, lng });
    }
    const counts = Object.create(null);
    for (const p of places) {
      const occ = counts[p.name] || 0;
      counts[p.name] = occ + 1;
      p.occ = occ;
    }
    return places;
  }

  function mapsSearchUrl(place) {
    return (
      "https://www.google.com/maps/search/" +
      encodeURIComponent(place.name) +
      "/@" +
      place.lat +
      "," +
      place.lng +
      ",17z?hl=es"
    );
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      .mmogm-row { position: relative !important; }
      .${BTN_CLASS} {
        all: unset;
        box-sizing: border-box;
        position: absolute;
        right: 34px; /* clear of the row's own edit/style button */
        top: 50%;
        transform: translateY(-50%);
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        background: #fff;
        color: #1a73e8;
        cursor: pointer;
        border-radius: 4px;
        opacity: 0;
        pointer-events: none;
      }
      .mmogm-row:hover .${BTN_CLASS} {
        opacity: 1;
        pointer-events: auto;
      }
      .${BTN_CLASS}:hover { background: #e8f0fe; }
      .${BTN_CLASS} svg {
        width: 14px;
        height: 14px;
        display: block;
        pointer-events: none;
      }
    `;
    document.documentElement.appendChild(s);
  }

  async function loadPlaces() {
    const mid = midFromUrl(location.href);
    if (!mid) return;
    const res = await fetch(
      "https://www.google.com/maps/d/kml?mid=" + encodeURIComponent(mid) + "&forcekml=1",
      { credentials: "include" }
    );
    if (!res.ok) throw new Error("KML " + res.status);
    const places = parseKml(await res.text());
    byName = new Map();
    for (const p of places) {
      const list = byName.get(p.name) || [];
      list.push(p);
      byName.set(p.name, list);
    }
    ready = true;
  }

  function layersPanel() {
    const sample = [...byName.keys()].slice(0, 8);
    if (sample.length < 3) return null;
    const firstNodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if ((node.nodeValue || "").trim() === sample[0]) firstNodes.push(node);
    }
    let best = null;
    let bestScore = 0;
    for (const n of firstNodes) {
      let el = n.parentElement;
      for (let up = 0; up < 14 && el; up++) {
        const text = el.innerText || "";
        let score = 0;
        for (const name of sample) if (text.includes(name)) score++;
        const tighter =
          score === bestScore && best && text.length < (best.innerText || "").length;
        if (score > bestScore || tighter) {
          bestScore = score;
          best = el;
        }
        el = el.parentElement;
      }
    }
    return bestScore >= 3 ? best : null;
  }

  // The row is the ancestor of the name that spans (most of) the panel width and
  // is only one line tall. Anchoring there keeps the arrow aligned whatever the
  // row's internal layout is, and out of reach of the name's ellipsis clipping.
  function rowFor(nameEl, panelWidth) {
    let el = nameEl;
    for (let i = 0; i < 6 && el; i++) {
      const r = el.getBoundingClientRect();
      if (r.width >= panelWidth * 0.85 && r.height > 0 && r.height <= 56) return el;
      el = el.parentElement;
    }
    return nameEl;
  }

  function attach(row, place) {
    for (const child of row.children) {
      if (child.classList && child.classList.contains(BTN_CLASS)) return;
    }
    const a = document.createElement("a");
    a.className = BTN_CLASS;
    a.href = mapsSearchUrl(place);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = "Abrir en Google Maps";
    a.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
      '<path fill="none" stroke="#1a73e8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M6 3.2h6.8V10M12.8 3.2 3.2 12.8"/>' +
      "</svg>";
    ["click", "mousedown", "mouseup", "pointerdown"].forEach((type) =>
      a.addEventListener(type, (ev) => ev.stopPropagation())
    );
    row.classList.add("mmogm-row");
    row.appendChild(a);
  }

  function paint() {
    if (!ready || !byName.size) return;
    ensureStyle();
    const panel = layersPanel();
    if (!panel) return;
    const panelWidth = panel.getBoundingClientRect().width || 300;

    // collect first, then mutate: inserting while walking disturbs the walker
    const hits = [];
    const seen = Object.create(null);
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const name = (node.nodeValue || "").trim();
      if (!name || !byName.has(name)) continue;
      const el = node.parentElement;
      if (!el || el.closest("." + BTN_CLASS)) continue;
      const list = byName.get(name);
      const occ = seen[name] || 0;
      seen[name] = occ + 1;
      const place = list[occ] || list[0];
      if (place) hits.push({ el, place });
    }

    for (const hit of hits) {
      attach(rowFor(hit.el, panelWidth), hit.place);
    }
  }

  let timer = 0;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(paint, 250);
  }

  async function boot() {
    try {
      await loadPlaces();
    } catch (e) {
      console.warn("[mmogm] no se pudo cargar el KML", e);
      return;
    }
    paint();
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  boot();
})();
