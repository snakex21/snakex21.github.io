// Menu kontekstowe (prawy przycisk myszy, Shift+F10 / klawisz Menu, długie przytrzymanie na dotyku).
// Jeden komponent dla wszystkich motywów: wygląd rysuje css/contextmenu.css według data-theme na <html>.
//
// API dla modułów:
//   bindMenu(el, provider)      provider({ target, el, event, keyboard }) => pozycje | null | false
//                               (null = szukaj dalej w górę drzewa, false = zostaw menu przeglądarki; można podpiąć jeden provider do kontenera listy
//                               i rozpoznać element po target.closest(...))
//   registerMenu(selector, provider)   to samo dla wszystkich elementów pasujących do selektora (globalnie)
//   showMenu(items, { x, y } | { anchor: element }, { focusFirst })   pokazuje menu ręcznie (np. menu systemowe okna)
//   closeMenus()
//
// Pozycja menu: { label, run(), icon? (ikona z arkusza / ścieżka obrazka), glyph? (glif z util.js), shortcut?, disabled?, checked?, type?: 'check' | 'radio', default?: true (pogrubiona),
//                 submenu?: pozycje | () => pozycje | Promise, title? } albo 'sep' (separator). Fałszywe wartości są pomijane.
// Natywne menu przeglądarki zostaje w polach tekstowych, w ramkach (iframe to osobne dokumenty) i tam,
// gdzie żaden provider nie zwrócił pozycji (np. zwykła treść okien).

import { h, icon, glyph } from './util.js';

const bound = new WeakMap();
const registry = [];
const stack = [];          // otwarte poziomy: [{ el, items, parentItem }]
let restoreFocus = null;
let lastOpen = 0;          // znacznik czasu ostatniego otwarcia (odrzuca zdublowane contextmenu po klawiaturze / dotyku)
let suppressClickUntil = 0;
let hoverTimer = 0;
let typeBuf = '', typeTimer = 0;

const NATIVE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], iframe';

export function bindMenu(el, provider) { if (el) bound.set(el, provider); return el; }
export function registerMenu(selector, provider) { registry.push({ selector, provider }); }

/** Pozycje menu dla elementu (idąc w górę drzewa) albo null, gdy ma zostać menu przeglądarki. */
function resolve(target, event, keyboard) {
  for (let el = target instanceof Element ? target : target?.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    if (el.matches(NATIVE)) return null;
    const p = bound.get(el);
    if (p) {
      const items = p({ target, el, event, keyboard });
      if (items === false) return null;   // false = tu zostaje menu przeglądarki
      if (items) return { items, el };
    }
    for (const r of registry) {
      if (!el.matches(r.selector)) continue;
      const items = r.provider({ target, el, event, keyboard });
      if (items === false) return null;
      if (items) return { items, el };
    }
  }
  return null;
}

/* ---------- budowanie ---------- */

const clean = items => {
  const out = [];
  for (const it of items || []) {
    if (!it) continue;
    if (it === 'sep' && (!out.length || out[out.length - 1] === 'sep')) continue;
    out.push(it);
  }
  while (out[out.length - 1] === 'sep') out.pop();
  return out;
};

function build(items, level) {
  const menu = h('div', { class: 'cm', role: 'menu', tabindex: '-1', 'aria-orientation': 'vertical', dataset: { level } });
  const list = clean(items);
  menu._items = list;
  const hasGutter = list.some(it => it !== 'sep' && (it.icon || it.glyph || it.type || it.checked != null));
  menu.classList.toggle('cm-has-gutter', hasGutter);
  for (const it of list) {
    if (it === 'sep') { menu.append(h('div', { class: 'cm-sep', role: 'separator' })); continue; }
    const role = it.type === 'radio' ? 'menuitemradio' : it.type === 'check' ? 'menuitemcheckbox' : 'menuitem';
    const sub = !!it.submenu;
    const row = h('div', {
      class: 'cm-item' + (it.default ? ' cm-default' : '') + (sub ? ' cm-parent' : '') + (it.disabled ? ' cm-disabled' : ''),
      role, tabindex: '-1', title: it.title || null,
      'aria-disabled': it.disabled ? 'true' : null,
      'aria-checked': it.type ? String(!!it.checked) : null,
      'aria-haspopup': sub ? 'menu' : null,
      'aria-expanded': sub ? 'false' : null
    },
      h('span', { class: 'cm-gut', 'aria-hidden': 'true' },
        it.type && it.checked ? h('span', { class: 'cm-mark cm-mark-' + it.type }) : it.glyph ? glyph(it.glyph) : it.icon ? icon(it.icon, 'icon icon-sm') : null),
      h('span', { class: 'cm-label' }, it.label),
      h('span', { class: 'cm-key' }, it.shortcut || ''),
      h('span', { class: 'cm-arrow', 'aria-hidden': 'true' }));
    row._item = it;
    menu.append(row);
  }
  menu.addEventListener('pointerover', onOver);
  menu.addEventListener('click', onClick);
  menu.addEventListener('keydown', onKey);
  menu.addEventListener('contextmenu', e => e.preventDefault());
  return menu;
}

/* ---------- pozycjonowanie (w granicach okna, odbicie przy krawędziach) ---------- */

function place(menu, { x, y, anchor, parentRow }) {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  menu.style.left = '0px';
  menu.style.top = '0px';
  menu.style.maxHeight = (vh - 8) + 'px';
  const r = menu.getBoundingClientRect();
  let left, top;
  if (parentRow) {
    const p = parentRow.getBoundingClientRect();
    const pm = parentRow.closest('.cm').getBoundingClientRect();
    left = pm.right - 3;
    if (left + r.width > vw - 2) left = Math.max(2, pm.left - r.width + 3);   // odbicie w lewo
    top = p.top - 3;
    if (top + r.height > vh - 2) top = Math.max(2, vh - 2 - r.height);
    menu.classList.toggle('cm-flip-x', left < pm.left);
  } else if (anchor) {
    const a = anchor.getBoundingClientRect();
    left = a.left;
    top = a.bottom;
    if (top + r.height > vh - 2) top = a.top - r.height;   // nad elementem (np. pasek zadań na dole)
    if (top < 2) top = Math.max(2, vh - 2 - r.height);
  } else {
    left = x; top = y;
    if (left + r.width > vw - 2) left = x - r.width;        // jak w Windows: menu po drugiej stronie kursora
    if (top + r.height > vh - 2) top = y - r.height;
    menu.classList.toggle('cm-flip-x', left < x);
    menu.classList.toggle('cm-flip-y', top < y);
  }
  left = Math.max(2, Math.min(left, vw - r.width - 2));
  top = Math.max(2, Math.min(top, vh - r.height - 2));
  menu.style.left = Math.round(left) + 'px';
  menu.style.top = Math.round(top) + 'px';
}

/* ---------- otwieranie / zamykanie ---------- */

export function showMenu(items, pos = {}, { focusFirst = false, label } = {}) {
  closeMenus(false);
  const list = clean(items);
  if (!list.length) return null;
  if (!stack.length) restoreFocus = document.activeElement;
  const menu = build(list, 0);
  if (label) menu.setAttribute('aria-label', label);
  document.body.append(menu);
  place(menu, pos);
  stack.push({ el: menu });
  lastOpen = performance.now();
  menu.classList.add('cm-in');   // styl startowy jest już policzony w place(), więc przejście rusza od razu (także w karcie w tle)
  if (focusFirst) focusRow(enabledRows(menu)[0]);
  else menu.focus({ preventScroll: true });
  return menu;
}

export function closeMenus(returnFocus = true) {
  clearTimeout(hoverTimer);
  if (!stack.length) return;
  while (stack.length) stack.pop().el.remove();
  if (returnFocus && restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
  restoreFocus = null;
}
export const isMenuOpen = () => stack.length > 0;

function closeFrom(level) {
  while (stack.length > level) {
    const s = stack.pop();
    s.el.remove();
    if (s.parentRow) { s.parentRow.setAttribute('aria-expanded', 'false'); s.parentRow.classList.remove('cm-open'); }
  }
}

async function openSub(row, focus) {
  const menu = row.closest('.cm');
  const level = Number(menu.dataset.level) + 1;
  if (stack[level]?.parentRow === row) { if (focus) focusRow(enabledRows(stack[level].el)[0]); return; }
  closeFrom(level);
  let items = row._item.submenu;
  if (typeof items === 'function') items = items();
  if (items?.then) items = await items;
  if (!row.isConnected || stack.length !== level) return;
  const sub = build(items, level);
  document.body.append(sub);
  place(sub, { parentRow: row });
  stack.push({ el: sub, parentRow: row });
  row.setAttribute('aria-expanded', 'true');
  row.classList.add('cm-open');
  sub.classList.add('cm-in');
  if (focus) focusRow(enabledRows(sub)[0]);
}

const rows = menu => [...menu.querySelectorAll(':scope > .cm-item')];
const enabledRows = menu => rows(menu).filter(r => !r._item.disabled);

function focusRow(row) {
  if (!row) return;
  const menu = row.closest('.cm');
  for (const r of rows(menu)) r.classList.toggle('cm-active', r === row);
  row.focus({ preventScroll: true });
  row.scrollIntoView({ block: 'nearest' });
}

function activate(row, keyboard) {
  const it = row._item;
  if (it.disabled) return;
  if (it.submenu) { openSub(row, keyboard); return; }
  const prev = restoreFocus;
  closeMenus(false);
  // Fokus wraca na element, z którego otwarto menu – akcja (np. nowe okno) może go potem przenieść.
  if (prev?.isConnected && document.activeElement === document.body) prev.focus({ preventScroll: true });
  try { it.run?.(); } catch (err) { console.error(err); }
}

/* ---------- zdarzenia wewnątrz menu ---------- */

function onOver(e) {
  if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
  const row = e.target.closest('.cm-item');
  if (!row) return;
  const menu = row.closest('.cm');
  focusRow(row);
  clearTimeout(hoverTimer);
  const level = Number(menu.dataset.level);
  hoverTimer = setTimeout(() => {
    if (!row.isConnected) return;
    if (row._item.submenu && !row._item.disabled) openSub(row, false);
    else if (stack[level + 1]?.parentRow !== row) closeFrom(level + 1);
  }, row._item.submenu ? 220 : 300);
}

function onClick(e) {
  const row = e.target.closest('.cm-item');
  if (row) activate(row, e.detail === 0);
}

function onKey(e) {
  const menu = e.currentTarget;
  const level = Number(menu.dataset.level);
  const list = enabledRows(menu);
  const cur = document.activeElement?.closest?.('.cm-item');
  const i = list.indexOf(cur);
  const k = e.key;
  const handled = () => { e.preventDefault(); e.stopPropagation(); };
  if (k === 'ArrowDown' || k === 'ArrowUp') {
    handled();
    if (!list.length) return;
    const n = i < 0 ? (k === 'ArrowDown' ? 0 : list.length - 1) : (i + (k === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    focusRow(list[n]);
  } else if (k === 'Home' || k === 'End') {
    handled();
    focusRow(k === 'Home' ? list[0] : list[list.length - 1]);
  } else if (k === 'ArrowRight') {
    handled();
    if (cur?._item.submenu && !cur._item.disabled) openSub(cur, true);
  } else if (k === 'ArrowLeft') {
    handled();
    if (level > 0) { const parent = stack[level].parentRow; closeFrom(level); focusRow(parent); }
  } else if (k === 'Enter' || k === ' ') {
    handled();
    if (cur) activate(cur, true);
  } else if (k === 'Escape') {
    handled();
    if (level > 0) { const parent = stack[level].parentRow; closeFrom(level); focusRow(parent); }
    else closeMenus(true);
  } else if (k === 'Tab') {
    handled();
    closeMenus(true);
  } else if (k.length === 1 && /\S/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Szukanie po pierwszych literach etykiety
    handled();
    clearTimeout(typeTimer);
    typeBuf += k.toLocaleLowerCase('pl');
    typeTimer = setTimeout(() => { typeBuf = ''; }, 700);
    const start = typeBuf.length === 1 ? i + 1 : Math.max(0, i);
    for (let j = 0; j < list.length; j++) {
      const r = list[(start + j) % list.length];
      if (r._item.label.toLocaleLowerCase('pl').startsWith(typeBuf)) { focusRow(r); break; }
    }
  }
}

/* ---------- zdarzenia globalne ---------- */

function openFor(target, pos, { keyboard = false, event = null } = {}) {
  const res = resolve(target, event, keyboard);
  if (!res) return false;
  if (keyboard && !pos) {
    const r = (target instanceof Element ? target : res.el).getBoundingClientRect();
    pos = { x: Math.round(r.left + Math.min(r.width / 2, 24)), y: Math.round(r.top + Math.min(r.height / 2, 20)) };
  }
  showMenu(res.items, pos, { focusFirst: keyboard });
  return true;
}

function init() {
  document.addEventListener('contextmenu', e => {
    if (e.target.closest?.('.cm')) { e.preventDefault(); return; }
    // Zdublowane zdarzenie po naszym otwarciu z klawiatury / długim przytrzymaniu
    if (performance.now() - lastOpen < 600 && stack.length) { e.preventDefault(); return; }
    // Shift + prawy przycisk = zawsze menu przeglądarki (furtka dla „Zbadaj element”, „Zapisz obraz” itp.)
    if (e.shiftKey && e.button === 2) { closeMenus(false); return; }
    const kb = e.button !== 2 && e.clientX === 0 && e.clientY === 0;
    const target = kb ? document.activeElement : e.target;
    if (openFor(target, kb ? null : { x: e.clientX, y: e.clientY }, { keyboard: kb, event: e })) e.preventDefault();
    else closeMenus(false);
  });

  document.addEventListener('keydown', e => {
    if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      const t = document.activeElement;
      if (!t || t === document.body || stack.length) return;
      if (openFor(t, null, { keyboard: true, event: e })) e.preventDefault();
    }
  });

  // Zamykanie: klik poza menu, utrata fokusu okna, przewijanie, zmiana rozmiaru
  document.addEventListener('pointerdown', e => {
    if (stack.length && !e.target.closest?.('.cm')) closeMenus(false);
  }, true);
  window.addEventListener('blur', () => closeMenus(false));
  window.addEventListener('resize', () => closeMenus(false));
  document.addEventListener('scroll', e => {
    if (stack.length && !(e.target instanceof Element && e.target.closest('.cm'))) closeMenus(false);
  }, true);
  document.addEventListener('focusin', e => {
    if (stack.length && !e.target.closest?.('.cm')) closeMenus(false);
  });

  // Dotyk: długie przytrzymanie (~500 ms) otwiera menu (iOS nie wysyła contextmenu).
  let lp = null;
  const cancel = () => { if (lp) { clearTimeout(lp.timer); lp = null; } };
  document.addEventListener('pointerdown', e => {
    cancel();
    if (e.pointerType !== 'touch' || e.target.closest?.('.cm')) return;
    const target = e.target;
    const x = e.clientX, y = e.clientY;
    lp = { x, y, timer: setTimeout(() => {
      lp = null;
      if (openFor(target, { x, y }, { event: e })) {
        suppressClickUntil = performance.now() + 900;
        navigator.vibrate?.(15);
      }
    }, 500) };
  }, { passive: true });
  document.addEventListener('pointermove', e => {
    if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) cancel();
  }, { passive: true });
  document.addEventListener('pointerup', cancel, { passive: true });
  document.addEventListener('pointercancel', cancel, { passive: true });
  // Po długim przytrzymaniu puszczenie palca nie może jeszcze „kliknąć” w element pod spodem.
  document.addEventListener('click', e => {
    if (performance.now() < suppressClickUntil && !e.target.closest?.('.cm')) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickUntil = 0;
    }
  }, true);
}

init();
