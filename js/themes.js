// Motywy: lista w themes/themes.json, każdy motyw to jeden plik CSS w themes/.
// Przełączenie podmienia <link id="theme-css"> (nowy arkusz ładuje się, zanim zniknie stary).
// Motyw może zadeklarować w themes.json obiekt "layout" (cechy układu, patrz README). Każda cecha
// trafia jako atrybut data-* na <html>, więc CSS i moduły JS (wm, pasek, menu Start) mogą na nią reagować.

import { fetchJSON } from './util.js';
import { store, emit } from './store.js';

let registry = null;
// Wersja z adresu modułu (dokleja ją mapa importów w index.html), żeby arkusz motywu też omijał starą kopię.
const VERSION = new URL(import.meta.url).searchParams.get('v');

export async function loadThemes() {
  if (!registry) {
    try {
      registry = await fetchJSON(new URL('../themes/themes.json' + (VERSION ? '?v=' + VERSION : ''), import.meta.url));
    } catch {
      registry = { default: 'win95', themes: [{ id: 'win95', name: 'Windows 95', file: 'win95.css', preview: {} }] };
    }
  }
  return registry;
}

/** Domyślne cechy układu: klasyczny pasek zadań na dole i zwykłe menu Start. */
export const LAYOUT_DEFAULTS = {
  taskbar: 'bottom',      // 'bottom' | 'none' (bez paska: zminimalizowane okna jako ikony na dole pulpitu)
  launcher: 'none',       // 'none' | 'executive' | 'menubar' (pasek programów u góry ekranu zamiast Start)
  programManager: false,  // true = okno „Menedżer programów” z grupami zamiast ikon pulpitu
  tiling: false,          // true = okna układane obok siebie, bez nakładania
  start: 'menu',          // 'menu' | 'screen' (pełnoekranowy ekran Start z kafelkami)
  startButton: 'button',  // 'button' | 'orb' | 'corner' (aktywny róg) – wygląd rysuje CSS motywu
  allApps: false          // true = przełącznik „Wszystkie aplikacje” na ekranie Start
};

const ATTRS = {
  taskbar: 'taskbar', launcher: 'launcher', programManager: 'progman', tiling: 'tiling',
  start: 'start', startButton: 'startBtn', allApps: 'allApps'
};

export function themeLayout(theme) {
  return { ...LAYOUT_DEFAULTS, ...(theme?.layout || {}) };
}

/** Ustawia atrybuty data-* układu na <html> i zapamiętuje je dla skryptu w <head> (bez mrugania). */
function applyLayout(theme) {
  const layout = themeLayout(theme);
  const root = document.documentElement;
  for (const [key, attr] of Object.entries(ATTRS)) root.dataset[attr] = String(layout[key]);
  // Elementy tylko dla wybranych motywów: atrybut hidden ukrywa je nawet przy nieaktualnym CSS.
  const launcher = document.getElementById('launcher');
  if (launcher) launcher.hidden = layout.launcher === 'none';
  const iconArea = document.getElementById('icon-area');
  if (iconArea) iconArea.hidden = layout.taskbar !== 'none';
  store.set('layout', layout);
  return layout;
}

/* ---------- Zestawy ikon (themes.json: "icons" w motywie, opis zestawów w "iconSets") ----------
 * Pliki: icons/<zestaw>/logo-16.png, logo-32.png, logo-48.png (logo systemu danej epoki).
 * Na <html> trafiają data-icons i zmienne --os-logo-16/32/48/lg; elementy .os-logo (icon('os') z util.js,
 * znak przycisku Start) pokazują wtedy obrazek, a bez zestawu – własny znak SVG #i-start. */
export const ICON_SIZES = [16, 32, 48];

export function iconUrl(set, size) {
  return new URL('../icons/' + set + '/logo-' + size + '.png' + (VERSION ? '?v=' + VERSION : ''), import.meta.url).href;
}

/** Zestaw ikon motywu (obiekt z iconSets + id) albo null. */
export function themeIcons(theme) {
  const id = theme?.icons;
  if (!id || !/^[a-z0-9-]+$/.test(id)) return null;
  return { id, large: 32, pixelated: false, ...(registry?.iconSets?.[id] || {}) };
}

let iconToken = 0;
function clearIcons(root) {
  delete root.dataset.icons;
  delete root.dataset.iconsPixelated;
  for (const px of [...ICON_SIZES, 'lg']) root.style.removeProperty('--os-logo-' + px);
}

function applyIcons(theme) {
  const root = document.documentElement;
  const set = themeIcons(theme);
  const token = ++iconToken;
  if (!set) { clearIcons(root); store.remove('icons'); return; }
  for (const px of ICON_SIZES) root.style.setProperty('--os-logo-' + px, `url("${iconUrl(set.id, px)}")`);
  root.style.setProperty('--os-logo-lg', `var(--os-logo-${set.large === 48 ? 48 : 32})`);
  root.dataset.icons = set.id;
  if (set.pixelated) root.dataset.iconsPixelated = 'true'; else delete root.dataset.iconsPixelated;
  store.set('icons', { id: set.id, large: set.large === 48 ? 48 : 32, pixelated: !!set.pixelated });
  // Brak pliku (np. usunięty zestaw) = wracamy do własnego znaku SVG.
  const probe = new Image();
  probe.onerror = () => { if (token === iconToken) { clearIcons(root); store.remove('icons'); } };
  probe.src = iconUrl(set.id, 32);
}

export const layout = () => {
  const d = document.documentElement.dataset;
  return {
    taskbar: d.taskbar || 'bottom', launcher: d.launcher || 'none', programManager: d.progman === 'true',
    tiling: d.tiling === 'true', start: d.start || 'menu', startButton: d.startBtn || 'button', allApps: d.allApps === 'true'
  };
};

export const currentTheme = () => document.documentElement.dataset.theme;
/** Czy motyw ma warianty (np. jasny / ciemny w Windows 11); przed wczytaniem themes.json – false. */
export const hasVariants = id => !!registry?.themes.find(t => t.id === id)?.variants?.length;
export const currentVariant = () => document.documentElement.dataset.variant || 'auto';

export async function applyTheme(id, { variant } = {}) {
  const reg = await loadThemes();
  const theme = reg.themes.find(t => t.id === id) || reg.themes.find(t => t.id === reg.default) || reg.themes[0];
  const root = document.documentElement;
  const old = document.getElementById('theme-css');
  const href = new URL('../themes/' + theme.file + (VERSION ? '?v=' + VERSION : ''), import.meta.url).href;

  if (!old || old.href !== href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    await new Promise(resolve => {
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      (old || document.head.lastElementChild).after(link);
    });
    old?.remove();
    link.id = 'theme-css';
  }
  root.dataset.theme = theme.id;
  applyLayout(theme);
  applyIcons(theme);
  if (variant) root.dataset.variant = variant;
  store.set('theme', theme.id);
  if (variant) store.set('variant', variant);
  emit('theme:change', theme);
  return theme;
}

export function setVariant(variant) {
  document.documentElement.dataset.variant = variant;
  store.set('variant', variant);
  emit('theme:change');
}

export function setWallColor(color) {
  const root = document.documentElement;
  if (color) {
    root.style.setProperty('--wall-color', color);
    store.set('wallColor', color);
  } else {
    root.style.removeProperty('--wall-color');
    store.remove('wallColor');
  }
}

/** Po starcie: jeśli zapisany motyw nie istnieje (np. usunięty plik), wracamy do domyślnego.
 *  Cechy układu są zawsze odświeżane z themes.json (zapamiętane mogły się zestarzeć). */
export async function verifyTheme() {
  const reg = await loadThemes();
  const theme = reg.themes.find(t => t.id === currentTheme());
  if (!theme) await applyTheme(reg.default);
  else { applyLayout(theme); applyIcons(theme); }
}
