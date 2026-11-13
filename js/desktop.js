// Ikony pulpitu: pojedyncze kliknięcie zaznacza, dwuklik albo Enter otwiera,
// strzałki przenoszą zaznaczenie (jedna ikona w kolejce Tab naraz). Na dotyku i wąskim ekranie wystarczy stuknięcie.
// Rozmiar ikon (duże / średnie / małe) i sortowanie (nazwa / typ) ustawia menu kontekstowe pulpitu (js/menus.js).

import { h, icon, isNarrow } from './util.js';
import { apps, launch } from './apps/registry.js';
import { store } from './store.js';

export const DESKTOP_ICONS = ['programs', 'games', 'tools', 'music', 'films', 'linkhub', 'notepad', 'gadgets', 'control', 'oldsite'];

/** Typ pozycji pulpitu (do sortowania i okna Właściwości). */
export function appType(id) {
  const app = apps[id];
  if (!app) return '';
  if (['programs', 'games', 'tools', 'linkhub'].includes(id)) return 'Folder';
  if (app.href) return 'Link zewnętrzny';
  if (app.web) return 'Strona starej witryny';
  return 'Program';
}

const SIZES = ['large', 'medium', 'small'];
let container = null;
let buttons = [];

export const iconSize = () => (SIZES.includes(store.get('desk:size')) ? store.get('desk:size') : 'large');
export const iconSort = () => (['name', 'type'].includes(store.get('desk:sort')) ? store.get('desk:sort') : null);

export function setIconSize(size) {
  if (!SIZES.includes(size)) return;
  store.set('desk:size', size);
  if (container) container.dataset.size = size;
}

export function setIconSort(sort) {
  if (sort) store.set('desk:sort', sort); else store.remove('desk:sort');
  render();
}

/** „Odśwież”: ikony są budowane od nowa (krótkie mrugnięcie jak w Windows). */
export function refreshDesktop() {
  if (!container) return;
  container.classList.add('cm-refresh');
  render();
  setTimeout(() => container.classList.remove('cm-refresh'), 120);
}

function ordered() {
  const ids = DESKTOP_ICONS.filter(id => apps[id]);
  const sort = iconSort();
  const byName = (a, b) => apps[a].title.localeCompare(apps[b].title, 'pl');
  if (sort === 'name') ids.sort(byName);
  if (sort === 'type') ids.sort((a, b) => appType(a).localeCompare(appType(b), 'pl') || byName(a, b));
  return ids;
}

function render() {
  if (!container) return;
  const prev = document.activeElement?.closest?.('.desk-icon')?.dataset.app;
  buttons = ordered().map((id, i) => {
    const app = apps[id];
    return h('button', {
      class: 'desk-icon',
      type: 'button',
      tabindex: i === 0 ? '0' : '-1',
      'aria-pressed': 'false',
      title: app.hint || app.title,
      dataset: { app: id }
    }, h('span', { class: 'desk-icon-img' }, icon(app.icon, 'icon icon-lg')), h('span', { class: 'desk-icon-label' }, app.title));
  });
  container.replaceChildren(...buttons);
  if (prev) selectIcon(buttons.find(b => b.dataset.app === prev), true);
}

/** Zaznacza ikonę (null = zdejmuje zaznaczenie). */
export function selectIcon(btn, focus = false) {
  for (const b of buttons) {
    const on = b === btn;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-pressed', String(on));
    if (btn) b.tabIndex = on ? 0 : -1;
  }
  if (btn && focus) btn.focus();
}

export function initDesktop(el) {
  container = el;
  container.dataset.size = iconSize();
  render();
  const select = selectIcon;

  container.addEventListener('click', e => {
    const btn = e.target.closest('.desk-icon');
    if (!btn) return;
    select(btn);
    // detail === 0: aktywacja klawiaturą (Enter/Spacja); dotyk i wąski ekran: jedno stuknięcie.
    if (e.detail === 0 || isNarrow() || e.pointerType === 'touch') launch(btn.dataset.app);
  });
  container.addEventListener('dblclick', e => {
    const btn = e.target.closest('.desk-icon');
    if (btn && !isNarrow()) launch(btn.dataset.app);
  });

  // Klik w puste miejsce pulpitu zdejmuje zaznaczenie.
  document.getElementById('workarea').addEventListener('pointerdown', e => {
    if (e.target.id === 'workarea' || e.target === container) select(null);
  });

  container.addEventListener('keydown', e => {
    const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      select(buttons[e.key === 'Home' ? 0 : buttons.length - 1], true);
      return;
    }
    if (!dirs[e.key]) return;
    e.preventDefault();
    const [dx, dy] = dirs[e.key];
    const from = buttons[i].getBoundingClientRect();
    const cx = from.left + from.width / 2, cy = from.top + from.height / 2;
    let best = null, bestScore = Infinity;
    for (const b of buttons) {
      if (b === buttons[i]) continue;
      const r = b.getBoundingClientRect();
      const vx = r.left + r.width / 2 - cx, vy = r.top + r.height / 2 - cy;
      const along = vx * dx + vy * dy;
      if (along <= 1) continue;
      const across = Math.abs(vx * dy) + Math.abs(vy * dx);
      const score = along + across * 3;
      if (score < bestScore) { bestScore = score; best = b; }
    }
    if (best) select(best, true);
  });
}
