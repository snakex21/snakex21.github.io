// LinkHub: okno jak Ulubione / Eksplorator z linkami ze starej strony.
// Dane NIE są kopiowane do pulpitu: przy otwarciu okna pobieramy LinkHub/data.js ze starej strony
// (ten sam plik, który dopisuje klasyfikator z GitHub Actions: .github/scripts/classify_link.py)
// i wyciągamy z niego literały JSON stałych LINKHUB_CATEGORIES i LINKHUB_LINKS (bez wykonywania skryptu).
// Lewa strona: drzewo kategorii (foldery). Prawa: lista linków w widoku "Szczegóły" albo "Ikony",
// renderowana wirtualnie (w DOM są tylko widoczne wiersze), więc kilka tysięcy linków przewija się płynnie.

import { openWindow } from '../wm.js';
import { h, icon, fold, isNarrow, announce, OLD_SITE, oldSiteUrl } from '../util.js';
import { store, on } from '../store.js';
import { bindMenu, showProperties } from '../menus.js';

const DATA_PATH = 'LinkHub/data.js';
const OLD_PAGE = 'LinkHub/index.html';
const FAVICON = host => 'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(host) + '.ico';
const OVERSCAN = 6;

/* ---------- Dane ---------- */

/** Wyciąga wartość `const NAME = <JSON>;` z tekstu data.js (skaner nawiasów z obsługą napisów). */
export function extractConst(src, name) {
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*').exec(src);
  if (!m) return null;
  const start = m.index + m[0].length;
  if (src[start] !== '[' && src[start] !== '{') return null;
  let depth = 0, inStr = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      if (--depth === 0) return JSON.parse(src.slice(start, i + 1));
    }
  }
  return null;
}

const safeUrl = value => {
  try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null; } catch { return null; }
};
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
// Nazwy kategorii w data.js zaczynają się od emoji; w oknie pokazujemy samo słowo (ikoną jest folder).
const plain = name => String(name ?? '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '') || String(name ?? '');

let dataPromise = null;
function loadLinks() {
  if (!dataPromise) {
    dataPromise = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      try {
        const res = await fetch(OLD_SITE + DATA_PATH, { signal: ctrl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const src = await res.text();
        const rawCats = extractConst(src, 'LINKHUB_CATEGORIES') || {};
        const rawLinks = extractConst(src, 'LINKHUB_LINKS');
        if (!Array.isArray(rawLinks)) throw new Error('Brak LINKHUB_LINKS');
        const cats = new Map();
        for (const [id, c] of Object.entries(rawCats)) cats.set(id, { id, name: plain(c?.name || id), color: /^#[0-9a-f]{3,8}$/i.test(c?.color) ? c.color : '#888', count: 0 });
        const links = [];
        rawLinks.forEach((l, order) => {
          const url = safeUrl(l?.url);
          if (!url) return;
          const catId = typeof l.category === 'string' && l.category ? l.category : 'pozostale';
          if (!cats.has(catId)) cats.set(catId, { id: catId, name: catId, color: '#888', count: 0 });
          const cat = cats.get(catId);
          cat.count++;
          const host = hostOf(url);
          const name = String(l.name || host || url);
          const tags = [cat.name, ...(Array.isArray(l.tags) ? l.tags.filter(t => typeof t === 'string' && t).map(String) : [])];
          links.push({
            order, name, url, host, cat, tags,
            description: String(l.description || ''),
            added: String(l.added || ''),
            text: fold([name, url, l.description, cat.name, ...tags].join(' ')),
            sortName: fold(name)
          });
        });
        const categories = [...cats.values()].filter(c => c.count).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
        return { links, categories };
      } finally { clearTimeout(timer); }
    })().catch(err => { dataPromise = null; throw err; });
  }
  return dataPromise;
}

/* ---------- Okno ---------- */

const SORTS = {
  name:   { label: 'Nazwa (A–Z)', cmp: (a, b) => a.sortName.localeCompare(b.sortName, 'pl') },
  added:  { label: 'Najnowsze', cmp: (a, b) => b.added.localeCompare(a.added) || a.order - b.order },
  host:   { label: 'Domena', cmp: (a, b) => a.host.localeCompare(b.host) || a.sortName.localeCompare(b.sortName, 'pl') },
  cat:    { label: 'Kategoria', cmp: (a, b) => a.cat.name.localeCompare(b.cat.name, 'pl') || a.sortName.localeCompare(b.sortName, 'pl') },
  source: { label: 'Kolejność w bazie', cmp: (a, b) => a.order - b.order }
};
const COLUMNS = [['name', 'Nazwa'], ['host', 'Domena'], ['added', 'Dodano'], ['cat', 'Tagi']];

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* brak uprawnień – metoda zapasowa */ }
  const ta = h('textarea', { style: { position: 'fixed', left: '-9999px', top: '0' }, readonly: true });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

export function open() {
  return openWindow({
    id: 'app:linkhub',
    title: 'LinkHub',
    icon: 'link',
    width: 960,
    height: 620,
    minWidth: 340,
    minHeight: 280,
    className: 'win-linkhub',
    render(body, win) { build(body, win); }
  });
}

function build(body, win) {
  const st = {
    view: store.get('linkhub:view', 'details') === 'icons' ? 'icons' : 'details',
    sort: SORTS[store.get('linkhub:sort')] ? store.get('linkhub:sort') : 'name',
    favicons: store.get('linkhub:favicons', false) === true,
    cat: 'all',
    query: '',
    data: null,
    list: [],
    sel: -1,          // indeks w st.list
    rowH: 22, tileW: 104, tileH: 84, cols: 1
  };
  const uid = 'lh' + Math.random().toString(36).slice(2, 8);

  /* --- elementy --- */
  const search = h('input', { class: 'field lh-search', type: 'search', placeholder: 'Szukaj w linkach…', 'aria-label': 'Szukaj w linkach', autocomplete: 'off' });
  const sortSel = h('select', { class: 'field lh-sort', 'aria-label': 'Sortuj' },
    Object.entries(SORTS).map(([k, s]) => h('option', { value: k }, s.label)));
  sortSel.value = st.sort;
  const catSel = h('select', { class: 'field lh-catsel', 'aria-label': 'Kategoria' }, h('option', { value: 'all' }, 'Wszystkie linki'));
  const viewBtns = ['details', 'icons'].map(v => h('button', {
    class: 'btn btn-view', type: 'button', 'aria-pressed': String(v === st.view), dataset: { view: v },
    title: v === 'icons' ? 'Ikony' : 'Szczegóły'
  }, h('span', { class: 'view-glyph view-' + v, 'aria-hidden': 'true' }), h('span', { class: 'btn-view-label' }, v === 'icons' ? 'Ikony' : 'Szczegóły')));
  const favBox = h('input', { type: 'checkbox', checked: st.favicons });
  const favLabel = h('label', { class: 'lh-fav', title: 'Ikony stron pobierane z usługi DuckDuckGo (domeny trafiają do zewnętrznego serwera)' }, favBox, ' Ikony stron');
  const crumbCat = h('strong', {}, 'Wszystkie linki');
  const tree = h('ul', { class: 'lh-tree', role: 'tree', 'aria-label': 'Kategorie' });
  const head = h('div', { class: 'lh-head', role: 'row' },
    h('span', { class: 'lh-c-icon', 'aria-hidden': 'true' }),
    COLUMNS.map(([k, label]) => h('button', { class: 'lh-col lh-c-' + k, type: 'button', dataset: { sort: k }, title: 'Sortuj: ' + label }, label, h('span', { class: 'lh-arrow', 'aria-hidden': 'true' }))));
  const canvas = h('div', { class: 'lh-canvas' });
  const scroller = h('div', {
    class: 'lh-scroll', role: 'listbox', tabindex: '0', 'aria-label': 'Linki',
    'aria-describedby': uid + '-hint'
  }, head, canvas);
  const hint = h('span', { class: 'sr-only', id: uid + '-hint' }, 'Strzałki wybierają link, Enter otwiera w nowej karcie, Ctrl+C kopiuje adres.');
  const info = h('span', { class: 'status-text', role: 'status' }, 'Wczytywanie linków ze starej strony…');
  const openBtn = h('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Otwórz');
  const copyBtn = h('button', { class: 'btn', type: 'button', disabled: true }, 'Kopiuj link');
  const oldLink = h('a', { class: 'btn lh-old', href: oldSiteUrl(OLD_PAGE), target: '_blank', rel: 'noopener', title: 'Poprzednia strona LinkHub (dodawanie i edycja linków)' }, icon('web', 'icon icon-sm'), ' Stary LinkHub');

  body.append(
    h('div', { class: 'toolbar lh-toolbar' },
      h('span', { class: 'crumbs' }, icon('link', 'icon icon-sm'), ' LinkHub › ', crumbCat),
      catSel,
      h('span', { class: 'view-switch', role: 'group', 'aria-label': 'Widok' }, viewBtns),
      h('label', { class: 'lh-sortwrap' }, h('span', { class: 'lh-sortlabel' }, 'Sortuj:'), sortSel),
      favLabel,
      oldLink,
      search),
    h('div', { class: 'lh-split' },
      h('nav', { class: 'lh-side', 'aria-label': 'Foldery' }, tree),
      scroller),
    hint,
    h('div', { class: 'statusbar' }, info, copyBtn, openBtn)
  );

  /* --- drzewo kategorii --- */
  function treeItem(id, label, count, color, level) {
    return h('li', { class: 'lh-node', role: 'treeitem', 'aria-level': String(level), 'aria-selected': 'false', tabindex: '-1', dataset: { cat: id } },
      h('span', { class: 'lh-node-row' },
        h('span', { class: 'lh-node-icon' }, icon(level === 1 ? 'link' : 'folder', 'icon icon-sm'),
          color ? h('i', { class: 'lh-dot', style: { background: color }, 'aria-hidden': 'true' }) : null),
        h('span', { class: 'lh-node-label' }, label),
        h('span', { class: 'lh-node-count', 'aria-label': count + ' linków' }, String(count))));
  }
  function buildTree() {
    const { links, categories } = st.data;
    const root = treeItem('all', 'Wszystkie linki', links.length, null, 1);
    root.setAttribute('aria-expanded', 'true');
    const group = h('ul', { role: 'group' }, categories.map(c => treeItem(c.id, c.name, c.count, c.color, 2)));
    root.append(group);
    tree.replaceChildren(root);
    catSel.append(...categories.map(c => h('option', { value: c.id }, `${c.name} (${c.count})`)));
    markTree();
  }
  function markTree() {
    for (const n of tree.querySelectorAll('.lh-node')) {
      const on = n.dataset.cat === st.cat;
      n.setAttribute('aria-selected', String(on));
      n.classList.toggle('selected', on);
      n.tabIndex = on ? 0 : -1;
    }
    catSel.value = st.cat;
    const c = st.data?.categories.find(x => x.id === st.cat);
    crumbCat.textContent = c ? c.name : 'Wszystkie linki';
  }
  function setCat(id, { focus = false } = {}) {
    st.cat = id;
    markTree();
    if (focus) tree.querySelector(`.lh-node[data-cat="${CSS.escape(id)}"]`)?.focus();
    refilter();
  }
  tree.addEventListener('click', e => {
    const node = e.target.closest('.lh-node');
    if (node) { e.stopPropagation(); setCat(node.dataset.cat); }
  });
  tree.addEventListener('keydown', e => {
    const nodes = [...tree.querySelectorAll('.lh-node')];
    const i = nodes.indexOf(e.target.closest('.lh-node'));
    if (i < 0) return;
    const moves = { ArrowDown: 1, ArrowUp: -1, Home: -i, End: nodes.length - 1 - i };
    if (e.key in moves) {
      e.preventDefault();
      const next = nodes[Math.max(0, Math.min(nodes.length - 1, i + moves[e.key]))];
      setCat(next.dataset.cat, { focus: true });
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      scroller.focus();
      if (st.sel < 0 && st.list.length) select(0);
    }
  });
  catSel.addEventListener('change', () => setCat(catSel.value));

  /* --- filtrowanie i sortowanie --- */
  function refilter({ keepSel = false } = {}) {
    if (!st.data) return;
    const prev = keepSel ? st.list[st.sel] : null;
    const q = st.query;
    const words = q ? q.split(/\s+/) : [];
    let list = st.data.links;
    if (st.cat !== 'all') list = list.filter(l => l.cat.id === st.cat);
    if (words.length) list = list.filter(l => words.every(w => l.text.includes(w)));
    st.list = list.slice().sort(SORTS[st.sort].cmp);
    st.sel = prev ? st.list.indexOf(prev) : -1;
    for (const b of head.querySelectorAll('.lh-col')) {
      const on = b.dataset.sort === st.sort;
      b.classList.toggle('sorted', on);
      b.setAttribute('aria-sort', on ? (st.sort === 'added' ? 'descending' : 'ascending') : 'none');
    }
    clearRows();
    layout();
    if (!keepSel) scroller.scrollTop = 0;
    paint();
    updateStatus();
  }
  // Filtrowanie kilku tysięcy wpisów trwa kilka ms, więc lista odświeża się przy każdym znaku.
  search.addEventListener('input', () => { st.query = fold(search.value.trim()); refilter(); });
  search.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && st.list.length) { e.preventDefault(); scroller.focus(); select(Math.max(0, st.sel)); }
    if (e.key === 'Enter' && st.list.length) { e.preventDefault(); openLink(st.list[Math.max(0, st.sel)]); }
  });
  sortSel.addEventListener('change', () => { st.sort = sortSel.value; store.set('linkhub:sort', st.sort); refilter({ keepSel: true }); scrollToSel(); });
  head.addEventListener('click', e => {
    const b = e.target.closest('.lh-col');
    if (!b) return;
    st.sort = b.dataset.sort;
    sortSel.value = st.sort;
    store.set('linkhub:sort', st.sort);
    refilter({ keepSel: true });
    scrollToSel();
  });

  /* --- widok i wirtualna lista --- */
  function setView(v) {
    st.view = v;
    store.set('linkhub:view', v);
    scroller.classList.toggle('is-icons', v === 'icons');
    scroller.classList.toggle('is-details', v === 'details');
    head.hidden = v !== 'details';
    for (const b of viewBtns) b.setAttribute('aria-pressed', String(b.dataset.view === v));
    clearRows();
    measure();
    layout();
    scrollToSel();
    paint();
  }
  for (const b of viewBtns) b.addEventListener('click', () => setView(b.dataset.view));
  favBox.addEventListener('change', () => { st.favicons = favBox.checked; store.set('linkhub:favicons', st.favicons); clearRows(); paint(); });

  /** Wysokość wiersza / rozmiar kafelka z CSS motywu (zmienne --lh-row, --lh-tile-w, --lh-tile-h). */
  function measure() {
    const cs = getComputedStyle(scroller);
    const num = (name, fb) => { const n = parseFloat(cs.getPropertyValue(name)); return n > 0 ? n : fb; };
    st.rowH = num('--lh-row', 22);
    st.tileW = num('--lh-tile-w', 104);
    st.tileH = num('--lh-tile-h', 84);
  }
  function layout() {
    const w = canvas.clientWidth || scroller.clientWidth;
    if (st.view === 'icons') {
      st.cols = Math.max(1, Math.floor(w / st.tileW));
      canvas.style.height = Math.ceil(st.list.length / st.cols) * st.tileH + 'px';
    } else {
      st.cols = 1;
      canvas.style.height = st.list.length * st.rowH + 'px';
    }
  }
  const rendered = new Map();   // indeks w st.list -> element
  function clearRows() { for (const el of rendered.values()) el.remove(); rendered.clear(); }

  function linkIcon(l, cls) {
    if (!st.favicons || !l.host) return icon('web', cls);
    const img = h('img', { class: cls + ' lh-favicon', src: FAVICON(l.host), alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' });
    img.addEventListener('error', () => img.replaceWith(icon('web', cls)), { once: true });
    return img;
  }
  function makeRow(i) {
    const l = st.list[i];
    const common = {
      class: 'lh-item' + (i === st.sel ? ' selected' : ''), id: uid + '-' + i, role: 'option',
      'aria-selected': String(i === st.sel), 'aria-setsize': String(st.list.length), 'aria-posinset': String(i + 1),
      href: l.url, target: '_blank', rel: 'noopener noreferrer', tabindex: '-1', draggable: 'true',
      title: [l.name, l.description, l.url].filter(Boolean).join('\n'), dataset: { i }
    };
    if (st.view === 'icons') {
      const el = h('a', common, h('span', { class: 'lh-ticon' }, linkIcon(l, 'icon icon-lg')), h('span', { class: 'lh-tlabel' }, l.name));
      el.style.cssText = `left:${(i % st.cols) * (100 / st.cols)}%;top:${Math.floor(i / st.cols) * st.tileH}px;width:${100 / st.cols}%;height:${st.tileH}px`;
      return el;
    }
    const el = h('a', common,
      h('span', { class: 'lh-c-icon' }, linkIcon(l, 'icon icon-sm')),
      h('span', { class: 'lh-c-name' }, l.name),
      h('span', { class: 'lh-c-host' }, l.host),
      h('span', { class: 'lh-c-added' }, l.added),
      h('span', { class: 'lh-c-cat' }, l.tags.map((t, k) => h('span', { class: 'lh-tag', style: k ? null : { '--tag': l.cat.color } }, t))));
    el.style.cssText = `top:${i * st.rowH}px;height:${st.rowH}px`;
    return el;
  }
  let painting = 0;
  function paint() {
    painting = 0;
    if (!st.data) return;
    const top = scroller.scrollTop;
    const headH = st.view === 'details' ? head.offsetHeight : 0;
    const vh = scroller.clientHeight - headH;
    let from, to;
    if (st.view === 'icons') {
      const r0 = Math.max(0, Math.floor(top / st.tileH) - 2);
      const r1 = Math.ceil((top + vh) / st.tileH) + 2;
      from = r0 * st.cols; to = Math.min(st.list.length, r1 * st.cols);
    } else {
      from = Math.max(0, Math.floor(top / st.rowH) - OVERSCAN);
      to = Math.min(st.list.length, Math.ceil((top + vh) / st.rowH) + OVERSCAN);
    }
    for (const [i, el] of rendered) if (i < from || i >= to) { el.remove(); rendered.delete(i); }
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) if (!rendered.has(i)) { const el = makeRow(i); rendered.set(i, el); frag.append(el); }
    canvas.append(frag);
    syncActive();
  }
  const schedule = () => { if (!painting) painting = requestAnimationFrame(paint); };
  scroller.addEventListener('scroll', schedule, { passive: true });
  const ro = new ResizeObserver(() => {
    if (!st.data) return;
    const cols = st.cols;
    layout();
    if (st.view === 'icons' && cols !== st.cols) clearRows();
    paint();
  });
  ro.observe(scroller);
  const offTheme = on('theme:change', () => setTimeout(() => { measure(); layout(); clearRows(); paint(); }, 0));
  win.onClose.push(() => { ro.disconnect(); offTheme(); cancelAnimationFrame(painting); });

  /* --- zaznaczenie, otwieranie, kopiowanie --- */
  function syncActive() {
    const el = rendered.get(st.sel);
    if (el) scroller.setAttribute('aria-activedescendant', el.id); else scroller.removeAttribute('aria-activedescendant');
  }
  function select(i) {
    if (!st.list.length) return;
    i = Math.max(0, Math.min(st.list.length - 1, i));
    rendered.get(st.sel)?.classList.remove('selected');
    rendered.get(st.sel)?.setAttribute('aria-selected', 'false');
    st.sel = i;
    scrollToSel();
    paint();
    const el = rendered.get(i);
    el?.classList.add('selected');
    el?.setAttribute('aria-selected', 'true');
    syncActive();
    updateStatus();
  }
  function scrollToSel() {
    if (st.sel < 0) return;
    const headH = st.view === 'details' ? head.offsetHeight : 0;
    const vh = scroller.clientHeight - headH;
    const size = st.view === 'icons' ? st.tileH : st.rowH;
    const y = (st.view === 'icons' ? Math.floor(st.sel / st.cols) : st.sel) * size;
    if (y < scroller.scrollTop) scroller.scrollTop = y;
    else if (y + size > scroller.scrollTop + vh) scroller.scrollTop = y + size - vh;
  }
  function openLink(l) { if (l) window.open(l.url, '_blank', 'noopener,noreferrer'); }
  async function copyLink(l) {
    if (!l) return;
    const ok = await copyText(l.url);
    info.textContent = ok ? 'Skopiowano: ' + l.url : 'Nie udało się skopiować adresu.';
    announce(info.textContent);
  }
  openBtn.addEventListener('click', () => openLink(st.list[st.sel]));
  // Menu kontekstowe linku: Otwórz, Kopiuj adres, Właściwości (zamiast menu linku przeglądarki)
  bindMenu(canvas, ({ target }) => {
    const a = target.closest('.lh-item');
    const l = a && st.list[Number(a.dataset.i)];
    if (!l) return null;
    select(Number(a.dataset.i));
    return [
      { label: 'Otwórz', default: true, glyph: 'external', run: () => openLink(l) },
      { label: 'Kopiuj adres', shortcut: 'Ctrl+C', run: () => copyLink(l) },
      'sep',
      { label: 'Właściwości', run: () => showProperties({ name: l.name, icon: 'web', type: 'Link · ' + l.cat.name, url: l.url, description: l.description,
        extra: [l.added ? ['Dodano', l.added] : null, l.tags.length > 1 ? ['Tagi', l.tags.slice(1).join(', ')] : null].filter(Boolean) }) }
    ];
  });
  copyBtn.addEventListener('click', () => copyLink(st.list[st.sel]));

  canvas.addEventListener('click', e => {
    const a = e.target.closest('.lh-item');
    if (!a) return;
    // Ctrl / Shift / środkowy przycisk: zwykłe zachowanie linku (nowa karta przeglądarki).
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    const narrow = isNarrow() || e.pointerType === 'touch';
    if (!narrow) e.preventDefault();
    select(Number(a.dataset.i));
    scroller.focus({ preventScroll: true });
  });
  canvas.addEventListener('dblclick', e => {
    const a = e.target.closest('.lh-item');
    if (a) { e.preventDefault(); openLink(st.list[Number(a.dataset.i)]); }
  });
  scroller.addEventListener('keydown', e => {
    if (!st.list.length) return;
    const page = Math.max(1, Math.floor((scroller.clientHeight - head.offsetHeight) / (st.view === 'icons' ? st.tileH : st.rowH)));
    const c = st.cols;
    const cur = st.sel < 0 ? -1 : st.sel;
    const moves = {
      ArrowDown: c, ArrowUp: -c, PageDown: page * c, PageUp: -page * c,
      ArrowRight: st.view === 'icons' ? 1 : 0, ArrowLeft: st.view === 'icons' ? -1 : 0
    };
    if (e.key === 'ArrowLeft' && st.view === 'details') {
      e.preventDefault();
      tree.querySelector('.lh-node.selected')?.focus();
    } else if (e.key in moves) {
      e.preventDefault();
      select(cur < 0 ? 0 : cur + moves[e.key]);
    } else if (e.key === 'Home') { e.preventDefault(); select(0); }
    else if (e.key === 'End') { e.preventDefault(); select(st.list.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); openLink(st.list[Math.max(0, cur)]); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && cur >= 0) { e.preventDefault(); copyLink(st.list[cur]); }
  });

  function updateStatus() {
    const l = st.list[st.sel];
    openBtn.disabled = copyBtn.disabled = !l;
    if (l) { info.textContent = `${l.name} — ${l.url}${l.description ? ' — ' + l.description : ''}`; return; }
    if (!st.data) return;
    const n = st.list.length;
    info.textContent = st.query
      ? `Znaleziono: ${n} z ${st.data.links.length}`
      : `${n} ${n === 1 ? 'link' : 'linków'} · ${isNarrow() ? 'stuknij, aby otworzyć' : 'dwuklik lub Enter otwiera w nowej karcie'}`;
  }

  /* --- start --- */
  setView(st.view);
  loadLinks().then(data => {
    if (!body.isConnected) return;
    st.data = data;
    buildTree();
    measure();
    refilter();
    search.focus({ preventScroll: true });
  }).catch(err => {
    console.warn('LinkHub:', err);
    info.textContent = 'Nie udało się wczytać linków ze starej strony.';
    canvas.replaceChildren(h('div', { class: 'notice notice-warn lh-error', role: 'alert' },
      h('p', {}, 'Nie udało się pobrać listy linków (' + (err?.name === 'AbortError' ? 'brak odpowiedzi' : err?.message || 'błąd') + ').'),
      h('p', {}, h('button', { class: 'btn', type: 'button', onclick: () => { canvas.replaceChildren(); win.close(); open(); } }, 'Spróbuj ponownie'),
        ' albo ', h('a', { href: oldSiteUrl(OLD_PAGE), target: '_blank', rel: 'noopener' }, 'otwórz stary LinkHub'), '.')));
    canvas.style.height = 'auto';
  });
}
