// Menu Start. Jedna struktura HTML; motyw decyduje o wyglądzie:
//  --sm-flyout: 1  -> kategorie rozwijają się z boku po najechaniu (Windows 95 / XP)
//  --sm-flyout: 0  -> kategorie rozwijają się w miejscu, jak akordeon (Windows 11)
// Klawiatura: strzałki góra/dół, prawo otwiera podmenu, lewo je zamyka, Esc zamyka menu.
// Motyw z cechą start: "screen" (data-start="screen", Windows 8 / 8.1) dostaje zamiast tego
// pełnoekranowy ekran Start z kafelkami (.ss), budowany przy pierwszym otwarciu. Cecha allApps
// dokłada przełącznik widoku "Wszystkie aplikacje". Wyszukiwarka i stopka zostają wspólne.

import { h, icon, itemArt, catalogIcon, loadData, fold } from './util.js';
import { apps, launch } from './apps/registry.js';
import { openItem } from './apps/catalog.js';
import { getWindows, closeWindow } from './wm.js';
import { on } from './store.js';
import { bindMenu, itemMenu, describe } from './menus.js';

const PINNED = ['programs', 'games', 'tools', 'notepad', 'music', 'films', 'linkhub', 'control'];

let menu, startBtn, cats, results, search, screen;
let hoverTimer, liveTimer;

const screenMode = () => document.documentElement.dataset.start === 'screen';

const flyoutMode = () => getComputedStyle(menu).getPropertyValue('--sm-flyout').trim() === '1';
const isOpen = () => !menu.hidden;

function appItem(id, extra) {
  const app = apps[id];
  return { appId: id, label: app.title, icon: app.icon, run: () => launch(id, extra), search: app.title + ' ' + (app.hint || '') };
}

/** Menu kontekstowe pozycji menu / ekranu Start: Otwórz, Otwórz w nowej karcie, Właściwości. */
function withMenu(el, item) {
  if (describe(item)) bindMenu(el, () => itemMenu({ ...item, run: () => { closeMenu(false); item.run(); } }));
  return el;
}

function itemButton(item) {
  return h('li', { role: 'none' },
    withMenu(h('button', { class: 'sm-item', type: 'button', role: 'menuitem', title: item.title || null },
      itemArt(item, 'icon icon-sm'),
      h('span', { class: 'sm-label' }, item.label)), item));
}

function attach(li, item) {
  li.firstElementChild.addEventListener('click', () => { closeMenu(false); item.run(); });
  return li;
}

let categoriesPromise = null;
/** Kategorie menu Start (wspólne z launcherem Windows 1.0 / 2.0 i ekranem Start). */
export const getCategories = () => (categoriesPromise ||= buildCategories());

async function buildCategories() {
  const [programs, games, tools] = await Promise.all([
    loadData('programs').catch(() => ({ items: [] })),
    loadData('games').catch(() => ({ items: [] })),
    loadData('tools').catch(() => ({ items: [] }))
  ]);
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'pl');
  const web = (kind) => x => ({ label: x.title, tile: true, kind, item: x, title: x.description, run: () => openItem(kind, x), search: x.title + ' ' + x.description });

  return [
    { id: 'programs', label: 'Moje programy', icon: 'download', items: [
      { ...appItem('programs'), label: 'Wszystkie programy' }, 'sep',
      ...programs.items.map(p => ({ prog: p, label: p.name, icon: p.icon || (p.kind === 'Gry' ? 'game' : 'app'), title: p.description, run: () => launch('programs', { repo: p.repo }), search: p.name + ' ' + p.description }))
    ] },
    { id: 'games', label: 'Gry', icon: 'game', items: [
      { ...appItem('games'), label: 'Wszystkie gry', icon: 'folder' }, 'sep',
      ...games.items.slice().sort(byTitle).map(web('games'))
    ] },
    { id: 'tools', label: 'Narzędzia', icon: 'tools', items: [
      appItem('notepad'), appItem('gadgets'), { ...appItem('tools'), label: 'Wszystkie narzędzia', icon: 'folder' }, 'sep',
      ...tools.items.slice().sort(byTitle).map(web('tools'))
    ] },
    { id: 'media', label: 'Media', icon: 'music', items: [appItem('music'), appItem('films')] },
    { id: 'links', label: 'Linki', icon: 'link', items: [appItem('linkhub'), appItem('oldsite'), appItem('changelog'), { ...appItem('github'), label: 'Profil GitHub ↗' }] },
    { id: 'control', label: 'Panel sterowania', icon: 'settings', items: [appItem('control'), appItem('oldsettings')] }
  ];
}

export async function initStartMenu() {
  menu = document.getElementById('startmenu');
  startBtn = document.getElementById('start-btn');

  search = h('input', { class: 'sm-search-input', type: 'search', placeholder: 'Wyszukaj programy, gry i narzędzia', 'aria-label': 'Wyszukaj w menu Start' });
  cats = h('ul', { class: 'sm-cats', role: 'menu', 'aria-label': 'Kategorie' });
  results = h('ul', { class: 'sm-results', role: 'menu', 'aria-label': 'Wyniki wyszukiwania', hidden: true });
  const pinned = h('ul', { class: 'sm-pinned-list', role: 'menu', 'aria-label': 'Przypięte' },
    PINNED.map(id => attach(itemButton(appItem(id)), appItem(id))));

  const closeAll = h('button', { class: 'sm-foot-btn', type: 'button', onclick: () => { closeMenu(); for (const w of getWindows()) closeWindow(w.id); } },
    icon('power', 'icon icon-sm'), h('span', {}, 'Zamknij wszystkie okna'));
  const restart = h('button', { class: 'sm-foot-btn', type: 'button', onclick: () => location.reload() },
    h('span', { class: 'sm-restart-glyph', 'aria-hidden': 'true' }, '↻'), h('span', {}, 'Uruchom ponownie'));

  screen = h('div', { class: 'ss', role: 'region', 'aria-label': 'Ekran Start' });

  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Menu Start');
  menu.append(
    h('div', { class: 'sm-banner', 'aria-hidden': 'true' }, h('span', { class: 'sm-banner-text' }, h('b', {}, 'snakex21'), ' pulpit')),
    h('div', { class: 'sm-main' },
      h('div', { class: 'sm-head' }, h('span', { class: 'sm-avatar' }, icon('user', 'icon')), h('span', { class: 'sm-user' }, 'snakex21')),
      h('div', { class: 'sm-search' }, icon('search', 'icon icon-sm'), search),
      screen,
      h('div', { class: 'sm-columns' },
        h('section', { class: 'sm-pinned', 'aria-label': 'Przypięte' }, h('h3', { class: 'sm-heading' }, 'Przypięte'), pinned),
        h('section', { class: 'sm-all', 'aria-label': 'Wszystkie' }, h('h3', { class: 'sm-heading' }, 'Wszystkie programy'), cats, results)),
      h('div', { class: 'sm-foot' }, h('span', { class: 'sm-foot-user' }, icon('user', 'icon icon-sm'), 'snakex21'), restart, closeAll))
  );

  const categories = await getCategories();
  const allItems = [];
  for (const cat of categories) {
    const subId = 'sm-sub-' + cat.id;
    const btn = h('button', { class: 'sm-item sm-cat-btn', type: 'button', role: 'menuitem', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': subId },
      icon(cat.icon, 'icon icon-sm'), h('span', { class: 'sm-label' }, cat.label), h('span', { class: 'sm-arrow', 'aria-hidden': 'true' }));
    const sub = h('ul', { class: 'sm-sub', id: subId, role: 'menu', 'aria-label': cat.label, hidden: true });
    for (const it of cat.items) {
      if (it === 'sep') { sub.append(h('li', { class: 'sm-sep', role: 'separator' })); continue; }
      sub.append(attach(itemButton(it), it));
      allItems.push(it);
    }
    const li = h('li', { class: 'sm-cat', role: 'none' }, btn, sub);
    cats.append(li);
    btn.addEventListener('click', () => toggleSub(li, !li.classList.contains('open')));
    li.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse' || !flyoutMode()) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => toggleSub(li, true), 120);
    });
  }
  cats.addEventListener('pointerleave', () => clearTimeout(hoverTimer));

  // Wyszukiwanie
  search.addEventListener('input', () => {
    const q = fold(search.value.trim());
    menu.classList.toggle('searching', !!q);
    results.hidden = !q;
    cats.hidden = !!q;
    if (!q) return;
    const hits = allItems.filter(it => fold(it.label + ' ' + (it.search || '')).includes(q)).slice(0, 30);
    results.replaceChildren(...(hits.length ? hits.map(it => attach(itemButton(it), it)) : [h('li', { class: 'sm-empty' }, 'Nic nie znaleziono')]));
  });
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); results.querySelector('.sm-item')?.click(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); visibleItems()[0]?.focus(); }
  });

  // Otwieranie / zamykanie
  startBtn.addEventListener('click', () => (isOpen() ? closeMenu() : openMenu()));
  document.addEventListener('pointerdown', e => {
    if (isOpen() && !menu.contains(e.target) && !startBtn.contains(e.target)) closeMenu(false);
  });
  window.addEventListener('blur', () => { if (isOpen() && document.activeElement?.tagName === 'IFRAME') closeMenu(false); });
  menu.addEventListener('keydown', onKey);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); closeMenu(); }
  });
  // Inny motyw = inny układ menu; otwarte menu zamykamy, żeby nie zostało w złym miejscu.
  on('theme:change', () => closeMenu(false));
}

/* ---------- Ekran Start (Windows 8 / 8.1) ---------- */

// Kolory kafelków (własna paleta, płaskie barwy)
const TC = { blue: '#1f6fd1', teal: '#008a8a', green: '#2e8b3a', lime: '#6f8f00', orange: '#d2691e', red: '#c23b3b',
  magenta: '#b0287a', purple: '#6b3fa0', indigo: '#3a4cb0', slate: '#46505e', brown: '#8a5a2b', sky: '#1b8bc1' };
const TC_LIST = Object.values(TC);

function hashColor(text) {
  let x = 0;
  for (const ch of text) x = (x * 31 + ch.codePointAt(0)) >>> 0;
  return TC_LIST[x % TC_LIST.length];
}

/** Kafelek ekranu Start. size: small | medium | wide | large */
function ssTile(spec) {
  const { label, icon: ic, art, color, size = 'medium', run, title, live, cls = '' } = spec;
  const btn = h('button', { class: `ss-tile s-${size} ${cls}`, type: 'button', title: title || label, style: { '--tc': color || hashColor(label) } },
    h('span', { class: 'ss-tile-art', 'aria-hidden': 'true' }, art ? art() : icon(ic || 'app', 'icon')),
    live || null,
    h('span', { class: 'ss-tile-label' }, label));
  btn.addEventListener('click', () => { closeMenu(false); run(); });
  return withMenu(btn, spec);
}

function ssGroup(title, tiles) {
  return h('section', { class: 'ss-group', 'aria-label': title }, h('h3', { class: 'ss-group-title' }, title), h('div', { class: 'ss-grid' }, tiles));
}

async function buildScreen() {
  const [programs, games, tools] = await Promise.all([
    loadData('programs').catch(() => ({ items: [] })),
    loadData('games').catch(() => ({ items: [] })),
    loadData('tools').catch(() => ({ items: [] }))
  ]);
  const categories = await getCategories();
  const a = (id, size, color, extra = {}) => ({ appId: id, label: apps[id].title, icon: apps[id].icon, title: apps[id].hint, size, color, run: () => launch(id), ...extra });

  // Żywe kafelki: zegar, przewijane nazwy programów, licznik gier (animacja wyłączona przy ograniczonym ruchu).
  const clockLive = h('span', { class: 'ss-live ss-live-clock', 'aria-hidden': 'true' }, h('b', { class: 'ss-time' }), h('span', { class: 'ss-date' }));
  const names = programs.items.slice(0, 4).map(p => p.name);
  const progLive = h('span', { class: 'ss-live ss-live-roll', 'aria-hidden': 'true' },
    h('span', { class: 'ss-roll' }, names.map(n => h('span', {}, n)), names[0] ? h('span', {}, names[0]) : null));
  const gamesLive = h('span', { class: 'ss-live ss-live-count', 'aria-hidden': 'true' }, h('b', {}, String(games.items.length)), ' gier');

  const top = [
    { label: 'Pulpit', icon: 'folder', size: 'wide', color: '#2a5d8f', cls: 'ss-desktop', run: () => {}, title: 'Wróć na pulpit' },
    a('programs', 'wide', TC.green, { live: progLive }),
    a('gadgets', 'wide', TC.sky, { live: clockLive, label: 'Zegar i pogoda' }),
    a('games', 'medium', TC.purple, { live: gamesLive }),
    a('tools', 'medium', TC.orange),
    a('notepad', 'small', TC.lime),
    a('control', 'small', TC.slate),
    a('music', 'small', TC.magenta),
    a('films', 'small', TC.red),
    a('linkhub', 'medium', TC.indigo),
    a('oldsite', 'medium', TC.teal),
    a('changelog', 'small', TC.brown),
    { appId: 'github', label: 'Profil GitHub', icon: 'code', size: 'small', color: '#333a44', run: () => launch('github') }
  ];
  const progTiles = programs.items.map((p, i) => ({ prog: p, label: p.name, icon: p.icon || (p.kind === 'Gry' ? 'game' : 'app'), title: p.description,
    size: i === 0 ? 'large' : i < 3 ? 'wide' : 'medium', run: () => launch('programs', { repo: p.repo }) }));
  const pick = (list, n) => list.slice().sort((x, y) => x.title.localeCompare(y.title, 'pl')).slice(0, n);
  const gameTiles = pick(games.items, 12).map((g, i) => ({ kind: 'games', item: g, label: g.title, art: () => catalogIcon('games', g), title: g.description, size: i < 2 ? 'medium' : 'small', run: () => openItem('games', g) }));
  const toolTiles = pick(tools.items, 8).map((t, i) => ({ kind: 'tools', item: t, label: t.title, art: () => catalogIcon('tools', t), title: t.description, size: i < 2 ? 'medium' : 'small', run: () => openItem('tools', t) }));

  const tilesView = h('div', { class: 'ss-groups' },
    ssGroup('Start', top.map(ssTile)),
    ssGroup('Moje programy', progTiles.map(ssTile)),
    ssGroup('Gry', [ssTile({ ...a('games', 'wide', TC.purple), label: 'Wszystkie gry' }), ...gameTiles.map(ssTile)]),
    ssGroup('Narzędzia', [ssTile({ ...a('tools', 'wide', TC.orange), label: 'Wszystkie narzędzia' }), ...toolTiles.map(ssTile)]));

  // Widok "Wszystkie aplikacje": lista według kategorii (Windows 8.1)
  const allView = h('div', { class: 'ss-all', hidden: true },
    categories.map(cat => h('section', { class: 'ss-all-cat', 'aria-label': cat.label },
      h('h3', { class: 'ss-all-title' }, cat.label),
      h('ul', { class: 'ss-all-list' }, cat.items.filter(it => it !== 'sep').map(it => {
        const btn = h('button', { class: 'ss-all-item', type: 'button', title: it.title || null },
          itemArt(it, 'icon icon-sm'), h('span', {}, it.label));
        btn.addEventListener('click', () => { closeMenu(false); it.run(); });
        return h('li', {}, withMenu(btn, it));
      })))));

  const toggle = h('button', { class: 'ss-toggle', type: 'button', 'aria-pressed': 'false' },
    h('span', { class: 'ss-toggle-arrow', 'aria-hidden': 'true' }), h('span', { class: 'ss-toggle-label' }, 'Wszystkie aplikacje'));
  toggle.addEventListener('click', () => {
    const all = allView.hidden;
    allView.hidden = !all;
    tilesView.hidden = all;
    toggle.setAttribute('aria-pressed', String(all));
    toggle.querySelector('.ss-toggle-label').textContent = all ? 'Kafelki' : 'Wszystkie aplikacje';
    screen.classList.toggle('ss-show-all', all);
  });
  const back = h('button', { class: 'ss-back', type: 'button', title: 'Wróć na pulpit (Esc)' }, h('span', { 'aria-hidden': 'true' }, '←'), h('span', {}, 'Pulpit'));
  back.addEventListener('click', () => closeMenu());

  screen.append(h('div', { class: 'ss-bar' }, h('h2', { class: 'ss-title' }, 'Start'), back), tilesView, allView, toggle);
  screen.dataset.built = '1';
}

function tickLive() {
  const t = screen.querySelector('.ss-time');
  if (!t) return;
  const d = new Date();
  t.textContent = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  screen.querySelector('.ss-date').textContent = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function toggleSub(li, open) {
  for (const other of cats.children) {
    if (other !== li || !open) {
      other.classList.remove('open');
      other.querySelector('.sm-cat-btn').setAttribute('aria-expanded', 'false');
      other.querySelector('.sm-sub').hidden = true;
    }
  }
  if (!open) return;
  li.classList.add('open');
  li.querySelector('.sm-cat-btn').setAttribute('aria-expanded', 'true');
  const sub = li.querySelector('.sm-sub');
  sub.hidden = false;
  sub.style.top = '';
  if (flyoutMode()) {
    // Podmenu nie może wyjść poza dolną krawędź (nad paskiem zadań).
    const limit = document.getElementById('taskbar').getBoundingClientRect();
    const bottom = limit.top > window.innerHeight / 2 ? limit.top : window.innerHeight;
    const r = sub.getBoundingClientRect();
    if (r.bottom > bottom) sub.style.top = Math.min(0, bottom - r.bottom) - 2 + 'px';
    const r2 = sub.getBoundingClientRect();
    if (r2.top < 0) sub.style.top = (parseFloat(sub.style.top) || 0) - r2.top + 'px';
  }
}

async function openMenu() {
  if (screenMode() && !screen.dataset.built) {
    screen.dataset.built = 'pending';
    try { await buildScreen(); } catch (err) { console.error(err); delete screen.dataset.built; }
  }
  if (screenMode()) {
    tickLive();
    clearInterval(liveTimer);
    liveTimer = setInterval(tickLive, 1000);
  }
  menu.hidden = false;
  startBtn.setAttribute('aria-expanded', 'true');
  startBtn.classList.add('pressed');
  requestAnimationFrame(() => {
    if (getComputedStyle(search).display !== 'none' && search.offsetParent) search.focus();
    else visibleItems()[0]?.focus();
  });
}

export function closeMenu(returnFocus = true) {
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  clearInterval(liveTimer);
  startBtn.setAttribute('aria-expanded', 'false');
  startBtn.classList.remove('pressed');
  for (const li of cats.children) {
    li.classList.remove('open');
    li.querySelector('.sm-sub').hidden = true;
    li.querySelector('.sm-cat-btn').setAttribute('aria-expanded', 'false');
  }
  search.value = '';
  search.dispatchEvent(new Event('input'));
  if (returnFocus && startBtn.offsetParent) startBtn.focus();
}

/** Pozycje widoczne w tej samej liście co element z fokusem. */
function visibleItems(from) {
  const scope = from ? from.closest('ul') : null;
  const root = scope || menu;
  return [...root.querySelectorAll('.sm-item, .sm-foot-btn')].filter(b =>
    b.offsetParent !== null && (!scope || b.closest('ul') === scope));
}

function onKey(e) {
  const cur = document.activeElement;
  if (!cur || cur === search) return;
  const inSub = cur.closest('.sm-sub');
  const catLi = cur.closest('.sm-cat');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    const list = cur.closest('ul') ? visibleItems(cur) : visibleItems();
    const i = list.indexOf(cur);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    list[next]?.focus();
  } else if (e.key === 'ArrowRight' && cur.classList.contains('sm-cat-btn')) {
    e.preventDefault();
    toggleSub(catLi, true);
    catLi.querySelector('.sm-sub .sm-item')?.focus();
  } else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && inSub) {
    e.preventDefault();
    e.stopPropagation();
    toggleSub(catLi, false);
    catLi.querySelector('.sm-cat-btn').focus();
  }
}
