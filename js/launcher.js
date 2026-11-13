// Launcher u góry ekranu dla motywów bez menu Start (cecha "launcher" w themes.json):
//  - "executive": tytuł, pasek menu i lista programów jak nazwy plików (Windows 1.0)
//  - "menubar":   sam pasek menu z kategoriami i zegarem (Windows 2.0)
// Element #launcher jest zawsze budowany; CSS pokazuje go tylko, gdy data-launcher ≠ "none".

import { h, icon, fold } from './util.js';
import { apps, launch } from './apps/registry.js';
import { DESKTOP_ICONS } from './desktop.js';
import { getCategories } from './startmenu.js';
import { menuBar } from './menubar.js';
import { getWindows, closeWindow, minimizeAll } from './wm.js';

/** "Moje programy" -> "MOJEPROG.EXE" (nazwa w stylu 8.3). */
const fileName = (title) => (fold(title).replace(/[^a-z0-9]/g, '').slice(0, 8) || 'PROGRAM').toUpperCase() + '.EXE';

export async function initLauncher() {
  const nav = document.getElementById('launcher');
  if (!nav) return;
  const categories = await getCategories();

  const fileMenu = {
    label: 'Plik',
    items: [
      { label: 'Pokaż pulpit', icon: 'folder', run: minimizeAll },
      { label: 'Zamknij wszystkie okna', icon: 'power', run: () => { for (const w of getWindows()) closeWindow(w.id); } },
      'sep',
      { label: 'Uruchom ponownie', icon: 'os', run: () => location.reload() }
    ]
  };
  const bar = menuBar([fileMenu, ...categories.map(c => ({ label: c.label, items: c.items }))], { label: 'Menu programów', className: 'ln-menu' });

  const list = h('ul', { class: 'ln-apps', 'aria-label': 'Programy' },
    DESKTOP_ICONS.map(id => {
      const app = apps[id];
      const btn = h('button', { class: 'ln-app', type: 'button', title: app.hint || app.title, 'aria-label': app.title },
        icon(app.icon, 'icon icon-sm'),
        h('span', { class: 'ln-app-file', 'aria-hidden': 'true' }, fileName(app.title)),
        h('span', { class: 'ln-app-name', 'aria-hidden': 'true' }, app.title));
      btn.addEventListener('click', () => launch(id));
      return h('li', {}, btn);
    }));

  const clock = h('time', { class: 'ln-clock' });
  const tick = () => {
    const d = new Date();
    clock.textContent = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    clock.dateTime = d.toISOString();
  };
  tick();
  setInterval(tick, 15000);

  nav.append(
    h('div', { class: 'ln-title' }, h('span', { class: 'ln-title-text' }, 'Pulpit — snakex21'), h('span', { class: 'ln-path', 'aria-hidden': 'true' }, 'C:\\PULPIT')),
    h('div', { class: 'ln-row' }, icon('os', 'icon icon-sm ln-logo'), bar, clock),
    list
  );
}
