// Okno-folder z grami albo narzędziami (dane z data/games.json i data/tools.json), widoki "Duże ikony" / "Szczegóły"
// jak w "Moje programy". Ikony: icons/games/<slug>.svg, icons/tools/<slug>.svg (catalogIcon w util.js; przy braku
// pliku kafelek z inicjałami). Kliknięcie zaznacza, dwuklik / Enter otwiera grę lub narzędzie w oknie z iframe.

import { openWindow } from '../wm.js';
import { h, icon, catalogIcon, catalogIconPath, loadData, fold, isNarrow } from '../util.js';
import { store } from '../store.js';
import { openWeb } from './webview.js';
import { bindMenu, itemMenu } from '../menus.js';

const KINDS = {
  games: { title: 'Gry', icon: 'game', file: 'games', noun: 'gier', winIcon: 'game', size: [820, 600], kindLabel: 'Gra' },
  tools: { title: 'Narzędzia', icon: 'tools', file: 'tools', noun: 'narzędzi', winIcon: 'app', size: [960, 640], kindLabel: 'Narzędzie' }
};

/** Okno gry / narzędzia: ikona gry w pasku tytułu i na pasku zadań (zwykła ikona, gdy rysunku brak). */
export function openItem(kind, item) {
  const k = KINDS[kind];
  return openWeb({ id: 'web:' + item.path, title: item.title, icon: catalogIconPath(kind, item) || k.winIcon, path: item.path, size: k.size });
}

export function open({ kind = 'games' } = {}) {
  const k = KINDS[kind];
  const viewKey = 'catalog:' + kind + ':view';
  return openWindow({
    id: 'app:' + kind,
    title: k.title,
    icon: k.icon,
    width: 720,
    height: 500,
    render(body) {
      let view = store.get(viewKey, 'icons') === 'details' ? 'details' : 'icons';
      const search = h('input', { class: 'field', type: 'search', placeholder: 'Szukaj…', 'aria-label': 'Szukaj w: ' + k.title });
      const viewBtns = ['icons', 'details'].map(v => h('button', {
        class: 'btn btn-view', type: 'button', 'aria-pressed': String(v === view), dataset: { view: v },
        title: v === 'icons' ? 'Duże ikony' : 'Szczegóły'
      }, h('span', { class: 'view-glyph view-' + v, 'aria-hidden': 'true' }), h('span', { class: 'btn-view-label' }, v === 'icons' ? 'Duże ikony' : 'Szczegóły')));
      const grid = h('div', { class: 'folder-grid prog-folder cat-folder', role: 'listbox', 'aria-label': k.title });
      const head = h('div', { class: 'details-head', 'aria-hidden': 'true' }, h('span'), h('span', {}, 'Nazwa'), h('span', {}, 'Opis'), h('span', {}, kind === 'games' ? 'Gatunek' : 'Typ'));
      const info = h('span', { class: 'status-text' }, 'Wczytywanie…');
      const openBtn = h('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Otwórz');
      const scroller = h('div', { class: 'folder-scroll' }, head, grid);
      body.append(
        h('div', { class: 'toolbar' },
          h('span', { class: 'crumbs' }, icon(k.icon, 'icon icon-sm'), ' Pulpit › ', h('strong', {}, k.title)),
          h('span', { class: 'view-switch', role: 'group', 'aria-label': 'Widok' }, viewBtns),
          search
        ),
        scroller,
        h('div', { class: 'statusbar' }, info, openBtn)
      );

      const setView = (v) => {
        view = v;
        store.set(viewKey, v);
        scroller.classList.toggle('is-details', v === 'details');
        grid.classList.toggle('folder-grid', v === 'icons');
        grid.classList.toggle('folder-details', v === 'details');
        head.hidden = v !== 'details';
        for (const b of viewBtns) b.setAttribute('aria-pressed', String(b.dataset.view === v));
      };
      for (const b of viewBtns) b.addEventListener('click', () => setView(b.dataset.view));

      let items = [];
      let selected = null;
      const summary = () => `${items.length} ${k.noun} · ${isNarrow() ? 'stuknij, aby otworzyć' : 'dwuklik lub Enter otwiera'}`;
      const select = (btn) => {
        for (const b of grid.querySelectorAll('.file')) {
          const on = b === btn;
          b.classList.toggle('selected', on);
          b.setAttribute('aria-selected', String(on));
          b.tabIndex = on ? 0 : -1;
        }
        selected = btn;
        const item = btn && items[btn.dataset.i];
        info.textContent = item ? `${item.title} — ${item.description || ''}` : summary();
        openBtn.disabled = !item;
      };
      const launch = (btn) => { const item = btn && items[btn.dataset.i]; if (item) openItem(kind, item); };
      openBtn.addEventListener('click', () => launch(selected));

      grid.addEventListener('click', e => {
        const btn = e.target.closest('.file');
        if (!btn) return;
        select(btn);
        if (e.detail === 0 || isNarrow() || e.pointerType === 'touch') launch(btn);   // klawiatura / dotyk
      });
      grid.addEventListener('dblclick', e => launch(e.target.closest('.file')));
      // Menu kontekstowe pozycji: Otwórz, Otwórz w nowej karcie, Właściwości
      bindMenu(grid, ({ target }) => {
        const btn = target.closest('.file');
        const item = btn && items[btn.dataset.i];
        if (!item) return false;
        select(btn);
        return itemMenu({ kind, item, run: () => openItem(kind, item) });
      });
      grid.addEventListener('keydown', e => {
        const all = [...grid.querySelectorAll('.file:not([hidden])')];
        const i = all.indexOf(document.activeElement);
        if (i < 0) return;
        const cols = view === 'details' ? 1 : Math.max(1, Math.round(grid.clientWidth / all[0].offsetWidth));
        const moves = { ArrowRight: view === 'details' ? 0 : 1, ArrowLeft: view === 'details' ? 0 : -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: all.length - 1 - i };
        if (e.key in moves) {
          e.preventDefault();
          const next = all[Math.max(0, Math.min(all.length - 1, i + moves[e.key]))];
          select(next);
          next.focus();
        }
      });
      search.addEventListener('input', () => {
        const q = fold(search.value.trim());
        let shown = 0;
        for (const b of grid.querySelectorAll('.file')) {
          const item = items[b.dataset.i];
          const hit = !q || fold(item.title + ' ' + item.description + ' ' + (item.genres || []).join(' ')).includes(q);
          b.hidden = !hit;
          if (hit) shown++;
        }
        info.textContent = q ? `Znaleziono: ${shown}` : summary();
        const first = grid.querySelector('.file:not([hidden])');
        if (first && (!selected || selected.hidden)) select(first);
      });

      loadData(k.file).then(data => {
        items = data.items.slice().sort((a, b) => a.title.localeCompare(b.title, 'pl'));
        items.forEach((item, i) => grid.append(
          h('button', {
            class: 'file prog-file cat-file', type: 'button', role: 'option', 'aria-selected': 'false', tabindex: i ? '-1' : '0', dataset: { i },
            title: item.description ? item.title + '\n' + item.description : item.title
          },
            h('span', { class: 'file-icon' }, catalogIcon(kind, item, 'icon icon-xl')),
            h('span', { class: 'file-label', lang: 'pl' }, item.title),
            h('span', { class: 'file-desc' }, item.description || ''),
            h('span', { class: 'file-kind' }, (item.genres || []).join(', ') || k.kindLabel))
        ));
        setView(view);
        info.textContent = summary();
      }).catch(() => { info.textContent = 'Nie udało się wczytać listy.'; });
    }
  });
}
