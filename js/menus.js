// Menu kontekstowe pulpitu: tło i ikony pulpitu, pasek tytułu okna (menu systemowe, też klik w ikonę okna
// i Alt+Spacja), przyciski i puste miejsce paska zadań, ikony zminimalizowanych okien.
// Pomocniki dla programów: itemMenu() (Otwórz / Otwórz w nowej karcie / Właściwości), describe(), showProperties().
// Programy podpinają własne menu pozycji przez bindMenu() z js/contextmenu.js (np. catalog.js, linkhub.js, music.js).

import { bindMenu, registerMenu, showMenu } from './contextmenu.js';
import { h, icon, oldSiteUrl, catalogIconPath, isNarrow, GITHUB_USER } from './util.js';
import {
  openWindow, getWindow, getWindows, activeWindow, minimizeWindow, restoreWindow, closeWindow, toggleMaximize,
  focusWindow, minimizeAll, arrangeWindows, keyboardMoveResize, canMove, canResize, restoreFromMenu
} from './wm.js';
import { store, emit, on } from './store.js';
import { loadThemes, applyTheme, currentTheme, layout } from './themes.js';
import { apps, launch } from './apps/registry.js';
import { appType, iconSize, iconSort, setIconSize, setIconSort, refreshDesktop, selectIcon } from './desktop.js';

export { bindMenu };

/* ---------- wspólne pomocniki ---------- */

export function openUrl(url) { if (url) window.open(url, '_blank', 'noopener'); }

/** Adres programu pulpitu: link zewnętrzny, strona starej witryny albo pulpit z #id (otwiera program). */
export function appUrl(id) {
  const a = apps[id];
  if (!a) return null;
  if (a.href) return a.href;
  if (a.web) return oldSiteUrl(a.web);
  return new URL('#' + id, location.href).href;
}

const KIND_LABEL = { games: 'Gra', tools: 'Narzędzie' };

/** Opis pozycji (menu Start, Menedżer programów, foldery): { name, icon, type, url, description, extra }. */
export function describe(it) {
  if (it.appId && apps[it.appId]) {
    const a = apps[it.appId];
    return { name: a.title, icon: a.icon, type: appType(it.appId), url: appUrl(it.appId), description: a.hint || '' };
  }
  if (it.kind && it.item) {
    return { name: it.item.title, icon: catalogIconPath(it.kind, it.item) || (it.kind === 'games' ? 'game' : 'tools'),
      type: KIND_LABEL[it.kind] || 'Strona', url: oldSiteUrl(it.item.path), description: it.item.description || '',
      extra: it.item.genres?.length ? [['Gatunek', it.item.genres.join(', ')]] : null };
  }
  if (it.prog || it.repo) {
    const p = it.prog || { name: it.label, repo: it.repo, description: it.title, icon: it.icon };
    return { name: p.name, icon: p.icon || 'app', type: 'Mój program' + (p.kind ? ' · ' + p.kind : ''),
      url: `https://github.com/${GITHUB_USER}/${p.repo}`, description: p.description || '',
      extra: [p.language ? ['Język', p.language] : null, p.platforms?.length ? ['Platformy', p.platforms.join(', ')] : null].filter(Boolean) };
  }
  return null;
}

/** Okno „Właściwości”: nazwa, typ, lokalizacja (adres), opis. */
export function showProperties(d) {
  if (!d) return;
  const key = (d.url || d.name).replace(/[^\w-]+/g, '_').slice(-60);
  return openWindow({
    id: 'props:' + key, saveKey: 'props', title: 'Właściwości: ' + d.name, icon: d.icon || 'app',
    width: 400, height: 300, minWidth: 280, minHeight: 220, className: 'win-props',
    render(body, w) {
      const ok = h('button', { class: 'btn btn-primary', type: 'button', autofocus: true, onclick: () => closeWindow(w.id) }, 'OK');
      const rows = [
        ['Typ', d.type],
        ['Lokalizacja', d.url ? h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.url) : null],
        ['Opis', d.description],
        ...(d.extra || [])
      ].filter(([, v]) => v);
      body.append(h('div', { class: 'props' },
        h('div', { class: 'props-head' }, icon(d.icon || 'app', 'icon icon-lg'), h('span', { class: 'props-name' }, d.name)),
        h('dl', { class: 'props-facts' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
        h('div', { class: 'props-foot' }, ok)));
      body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeWindow(w.id); } });
    }
  });
}

/** Standardowe menu pozycji: Otwórz (pogrubione), Otwórz w nowej karcie (gdy jest adres), Właściwości. */
export function itemMenu(it, d = describe(it)) {
  return [
    { label: 'Otwórz', default: true, run: it.run },
    d?.url && { label: 'Otwórz w nowej karcie', glyph: 'external', run: () => openUrl(d.url) },
    'sep',
    d && { label: 'Właściwości', run: () => showProperties(d) }
  ];
}

/** Menu programu z GitHub Releases (folder „Moje programy”). */
export function programMenu(prog) {
  const d = describe({ prog });
  const mod = () => import('./apps/programs.js');
  return [
    { label: 'Otwórz szczegóły', default: true, run: () => mod().then(m => m.openProgram(prog.repo)) },
    { label: 'Pobierz dla Windows', icon: 'download', run: () => mod().then(m => m.downloadForWindows(prog.repo)) },
    { label: 'Strona projektu', icon: 'code', run: () => openUrl(d.url) },
    'sep',
    { label: 'Właściwości', run: () => showProperties(d) }
  ];
}

/* ---------- pulpit ---------- */

const ERA_OLD = ['win1', 'win2', 'win31'];
const ERA_NEW = ['winvista', 'win7', 'win8', 'win81', 'win11'];

async function themeItems() {
  const reg = await loadThemes();
  const cur = currentTheme();
  return reg.themes.slice().sort((a, b) => (a.year || 0) - (b.year || 0)).map(t => ({
    label: t.name, type: 'radio', checked: t.id === cur, run: () => { if (t.id !== cur) applyTheme(t.id); }
  }));
}

function desktopMenu() {
  const theme = currentTheme();
  const size = iconSize(), sort = iconSort();
  const gadgets = store.get('gadgetsOnDesktop', true);
  const radio = (label, on, run) => ({ label, type: 'radio', checked: on, run });
  return [
    { label: 'Widok', submenu: () => [
      radio('Duże ikony', size === 'large', () => setIconSize('large')),
      radio('Średnie ikony', size === 'medium', () => setIconSize('medium')),
      radio('Małe ikony', size === 'small', () => setIconSize('small')),
      'sep',
      { label: 'Pokaż gadżety pulpitu', type: 'check', checked: gadgets, run: () => { store.set('gadgetsOnDesktop', !gadgets); emit('gadgets:toggle'); } }
    ] },
    { label: 'Sortuj według', submenu: () => [
      radio('Nazwa', sort === 'name', () => setIconSort('name')),
      radio('Typ', sort === 'type', () => setIconSort('type'))
    ] },
    { label: 'Wyrównaj ikony', title: 'Przywraca domyślny układ ikon', run: () => { setIconSort(null); refreshDesktop(); } },
    { label: 'Odśwież', run: refreshDesktop },
    'sep',
    { label: 'Nowy', submenu: () => [
      { label: 'Notatka', icon: 'notes', run: () => launch('notepad', { newNote: true }) }
    ] },
    'sep',
    { label: 'Motyw', icon: 'os', submenu: themeItems },
    { label: ERA_NEW.includes(theme) ? 'Personalizuj' : ERA_OLD.includes(theme) ? 'Panel sterowania' : 'Właściwości ekranu',
      icon: 'settings', run: () => launch('control') }
  ];
}

function deskIconMenu(btn) {
  const id = btn.dataset.app;
  if (!apps[id]) return null;
  selectIcon(btn);
  return itemMenu({ appId: id, run: () => launch(id) });
}

/* ---------- okna: menu systemowe ---------- */

export function systemMenu(id) {
  const w = getWindow(id);
  if (!w) return null;
  return [
    { label: 'Przywróć', glyph: 'restore', disabled: !w.maximized && !w.minimized, run: () => restoreFromMenu(id) },
    { label: 'Przenieś', disabled: !canMove(id), run: () => keyboardMoveResize(id, 'move') },
    { label: 'Rozmiar', disabled: !canResize(id), run: () => keyboardMoveResize(id, 'size') },
    { label: 'Minimalizuj', glyph: 'min', disabled: w.minimized, run: () => minimizeWindow(id) },
    { label: 'Maksymalizuj', glyph: 'max', disabled: w.maximized || isNarrow(), run: () => { if (w.minimized) restoreWindow(id); if (!w.maximized) toggleMaximize(id); } },
    'sep',
    { label: 'Zamknij', glyph: 'close', default: true, shortcut: 'Alt+F4', run: () => closeWindow(id) }
  ];
}

function openSystemMenu(id, anchor, keyboard) {
  const items = systemMenu(id);
  if (!items) return;
  showMenu(items, { anchor }, { focusFirst: keyboard, label: 'Menu okna' });
}

/* ---------- pasek zadań ---------- */

function taskMenu(id) {
  const w = getWindow(id);
  if (!w) return null;
  const front = !w.minimized && activeWindow() === w;
  return [
    w.minimized || !front
      ? { label: 'Przywróć', glyph: 'restore', default: true, run: () => (w.minimized ? restoreWindow(id) : focusWindow(id)) }
      : { label: 'Minimalizuj', glyph: 'min', default: true, run: () => minimizeWindow(id) },
    { label: 'Maksymalizuj', glyph: 'max', disabled: (w.maximized && !w.minimized) || isNarrow(), run: () => { if (w.minimized) restoreWindow(id); if (!w.maximized) toggleMaximize(id); else focusWindow(id); } },
    'sep',
    { label: 'Zamknij okno', glyph: 'close', run: () => closeWindow(id) }
  ];
}

function taskbarMenu() {
  const visible = getWindows().some(w => !w.minimized);
  const canArrange = visible && !isNarrow() && !layout().tiling;
  return [
    { label: 'Kaskadowo', disabled: !canArrange, run: () => arrangeWindows('cascade') },
    { label: 'Sąsiadująco poziomo', disabled: !canArrange, run: () => arrangeWindows('horizontal') },
    { label: 'Sąsiadująco pionowo', disabled: !canArrange, run: () => arrangeWindows('vertical') },
    'sep',
    { label: 'Pokaż pulpit', disabled: !getWindows().length, run: minimizeAll },
    'sep',
    { label: currentTheme() === 'win11' ? 'Ustawienia paska zadań' : 'Właściwości paska zadań', icon: 'settings', run: () => launch('control') }
  ];
}

/* ---------- rejestracja ---------- */

export function initMenus() {
  // Kolejność ma znaczenie tylko dla tego samego elementu; menu wybiera element najbliższy kliknięciu.
  registerMenu('.desk-icon', ({ el }) => deskIconMenu(el));
  registerMenu('.win-titlebar', ({ el }) => systemMenu(el.closest('.win')?.dataset.wid));
  registerMenu('.win', () => false);   // treść okien: menu przeglądarki (zaznaczony tekst, linki), chyba że program podpiął własne
  registerMenu('.task-btn, .min-icon', ({ el }) => taskMenu(el.dataset.wid));
  registerMenu('#taskbar', taskbarMenu);
  registerMenu('#workarea', ({ target }) => (target.closest('#gadgets a, #gadgets input') ? false : desktopMenu()));

  on('wm:sysmenu', ({ id, anchor, keyboard }) => openSystemMenu(id, anchor, !!keyboard));

  // Alt+Spacja: menu systemowe aktywnego okna (gdy fokus jest w oknie).
  document.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== 'Space') return;
    const winEl = document.activeElement?.closest?.('.win');
    const w = winEl ? getWindow(winEl.dataset.wid) : activeWindow();
    if (!w || w.minimized) return;
    e.preventDefault();
    openSystemMenu(w.id, w.el.querySelector('.win-icon') || w.el, true);
  });
}
