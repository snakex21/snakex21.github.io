// Drobne pomocniki DOM i sieci używane przez wszystkie moduły.

/** Adres poprzedniej strony (gry, narzędzia, filmy, dane LinkHub, pliki muzyki).
 *  Do testów lokalnych można go podmienić bez zmiany kodu: w konsoli przeglądarki
 *  localStorage.setItem('pulpit:oldSite', JSON.stringify('http://127.0.0.1:8002/')) i odświeżyć stronę
 *  (usunięcie klucza przywraca adres domyślny). Przyjmowany jest tylko adres http(s) zakończony "/". */
export const OLD_SITE_DEFAULT = 'https://snakex21.github.io/snakex21/';
export const OLD_SITE = (() => {
  try {
    const v = JSON.parse(localStorage.getItem('pulpit:oldSite') || 'null');
    if (typeof v === 'string' && /^https?:\/\/[^\s"'<>]+\/$/.test(v)) return v;
  } catch { /* brak dostępu do localStorage */ }
  return OLD_SITE_DEFAULT;
})();
export const GITHUB_USER = 'snakex21';

/** Tworzy element: h('button', { class: 'btn', onclick: fn }, 'Tekst', innyElement) */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (val == null) continue;
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Rozmiar (CSS px) ikony-obrazka według klasy (zgrubnie, jak w CSS: sm 16, domyślnie 32, lg do 44, xl 48–64). */
function imgPx(cls) {
  if (/\bicon-sm\b/.test(cls)) return 16;
  if (/\bicon-xl\b/.test(cls)) return 64;
  if (/\bicon-lg\b/.test(cls)) return 44;
  return 32;
}

/** Ustawia plik z zestawu 16/32/48/64 najbliższy rozmiarowi na ekranie (bez srcset: Chrome wolałby większy plik
 *  z pamięci podręcznej, a ręcznie rysowane 16 px z .ico są ostrzejsze niż pomniejszone 64 px). */
export function sizeImageIcon(img, px) {
  const path = img.dataset.iconPath;
  if (!path || !path.includes('{s}')) return;
  const need = px * (window.devicePixelRatio || 1);
  const s = [16, 32, 48, 64].find(x => x >= need - 2) || 64;
  const src = path.replace('{s}', s);
  if (img.getAttribute('src') !== src) img.src = src;
}

/** Ikona-obrazek programu (icons/programs/<repo>/…): ścieżka z "{s}" = zestaw PNG 16/32/48/64, inaczej jeden plik (SVG).
 *  Gdy pliku brak, w jego miejsce wchodzi zwykła ikona SVG "app" (bez pękniętego obrazka). */
function imageIcon(path, cls, fallback = () => icon('app', cls)) {
  const img = h('img', {
    class: cls + ' img-icon',
    dataset: { iconPath: path },
    alt: '',
    'aria-hidden': 'true',
    draggable: 'false',
    decoding: 'async'
  });
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  if (path.includes('{s}')) sizeImageIcon(img, imgPx(cls));
  else img.src = path;
  return img;
}

/** Ikona z arkusza icons/icons.svg (wstrzykniętego do dokumentu).
 *  name 'os' = logo systemu z zestawu ikon bieżącego motywu (CSS .os-logo), z własnym znakiem SVG jako zapasem.
 *  name ze znakiem "/" = ścieżka obrazka (ikony programów z data/programs.json, pole "icon"). */
export function icon(name, cls = 'icon') {
  if (typeof name === 'string' && name.includes('/')) return imageIcon(name, cls);
  if (name === 'os') {
    const box = document.createElement('span');
    box.className = cls + ' os-logo';
    box.setAttribute('aria-hidden', 'true');
    box.append(icon('start', 'os-logo-svg'));
    return box;
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

/** Małe glify przycisków okna i menu, rysowane liniami w kolorze tekstu. */
const GLYPHS = {
  min: 'M3 9.5h6',
  max: 'M2.5 2.5h7v7h-7zM2.5 3.5h7',
  restore: 'M2.5 4.5h5v5h-5zM2.5 5.5h5M4.5 2.5h5v5M4.5 3.5h5',
  close: 'M3 3l6 6M9 3l-6 6',
  chevron: 'M4.5 2.5l3.5 3.5-3.5 3.5',
  back: 'M7.5 2.5L4 6l3.5 3.5',
  refresh: 'M9.5 6a3.5 3.5 0 1 1-1-2.5M9 1.5v2.5H6.5',
  external: 'M5 2.5H2.5v7h7V7M6.5 2.5h3v3M9.5 2.5l-4 4'
};
export function glyph(name, cls = 'glyph') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls + ' glyph-' + name);
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', GLYPHS[name]);
  svg.append(p);
  return svg;
}

/** Kafelek z inicjałami dla gier i narzędzi (kolor z nazwy, styl z motywu). */
export function tile(title) {
  const words = title.replace(/\(.*?\)/g, '').match(/[\p{L}\p{N}]+/gu) || ['?'];
  const text = /^\d+$/.test(words[0]) ? words[0].slice(0, 4) : words.slice(0, 2).map(w => w[0]).join('').toLocaleUpperCase('pl');
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return h('span', { class: 'tile', 'aria-hidden': 'true', style: { '--tile-h': String(hash % 360) } }, text);
}

const ASSET_VERSION = new URL(import.meta.url).searchParams.get('v');

/** Ścieżka ikony gry / narzędzia: icons/games/<slug>.svg albo icons/tools/<slug>.svg (slug z data/*.json),
 *  z tą samą wersją ?v= co moduły. Bez sluga: null. */
export function catalogIconPath(kind, item) {
  return item?.slug ? `icons/${kind}/${encodeURIComponent(item.slug)}.svg` + (ASSET_VERSION ? '?v=' + ASSET_VERSION : '') : null;
}

/** Ikona gry / narzędzia (rysunek SVG); gdy pliku brak – kafelek z inicjałami. */
export function catalogIcon(kind, item, cls = 'icon') {
  const path = catalogIconPath(kind, item);
  if (!path) return tile(item.title);
  return imageIcon(path, cls + ' cat-icon', () => tile(item.title));
}

/** Ikona pozycji menu / grupy / kafelka: gra lub narzędzie ({ tile, kind, item }) albo ikona z arkusza / obrazek. */
export function itemArt(it, cls = 'icon icon-sm') {
  if (it.tile) return it.kind && it.item ? catalogIcon(it.kind, it.item, cls) : tile(it.label);
  return icon(it.icon || 'app', cls);
}

export async function fetchJSON(url, { timeout = 10000, cache } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache });
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      err.headers = res.headers;
      throw err;
    }
    return await res.json();
  } finally { clearTimeout(timer); }
}

const DATA_VERSION = ASSET_VERSION;
const dataCache = new Map();
/** Pliki z data/ ładowane raz na sesję strony. */
export function loadData(name) {
  if (!dataCache.has(name)) {
    dataCache.set(name, fetchJSON(new URL(`../data/${name}.json` + (DATA_VERSION ? '?v=' + DATA_VERSION : ''), import.meta.url)).catch(err => {
      dataCache.delete(name);
      throw err;
    }));
  }
  return dataCache.get(name);
}

export function oldSiteUrl(path) { return encodeURI(OLD_SITE + path); }

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return n.toLocaleString('pl-PL', { maximumFractionDigits: i ? 1 : 0 }) + ' ' + units[i];
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const narrowQuery = matchMedia('(max-width: 640px)');
export const isNarrow = () => narrowQuery.matches;
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function announce(text) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 30);
}

/** Normalizacja tekstu do wyszukiwania (bez polskich znaków i wielkości liter). */
export function fold(s) {
  return String(s || '').toLocaleLowerCase('pl').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}
