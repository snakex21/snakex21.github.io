// "Menedżer programów" (motywy z cechą programManager, np. Windows 3.1): okno z paskiem menu
// i oknami grup (Moje programy, Gry, Narzędzia, Media) z ikonami. Grupę można zminimalizować do ikony
// na dole okna, zmaksymalizować albo ułożyć wszystkie kaskadowo / sąsiadująco.
// Okno jest "persistent": przycisk zamykania je minimalizuje. Otwiera i zamyka je syncProgman() przy zmianie motywu.

import { openWindow, closeWindow, getWindow, getWindows } from '../wm.js';
import { h, itemArt, loadData, isNarrow } from '../util.js';
import { apps, launch } from './registry.js';
import { openItem } from './catalog.js';
import { menuBar } from '../menubar.js';
import { bindMenu, itemMenu, describe, showProperties } from '../menus.js';

const ID = 'app:progman';

const app = (id, label) => ({ appId: id, label: label || apps[id].title, icon: apps[id].icon, title: apps[id].hint, run: () => launch(id) });

async function groups() {
  const [programs, games, tools] = await Promise.all([
    loadData('programs').catch(() => ({ items: [] })),
    loadData('games').catch(() => ({ items: [] })),
    loadData('tools').catch(() => ({ items: [] }))
  ]);
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'pl');
  const web = kind => x => ({ label: x.title, tile: true, kind, item: x, title: x.description, run: () => openItem(kind, x) });
  return [
    { id: 'programs', title: 'Moje programy', items: [app('programs', 'Wszystkie programy'),
      ...programs.items.map(p => ({ prog: p, label: p.name, icon: p.icon || (p.kind === 'Gry' ? 'game' : 'app'), title: p.description, run: () => launch('programs', { repo: p.repo }) }))] },
    { id: 'games', title: 'Gry', items: [app('games', 'Wszystkie gry'), ...games.items.slice().sort(byTitle).map(web('games'))] },
    { id: 'tools', title: 'Narzędzia', items: [app('notepad'), app('gadgets'), app('control'), app('tools', 'Wszystkie narzędzia'), ...tools.items.slice().sort(byTitle).map(web('tools'))] },
    { id: 'media', title: 'Media', items: [app('music'), app('films'), app('linkhub'), app('oldsite'), app('changelog')] }
  ];
}

export function open() {
  return openWindow({
    id: ID,
    title: 'Menedżer programów',
    icon: 'os',
    width: 640,
    height: 440,
    minWidth: 300,
    minHeight: 220,
    persistent: true,
    className: 'progman',
    render(body) {
      const mdi = h('div', { class: 'pm-mdi' });
      const tray = h('div', { class: 'pm-tray', role: 'toolbar', 'aria-label': 'Zminimalizowane grupy' });
      let zTop = 1;
      const groupEls = [];

      const arrange = (mode) => {
        const vis = groupEls.filter(g => !g.hidden && !g.classList.contains('max'));
        mdi.dataset.arrange = mode;
        vis.forEach((g, i) => {
          if (mode === 'cascade') {
            Object.assign(g.style, { left: 8 + i * 22 + 'px', top: 8 + i * 22 + 'px', width: '62%', height: '58%' });
          } else {
            const cols = vis.length > 2 ? 2 : vis.length;
            const rows = Math.ceil(vis.length / cols);
            const r = Math.floor(i / cols), c = i % cols;
            const inRow = r === rows - 1 ? vis.length - r * cols : cols;
            Object.assign(g.style, {
              left: `calc(${(100 / inRow) * c}% + 4px)`, top: `calc(${(100 / rows) * r}% + 4px)`,
              width: `calc(${100 / inRow}% - 8px)`, height: `calc(${100 / rows}% - 8px)`
            });
          }
        });
      };
      const activate = (g) => {
        for (const o of groupEls) o.classList.toggle('active', o === g);
        g.style.zIndex = String(++zTop);
      };

      const menus = [
        { label: 'Plik', items: [
          { label: 'Uruchom: Notatnik', icon: 'notes', run: () => launch('notepad') },
          { label: 'Panel sterowania', icon: 'settings', run: () => launch('control') },
          'sep',
          { label: 'Zamknij wszystkie okna', icon: 'power', run: () => { for (const w of getWindows()) closeWindow(w.id); } }
        ] },
        { label: 'Okno', items: [
          { label: 'Kaskadowo', run: () => arrange('cascade') },
          { label: 'Sąsiadująco', run: () => arrange('tile') },
          'sep',
          { label: 'Przywróć wszystkie grupy', run: () => { for (const g of groupEls) restore(g); arrange('tile'); } }
        ] },
        { label: 'Pomoc', items: [
          { label: 'Dziennik zmian', icon: 'notes', run: () => launch('changelog') },
          { label: 'Stara strona', icon: 'web', run: () => launch('oldsite') }
        ] }
      ];
      body.append(menuBar(menus, { label: 'Menu Menedżera programów', className: 'pm-menubar' }), h('div', { class: 'pm-area' }, mdi, tray));

      const restore = (g) => {
        if (!g.hidden) return;
        g.hidden = false;
        g._icon.remove();
        activate(g);
      };
      const minimize = (g) => {
        g.hidden = true;
        g.classList.remove('max');
        tray.append(g._icon);
        g._icon.focus();
      };

      groups().then(list => {
        for (const grp of list) {
          const titleId = 'pm-g-' + grp.id;
          const grid = h('div', { class: 'pm-icons', role: 'listbox', 'aria-labelledby': titleId });
          grp.items.forEach((it, i) => {
            const btn = h('button', { class: 'file pm-icon', type: 'button', role: 'option', 'aria-selected': 'false', tabindex: i ? '-1' : '0', title: it.title ? it.label + '\n' + it.title : it.label },
              itemArt(it, 'icon icon-lg'), h('span', { class: 'file-label', lang: 'pl' }, it.label));
            btn._run = it.run;
            if (describe(it)) bindMenu(btn, () => { select(btn); return itemMenu(it); });
            grid.append(btn);
          });
          const select = (btn) => {
            for (const b of grid.children) {
              const on = b === btn;
              b.classList.toggle('selected', on);
              b.setAttribute('aria-selected', String(on));
              b.tabIndex = on ? 0 : -1;
            }
          };
          grid.addEventListener('click', e => {
            const btn = e.target.closest('.pm-icon');
            if (!btn) return;
            select(btn);
            if (e.detail === 0 || isNarrow()) btn._run();
          });
          grid.addEventListener('dblclick', e => { const btn = e.target.closest('.pm-icon'); if (btn && !isNarrow()) btn._run(); });
          grid.addEventListener('keydown', e => {
            const items = [...grid.children];
            const i = items.indexOf(document.activeElement);
            if (i < 0) return;
            const cols = Math.max(1, Math.round(grid.clientWidth / (items[0].offsetWidth || 1)));
            const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
            if (!d) return;
            e.preventDefault();
            const next = items[Math.max(0, Math.min(items.length - 1, i + d))];
            select(next);
            next.focus();
          });

          const btnMin = h('button', { class: 'pm-btn pm-min', type: 'button', 'aria-label': 'Minimalizuj grupę ' + grp.title, title: 'Minimalizuj' });
          const btnMax = h('button', { class: 'pm-btn pm-max', type: 'button', 'aria-label': 'Maksymalizuj grupę ' + grp.title, title: 'Maksymalizuj' });
          const g = h('section', { class: 'pm-group', 'aria-labelledby': titleId },
            h('header', { class: 'pm-group-title' }, h('span', { class: 'pm-sys', 'aria-hidden': 'true' }), h('h3', { id: titleId }, grp.title), btnMin, btnMax),
            grid);
          g._icon = h('button', { class: 'pm-group-icon', type: 'button', 'aria-label': 'Przywróć grupę ' + grp.title, title: grp.title },
            h('span', { class: 'pm-group-glyph', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')), h('span', { class: 'pm-group-label' }, grp.title));
          // Menu kontekstowe grupy (pasek tytułu albo ikona zminimalizowanej grupy): Otwórz, Właściwości
          const groupMenu = () => [
            { label: 'Otwórz', default: true, run: () => { restore(g); activate(g); (grid.querySelector('[tabindex="0"]') || grid.firstElementChild)?.focus(); } },
            'sep',
            { label: 'Właściwości', run: () => showProperties({ name: grp.title, icon: 'folder', type: 'Grupa programów',
              description: 'Grupa w Menedżerze programów', extra: [['Elementy', String(grp.items.length)]] }) }
          ];
          bindMenu(g.querySelector('.pm-group-title'), groupMenu);
          bindMenu(g._icon, groupMenu);
          g._icon.addEventListener('click', () => restore(g));
          g._icon.addEventListener('dblclick', () => restore(g));
          btnMin.addEventListener('click', () => minimize(g));
          btnMax.addEventListener('click', () => { g.classList.toggle('max'); activate(g); });
          g.querySelector('.pm-group-title').addEventListener('dblclick', e => { if (!e.target.closest('button')) { g.classList.toggle('max'); activate(g); } });
          g.addEventListener('pointerdown', () => activate(g));
          g.addEventListener('focusin', () => activate(g));
          groupEls.push(g);
          mdi.append(g);
        }
        arrange('tile');
        activate(groupEls[0]);
      });
    }
  });
}

/** Wywoływane po starcie i przy zmianie motywu: Menedżer programów istnieje tylko w motywach, które go deklarują. */
export function syncProgman() {
  const want = document.documentElement.dataset.progman === 'true';
  const win = getWindow(ID);
  if (want && !win) open();
  else if (!want && win) closeWindow(ID, { force: true });
}
