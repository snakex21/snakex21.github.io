// Okno z ramką (iframe) pokazującą stronę ze starej witryny: gry, narzędzia, filmy, stare ustawienia...
// Ramka dostaje bieżący motyw pulpitu: w adresie (?theme=win95&variant=light) i wiadomością postMessage
// przy wczytaniu oraz przy każdej zmianie motywu. Strony starej witryny z assets/pulpit-theme/pulpit-theme.js
// dopasowują wtedy przyciski, pola, czcionkę i paski przewijania do motywu; pozostałe strony to ignorują.

import { openWindow } from '../wm.js';
import { h, glyph, oldSiteUrl, OLD_SITE } from '../util.js';
import { on } from '../store.js';
import { hasVariants } from '../themes.js';

const OLD_ORIGIN = new URL(OLD_SITE).origin;
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

/** Motyw dla ramek: id motywu i wariant rozwiązany do "light" / "dark" (wariant "auto" = ustawienie systemu;
 *  motywy bez wariantów w themes.json są zawsze jasne). */
export function frameTheme() {
  const d = document.documentElement.dataset;
  const theme = d.theme || 'win95';
  const dark = hasVariants(theme) && (d.variant === 'dark' || (d.variant === 'auto' && darkQuery.matches));
  return { theme, variant: dark ? 'dark' : 'light' };
}

function themedUrl(url) {
  const { theme, variant } = frameTheme();
  return url + (url.includes('?') ? '&' : '?') + 'theme=' + encodeURIComponent(theme) + '&variant=' + variant;
}

function sendTheme(frame) {
  try { frame.contentWindow?.postMessage({ type: 'pulpit:theme', ...frameTheme() }, OLD_ORIGIN); } catch { /* ramka zamknięta */ }
}

const sendAll = () => { for (const f of document.querySelectorAll('iframe.web-frame')) sendTheme(f); };
on('theme:change', sendAll);
darkQuery.addEventListener?.('change', sendAll);

// Strona w ramce może poprosić o motyw (np. po przejściu na inną stronę w tej samej ramce).
window.addEventListener('message', e => {
  if (e.origin !== OLD_ORIGIN || e.data?.type !== 'pulpit:theme-request') return;
  const frame = [...document.querySelectorAll('iframe.web-frame')].find(f => f.contentWindow === e.source);
  if (frame) sendTheme(frame);
});

export function openWeb({ id, title, icon = 'web', path, size = [900, 620] }) {
  const url = oldSiteUrl(path);
  return openWindow({
    id: id || 'web:' + path,
    saveKey: id || 'web',
    title,
    icon,
    width: size[0],
    height: size[1],
    minWidth: 320,
    minHeight: 240,
    className: 'win-web',
    render(body) {
      const frame = h('iframe', {
        class: 'web-frame',
        src: themedUrl(url),
        title,
        loading: 'eager',
        allow: 'autoplay; fullscreen; clipboard-read; clipboard-write; microphone; camera; display-capture; gamepad',
        referrerpolicy: 'no-referrer-when-downgrade'
      });
      const status = h('span', { class: 'web-status', role: 'status' }, 'Wczytywanie…');
      frame.addEventListener('load', () => { status.textContent = 'Gotowe'; body.classList.remove('loading'); sendTheme(frame); });
      body.classList.add('loading');

      const toolbar = h('div', { class: 'toolbar web-toolbar' },
        h('button', {
          class: 'btn btn-icon', type: 'button', title: 'Odśwież', 'aria-label': 'Odśwież',
          onclick: () => { body.classList.add('loading'); status.textContent = 'Wczytywanie…'; frame.src = themedUrl(url); }
        }, glyph('refresh')),
        h('label', { class: 'address' },
          h('span', { class: 'address-label' }, 'Adres'),
          h('input', { class: 'field', type: 'text', readonly: true, value: decodeURI(url), 'aria-label': 'Adres strony', onfocus: e => e.target.select() })
        ),
        h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, glyph('external'), ' Otwórz w nowej karcie')
      );
      body.append(toolbar, h('div', { class: 'web-wrap' }, frame), h('div', { class: 'statusbar' }, status));
    }
  });
}
