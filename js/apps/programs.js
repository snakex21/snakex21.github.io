// "Moje programy": okno-folder jak Eksplorator (widoki "Duże ikony" / "Szczegóły") z ikonami programów
// (pole "icon" w data/programs.json, pliki w icons/programs/<repo>/). Dwuklik / Enter otwiera okno
// szczegółów programu: ikona, opis, najnowsza wersja z GitHub Releases (wynik trzymany w sessionStorage),
// przycisk "Pobierz dla Windows", pozostałe pliki i link do strony projektu.

import { openWindow } from '../wm.js';
import { h, icon, sizeImageIcon, loadData, fetchJSON, formatBytes, fold, isNarrow, GITHUB_USER } from '../util.js';
import { session, store } from '../store.js';
import { bindMenu, programMenu } from '../menus.js';

const API = 'https://api.github.com/repos/';
const CACHE_MS = 30 * 60 * 1000;

const isMeta = name => /\.(ya?ml|blockmap|sha256|json|md|txt|sig|asc)$|sha256sums|checksums/i.test(name);
const isWindows = name => /\.(exe|msi)$/i.test(name) || /(^|[-_.])(win(dows)?|win64|win32|x64-?setup)([-_.]|$)/i.test(name) ||
  (/windows/i.test(name) && !/darwin|linux|android|mac/i.test(name));

/** Ikona programu (ścieżka obrazka z programs.json) albo ikona zastępcza z arkusza SVG. */
export const progIcon = p => p.icon || (p.kind === 'Gry' ? 'game' : 'app');

function platformOf(name) {
  if (isWindows(name)) return 'Windows';
  if (/linux/i.test(name)) return 'Linux';
  if (/darwin|mac/i.test(name)) return 'macOS';
  if (/android|\.apk$/i.test(name)) return 'Android';
  if (/\.jar$/i.test(name)) return 'Minecraft';
  if (/\.xpi$/i.test(name)) return 'Thunderbird';
  if (/\.user\.js$/i.test(name)) return 'Skrypt użytkownika';
  return '';
}

/** Sortowanie: najpierw Windows (.exe przed .zip, przenośne przed instalatorem), potem reszta. */
function rankAsset(a) {
  const n = a.name;
  let r = 50;
  if (isWindows(n)) {
    r = 0;
    if (/\.zip$/i.test(n)) r += 2;
    if (/setup|install/i.test(n)) r += 1;
    if (/online/i.test(n)) r += 1;
    if (/arm64/i.test(n)) r += 3;
  }
  return r;
}

async function fetchRelease(prog) {
  const key = 'rel:' + prog.repo;
  const cached = session.get(key, CACHE_MS);
  if (cached) return cached;
  const base = API + GITHUB_USER + '/' + prog.repo;
  // Repo z samymi wydaniami testowymi (pre-release, "prerelease": true w programs.json) nie ma "latest",
  // więc od razu bierzemy najnowsze wydanie z listy; przy 404 z "latest" robimy to samo.
  const newestFromList = async () => {
    const list = await fetchJSON(base + '/releases?per_page=1');
    if (!list.length) throw Object.assign(new Error('Brak wydań'), { status: 404 });
    return list[0];
  };
  let rel;
  if (prog.prerelease) {
    rel = await newestFromList();
  } else {
    try {
      rel = await fetchJSON(base + '/releases/latest');
    } catch (err) {
      if (err.status !== 404) throw err;
      rel = await newestFromList();
    }
  }
  const slim = {
    tag: rel.tag_name,
    name: rel.name,
    date: rel.published_at,
    prerelease: rel.prerelease,
    url: rel.html_url,
    assets: rel.assets.map(a => ({ name: a.name, size: a.size, url: a.browser_download_url, downloads: a.download_count }))
  };
  session.set(key, slim);
  return slim;
}

function errorMessage(err, releasesUrl) {
  let text;
  if (err.status === 403 || err.status === 429) {
    const reset = Number(err.headers?.get('x-ratelimit-reset'));
    const when = reset ? new Date(reset * 1000).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : null;
    text = 'GitHub chwilowo ogranicza liczbę zapytań (60 na godzinę bez logowania).' + (when ? ` Limit odnowi się około ${when}.` : '');
  } else if (err.status === 404) {
    text = 'To repozytorium nie ma jeszcze opublikowanych wydań.';
  } else if (err.name === 'AbortError') {
    text = 'GitHub nie odpowiedział na czas.';
  } else {
    text = 'Nie udało się pobrać listy plików.';
  }
  return h('div', { class: 'notice notice-warn', role: 'alert' },
    h('p', {}, text),
    h('p', {}, 'Pliki są zawsze dostępne na stronie wydań: ',
      h('a', { href: releasesUrl, target: '_blank', rel: 'noopener' }, 'otwórz wydania na GitHubie'), '.'));
}

const longDate = iso => iso ? new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

function assetRow(a) {
  const plat = platformOf(a.name);
  return h('li', { class: 'asset' },
    h('span', { class: 'asset-name' }, a.name, plat ? h('span', { class: 'badge badge-muted' }, plat) : null),
    h('span', { class: 'asset-size' }, formatBytes(a.size)),
    h('a', { class: 'btn', href: a.url, rel: 'noopener', 'aria-label': 'Pobierz ' + a.name }, icon('download', 'icon icon-sm'), ' Pobierz'));
}

/** Sekcja wydania w oknie szczegółów: wersja + data, główny przycisk, pozostałe pliki. */
function renderRelease(panel, prog, rel) {
  const assets = rel.assets.slice().sort((a, b) => rankAsset(a) - rankAsset(b) || a.name.localeCompare(b.name));
  const main = assets.filter(a => !isMeta(a.name));
  const meta = assets.filter(a => isMeta(a.name));
  const first = main[0];
  const firstPlat = first ? platformOf(first.name) : '';
  const primaryLabel = !first ? null : firstPlat ? 'Pobierz dla ' + firstPlat : 'Pobierz';
  const others = main.slice(1);
  panel.replaceChildren(...[
    h('dl', { class: 'pd-facts' },
      h('dt', {}, 'Najnowsza wersja'),
      h('dd', {}, h('strong', {}, rel.tag), rel.name && rel.name !== rel.tag ? ' · ' + rel.name : '',
        rel.prerelease ? h('span', { class: 'badge badge-muted' }, 'wersja testowa') : null),
      rel.date ? h('dt', {}, 'Data wydania') : null,
      rel.date ? h('dd', {}, h('time', { datetime: rel.date }, longDate(rel.date))) : null),
    first
      ? h('div', { class: 'pd-primary' },
          h('a', { class: 'btn btn-primary btn-big', href: first.url, rel: 'noopener' }, icon('download', 'icon icon-sm'), ' ', primaryLabel),
          h('span', { class: 'pd-file muted' }, first.name, ' · ', formatBytes(first.size)))
      : h('p', { class: 'muted' }, 'To wydanie nie zawiera plików do pobrania.'),
    others.length ? h('details', { class: 'pd-more', open: others.length <= 4 },
      h('summary', {}, `Inne pliki (${others.length})`),
      h('ul', { class: 'assets' }, others.map(assetRow))) : null,
    meta.length ? h('details', { class: 'pd-more' },
      h('summary', {}, `Sumy kontrolne i manifesty (${meta.length})`),
      h('ul', { class: 'assets' }, meta.map(assetRow))) : null
  ].filter(Boolean));
}

/** „Pobierz dla Windows” z menu kontekstowego: najlepszy plik dla Windows z najnowszego wydania;
 *  gdy go brak albo GitHub nie odpowiada – strona wydań w nowej karcie. */
export async function downloadForWindows(repo) {
  const releasesUrl = `https://github.com/${GITHUB_USER}/${repo}/releases`;
  const tab = window.open('about:blank', '_blank');   // otwarte od razu, póki trwa gest użytkownika
  try {
    const data = await loadData('programs');
    const prog = data.items.find(p => p.repo === repo);
    const rel = prog && await fetchRelease(prog);
    const best = rel?.assets.filter(a => !isMeta(a.name) && isWindows(a.name)).sort((a, b) => rankAsset(a) - rankAsset(b))[0];
    if (tab) { tab.opener = null; tab.location.href = best ? best.url : releasesUrl; }
  } catch {
    if (tab) { tab.opener = null; tab.location.href = releasesUrl; }
  }
}

/** Okno szczegółów jednego programu (ikona programu w pasku tytułu i na pasku zadań). */
export async function openProgram(repo) {
  const data = await loadData('programs');
  const prog = data.items.find(p => p.repo === repo);
  if (!prog) return null;
  const projectUrl = `https://github.com/${GITHUB_USER}/${prog.repo}`;
  const releasesUrl = projectUrl + '/releases';
  return openWindow({
    id: 'prog:' + prog.repo,
    saveKey: 'prog',
    title: prog.name,
    icon: progIcon(prog),
    width: 560,
    height: 500,
    minWidth: 300,
    minHeight: 260,
    className: 'win-prog',
    render(body) {
      const panel = h('div', { class: 'pd-release', 'aria-live': 'polite' }, h('p', { class: 'muted loading-text' }, 'Sprawdzam najnowsze wydanie…'));
      body.append(h('div', { class: 'pd' },
        h('header', { class: 'pd-head' },
          h('span', { class: 'pd-icon' }, icon(progIcon(prog), 'icon icon-xl')),
          h('div', { class: 'pd-titles' },
            h('h3', { class: 'pd-name' }, prog.name),
            h('p', { class: 'pd-sub muted' }, [prog.kind, prog.language, (prog.platforms || []).join(', ')].filter(Boolean).join(' · ')))),
        h('p', { class: 'pd-desc' }, prog.description),
        panel,
        h('p', { class: 'pd-links' },
          h('a', { class: 'btn', href: projectUrl, target: '_blank', rel: 'noopener' }, icon('code', 'icon icon-sm'), ' Strona projektu (GitHub)'),
          h('a', { class: 'btn', href: releasesUrl, target: '_blank', rel: 'noopener' }, 'Wszystkie wydania'))),
        h('div', { class: 'statusbar' }, h('span', { class: 'status-text' }, 'github.com/' + GITHUB_USER + '/' + prog.repo)));
      fetchRelease(prog)
        .then(rel => renderRelease(panel, prog, rel))
        .catch(err => panel.replaceChildren(errorMessage(err, releasesUrl)));
    }
  });
}

/** Folder "Moje programy". Z { repo } od razu otwiera szczegóły programu (menu Start, kafelki, Menedżer programów). */
export function open({ repo } = {}) {
  if (repo) return openProgram(repo);
  return openWindow({
    id: 'app:programs',
    title: 'Moje programy',
    icon: 'download',
    width: 720,
    height: 520,
    minWidth: 300,
    render(body) {
      let view = store.get('programs:view', 'icons') === 'details' ? 'details' : 'icons';
      const search = h('input', { class: 'field', type: 'search', placeholder: 'Szukaj programu…', 'aria-label': 'Szukaj programu' });
      const viewBtns = ['icons', 'details'].map(v => h('button', {
        class: 'btn btn-view', type: 'button', 'aria-pressed': String(v === view), dataset: { view: v },
        title: v === 'icons' ? 'Duże ikony' : 'Szczegóły'
      }, h('span', { class: 'view-glyph view-' + v, 'aria-hidden': 'true' }), h('span', { class: 'btn-view-label' }, v === 'icons' ? 'Duże ikony' : 'Szczegóły')));
      const grid = h('div', { class: 'folder-grid prog-folder', role: 'listbox', 'aria-label': 'Moje programy' });
      const head = h('div', { class: 'details-head', 'aria-hidden': 'true' }, h('span'), h('span', {}, 'Nazwa'), h('span', {}, 'Opis'), h('span', {}, 'Typ'));
      const info = h('span', { class: 'status-text' }, 'Wczytywanie…');
      const openBtn = h('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Otwórz');
      const scroller = h('div', { class: 'folder-scroll' }, head, grid);
      body.append(
        h('div', { class: 'toolbar' },
          h('span', { class: 'crumbs' }, icon('folder', 'icon icon-sm'), ' Pulpit › ', h('strong', {}, 'Moje programy')),
          h('span', { class: 'view-switch', role: 'group', 'aria-label': 'Widok' }, viewBtns),
          search),
        scroller,
        h('div', { class: 'statusbar' }, info, openBtn)
      );

      const setView = (v) => {
        view = v;
        store.set('programs:view', v);
        scroller.classList.toggle('is-details', v === 'details');
        grid.classList.toggle('folder-grid', v === 'icons');
        grid.classList.toggle('folder-details', v === 'details');
        head.hidden = v !== 'details';
        for (const b of viewBtns) b.setAttribute('aria-pressed', String(b.dataset.view === v));
        for (const img of grid.querySelectorAll('.img-icon')) sizeImageIcon(img, v === 'details' ? 20 : 48);
      };
      for (const b of viewBtns) b.addEventListener('click', () => setView(b.dataset.view));

      let items = [];
      let selected = null;
      const summary = () => `${items.length} programów · ${isNarrow() ? 'stuknij, aby otworzyć' : 'dwuklik lub Enter otwiera'}`;
      const select = (btn) => {
        for (const b of grid.querySelectorAll('.file')) {
          const on = b === btn;
          b.classList.toggle('selected', on);
          b.setAttribute('aria-selected', String(on));
          b.tabIndex = on ? 0 : -1;
        }
        selected = btn;
        const p = btn && items[btn.dataset.i];
        info.textContent = p ? `${p.name} — ${p.description}` : summary();
        openBtn.disabled = !p;
      };
      const launchBtn = (btn) => { const p = btn && items[btn.dataset.i]; if (p) openProgram(p.repo); };
      openBtn.addEventListener('click', () => launchBtn(selected));
      grid.addEventListener('click', e => {
        const btn = e.target.closest('.file');
        if (!btn) return;
        select(btn);
        if (e.detail === 0 || isNarrow() || e.pointerType === 'touch') launchBtn(btn);
      });
      grid.addEventListener('dblclick', e => launchBtn(e.target.closest('.file')));
      // Menu kontekstowe: Otwórz szczegóły, Pobierz dla Windows, Strona projektu, Właściwości
      bindMenu(grid, ({ target }) => {
        const btn = target.closest('.file');
        const p = btn && items[btn.dataset.i];
        if (!p) return false;
        select(btn);
        return programMenu(p);
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
          const p = items[b.dataset.i];
          const hit = !q || fold([p.name, p.repo, p.kind, p.language, p.description, ...(p.platforms || [])].join(' ')).includes(q);
          b.hidden = !hit;
          if (hit) shown++;
        }
        info.textContent = q ? `Znaleziono: ${shown}` : summary();
        const first = grid.querySelector('.file:not([hidden])');
        if (first && (!selected || selected.hidden)) select(first);
      });

      loadData('programs').then(data => {
        items = data.items;
        items.forEach((p, i) => grid.append(
          h('button', { class: 'file prog-file', type: 'button', role: 'option', 'aria-selected': 'false', tabindex: i ? '-1' : '0', dataset: { i }, title: p.description },
            h('span', { class: 'file-icon' }, icon(progIcon(p), 'icon icon-xl')),
            h('span', { class: 'file-label' }, p.name),
            h('span', { class: 'file-desc' }, p.description),
            h('span', { class: 'file-kind' }, p.kind))
        ));
        setView(view);
        info.textContent = summary();
      }).catch(() => { info.textContent = 'Nie udało się wczytać listy programów.'; });
    }
  });
}
