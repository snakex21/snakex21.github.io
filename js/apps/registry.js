// Rejestr programów pulpitu. Każdy wpis ma tytuł, ikonę (z icons/icons.svg; 'os' = logo systemu z zestawu motywu) i sposób uruchomienia:
//  - module: plik w js/apps/ eksportujący open(args)
//  - web:    ścieżka strony na starej witrynie, pokazywana w oknie z iframe
//  - href:   zewnętrzny link otwierany w nowej karcie
// Nowy program = nowy wpis tutaj (+ ewentualnie moduł w js/apps/).

import { openWeb } from './webview.js';

export const apps = {
  programs:    { title: 'Moje programy', icon: 'download', module: './programs.js', hint: 'Pobierz moje aplikacje z GitHub Releases' },
  games:       { title: 'Gry', icon: 'game', module: './catalog.js', args: { kind: 'games' }, hint: 'Gry HTML5 w oknie' },
  tools:       { title: 'Narzędzia', icon: 'tools', module: './catalog.js', args: { kind: 'tools' }, hint: 'Narzędzia w przeglądarce' },
  music:       { title: 'Muzyka', icon: 'music', module: './music.js', hint: 'Odtwarzacz muzyki ze starej strony' },
  films:       { title: 'Filmy', icon: 'film', module: './filmy.js', hint: 'Katalog filmów, oceny i lista do obejrzenia' },
  linkhub:     { title: 'LinkHub', icon: 'link', module: './linkhub.js', hint: 'Moje linki ze starej strony (Ulubione)' },
  oldsettings: { title: 'Ustawienia starej strony', icon: 'settings', web: 'ustawienia.html', size: [820, 600] },
  oldsite:     { title: 'Stara strona', icon: 'web', web: 'index.html', size: [1000, 660] },
  changelog:   { title: 'Dziennik zmian', icon: 'notes', web: 'zmiany.html', size: [760, 600] },
  notepad:     { title: 'Notatnik', icon: 'notes', module: './notepad.js', hint: 'Notatki zapisywane w tej przeglądarce' },
  gadgets:     { title: 'Gadżety', icon: 'gadget', module: './gadgets.js', hint: 'Zegar, pogoda i cytat dnia' },
  progman:     { title: 'Menedżer programów', icon: 'os', module: './progman.js', hint: 'Grupy programów (Windows 3.1)' },
  control:     { title: 'Panel sterowania', icon: 'settings', module: './control.js', hint: 'Motyw, tapeta i gadżety' },
  github:      { title: 'Profil GitHub', icon: 'code', href: 'https://github.com/snakex21' }
};

export async function launch(id, extra) {
  const app = apps[id];
  if (!app) return;
  if (app.href) {
    window.open(app.href, '_blank', 'noopener');
    return;
  }
  if (app.web) {
    return openWeb({ id: 'app:' + id, title: app.title, icon: app.icon, path: app.web, size: app.size });
  }
  try {
    const mod = await import(app.module);
    return mod.open({ ...(app.args || {}), ...(extra || {}) });
  } catch (err) {
    console.error(err);
    alert('Nie udało się uruchomić: ' + app.title);
  }
}
