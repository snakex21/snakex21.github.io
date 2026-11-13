// Pasek zadań: przyciski otwartych okien, zegar w zasobniku i "Pokaż pulpit".
// Obszar ikon (#icon-area): zminimalizowane okna jako ikony na dole pulpitu – widoczny
// tylko w motywach bez paska zadań (data-taskbar="none", Windows 1.0 / 2.0 / 3.1).

import { h, icon } from './util.js';
import { on } from './store.js';
import { getWindows, activeWindow, toggleFromTaskbar, minimizeAll, restoreWindow } from './wm.js';
import { launch } from './apps/registry.js';

export function initTaskbar() {
  const list = document.getElementById('tasklist');
  const iconArea = document.getElementById('icon-area');
  const buttons = new Map();
  const minIcons = new Map();

  const renderIcons = (wins) => {
    for (const [id, btn] of minIcons) {
      if (!wins.some(w => w.id === id && w.minimized)) { btn.remove(); minIcons.delete(id); }
    }
    for (const w of wins) {
      if (!w.minimized) continue;
      let btn = minIcons.get(w.id);
      if (!btn) {
        btn = h('button', { class: 'min-icon', type: 'button', dataset: { wid: w.id } },
          h('span', { class: 'min-icon-img' }, icon(w.icon, 'icon icon-lg')), h('span', { class: 'min-icon-label' }));
        // Pojedyncze kliknięcie przywraca (dwuklik z epoki byłby mało wygodny na dotyku).
        btn.addEventListener('click', () => restoreWindow(w.id));
        minIcons.set(w.id, btn);
        iconArea.append(btn);
      }
      btn.querySelector('.min-icon-label').textContent = w.title;
      btn.title = w.title;
      btn.setAttribute('aria-label', 'Przywróć: ' + w.title);
    }
  };

  const render = () => {
    const wins = getWindows();
    const active = activeWindow();
    if (iconArea) renderIcons(wins);
    for (const [id, btn] of buttons) {
      if (!wins.some(w => w.id === id)) { btn.remove(); buttons.delete(id); }
    }
    for (const w of wins) {
      let btn = buttons.get(w.id);
      if (!btn) {
        btn = h('button', { class: 'task-btn', type: 'button', dataset: { wid: w.id } },
          h('span', { class: 'task-icon' }, icon(w.icon, 'icon icon-sm')), h('span', { class: 'task-label' }));
        btn.addEventListener('click', () => toggleFromTaskbar(w.id));
        buttons.set(w.id, btn);
        list.append(btn);
      }
      const isActive = active === w && !w.minimized;
      btn.querySelector('.task-label').textContent = w.title;
      btn.title = w.title;
      btn.setAttribute('aria-label', w.title + (w.minimized ? ' (zminimalizowane)' : ''));
      btn.setAttribute('aria-pressed', String(isActive));
      btn.classList.toggle('active', isActive);
      btn.classList.toggle('minimized', w.minimized);
    }
  };
  on('wm:change', render);

  // Zegar
  const time = document.getElementById('clock-time');
  const date = document.getElementById('clock-date');
  const clockBtn = document.getElementById('tray-clock');
  const tick = () => {
    const d = new Date();
    time.textContent = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    time.dateTime = d.toISOString();
    date.textContent = d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    clockBtn.title = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    clockBtn.setAttribute('aria-label', 'Godzina ' + time.textContent + ', ' + clockBtn.title + '. Otwórz gadżety');
  };
  tick();
  setInterval(tick, 1000);
  clockBtn.addEventListener('click', () => launch('gadgets'));
  document.getElementById('show-desktop').addEventListener('click', minimizeAll);
}
