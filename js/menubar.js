// Pasek menu z rozwijanymi listami (launcher Windows 1.0 / 2.0 i menu Menedżera programów).
// menuBar([{ label, items: [{ label, icon?, tile?, title?, run } | 'sep'] }]) zwraca <ul role="menubar">.
// Klik otwiera listę, najechanie przełącza między otwartymi, strzałki / Home / End / Esc działają jak w menu.
// Listy mają position: fixed i są ustawiane przy otwarciu, więc nie przycina ich przewijany pasek.

import { h, itemArt } from './util.js';
import { bindMenu, itemMenu, describe } from './menus.js';

let openBar = null;   // { bar, li } aktualnie otwarte menu (w całym dokumencie najwyżej jedno)
let globalReady = false;

function closeOpen(focusTop = false) {
  if (!openBar) return;
  const { li } = openBar;
  li.classList.remove('open');
  li.querySelector('.mb-top').setAttribute('aria-expanded', 'false');
  li.querySelector('.mb-drop').hidden = true;
  if (focusTop) li.querySelector('.mb-top').focus();
  openBar = null;
}

function initGlobal() {
  if (globalReady) return;
  globalReady = true;
  document.addEventListener('pointerdown', e => {
    if (openBar && !openBar.li.contains(e.target)) closeOpen();
  });
  window.addEventListener('resize', () => closeOpen());
  window.addEventListener('blur', () => closeOpen());
}

function place(li) {
  const top = li.querySelector('.mb-top').getBoundingClientRect();
  const drop = li.querySelector('.mb-drop');
  drop.style.left = '0px';
  drop.style.top = '0px';
  drop.style.maxHeight = Math.max(120, window.innerHeight - top.bottom - 8) + 'px';
  const w = drop.offsetWidth;
  drop.style.left = Math.max(0, Math.min(top.left, window.innerWidth - w)) + 'px';
  drop.style.top = Math.round(top.bottom) + 'px';
}

function openMenu(bar, li, focusFirst = false) {
  if (openBar?.li === li) return;
  closeOpen();
  li.classList.add('open');
  li.querySelector('.mb-top').setAttribute('aria-expanded', 'true');
  const drop = li.querySelector('.mb-drop');
  drop.hidden = false;
  place(li);
  openBar = { bar, li };
  if (focusFirst) drop.querySelector('.mb-item')?.focus();
}

export function menuBar(menus, { label = 'Menu', className = '' } = {}) {
  initGlobal();
  const bar = h('ul', { class: 'mb ' + className, role: 'menubar', 'aria-label': label });
  for (const m of menus) {
    const drop = h('ul', { class: 'mb-drop', role: 'menu', 'aria-label': m.label, hidden: true });
    for (const it of m.items) {
      if (it === 'sep') { drop.append(h('li', { class: 'mb-sep', role: 'separator' })); continue; }
      const btn = h('button', { class: 'mb-item', type: 'button', role: 'menuitem', title: it.title || null },
        it.tile || it.icon ? itemArt(it, 'icon icon-sm') : null,
        h('span', { class: 'mb-label' }, it.label));
      btn.addEventListener('click', () => { closeOpen(); it.run(); });
      // Programy w launcherze (1.0 / 2.0): Otwórz, Otwórz w nowej karcie, Właściwości
      if (describe(it)) bindMenu(btn, () => itemMenu({ ...it, run: () => { closeOpen(); it.run(); } }));
      drop.append(h('li', { role: 'none' }, btn));
    }
    const top = h('button', { class: 'mb-top', type: 'button', role: 'menuitem', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, m.label);
    const li = h('li', { class: 'mb-menu', role: 'none' }, top, drop);
    top.addEventListener('click', () => (openBar?.li === li ? closeOpen() : openMenu(bar, li)));
    top.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && openBar?.bar === bar && openBar.li !== li) openMenu(bar, li); });
    bar.append(li);
  }

  bar.addEventListener('keydown', e => {
    const tops = [...bar.querySelectorAll(':scope > .mb-menu > .mb-top')];
    const cur = document.activeElement;
    const li = cur?.closest('.mb-menu');
    if (!li) return;
    const ti = tops.indexOf(li.querySelector('.mb-top'));
    const inDrop = !!cur.closest('.mb-drop');
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = tops[(ti + (e.key === 'ArrowRight' ? 1 : -1) + tops.length) % tops.length];
      if (openBar) openMenu(bar, next.closest('.mb-menu'), inDrop);
      next.focus();
      if (inDrop) next.closest('.mb-menu').querySelector('.mb-item')?.focus();
    } else if (e.key === 'ArrowDown' && !inDrop) {
      e.preventDefault();
      openMenu(bar, li, true);
    } else if (inDrop && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const items = [...li.querySelectorAll('.mb-item')];
      const i = items.indexOf(cur);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[n]?.focus();
    } else if (e.key === 'Escape' && openBar) {
      e.preventDefault();
      e.stopPropagation();
      closeOpen(true);
    }
  });
  return bar;
}
