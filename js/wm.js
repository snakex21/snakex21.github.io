// Menedżer okien: tworzenie, przeciąganie, zmiana rozmiaru, kolejność (z-order),
// minimalizacja, maksymalizacja, zamykanie i zapamiętywanie pozycji w localStorage.
// Gdy motyw ma cechę "tiling" (data-tiling="true" na <html>), okna są układane obok siebie
// bez nakładania, a ich swobodne pozycje wracają po zmianie motywu.

import { h, icon, glyph, isNarrow, narrowQuery } from './util.js';
import { store, emit, on } from './store.js';

const windows = new Map();   // id -> obiekt okna
let layer;                   // kontener #windows
let zTop = 10;
let seq = 0;
let opened = 0;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const tilingOn = () => document.documentElement.dataset.tiling === 'true';

export function initWM(container) {
  layer = container;

  // Kliknięcie w iframe nie wywołuje zdarzeń w dokumencie; łapiemy to przez blur okna.
  window.addEventListener('blur', () => setTimeout(() => {
    const a = document.activeElement;
    if (a && a.tagName === 'IFRAME') {
      const el = a.closest('.win');
      if (el) focusWindow(el.dataset.wid, { keepFocus: true });
    }
  }));

  window.addEventListener('resize', () => { for (const w of windows.values()) keepInside(w); arrange(); });
  narrowQuery.addEventListener('change', () => emit('wm:change'));
  on('wm:change', arrange);
  on('theme:change', () => (tilingOn() ? arrange() : untile()));
}

/** Układ kafelkowy (Windows 1.0): widoczne okna dzielą obszar roboczy na siatkę bez nakładania. */
function arrange() {
  if (!layer || !tilingOn() || isNarrow()) return;
  const vis = [...windows.values()].filter(w => !w.minimized && !w.maximized).sort((a, b) => a.order - b.order);
  if (!vis.length) return;
  const area = layer.getBoundingClientRect();
  const gap = 4;
  const cols = Math.ceil(Math.sqrt(vis.length));
  const rows = Math.ceil(vis.length / cols);
  const rowH = (area.height - gap * (rows + 1)) / rows;
  vis.forEach((w, i) => {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? vis.length - row * cols : cols;
    const col = i - row * cols;
    const colW = (area.width - gap * (inRow + 1)) / inRow;
    if (!w.freeRect) {
      const s = w.el.style;
      w.freeRect = { left: s.left, top: s.top, width: s.width, height: s.height };
    }
    Object.assign(w.el.style, {
      left: Math.round(gap + col * (colW + gap)) + 'px',
      top: Math.round(gap + row * (rowH + gap)) + 'px',
      width: Math.round(colW) + 'px',
      height: Math.round(rowH) + 'px'
    });
  });
}

function untile() {
  for (const w of windows.values()) {
    if (!w.freeRect) continue;
    Object.assign(w.el.style, w.freeRect);
    delete w.freeRect;
    keepInside(w);
  }
}

export function getWindows() { return [...windows.values()]; }
export function getWindow(id) { return windows.get(id); }
export function activeWindow() {
  let best = null;
  for (const w of windows.values()) if (!w.minimized && (!best || w.z > best.z)) best = w;
  return best;
}

/**
 * Otwiera okno.
 * opts: { id, title, icon, width, height, minWidth, minHeight, saveKey, className,
 *         render(body, win), onReopen(args), args, resizable, persistent }
 * persistent: przycisk zamykania minimalizuje (np. Menedżer programów); zamyka tylko closeWindow(id, { force: true }).
 * Jeśli okno o tym samym id już istnieje, zostaje przywrócone i aktywowane.
 */
export function openWindow(opts) {
  if (opts.id && windows.has(opts.id)) {
    const w = windows.get(opts.id);
    if (w.minimized) restoreWindow(w.id);
    focusWindow(w.id);
    w.onReopen?.(opts.args);
    return w;
  }

  const id = opts.id || 'w' + (++seq);
  const saveKey = opts.saveKey || opts.id || null;
  const titleId = 'wt-' + id.replace(/[^\w-]/g, '_');

  const btnMin = h('button', { class: 'win-btn win-min', type: 'button', 'aria-label': 'Minimalizuj', title: 'Minimalizuj' }, glyph('min'));
  const btnMax = h('button', { class: 'win-btn win-max', type: 'button', 'aria-label': 'Maksymalizuj', title: 'Maksymalizuj' }, glyph('max'), glyph('restore'));
  const btnClose = h('button', { class: 'win-btn win-close', type: 'button', 'aria-label': 'Zamknij', title: 'Zamknij' }, glyph('close'));
  const titleEl = h('h2', { class: 'win-title', id: titleId }, opts.title);
  // Ikona w pasku tytułu: klik = menu systemowe (js/menus.js), dwuklik = zamknięcie (jak w klasycznym Windows).
  const iconEl = h('span', { class: 'win-icon', title: 'Menu okna (Alt+Spacja)' }, icon(opts.icon || 'app', 'icon icon-sm'));
  const titlebar = h('header', { class: 'win-titlebar' },
    iconEl,
    titleEl,
    h('div', { class: 'win-controls' }, btnMin, btnMax, btnClose)
  );
  const body = h('div', { class: 'win-body' });
  const grip = opts.resizable === false ? null : h('div', { class: 'win-resize', 'aria-hidden': 'true' });
  const el = h('section', {
    class: 'win opening ' + (opts.className || ''),
    role: 'dialog',
    'aria-labelledby': titleId,
    tabindex: '-1',
    dataset: { wid: id }
  }, titlebar, body, grip);

  const w = {
    id, el, body, titleEl, saveKey,
    title: opts.title,
    icon: opts.icon || 'app',
    minimized: false,
    maximized: false,
    persistent: !!opts.persistent,
    order: ++seq,
    z: 0,
    minWidth: opts.minWidth || 260,
    minHeight: opts.minHeight || 160,
    onReopen: opts.onReopen,
    onClose: [],
    setTitle(text) { w.title = text; titleEl.textContent = text; emit('wm:change'); },
    close: () => closeWindow(id)
  };
  windows.set(id, w);

  // Pozycja i rozmiar: zapamiętane albo kaskadowo od lewego górnego rogu.
  const area = layer.getBoundingClientRect();
  const saved = saveKey ? store.get('win:' + saveKey) : null;
  const width = clamp(saved?.w ?? opts.width ?? 640, w.minWidth, Math.max(w.minWidth, area.width - 16));
  const height = clamp(saved?.h ?? opts.height ?? 440, w.minHeight, Math.max(w.minHeight, area.height - 16));
  const step = (opened++ % 8) * 26;
  const x = saved?.x ?? Math.max(8, Math.min(120 + step, area.width - width - 8));
  const y = saved?.y ?? Math.max(8, Math.min(24 + step, area.height - height - 8));
  Object.assign(el.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px' });
  if (saved?.max) setMaximized(w, true);

  layer.append(el);
  keepInside(w);
  // Tylko własna animacja okna: animationend z elementów w środku (np. plakaty w Filmach) wypływa w górę i przy
  // { once: true } zjadałby to zdarzenie – klasa „opening” zostawała i animacja otwarcia wracała przy każdym pokazaniu.
  const onOpened = e => { if (e.target === el) { el.classList.remove('opening'); el.removeEventListener('animationend', onOpened); } };
  el.addEventListener('animationend', onOpened);
  setTimeout(() => el.classList.remove('opening'), 600);   // zapas: karta w tle może nie wysłać animationend

  // Zdarzenia
  btnMin.addEventListener('click', () => minimizeWindow(id));
  btnMax.addEventListener('click', () => toggleMaximize(id));
  // Motywy 2.0 / 3.1 rysują przycisk zamykania jako pole menu systemowego po lewej (CSS: order: -1):
  // klik otwiera menu okna, dwuklik zamyka – jak w oryginale. W pozostałych motywach klik zamyka.
  const sysBox = () => getComputedStyle(btnClose).order === '-1';
  btnClose.addEventListener('click', e => {
    if (!sysBox()) closeWindow(id);
    else if (e.detail <= 1) emit('wm:sysmenu', { id, anchor: btnClose, keyboard: e.detail === 0 });
  });
  btnClose.addEventListener('dblclick', () => { if (sysBox()) closeWindow(id); });
  const labelClose = () => {
    const s = sysBox();
    btnClose.title = s ? 'Menu okna (dwuklik zamyka)' : 'Zamknij';
    btnClose.setAttribute('aria-label', s ? 'Menu okna' : 'Zamknij');
  };
  btnClose.addEventListener('pointerenter', labelClose);
  btnClose.addEventListener('focus', labelClose);
  titlebar.addEventListener('dblclick', e => { if (!e.target.closest('button, .win-icon')) toggleMaximize(id); });
  iconEl.addEventListener('click', e => {
    if (e.detail > 1) return;
    emit('wm:sysmenu', { id, anchor: iconEl });
  });
  iconEl.addEventListener('dblclick', () => closeWindow(id));
  el.addEventListener('pointerdown', () => focusWindow(id, { keepFocus: true }), true);
  el.addEventListener('focusin', () => { if (activeWindow() !== w || !el.classList.contains('active')) focusWindow(id, { keepFocus: true }); });
  makeDraggable(w, titlebar);
  if (grip) makeResizable(w, grip);

  try { opts.render?.(body, w); } catch (err) {
    console.error(err);
    body.append(h('p', { class: 'win-error' }, 'Nie udało się uruchomić programu.'));
  }
  focusWindow(id);
  emit('wm:change');
  return w;
}

function save(w) {
  if (!w.saveKey || isNarrow() || tilingOn()) return;
  const s = w.el.style;
  store.set('win:' + w.saveKey, {
    x: parseInt(s.left, 10), y: parseInt(s.top, 10),
    w: parseInt(s.width, 10), h: parseInt(s.height, 10),
    max: w.maximized
  });
}

function keepInside(w) {
  if (!layer) return;
  const area = layer.getBoundingClientRect();
  const s = w.el.style;
  const width = Math.min(parseInt(s.width, 10), Math.max(w.minWidth, area.width));
  const height = Math.min(parseInt(s.height, 10), Math.max(w.minHeight, area.height));
  s.width = width + 'px';
  s.height = height + 'px';
  s.left = clamp(parseInt(s.left, 10), Math.min(0, 100 - width), Math.max(0, area.width - 100)) + 'px';
  s.top = clamp(parseInt(s.top, 10), 0, Math.max(0, area.height - 40)) + 'px';
}

export function focusWindow(id, { keepFocus = false } = {}) {
  const w = windows.get(id);
  if (!w) return;
  if (w.minimized) restoreWindow(id, { silent: true });
  if (w.z !== zTop || !w.el.classList.contains('active')) {
    w.z = ++zTop;
    w.el.style.zIndex = String(w.z);
  }
  for (const other of windows.values()) other.el.classList.toggle('active', other === w);
  if (!keepFocus && !w.el.contains(document.activeElement)) {
    const target = w.body.querySelector('[autofocus], input, textarea, button, [tabindex="0"], iframe') || w.el;
    target.focus({ preventScroll: true });
  }
  emit('wm:change');
}

/** Gdy nie ma już okna do aktywowania: fokus na Start albo (bez paska zadań) na ikonę zminimalizowanego okna. */
function focusFallback(id) {
  const start = document.getElementById('start-btn');
  if (start && start.offsetParent) start.focus();
  else document.querySelector(`#icon-area [data-wid="${CSS.escape(id || '')}"], #icon-area button, #launcher button`)?.focus();
}

export function minimizeWindow(id) {
  const w = windows.get(id);
  if (!w) return;
  w.minimized = true;
  w.el.hidden = true;
  w.el.classList.remove('active');
  emit('wm:change');
  const next = activeWindow();
  if (next) focusWindow(next.id);
  else focusFallback(id);
}

export function restoreWindow(id, { silent = false } = {}) {
  const w = windows.get(id);
  if (!w) return;
  w.minimized = false;
  w.el.hidden = false;
  if (!silent) focusWindow(id);
}

function setMaximized(w, on) {
  w.maximized = on;
  w.el.classList.toggle('maximized', on);
  const btn = w.el.querySelector('.win-max');
  if (btn) {
    btn.setAttribute('aria-label', on ? 'Przywróć' : 'Maksymalizuj');
    btn.title = on ? 'Przywróć' : 'Maksymalizuj';
  }
}

export function toggleMaximize(id) {
  const w = windows.get(id);
  if (!w || isNarrow()) return;
  setMaximized(w, !w.maximized);
  save(w);
  emit('wm:change');
}

export function closeWindow(id, { force = false } = {}) {
  const w = windows.get(id);
  if (!w) return;
  if (w.persistent && !force) { minimizeWindow(id); return; }
  for (const fn of w.onClose) { try { fn(); } catch (e) { console.error(e); } }
  windows.delete(id);
  w.el.remove();
  const next = activeWindow();
  if (next) focusWindow(next.id);
  else focusFallback();
  emit('wm:change');
}

/** Kliknięcie przycisku na pasku zadań. */
export function toggleFromTaskbar(id) {
  const w = windows.get(id);
  if (!w) return;
  if (w.minimized) restoreWindow(id);
  else if (activeWindow() === w) minimizeWindow(id);
  else focusWindow(id);
}

export function minimizeAll() {
  const anyVisible = getWindows().some(w => !w.minimized);
  if (anyVisible) {
    for (const w of windows.values()) { w.minimized = true; w.el.hidden = true; w.el.classList.remove('active'); }
    emit('wm:change');
  } else {
    for (const w of windows.values()) restoreWindow(w.id, { silent: true });
    const top = activeWindow();
    if (top) focusWindow(top.id);
  }
}

/** Czy okno da się przesuwać / zmieniać mu rozmiar (nie zmaksymalizowane, nie w układzie kafelkowym ani na wąskim ekranie). */
export function canMove(id) {
  const w = windows.get(id);
  return !!w && !w.minimized && !w.maximized && !isNarrow() && !tilingOn();
}
export const canResize = id => canMove(id) && !!windows.get(id)?.el.querySelector('.win-resize');
export const canMaximize = () => !isNarrow();

/** Przywraca okno: z minimalizacji albo ze stanu zmaksymalizowanego (menu systemowe „Przywróć”). */
export function restoreFromMenu(id) {
  const w = windows.get(id);
  if (!w) return;
  if (w.minimized) { restoreWindow(id); return; }
  if (w.maximized) toggleMaximize(id);
  focusWindow(id);
}

/** Kaskadowo / sąsiadująco poziomo (okna jedno pod drugim) / pionowo (obok siebie). */
export function arrangeWindows(mode) {
  if (!layer || tilingOn() || isNarrow()) return;
  const vis = [...windows.values()].filter(w => !w.minimized).sort((a, b) => a.z - b.z);
  if (!vis.length) return;
  const area = layer.getBoundingClientRect();
  const n = vis.length;
  // Przy wielu oknach „sąsiadująco” robi siatkę (jak Windows przy > 3 oknach).
  const lines = n > 3 ? Math.ceil(Math.sqrt(n)) : n;
  vis.forEach((w, i) => {
    setMaximized(w, false);
    let r;
    if (mode === 'cascade') {
      const step = 26;
      const width = Math.min(Math.max(w.minWidth, area.width * .6), area.width - step * (n - 1) - 8);
      const height = Math.min(Math.max(w.minHeight, area.height * .6), area.height - step * (n - 1) - 8);
      r = { x: 8 + i * step, y: 8 + i * step, w: width, h: height };
    } else {
      const per = n > 3 ? Math.ceil(n / lines) : 1;          // okien w jednej linii
      const line = Math.floor(i / per), pos = i % per;
      const inLine = line === lines - 1 ? n - line * per : per;
      const count = n > 3 ? lines : n;
      if (mode === 'horizontal') {   // rzędy
        const hgt = area.height / count, wid = area.width / inLine;
        r = n > 3 ? { x: pos * wid, y: line * hgt, w: wid, h: hgt } : { x: 0, y: i * hgt, w: area.width, h: hgt };
      } else {                       // kolumny
        const wid = area.width / count, hgt = area.height / inLine;
        r = n > 3 ? { x: line * wid, y: pos * hgt, w: wid, h: hgt } : { x: i * wid, y: 0, w: wid, h: area.height };
      }
    }
    Object.assign(w.el.style, { left: Math.round(r.x) + 'px', top: Math.round(r.y) + 'px', width: Math.round(r.w) + 'px', height: Math.round(r.h) + 'px' });
    w.z = ++zTop;
    w.el.style.zIndex = String(w.z);
    save(w);
  });
  focusWindow(vis[vis.length - 1].id);
}

/** Przesuwanie (mode 'move') albo zmiana rozmiaru ('size') strzałkami, jak „Przenieś” / „Rozmiar” z menu systemowego.
 *  Strzałki: 10 px (z Ctrl: 1 px), Enter albo klik zatwierdza, Esc przywraca poprzednie położenie. */
let kbdFinish = null;   // trwające przesuwanie / zmiana rozmiaru klawiaturą (najwyżej jedno naraz)
export function keyboardMoveResize(id, mode) {
  kbdFinish?.(true);
  const w = windows.get(id);
  if (!w || !canMove(id) || (mode === 'size' && !canResize(id))) return;
  const s = w.el.style;
  const orig = { left: s.left, top: s.top, width: s.width, height: s.height };
  focusWindow(id);
  w.el.focus({ preventScroll: true });
  w.el.classList.add('wm-kbd', mode === 'move' ? 'wm-kbd-move' : 'wm-kbd-size');
  const onKey = e => {
    const step = e.ctrlKey ? 1 : 10;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    e.preventDefault();
    e.stopPropagation();
    if (d) {
      const area = layer.getBoundingClientRect();
      const x = parseInt(s.left, 10), y = parseInt(s.top, 10), wd = parseInt(s.width, 10), ht = parseInt(s.height, 10);
      if (mode === 'move') {
        s.left = clamp(x + d[0], 80 - wd, area.width - 80) + 'px';
        s.top = clamp(y + d[1], 0, area.height - 32) + 'px';
      } else {
        s.width = clamp(wd + d[0], w.minWidth, area.width - x) + 'px';
        s.height = clamp(ht + d[1], w.minHeight, area.height - y) + 'px';
      }
    } else if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  };
  const onPointer = () => finish(true);
  function finish(commit) {
    kbdFinish = null;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPointer, true);
    w.el.classList.remove('wm-kbd', 'wm-kbd-move', 'wm-kbd-size');
    if (!commit) Object.assign(s, orig);
    else save(w);
    emit('wm:change');
  }
  kbdFinish = finish;
  // Dopiero po bieżącym zdarzeniu (Enter z menu nie może od razu zatwierdzić).
  setTimeout(() => {
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
  });
}

export function resetPositions() {
  store.clear('win:');
  opened = 0;
}

function makeDraggable(w, handle) {
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button, .win-icon') || w.maximized || isNarrow() || tilingOn()) return;
    e.preventDefault();
    const area = layer.getBoundingClientRect();
    const rect = w.el.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('wm-dragging');
    const move = ev => {
      const x = clamp(ev.clientX - area.left - dx, 80 - rect.width, area.width - 80);
      const y = clamp(ev.clientY - area.top - dy, 0, area.height - 32);
      w.el.style.left = Math.round(x) + 'px';
      w.el.style.top = Math.round(y) + 'px';
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('wm-dragging');
      save(w);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}

function makeResizable(w, grip) {
  grip.addEventListener('pointerdown', e => {
    if (e.button !== 0 || w.maximized || isNarrow() || tilingOn()) return;
    e.preventDefault();
    e.stopPropagation();
    const area = layer.getBoundingClientRect();
    const rect = w.el.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add('wm-dragging', 'wm-resizing');
    const move = ev => {
      const width = clamp(rect.width + ev.clientX - sx, w.minWidth, area.right - rect.left);
      const height = clamp(rect.height + ev.clientY - sy, w.minHeight, area.bottom - rect.top);
      w.el.style.width = Math.round(width) + 'px';
      w.el.style.height = Math.round(height) + 'px';
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      document.body.classList.remove('wm-dragging', 'wm-resizing');
      save(w);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
}
