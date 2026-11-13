// Notatnik: wiele notatek zapisywanych automatycznie w localStorage tej przeglądarki.

import { openWindow } from '../wm.js';
import { h, debounce } from '../util.js';
import { store } from '../store.js';

const KEY = 'notes';

const load = () => {
  const notes = store.get(KEY, []);
  return Array.isArray(notes) ? notes.filter(n => n && typeof n.text === 'string') : [];
};
const titleOf = n => (n.text.split('\n').find(l => l.trim()) || 'Pusta notatka').trim().slice(0, 40);

let createNote = null;   // „Nowy › Notatka” z menu pulpitu, gdy Notatnik jest już otwarty

export function open(args = {}) {
  return openWindow({
    id: 'app:notepad',
    onReopen: a => { if (a?.newNote) createNote?.(); },
    title: 'Notatnik',
    icon: 'notes',
    width: 640,
    height: 440,
    minWidth: 300,
    render(body, win) {
      let notes = load();
      let current = null;

      const list = h('ul', { class: 'notes-list', role: 'listbox', 'aria-label': 'Notatki' });
      const area = h('textarea', { class: 'field notes-text', spellcheck: 'true', 'aria-label': 'Treść notatki', placeholder: 'Zacznij pisać…' });
      const status = h('span', { class: 'status-text', role: 'status' }, '');
      const btnNew = h('button', { class: 'btn', type: 'button' }, 'Nowa');
      const btnDel = h('button', { class: 'btn', type: 'button' }, 'Usuń');
      const btnSave = h('button', { class: 'btn', type: 'button' }, 'Zapisz jako .txt');

      body.append(
        h('div', { class: 'toolbar menubar' }, btnNew, btnDel, btnSave),
        h('div', { class: 'notes' }, h('div', { class: 'notes-side' }, list), area),
        h('div', { class: 'statusbar' }, status)
      );

      const persist = () => { store.set(KEY, notes); status.textContent = 'Zapisano ' + new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }); };
      const saveSoon = debounce(persist, 400);

      function renderList() {
        list.replaceChildren(...notes
          .slice().sort((a, b) => b.updated - a.updated)
          .map(n => h('li', {},
            h('button', {
              class: 'notes-item' + (current && n.id === current.id ? ' selected' : ''),
              type: 'button', role: 'option', 'aria-selected': String(!!current && n.id === current.id),
              onclick: () => select(n.id)
            }, h('span', { class: 'notes-title' }, titleOf(n)),
              h('span', { class: 'notes-date' }, new Date(n.updated).toLocaleDateString('pl-PL'))))));
      }
      function select(id) {
        current = notes.find(n => n.id === id) || null;
        area.value = current ? current.text : '';
        area.disabled = !current;
        btnDel.disabled = btnSave.disabled = !current;
        win.setTitle(current ? `${titleOf(current)} – Notatnik` : 'Notatnik');
        renderList();
      }
      function create() {
        const n = { id: 'n' + Date.now().toString(36), text: '', updated: Date.now() };
        notes.push(n);
        persist();
        select(n.id);
        area.focus();
      }

      btnNew.addEventListener('click', create);
      btnDel.addEventListener('click', () => {
        if (!current || !confirm(`Usunąć notatkę „${titleOf(current)}”? Tego nie da się cofnąć.`)) return;
        notes = notes.filter(n => n.id !== current.id);
        persist();
        select(notes[0]?.id);
      });
      btnSave.addEventListener('click', () => {
        if (!current) return;
        const url = URL.createObjectURL(new Blob([current.text], { type: 'text/plain;charset=utf-8' }));
        const a = h('a', { href: url, download: titleOf(current).replace(/[\\/:*?"<>|]+/g, '_') + '.txt' });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      area.addEventListener('input', () => {
        if (!current) return;
        current.text = area.value;
        current.updated = Date.now();
        status.textContent = 'Zapisywanie…';
        saveSoon();
        const btn = list.querySelector('.notes-item.selected .notes-title');
        if (btn) btn.textContent = titleOf(current);
      });
      win.onClose.push(() => { if (current) store.set(KEY, notes); createNote = null; });
      createNote = create;

      if (!notes.length) {
        notes.push({ id: 'n-start', text: 'Moja pierwsza notatka\n\nNotatki zapisują się same w tej przeglądarce.', updated: Date.now() });
        store.set(KEY, notes);
      }
      select(notes.slice().sort((a, b) => b.updated - a.updated)[0].id);
      status.textContent = 'Notatki są zapisywane tylko w tej przeglądarce.';
      if (args.newNote) create();
    }
  });
}
