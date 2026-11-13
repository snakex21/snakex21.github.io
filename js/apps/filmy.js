// Filmy: katalog filmów ze starej strony (data/films.json – same metadane, bez odtwarzaczy) z listą "Do obejrzenia".
// Plakaty: miniatura z Wikipedii (REST /page/summary, strona zapisana w polu "wiki"; pl, potem en), zapamiętana
// w localStorage; bez miniatury rysujemy własny plakat (gradient + tytuł + rok). Plakaty ładują się dopiero,
// gdy są widoczne (IntersectionObserver). Dane użytkownika (obejrzane, ocena, notatki, ulubione, do obejrzenia,
// własne filmy) leżą w localStorage pod "pulpit:filmy:user" i można je wyeksportować / zaimportować jako JSON.

import { openWindow } from '../wm.js';
import { h, icon, fold, loadData, debounce, announce } from '../util.js';
import { store } from '../store.js';

const USER_KEY = 'filmy:user';
const POSTER_KEY = 'filmy:posters';
const POSTER_TTL = 30 * 864e5;        // znaleziona miniatura: 30 dni
const POSTER_MISS_TTL = 7 * 864e5;    // brak miniatury: spróbuj ponownie po tygodniu

const TYPES = { film: 'Film', serial: 'Serial' };
const STATUSES = {
  all: 'Wszystkie',
  watchlist: 'Do obejrzenia',
  watched: 'Obejrzane',
  unwatched: 'Nieobejrzane',
  fav: 'Ulubione',
  rated: 'Ocenione',
  custom: 'Dodane przeze mnie'
};
const SORTS = {
  collection: 'Kolekcje',
  title: 'Tytuł (A–Z)',
  yearDesc: 'Rok (najnowsze)',
  yearAsc: 'Rok (najstarsze)',
  rating: 'Moja ocena',
  watched: 'Ostatnio obejrzane'
};

/* ---------- Pomocniki ---------- */

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${Number(m[3])}.${m[2]}.${m[1]}` : '';
};
const hashHue = s => { let x = 0; for (const ch of s) x = (x * 31 + ch.codePointAt(0)) >>> 0; return x % 360; };
const str = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const plural = (n, one, few, many) => {
  if (n === 1) return one;
  const d = n % 10, t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
};
const wikiUrl = w => `https://${w.lang}.wikipedia.org/wiki/${encodeURIComponent(w.page.replace(/ /g, '_'))}`;

/* ---------- Dane użytkownika ---------- */

function cleanItem(it) {
  if (!it || typeof it !== 'object') return null;
  const out = {};
  if (typeof it.watched === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.watched)) out.watched = it.watched;
  const r = Number(it.rating);
  if (Number.isInteger(r) && r >= 1 && r <= 10) out.rating = r;
  const notes = str(it.notes, 5000);
  if (notes) out.notes = notes;
  if (it.watchlist === true) out.watchlist = true;
  if (it.fav === true) out.fav = true;
  return Object.keys(out).length ? out : null;
}
function cleanCustom(f) {
  if (!f || typeof f !== 'object') return null;
  const title = str(f.title, 200);
  const year = Number(f.year);
  if (!title || !Number.isInteger(year) || year < 1880 || year > 2100) return null;
  const id = typeof f.id === 'string' && /^u-[a-z0-9-]{1,40}$/.test(f.id) ? f.id : 'u-' + Math.random().toString(36).slice(2, 10);
  const dur = Number(f.duration);
  return {
    id, custom: true, title, year,
    originalTitle: str(f.originalTitle, 200),
    type: f.type === 'serial' ? 'serial' : 'film',
    genres: (Array.isArray(f.genres) ? f.genres : String(f.genres || '').split(','))
      .map(g => str(String(g), 40)).filter(Boolean).map(g => g[0].toLocaleUpperCase('pl') + g.slice(1)).slice(0, 8),
    duration: Number.isInteger(dur) && dur > 0 && dur < 2000 ? dur : null,
    description: str(f.description, 3000),
    added: typeof f.added === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.added) ? f.added : today()
  };
}
function loadUser() {
  const raw = store.get(USER_KEY, null) || {};
  const items = {};
  for (const [id, it] of Object.entries(raw.items || {})) { const c = cleanItem(it); if (c) items[id] = c; }
  const custom = (Array.isArray(raw.custom) ? raw.custom : []).map(cleanCustom).filter(Boolean);
  return { items, custom };
}

/* ---------- Plakaty z Wikipedii ---------- */

let posterCache = null;
function posterStore() {
  if (!posterCache) {
    posterCache = store.get(POSTER_KEY, null);
    if (!posterCache || typeof posterCache !== 'object') posterCache = {};
  }
  return posterCache;
}
const savePosters = debounce(() => store.set(POSTER_KEY, posterCache), 400);
const posterKey = f => f.custom ? `${f.id}|${fold(f.title)}|${f.year}` : f.id;

// Kolejka: najwyżej 3 zapytania naraz (Wikipedia ogranicza zbyt szybkich klientów).
let active = 0;
const waiting = [];
function queued(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      active++;
      fn().then(resolve, reject).finally(() => { active--; waiting.shift()?.(); });
    };
    if (active < 3) run(); else waiting.push(run);
  });
}
async function getJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return await res.json();
  } finally { clearTimeout(timer); }
}
const summary = (lang, page) =>
  queued(() => getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.replace(/ /g, '_'))}?redirect=true`));

/** Własny wpis bez znanej strony: kilku kandydatów jednym zapytaniem na język (API zapytań nie zwraca 404 za brak
 *  strony): pl po tytule, en po tytule oryginalnym. Strona musi wspominać rok i nie być ujednoznacznieniem. */
async function findPages(f) {
  const kind = { pl: f.type === 'serial' ? 'serial telewizyjny' : 'film', en: f.type === 'serial' ? 'TV series' : 'film' };
  const en = f.originalTitle || f.title;
  const tries = {
    pl: [`${f.title} (film ${f.year})`, `${f.title} (${kind.pl})`, f.title],
    en: [`${en} (${f.year} film)`, `${en} (${kind.en})`, en]
  };
  const found = {};
  for (const [lang, cands] of Object.entries(tries)) {
    const q = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', origin: '*', redirects: '1',
      titles: cands.join('|'), prop: 'pageprops|description|extracts', ppprop: 'disambiguation',
      exintro: '1', explaintext: '1', exchars: '400'
    });
    const j = await queued(() => getJSON(`https://${lang}.wikipedia.org/w/api.php?${q}`));
    const map = {};
    for (const n of [...(j.query?.normalized || []), ...(j.query?.redirects || [])]) map[n.from] = n.to;
    const pages = new Map((j.query?.pages || []).filter(p => !p.missing && !p.invalid).map(p => [p.title, p]));
    for (const c of cands) {
      let t = c;
      for (let i = 0; i < 3; i++) t = map[t] || t;
      const p = pages.get(t);
      if (!p || p.pageprops?.disambiguation !== undefined) continue;
      if (`${p.description || ''} ${p.extract || ''}`.includes(String(f.year))) { found[lang] = p.title; break; }
    }
  }
  return found;
}

const pending = new Map();
/** Raz na klucz: wynik obietnicy trafia do localStorage (także brak wyniku, z krótszym terminem). */
function cachedLookup(key, fn) {
  const c = posterStore()[key];
  if (c && Date.now() - c.t < (c.miss ? POSTER_MISS_TTL : POSTER_TTL)) return Promise.resolve(c.miss ? null : c.v);
  if (pending.has(key)) return pending.get(key);
  const p = fn().then(v => {
    posterStore()[key] = v ? { t: Date.now(), v } : { t: Date.now(), miss: true };
    savePosters();
    return v || null;
  }).catch(err => { console.warn('Filmy: Wikipedia', key, err?.message || err); return null; })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}
/** Strony Wikipedii filmu: { pl?, en? } – z katalogu albo (własny wpis) wyszukane po tytule i roku. */
function pagesOf(f) {
  if (f.wiki && (f.wiki.pl || f.wiki.en)) return Promise.resolve(f.wiki);
  return cachedLookup('find|' + posterKey(f), async () => { const w = await findPages(f); return w.pl || w.en ? w : null; });
}
/** Streszczenie strony (REST /page/summary): { s: miniatura, x: wstęp, u: adres }. */
function summaryOf(lang, page) {
  return cachedLookup(lang + ':' + page, async () => {
    let s;
    try { s = await summary(lang, page); } catch (e) { if (e.status === 404) return null; throw e; }
    if (!s || s.type !== 'standard') return null;
    return { s: s.thumbnail?.source || '', x: str(s.extract, 1200), u: s.content_urls?.desktop?.page || wikiUrl({ lang, page }) };
  });
}
/** Plakat: najpierw en (artykuły o filmach mają tam plakat w infoboksie), potem pl. */
async function posterOf(f) {
  const w = await pagesOf(f);
  for (const lang of ['en', 'pl']) {
    if (!w?.[lang]) continue;
    const s = await summaryOf(lang, w[lang]);
    if (s?.s) return s.s;
  }
  return '';
}
/** Opis: najpierw po polsku. */
async function aboutOf(f) {
  const w = await pagesOf(f);
  for (const lang of ['pl', 'en']) {
    if (!w?.[lang]) continue;
    const s = await summaryOf(lang, w[lang]);
    if (s?.x) return { ...s, lang };
  }
  return null;
}
const wikiHref = (f, w = f.wiki) => w?.pl ? wikiUrl({ lang: 'pl', page: w.pl }) : w?.en ? wikiUrl({ lang: 'en', page: w.en })
  : `https://pl.wikipedia.org/w/index.php?search=${encodeURIComponent(`${f.title} ${f.year} ${f.type === 'serial' ? 'serial' : 'film'}`)}`;

/* ---------- Okno ---------- */

export function open() {
  return openWindow({
    id: 'app:films',
    title: 'Filmy',
    icon: 'film',
    width: 1000,
    height: 640,
    minWidth: 340,
    minHeight: 300,
    className: 'win-filmy',
    render(body, win) { build(body, win); }
  });
}

function build(body, win) {
  const user = loadUser();
  const st = {
    view: store.get('filmy:view', 'grid') === 'list' ? 'list' : 'grid',
    sort: SORTS[store.get('filmy:sort')] ? store.get('filmy:sort') : 'collection',
    status: 'all', genre: '', decade: '', type: '', query: '',
    base: [], collections: new Map(), films: [], list: [],
    sel: null,          // id wybranego filmu
    mode: 'film'        // 'film' | 'add' | 'edit'
  };
  const uid = 'fm' + Math.random().toString(36).slice(2, 8);

  const saveUser = () => store.set(USER_KEY, { v: 1, items: user.items, custom: user.custom });
  const item = id => user.items[id] || {};
  function setItem(id, patch) {
    const next = cleanItem({ ...item(id), ...patch });
    if (next) user.items[id] = next; else delete user.items[id];
    saveUser();
  }

  /* --- elementy --- */
  const search = h('input', { class: 'field fm-search', type: 'search', placeholder: 'Szukaj filmu…', 'aria-label': 'Szukaj filmu', autocomplete: 'off' });
  const sel = (label, cls) => h('select', { class: 'field ' + cls, 'aria-label': label });
  const genreSel = sel('Gatunek', 'fm-genre');
  const decadeSel = sel('Rok', 'fm-decade');
  const typeSel = sel('Typ', 'fm-type');
  const statusSel = sel('Status', 'fm-status');
  const sortSel = sel('Sortuj', 'fm-sort');
  typeSel.append(h('option', { value: '' }, 'Filmy i seriale'), ...Object.entries(TYPES).map(([k, v]) => h('option', { value: k }, v + (k === 'film' ? 'y' : 'e'))));
  statusSel.append(...Object.entries(STATUSES).map(([k, v]) => h('option', { value: k }, v)));
  sortSel.append(...Object.entries(SORTS).map(([k, v]) => h('option', { value: k }, v)));
  sortSel.value = st.sort;
  const viewBtns = [['grid', 'Plakaty', 'icons'], ['list', 'Lista', 'details']].map(([v, label, glyphName]) => h('button', {
    class: 'btn btn-view', type: 'button', 'aria-pressed': String(v === st.view), dataset: { view: v }, title: label
  }, h('span', { class: 'view-glyph view-' + glyphName, 'aria-hidden': 'true' }), h('span', { class: 'fm-btn-label' }, label)));
  const addBtn = h('button', { class: 'btn', type: 'button', title: 'Dodaj własny film do katalogu' }, '+ ', h('span', { class: 'fm-btn-label' }, 'Dodaj film'));
  const exportBtn = h('button', { class: 'btn', type: 'button', title: 'Zapisz moje oceny, notatki, listy i dodane filmy do pliku JSON' }, 'Eksport');
  const importBtn = h('button', { class: 'btn', type: 'button', title: 'Wczytaj dane z pliku JSON (wcześniejszy eksport)' }, 'Import');
  const importFile = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });

  const grid = h('div', { class: 'fm-items', role: 'list', 'aria-label': 'Filmy' });
  const scroller = h('div', { class: 'fm-scroll' }, grid);
  const detail = h('section', { class: 'fm-detail', 'aria-label': 'Szczegóły', tabindex: '-1' });
  const info = h('span', { class: 'status-text', role: 'status' }, 'Wczytywanie katalogu…');
  const stats = h('span', { class: 'fm-stats muted' });

  body.append(
    h('div', { class: 'toolbar fm-toolbar' },
      search,
      h('span', { class: 'view-switch', role: 'group', 'aria-label': 'Widok' }, viewBtns),
      addBtn, exportBtn, importBtn, importFile),
    h('div', { class: 'toolbar fm-filters', role: 'group', 'aria-label': 'Filtry' },
      genreSel, decadeSel, typeSel, statusSel,
      h('label', { class: 'fm-sortwrap' }, h('span', { class: 'fm-sortlabel' }, 'Sortuj:'), sortSel)),
    h('div', { class: 'fm-split' }, scroller, detail),
    h('div', { class: 'statusbar' }, info, stats)
  );
  body.classList.add('fm-body');

  /* --- plakat: własny (gradient) + miniatura z Wikipedii, gdy się znajdzie --- */
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      fillPoster(e.target);
    }
  }, { root: scroller, rootMargin: '300px 0px' });
  win.onClose.push(() => io.disconnect());

  function posterEl(f, size) {
    const hue = hashHue(f.title + f.year);
    const el = h('span', { class: 'fm-poster fm-poster-' + size, style: { '--fm-h': String(hue) }, 'aria-hidden': 'true', dataset: { id: f.id } },
      h('span', { class: 'fm-poster-art' },
        h('span', { class: 'fm-poster-title' }, f.title),
        h('span', { class: 'fm-poster-year' }, String(f.year)),
        f.type === 'serial' ? h('span', { class: 'fm-poster-kind' }, 'serial') : null));
    return el;
  }
  function fillPoster(el) {
    const f = byId(el.dataset.id);
    if (!f) return;
    posterOf(f).then(src => {
      if (!src || !el.isConnected || el.querySelector('img')) return;
      const img = h('img', { class: 'fm-poster-img', alt: '', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' });
      img.addEventListener('load', () => {
        // Poziomy obrazek (np. plansza tytułowa serialu) nie jest przycinany, tylko mieści się na ciemnym tle.
        if (img.naturalWidth > img.naturalHeight) el.classList.add('is-wide');
        el.classList.add('has-img');
      }, { once: true });
      img.addEventListener('error', () => img.remove(), { once: true });
      img.src = src;
      el.append(img);
    });
  }
  const watchPoster = el => { io.observe(el); return el; };

  /* --- filtry --- */
  const byId = id => st.films.find(f => f.id === id);
  function allFilms() {
    // Gatunki własnych wpisów dopasowane do pisowni z katalogu ("sci-fi" → "Sci-Fi"), żeby filtr nie miał duplikatów.
    const canon = new Map(st.base.flatMap(f => f.genres || []).map(g => [fold(g), g]));
    for (const f of user.custom) f.genres = [...new Set(f.genres.map(g => canon.get(fold(g)) || g))];
    st.films = [...st.base, ...user.custom];
    for (const f of st.films) {
      const col = st.collections.get(f.collection);
      f.text = fold([f.title, f.originalTitle, f.year, ...(f.genres || []), col?.name, ...(col?.tags || []), f.description].join(' '));
    }
  }
  function fillFilterOptions() {
    const keep = [genreSel.value, decadeSel.value];
    const genres = [...new Set(st.films.flatMap(f => f.genres || []))].sort((a, b) => a.localeCompare(b, 'pl'));
    genreSel.replaceChildren(h('option', { value: '' }, 'Wszystkie gatunki'), ...genres.map(g => h('option', { value: g }, g)));
    const decades = [...new Set(st.films.map(f => Math.floor(f.year / 10) * 10))].sort((a, b) => b - a);
    decadeSel.replaceChildren(h('option', { value: '' }, 'Każdy rok'), ...decades.map(d => h('option', { value: String(d) }, `Lata ${d}–${d + 9}`)));
    genreSel.value = genres.includes(keep[0]) ? keep[0] : '';
    decadeSel.value = decades.includes(Number(keep[1])) ? keep[1] : '';
    st.genre = genreSel.value; st.decade = decadeSel.value;
  }
  function matches(f) {
    const it = item(f.id);
    if (st.genre && !(f.genres || []).includes(st.genre)) return false;
    if (st.decade && Math.floor(f.year / 10) * 10 !== Number(st.decade)) return false;
    if (st.type && f.type !== st.type) return false;
    switch (st.status) {
      case 'watchlist': if (!it.watchlist) return false; break;
      case 'watched': if (!it.watched) return false; break;
      case 'unwatched': if (it.watched) return false; break;
      case 'fav': if (!it.fav) return false; break;
      case 'rated': if (!it.rating) return false; break;
      case 'custom': if (!f.custom) return false; break;
    }
    if (st.query) return st.query.split(/\s+/).every(w => f.text.includes(w));
    return true;
  }
  const colOrder = f => f.custom ? 1000 : (st.collections.get(f.collection)?.order ?? 999);
  const CMP = {
    collection: (a, b) => colOrder(a) - colOrder(b) || (a.part || 0) - (b.part || 0) || a.year - b.year,
    title: (a, b) => a.title.localeCompare(b.title, 'pl', { numeric: true }),
    yearDesc: (a, b) => b.year - a.year || a.title.localeCompare(b.title, 'pl'),
    yearAsc: (a, b) => a.year - b.year || a.title.localeCompare(b.title, 'pl'),
    rating: (a, b) => (item(b.id).rating || 0) - (item(a.id).rating || 0) || a.title.localeCompare(b.title, 'pl'),
    watched: (a, b) => (item(b.id).watched || '').localeCompare(item(a.id).watched || '') || a.title.localeCompare(b.title, 'pl')
  };

  /* --- lista --- */
  function marks(f) {
    const it = item(f.id);
    return h('span', { class: 'fm-marks' },
      it.fav ? h('span', { class: 'fm-mark fm-mark-fav', title: 'Ulubiony' }, '♥') : null,
      it.watched ? h('span', { class: 'fm-mark fm-mark-seen', title: 'Obejrzany ' + fmtDate(it.watched) }, '✓') : null,
      it.watchlist ? h('span', { class: 'fm-mark fm-mark-list', title: 'Do obejrzenia' }, '◷') : null,
      it.rating ? h('span', { class: 'fm-mark fm-mark-rate', title: 'Moja ocena: ' + it.rating + '/10' }, '★' + it.rating) : null);
  }
  function card(f) {
    const it = item(f.id);
    const label = `${f.title} (${f.year})${it.watched ? ', obejrzany' : ''}${it.rating ? ', ocena ' + it.rating : ''}${it.fav ? ', ulubiony' : ''}`;
    if (st.view === 'grid') {
      return h('button', { class: 'fm-card', type: 'button', role: 'listitem', 'aria-label': label, dataset: { id: f.id }, title: f.originalTitle && f.originalTitle !== f.title ? `${f.title} / ${f.originalTitle}` : f.title },
        watchPoster(posterEl(f, 'sm')),
        h('span', { class: 'fm-card-title' }, f.title),
        h('span', { class: 'fm-card-sub' }, String(f.year), f.type === 'serial' ? ' · serial' : '', marks(f)));
    }
    return h('button', { class: 'fm-row', type: 'button', role: 'listitem', 'aria-label': label, dataset: { id: f.id } },
      watchPoster(posterEl(f, 'xs')),
      h('span', { class: 'fm-row-main' },
        h('span', { class: 'fm-row-title' }, f.title),
        f.originalTitle && f.originalTitle !== f.title ? h('span', { class: 'fm-row-orig muted' }, f.originalTitle) : null),
      h('span', { class: 'fm-row-year' }, String(f.year)),
      h('span', { class: 'fm-row-genres muted' }, [TYPES[f.type] || '', ...(f.genres || [])].filter(Boolean).join(', ')),
      marks(f));
  }
  function render({ keepScroll = false } = {}) {
    const top = scroller.scrollTop;
    st.list = st.films.filter(matches).sort(CMP[st.sort]);
    grid.className = 'fm-items ' + (st.view === 'grid' ? 'is-grid' : 'is-list');
    if (!st.list.length) {
      grid.replaceChildren(h('p', { class: 'fm-empty muted' }, st.films.length ? 'Brak filmów pasujących do filtrów.' : 'Katalog jest pusty.'));
    } else {
      grid.replaceChildren(...st.list.map(card));
    }
    markSelected();
    scroller.scrollTop = keepScroll ? top : 0;
    updateStatus();
  }
  function markSelected() {
    for (const el of grid.querySelectorAll('[data-id]')) {
      if (!el.matches('.fm-card, .fm-row')) continue;
      const on = el.dataset.id === st.sel;
      el.classList.toggle('selected', on);
      if (on) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
    }
  }
  function updateStatus() {
    const n = st.list.length, all = st.films.length;
    info.textContent = n === all ? `${all} ${plural(all, 'pozycja', 'pozycje', 'pozycji')}` : `Pokazano ${n} z ${all}`;
    const its = Object.values(user.items);
    const seen = st.films.filter(f => item(f.id).watched).length;
    const todo = st.films.filter(f => item(f.id).watchlist).length;
    stats.textContent = `Obejrzane: ${seen} · Do obejrzenia: ${todo} · Ulubione: ${its.filter(i => i.fav).length}`;
  }

  /* --- szczegóły --- */
  function showOverview() {
    st.sel = null; st.mode = 'film';
    body.classList.remove('fm-detail-open');
    markSelected();
    const rated = st.films.map(f => item(f.id).rating).filter(Boolean);
    const avg = rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length).toLocaleString('pl-PL', { maximumFractionDigits: 1 }) : '–';
    const next = st.films.filter(f => item(f.id).watchlist && !item(f.id).watched).slice(0, 6);
    detail.replaceChildren(h('div', { class: 'fm-overview' },
      h('h3', { class: 'fm-h' }, icon('film', 'icon'), ' Moja filmoteka'),
      h('p', { class: 'muted' }, 'Wybierz film z listy, żeby zobaczyć opis, ocenić go albo dopisać notatkę. Dane zapisują się w tej przeglądarce – zrób kopię przyciskiem „Eksport”.'),
      h('dl', { class: 'fm-facts' },
        h('dt', {}, 'W katalogu'), h('dd', {}, String(st.films.length)),
        h('dt', {}, 'Obejrzane'), h('dd', {}, String(st.films.filter(f => item(f.id).watched).length)),
        h('dt', {}, 'Średnia moich ocen'), h('dd', {}, avg),
        h('dt', {}, 'Dodane przeze mnie'), h('dd', {}, String(user.custom.length))),
      next.length ? h('div', {},
        h('h4', { class: 'fm-h4' }, 'Do obejrzenia'),
        h('ul', { class: 'fm-mini' }, next.map(f => h('li', {}, h('button', { class: 'fm-link', type: 'button', onclick: () => select(f.id, { focus: true }) }, `${f.title} (${f.year})`)))))
        : null));
  }

  function select(id, { focus = false } = {}) {
    const f = byId(id);
    if (!f) return showOverview();
    st.sel = id; st.mode = 'film';
    markSelected();
    renderDetail(f);
    body.classList.add('fm-detail-open');
    if (focus) detail.focus({ preventScroll: true });
    detail.scrollTop = 0;
  }

  function renderDetail(f) {
    const it = item(f.id);
    const col = st.collections.get(f.collection);
    const siblings = col ? st.base.filter(x => x.collection === f.collection && x.id !== f.id).sort((a, b) => (a.part || 0) - (b.part || 0)) : [];
    const big = posterEl(f, 'lg');
    fillPoster(big);
    const wikiBox = h('div', { class: 'fm-wiki muted' });
    const wikiBtn = h('a', { class: 'btn', target: '_blank', rel: 'noopener noreferrer',
      href: wikiHref(f) }, 'Wikipedia');
    aboutOf(f).then(p => {
      if (!p || !wikiBox.isConnected) return;
      if (p.u) wikiBtn.href = p.u;
      if (p.x) wikiBox.replaceChildren(h('p', { lang: p.lang }, p.x), h('p', { class: 'fm-src' }, 'Źródło: ', h('a', { href: p.u || wikiBtn.href, target: '_blank', rel: 'noopener noreferrer' }, p.lang === 'en' ? 'Wikipedia (ang.)' : 'Wikipedia'), ' (CC BY-SA)'));
    });

    const meta = [String(f.year), TYPES[f.type], ...(f.genres || [])];
    if (f.duration) meta.push(`${f.duration} min`);
    if (f.type === 'serial' && f.episodes?.length) meta.push(`sezon ${f.season || 1}: ${f.episodes.length} odc.`);

    // Obejrzane + data
    const seenBox = h('input', { type: 'checkbox', checked: !!it.watched, id: uid + '-seen' });
    const seenDate = h('input', { class: 'field fm-date', type: 'date', value: it.watched || '', max: today(), 'aria-label': 'Data obejrzenia', disabled: !it.watched });
    seenBox.addEventListener('change', () => {
      setItem(f.id, { watched: seenBox.checked ? (seenDate.value || today()) : null, ...(seenBox.checked ? { watchlist: false } : {}) });
      refreshAfterEdit(f);
    });
    seenDate.addEventListener('change', () => { if (seenDate.value) { setItem(f.id, { watched: seenDate.value }); refreshAfterEdit(f, { detail: false }); } });

    // Ocena 1–10
    const stars = h('span', { class: 'fm-stars', role: 'radiogroup', 'aria-label': 'Moja ocena (1–10)' });
    for (let i = 1; i <= 10; i++) {
      stars.append(h('button', { class: 'fm-star' + (it.rating >= i ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': String(it.rating === i), 'aria-label': `${i} / 10`, title: `${i} / 10`, dataset: { v: i } }, '★'));
    }
    stars.addEventListener('click', e => {
      const b = e.target.closest('.fm-star');
      if (!b) return;
      const v = Number(b.dataset.v);
      setItem(f.id, { rating: item(f.id).rating === v ? null : v });
      refreshAfterEdit(f);
      announce(item(f.id).rating ? `Ocena ${v} na 10` : 'Usunięto ocenę');
    });
    stars.addEventListener('keydown', e => {
      const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const v = Math.max(1, Math.min(10, (item(f.id).rating || 0) + d));
      setItem(f.id, { rating: v });
      refreshAfterEdit(f);
      detail.querySelector(`.fm-star[data-v="${v}"]`)?.focus();
    });

    const toggle = (label, key, cls) => h('button', {
      class: 'btn fm-toggle ' + cls, type: 'button', 'aria-pressed': String(!!it[key]),
      onclick: () => { setItem(f.id, { [key]: !item(f.id)[key] }); refreshAfterEdit(f); }
    }, label);

    const notes = h('textarea', { class: 'field fm-notes', rows: '4', placeholder: 'Moje notatki…', 'aria-label': 'Notatki', maxlength: '5000' });
    notes.value = it.notes || '';
    const saveNotes = debounce(() => { setItem(f.id, { notes: notes.value }); refreshAfterEdit(f, { detail: false }); }, 400);
    notes.addEventListener('input', saveNotes);

    const ext = (label, href, title) => h('a', { class: 'btn', href, target: '_blank', rel: 'noopener noreferrer', title }, label, ' ↗');
    const desc = f.custom ? f.description : col?.description;

    // replaceChildren zamienia null na tekst "null", więc puste części odfiltrowujemy.
    detail.replaceChildren(...[
      h('button', { class: 'btn fm-back', type: 'button', onclick: () => { body.classList.remove('fm-detail-open'); grid.querySelector(`[data-id="${CSS.escape(f.id)}"]`)?.focus(); } }, '‹ Lista'),
      h('div', { class: 'fm-d-head' },
        big,
        h('div', { class: 'fm-d-titles' },
          h('h3', { class: 'fm-d-title' }, f.title),
          f.originalTitle && f.originalTitle !== f.title ? h('p', { class: 'fm-d-orig muted' }, f.originalTitle) : null,
          h('p', { class: 'fm-d-meta' }, meta.join(' · ')),
          col ? h('p', { class: 'fm-d-col muted' }, 'Kolekcja: ', h('strong', {}, col.name), col.mood ? ` – ${col.mood}` : '') : null,
          f.custom ? h('p', { class: 'fm-d-col muted' }, 'Dodany przeze mnie ' + fmtDate(f.added)) : null,
          h('div', { class: 'fm-d-links' },
            ext('Zwiastun', `https://www.youtube.com/results?search_query=${encodeURIComponent(`${f.title} ${f.year} zwiastun`)}`, 'Szukaj zwiastuna w YouTube (nowa karta)'),
            ext('Gdzie obejrzeć', `https://www.justwatch.com/pl/search?q=${encodeURIComponent(f.title)}`, 'Sprawdź w JustWatch, gdzie można obejrzeć (nowa karta)'),
            wikiBtn))),
      h('div', { class: 'fm-mine' },
        h('div', { class: 'fm-row-ctl' },
          h('label', { class: 'fm-check', for: uid + '-seen' }, seenBox, ' Obejrzane'), seenDate),
        h('div', { class: 'fm-row-ctl' }, h('span', { class: 'fm-ctl-label' }, 'Ocena:'), stars,
          h('span', { class: 'fm-rate-val' }, it.rating ? `${it.rating}/10` : '')),
        h('div', { class: 'fm-row-ctl' },
          toggle('◷ Do obejrzenia', 'watchlist', 'fm-t-list'),
          toggle('♥ Ulubione', 'fav', 'fm-t-fav')),
        notes),
      desc ? h('p', { class: 'fm-d-desc' }, desc) : null,
      !f.custom && col?.highlight ? h('p', { class: 'fm-d-hl muted' }, col.highlight) : null,
      f.episodes?.length ? h('details', { class: 'fm-eps' }, h('summary', {}, `Odcinki (sezon ${f.season || 1})`),
        h('ol', {}, f.episodes.map(e => h('li', {}, e)))) : null,
      wikiBox,
      siblings.length ? h('div', { class: 'fm-sib' }, h('h4', { class: 'fm-h4' }, 'Z tej samej kolekcji'),
        h('ul', { class: 'fm-mini' }, siblings.map(s => h('li', {}, h('button', { class: 'fm-link', type: 'button', onclick: () => select(s.id, { focus: true }) }, `${s.title} (${s.year})`))))) : null,
      f.custom ? h('div', { class: 'fm-d-links fm-own' },
        h('button', { class: 'btn', type: 'button', onclick: () => showForm(f) }, 'Edytuj'),
        h('button', { class: 'btn', type: 'button', onclick: () => removeCustom(f) }, 'Usuń z katalogu')) : null
    ].filter(Boolean));
  }

  /** Po zmianie danych użytkownika: odśwież kafelek (status / sortowanie) i ewentualnie szczegóły. */
  function refreshAfterEdit(f, { detail: redraw = true } = {}) {
    const needsResort = st.status !== 'all' || st.sort === 'rating' || st.sort === 'watched';
    if (needsResort) render({ keepScroll: true });
    else {
      const old = grid.querySelector(`[data-id="${CSS.escape(f.id)}"].fm-card, [data-id="${CSS.escape(f.id)}"].fm-row`);
      if (old) {
        const fresh = card(f);
        const hadFocus = document.activeElement === old;
        old.replaceWith(fresh);
        markSelected();
        if (hadFocus) fresh.focus({ preventScroll: true });
      }
      updateStatus();
    }
    if (redraw && st.sel === f.id && st.mode === 'film') {
      const focusedStar = document.activeElement?.closest?.('.fm-star')?.dataset.v;
      const focusedToggle = document.activeElement?.classList?.contains('fm-toggle') ? [...detail.querySelectorAll('.fm-toggle')].indexOf(document.activeElement) : -1;
      const focusedSeen = document.activeElement?.id === uid + '-seen';
      const top = detail.scrollTop;
      renderDetail(f);
      detail.scrollTop = top;
      if (focusedStar) detail.querySelector(`.fm-star[data-v="${focusedStar}"]`)?.focus();
      if (focusedToggle >= 0) detail.querySelectorAll('.fm-toggle')[focusedToggle]?.focus();
      if (focusedSeen) document.getElementById(uid + '-seen')?.focus();
    }
  }

  /* --- własne filmy --- */
  function showForm(f = null) {
    st.mode = f ? 'edit' : 'add';
    body.classList.add('fm-detail-open');
    const field = (label, input) => h('label', { class: 'fm-field' }, h('span', {}, label), input);
    const inTitle = h('input', { class: 'field', name: 'title', required: true, maxlength: '200', value: f?.title || '' });
    const inOrig = h('input', { class: 'field', name: 'originalTitle', maxlength: '200', value: f?.originalTitle || '' });
    const inYear = h('input', { class: 'field', name: 'year', type: 'number', min: '1880', max: '2100', required: true, value: f?.year || new Date().getFullYear() });
    const inType = h('select', { class: 'field', name: 'type' }, Object.entries(TYPES).map(([k, v]) => h('option', { value: k }, v)));
    inType.value = f?.type || 'film';
    const inGenres = h('input', { class: 'field', name: 'genres', maxlength: '200', placeholder: 'np. Akcja, Komedia', value: (f?.genres || []).join(', ') });
    const inDur = h('input', { class: 'field', name: 'duration', type: 'number', min: '1', max: '1999', value: f?.duration || '' });
    const inDesc = h('textarea', { class: 'field', name: 'description', rows: '4', maxlength: '3000' });
    inDesc.value = f?.description || '';
    const err = h('p', { class: 'fm-err', role: 'alert' });
    const form = h('form', { class: 'fm-form' },
      h('h3', { class: 'fm-h' }, f ? 'Edytuj film' : 'Dodaj film'),
      field('Tytuł *', inTitle), field('Tytuł oryginalny', inOrig),
      h('div', { class: 'fm-form-row' }, field('Rok *', inYear), field('Typ', inType), field('Czas (min)', inDur)),
      field('Gatunki (po przecinku)', inGenres), field('Opis', inDesc), err,
      h('div', { class: 'fm-d-links' },
        h('button', { class: 'btn btn-primary', type: 'submit' }, f ? 'Zapisz' : 'Dodaj'),
        h('button', { class: 'btn', type: 'button', onclick: () => (f ? select(f.id) : (st.sel ? select(st.sel) : showOverview())) }, 'Anuluj')),
      h('p', { class: 'muted fm-small' }, 'Film zapisze się tylko w tej przeglądarce (i w pliku eksportu). Plakat zostanie poszukany w Wikipedii po tytule i roku.'));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const data = cleanCustom({ id: f?.id, added: f?.added, title: inTitle.value, originalTitle: inOrig.value, year: inYear.value,
        type: inType.value, genres: inGenres.value, duration: inDur.value, description: inDesc.value });
      if (!data) { err.textContent = 'Podaj tytuł i rok (1880–2100).'; return; }
      if (f) user.custom[user.custom.findIndex(x => x.id === f.id)] = data; else user.custom.push(data);
      saveUser();
      allFilms();
      fillFilterOptions();
      render({ keepScroll: !!f });
      select(data.id);
      grid.querySelector(`[data-id="${CSS.escape(data.id)}"]`)?.scrollIntoView({ block: 'nearest' });
      announce(f ? 'Zapisano zmiany' : 'Dodano film ' + data.title);
    });
    detail.replaceChildren(h('button', { class: 'btn fm-back', type: 'button', onclick: () => (f ? select(f.id) : (body.classList.remove('fm-detail-open'), showOverview())) }, '‹ Wróć'), form);
    detail.scrollTop = 0;
    inTitle.focus();
  }
  function removeCustom(f) {
    if (!confirm(`Usunąć „${f.title}” z katalogu? Twoja ocena i notatki do tego filmu też znikną.`)) return;
    user.custom = user.custom.filter(x => x.id !== f.id);
    delete user.items[f.id];
    saveUser();
    allFilms();
    fillFilterOptions();
    render({ keepScroll: true });
    showOverview();
    announce('Usunięto film');
  }

  /* --- eksport / import --- */
  exportBtn.addEventListener('click', () => {
    const data = { app: 'pulpit-filmy', version: 1, exported: new Date().toISOString(), items: user.items, custom: user.custom };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `filmy-moje-dane-${today()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    info.textContent = 'Zapisano plik z danymi.';
  });
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    try {
      if (file.size > 5e6) throw new Error('plik jest za duży');
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || (data.app && data.app !== 'pulpit-filmy') || (typeof data.items !== 'object' && !Array.isArray(data.custom))) throw new Error('to nie jest eksport Filmów');
      let nItems = 0, nCustom = 0;
      for (const c of (Array.isArray(data.custom) ? data.custom : [])) {
        const clean = cleanCustom(c);
        if (!clean) continue;
        const i = user.custom.findIndex(x => x.id === clean.id);
        if (i >= 0) user.custom[i] = clean; else user.custom.push(clean);
        nCustom++;
      }
      for (const [id, it] of Object.entries(data.items && typeof data.items === 'object' ? data.items : {})) {
        if (typeof id !== 'string' || id.length > 80) continue;
        const clean = cleanItem(it);
        if (clean) { user.items[id] = clean; nItems++; }
      }
      saveUser();
      allFilms();
      fillFilterOptions();
      render();
      if (st.sel && byId(st.sel)) select(st.sel); else showOverview();
      info.textContent = `Wczytano: ${nItems} ${plural(nItems, 'wpis', 'wpisy', 'wpisów')} i ${nCustom} ${plural(nCustom, 'własny film', 'własne filmy', 'własnych filmów')}.`;
      announce(info.textContent);
    } catch (err) {
      info.textContent = 'Nie udało się wczytać pliku: ' + (err instanceof SyntaxError ? 'niepoprawny JSON' : err.message);
      announce(info.textContent);
    }
  });

  /* --- zdarzenia --- */
  search.addEventListener('input', debounce(() => { st.query = fold(search.value.trim()); render(); }, 120));
  genreSel.addEventListener('change', () => { st.genre = genreSel.value; render(); });
  decadeSel.addEventListener('change', () => { st.decade = decadeSel.value; render(); });
  typeSel.addEventListener('change', () => { st.type = typeSel.value; render(); });
  statusSel.addEventListener('change', () => { st.status = statusSel.value; render(); });
  sortSel.addEventListener('change', () => { st.sort = sortSel.value; store.set('filmy:sort', st.sort); render(); });
  for (const b of viewBtns) b.addEventListener('click', () => {
    st.view = b.dataset.view;
    store.set('filmy:view', st.view);
    for (const x of viewBtns) x.setAttribute('aria-pressed', String(x === b));
    render({ keepScroll: false });
    grid.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  });
  addBtn.addEventListener('click', () => showForm());
  grid.addEventListener('click', e => {
    const el = e.target.closest('.fm-card, .fm-row');
    if (el) select(el.dataset.id);
  });
  grid.addEventListener('keydown', e => {
    const el = e.target.closest('.fm-card, .fm-row');
    if (!el) return;
    const items = [...grid.querySelectorAll('.fm-card, .fm-row')];
    const i = items.indexOf(el);
    let cols = 1;
    if (st.view === 'grid' && items.length > 1) {
      const y0 = items[0].offsetTop;
      cols = items.findIndex(x => x.offsetTop !== y0);
      if (cols < 1) cols = items.length;
    }
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: items.length - 1 - i }[e.key];
    if (d === undefined || (st.view === 'list' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft'))) return;
    e.preventDefault();
    const next = items[Math.max(0, Math.min(items.length - 1, i + d))];
    next.focus();
    select(next.dataset.id);
  });
  search.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); grid.querySelector('.fm-card, .fm-row')?.focus(); }
  });
  detail.addEventListener('keydown', e => {
    if (e.key === 'Escape' && body.classList.contains('fm-detail-open')) {
      e.stopPropagation();
      body.classList.remove('fm-detail-open');
      grid.querySelector('.selected')?.focus();
    }
  });

  /* --- start --- */
  showOverview();
  loadData('films').then(data => {
    if (!body.isConnected) return;
    st.collections = new Map((data.collections || []).map(c => [c.id, c]));
    st.base = (data.films || []).filter(f => f && f.id && f.title && Number.isInteger(f.year));
    allFilms();
    fillFilterOptions();
    render();
    showOverview();
    search.focus({ preventScroll: true });
  }).catch(err => {
    console.warn('Filmy:', err);
    info.textContent = 'Nie udało się wczytać katalogu filmów.';
    st.base = [];
    allFilms();
    render();
  });
}
