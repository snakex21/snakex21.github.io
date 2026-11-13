// Panel sterowania: motyw (zapamiętany), wariant jasny/ciemny, kolor tapety, gadżety, reset okien.

import { openWindow, resetPositions } from '../wm.js';
import { h, announce } from '../util.js';
import { store, emit, on } from '../store.js';
import { loadThemes, applyTheme, currentTheme, currentVariant, setVariant, setWallColor, themeLayout, themeIcons, iconUrl } from '../themes.js';
import { getCity, setCityByName } from './gadgets.js';
import { launch } from './registry.js';

/** Miniatura motywu: kolory z "preview", kształt z cech układu (pasek, launcher, Menedżer programów, kafelki, kula Start). */
function themePreview(t) {
  const p = t.preview || {};
  const l = themeLayout(t);
  const span = (cls, ...kids) => h('span', { class: cls }, ...kids);
  const kids = [];
  if (l.start === 'screen') {
    kids.push(span('pv-tiles', [1, 2, 3, 4, 5, 6, 7].map(i => span('pv-tile pv-t' + i))));
  } else {
    if (l.launcher !== 'none') kids.push(span('pv-top'));
    kids.push(span('pv-win', span('pv-title'), l.programManager ? span('pv-groups', span('pv-group'), span('pv-group'), span('pv-group'), span('pv-group')) : null));
    kids.push(span('pv-win pv-win2', span('pv-title')));
    if (l.taskbar === 'none') kids.push(span('pv-mins', span('pv-min'), span('pv-min')));
  }
  if (l.taskbar !== 'none' && l.start !== 'screen') kids.push(span('pv-bar', l.startButton === 'orb' ? span('pv-orb') : span('pv-start')));
  return h('span', {
    class: 'theme-preview', 'aria-hidden': 'true',
    dataset: { tiling: String(l.tiling), launcher: l.launcher, start: l.start },
    style: { '--pv-desk': p.desk, '--pv-bar': p.bar, '--pv-title': p.title, '--pv-win': p.win, '--pv-radius': p.radius, '--pv-accent': p.accent }
  }, kids);
}

/** Logo systemu z zestawu ikon motywu (16 px); brak pliku = obrazek znika. */
function themeLogo(t) {
  const set = themeIcons(t);
  if (!set) return null;
  return h('img', { class: 'theme-logo', src: iconUrl(set.id, 16), srcset: iconUrl(set.id, 32) + ' 2x', width: '16', height: '16', alt: '', decoding: 'async',
    onerror: e => e.currentTarget.remove() });
}

const SWATCHES = ['#008080', '#3f86d8', '#2f6fd0', '#5a2d82', '#1f6b3a', '#7a1f2b', '#303846', '#b86b00'];

export function open() {
  return openWindow({
    id: 'app:control',
    title: 'Panel sterowania',
    icon: 'settings',
    width: 620,
    height: 560,
    minWidth: 300,
    render(body, win) {
      const content = h('div', { class: 'panel' });
      body.append(content, h('div', { class: 'statusbar' }, h('span', { class: 'status-text' }, 'Zmiany zapisują się od razu w tej przeglądarce.')));

      loadThemes().then(reg => {
        /* --- Motyw --- */
        const themeList = h('div', { class: 'theme-cards', role: 'radiogroup', 'aria-label': 'Motyw' });
        const variantBox = h('div', { class: 'variant-box' });
        const renderVariants = () => {
          const t = reg.themes.find(x => x.id === currentTheme());
          variantBox.replaceChildren();
          if (!t?.variants) return;
          const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Tryb kolorów' });
          for (const v of t.variants) {
            group.append(h('label', { class: 'seg-item' },
              h('input', { type: 'radio', name: 'variant', value: v.id, checked: currentVariant() === v.id, onchange: () => setVariant(v.id) }),
              h('span', {}, v.name)));
          }
          variantBox.append(h('p', { class: 'field-label' }, 'Tryb kolorów'), group);
        };
        // Od najstarszego do najnowszego
        const sorted = reg.themes.slice().sort((a, b) => (a.year || 0) - (b.year || 0));
        for (const t of sorted) {
          const input = h('input', { type: 'radio', name: 'theme', value: t.id, checked: currentTheme() === t.id, class: 'sr-only' });
          input.addEventListener('change', async () => {
            await applyTheme(t.id);
            renderVariants();
            announce('Włączono motyw ' + t.name);
          });
          themeList.append(h('label', { class: 'theme-card' }, input,
            themePreview(t),
            h('span', { class: 'theme-name' }, themeLogo(t), t.name, t.year ? h('span', { class: 'theme-year' }, ' · ' + t.year) : null),
            h('span', { class: 'theme-desc' }, t.description || '')));
        }
        renderVariants();

        /* --- Tapeta --- */
        const saved = store.get('wallColor');
        const colorInput = h('input', { type: 'color', class: 'color-input', value: saved || '#008080', 'aria-label': 'Własny kolor tapety' });
        colorInput.addEventListener('input', () => setWallColor(colorInput.value));
        const swatches = h('div', { class: 'swatches' }, SWATCHES.map(c =>
          h('button', { class: 'swatch', type: 'button', style: { background: c }, title: c, 'aria-label': 'Kolor ' + c, onclick: () => { colorInput.value = c; setWallColor(c); } })));
        const resetWall = h('button', { class: 'btn', type: 'button', onclick: () => { setWallColor(null); announce('Przywrócono tapetę motywu'); } }, 'Domyślna dla motywu');

        /* --- Gadżety --- */
        const gadgetsToggle = h('input', { type: 'checkbox', checked: store.get('gadgetsOnDesktop', true) });
        gadgetsToggle.addEventListener('change', () => { store.set('gadgetsOnDesktop', gadgetsToggle.checked); emit('gadgets:toggle'); });
        const city = h('input', { class: 'field', type: 'text', value: getCity().name, 'aria-label': 'Miasto pogody' });
        const cityMsg = h('span', { class: 'muted', role: 'status' });
        const cityForm = h('form', { class: 'city-form' }, h('label', {}, 'Miasto pogody: ', city), h('button', { class: 'btn', type: 'submit' }, 'Ustaw'), cityMsg);
        cityForm.addEventListener('submit', async e => {
          e.preventDefault();
          cityMsg.textContent = 'Szukam…';
          try { const c = await setCityByName(city.value.trim()); city.value = c.name; cityMsg.textContent = 'Ustawiono: ' + c.name; }
          catch { cityMsg.textContent = 'Nie znaleziono takiego miasta.'; }
        });

        content.append(
          h('fieldset', { class: 'group' }, h('legend', {}, 'Wygląd'), themeList, variantBox),
          h('fieldset', { class: 'group' }, h('legend', {}, 'Tapeta'),
            h('p', { class: 'muted' }, 'Kolor tapety dla każdego motywu (np. turkus w Windows 95, niebo w Windows XP, zorza w Viście, tło ekranu Start w Windows 8).'),
            h('div', { class: 'row' }, swatches, colorInput, resetWall)),
          h('fieldset', { class: 'group' }, h('legend', {}, 'Gadżety'),
            h('label', { class: 'check' }, gadgetsToggle, ' Pokazuj gadżety na pulpicie'), cityForm),
          h('fieldset', { class: 'group' }, h('legend', {}, 'Okna i dane'),
            h('div', { class: 'row' },
              h('button', { class: 'btn', type: 'button', onclick: () => { resetPositions(); announce('Pozycje okien wyczyszczone'); } }, 'Zapomnij pozycje okien'),
              h('button', { class: 'btn', type: 'button', onclick: () => launch('oldsettings') }, 'Ustawienia starej strony'))));
      });
      const off = on('theme:change', () => {
        const r = content.querySelector(`input[name="theme"][value="${currentTheme()}"]`);
        if (r) r.checked = true;
      });
      win.onClose.push(off);
    }
  });
}
