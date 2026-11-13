// "Muzyka": własny odtwarzacz zamiast ramki ze starą stroną. Lista utworów: data/music.json
// (wygenerowana z muzyka/player.js starej strony i listy plików repo), pliki MP3 zostają na starej stronie
// (https://snakex21.github.io/snakex21/muzyka/utwory/muzyka/…) i grają przez zwykły <audio>.
// Gra dalej po zminimalizowaniu okna; zamknięcie okna zatrzymuje muzykę. Ostatni utwór, pozycja, głośność,
// losowanie i powtarzanie są w localStorage (music:state). Klawisze multimedialne systemu: Media Session API.
// Wygląd zależy od rodziny motywu (klasyczny / szklany / płaski) – reguły .mp w css/base.css.

import { openWindow } from '../wm.js';
import { h, icon, loadData, fold, OLD_SITE } from '../util.js';
import { store } from '../store.js';
import { openWeb } from './webview.js';
import { bindMenu, showProperties } from '../menus.js';

const OLD_PAGE = 'muzyka/muzyka.html';
const REPEAT = ['off', 'all', 'one'];
const REPEAT_LABEL = { off: 'Powtarzanie: wyłączone', all: 'Powtarzanie: cała lista', one: 'Powtarzanie: jeden utwór' };

const fmt = s => {
  if (!Number.isFinite(s) || s < 0) return '--:--';
  s = Math.floor(s);
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
const trackName = t => t.artist ? `${t.artist} – ${t.title}` : t.title;

/** Ikony przycisków odtwarzacza (własne, rysowane ścieżkami w kolorze tekstu). */
const MP_GLYPHS = {
  play: 'M5 3.5v9l8-4.5z',
  pause: 'M4.5 3.5h2.6v9H4.5zM8.9 3.5h2.6v9H8.9z',
  stop: 'M4 4h8v8H4z',
  prev: 'M3.5 3.5h2v9h-2zM13 3.5v9L6 8z',
  next: 'M10.5 3.5h2v9h-2zM3 3.5v9L10 8z',
  shuffle: 'M2 4.5h2.5l6 7H13M11.5 10l1.8 1.5-1.8 1.5M2 11.5h2.5l1.6-1.9M8.4 6.4l2.1-1.9H13M11.5 3l1.8 1.5L11.5 6',
  repeat: 'M3 7V5.5h9M10.5 4l1.6 1.5-1.6 1.5M13 9v1.5H4M5.5 12L3.9 10.5 5.5 9',
  vol: 'M2.5 6h2.5l3.5-3v10L5 10H2.5zM10.5 6a2.5 2.5 0 0 1 0 4M12 4.5a4.5 4.5 0 0 1 0 7',
  mute: 'M2.5 6h2.5l3.5-3v10L5 10H2.5zM10.5 6l3.5 4M14 6l-3.5 4'
};
const FILLED = new Set(['play', 'pause', 'stop', 'prev', 'next']);
function mpGlyph(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'mp-glyph mp-g-' + name);
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', MP_GLYPHS[name]);
  if (FILLED.has(name)) p.setAttribute('class', 'fill');
  svg.append(p);
  return svg;
}

let player = null;   // jeden odtwarzacz na stronę (okno z id app:music)

export function open() {
  if (player) return openWindow({ id: 'app:music' });
  const audio = new Audio();
  audio.preload = 'metadata';
  const saved = store.get('music:state', {}) || {};
  const st = {
    tracks: [],
    base: '',
    index: -1,
    shuffle: !!saved.shuffle,
    repeat: REPEAT.includes(saved.repeat) ? saved.repeat : 'off',
    order: [],
    pendingSeek: 0,
    lastSave: 0
  };
  audio.volume = Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : 0.8;
  audio.muted = !!saved.muted;

  const win = openWindow({
    id: 'app:music',
    title: 'Muzyka',
    icon: 'music',
    width: 620,
    height: 560,
    minWidth: 320,
    minHeight: 300,
    className: 'win-music',
    render(body, w) { build(body, w); }
  });
  player = { win, audio };
  win.onClose.push(() => {
    saveState(true);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      for (const a of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward', 'stop']) {
        try { navigator.mediaSession.setActionHandler(a, null); } catch { /* nieobsługiwane */ }
      }
    }
    player = null;
  });
  return win;

  function saveState(force = false) {
    const now = Date.now();
    if (!force && now - st.lastSave < 3000) return;
    st.lastSave = now;
    const t = st.tracks[st.index];
    store.set('music:state', {
      file: t ? t.file : saved.file || null,
      time: t ? Math.floor(audio.currentTime || st.pendingSeek || 0) : 0,
      volume: audio.volume, muted: audio.muted, shuffle: st.shuffle, repeat: st.repeat
    });
  }

  function build(body, w) {
    const b = (name, label, cls = '') => h('button', { class: 'btn mp-btn ' + cls, type: 'button', title: label, 'aria-label': label }, mpGlyph(name));
    const btnPrev = b('prev', 'Poprzedni utwór (PageUp)');
    const btnPlay = b('play', 'Odtwórz (Spacja)', 'mp-play');
    btnPlay.append(mpGlyph('pause'));
    const btnStop = b('stop', 'Zatrzymaj');
    const btnNext = b('next', 'Następny utwór (PageDown)');
    const btnShuffle = b('shuffle', 'Losowa kolejność', 'mp-toggle');
    const btnRepeat = h('button', { class: 'btn mp-btn mp-toggle', type: 'button' }, mpGlyph('repeat'), h('span', { class: 'mp-one', 'aria-hidden': 'true' }, '1'));
    const btnMute = h('button', { class: 'btn mp-btn mp-mute', type: 'button' }, mpGlyph('vol'), mpGlyph('mute'));
    const seek = h('input', { class: 'mp-seek', type: 'range', min: '0', max: '1000', step: '1', value: '0', 'aria-label': 'Pozycja w utworze', disabled: true });
    const vol = h('input', { class: 'mp-vol', type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(audio.volume * 100)), 'aria-label': 'Głośność' });
    const time = h('span', { class: 'mp-time', 'aria-hidden': 'true' }, '00:00');
    const dur = h('span', { class: 'mp-dur' }, '--:--');
    const title = h('span', { class: 'mp-title' }, 'Wybierz utwór z listy');
    const artist = h('span', { class: 'mp-artist' }, '');
    const cover = h('span', { class: 'mp-cover', 'aria-hidden': 'true' }, icon('music', 'icon icon-lg'));
    const bars = h('span', { class: 'mp-bars', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map(() => h('i')));
    const search = h('input', { class: 'field mp-search', type: 'search', placeholder: 'Szukaj utworu lub wykonawcy…', 'aria-label': 'Szukaj utworu' });
    const list = h('ol', { class: 'mp-list', role: 'listbox', 'aria-label': 'Lista utworów' });
    const status = h('span', { class: 'status-text', role: 'status' }, 'Wczytywanie listy…');
    const count = h('span', { class: 'mp-count' });

    body.append(h('div', { class: 'mp' },
      h('div', { class: 'mp-display' },
        cover,
        h('div', { class: 'mp-info' },
          h('span', { class: 'mp-lcd' }, time, h('span', { class: 'mp-sep' }, ' / '), dur, bars),
          h('span', { class: 'mp-now' }, title, artist))),
      h('div', { class: 'mp-seekrow' }, seek),
      h('div', { class: 'mp-controls' },
        h('div', { class: 'mp-transport' }, btnPrev, btnPlay, btnStop, btnNext),
        h('div', { class: 'mp-modes' }, btnShuffle, btnRepeat),
        h('div', { class: 'mp-volume' }, btnMute, vol)),
      h('div', { class: 'toolbar mp-toolbar' }, search, count),
      h('div', { class: 'folder-scroll mp-scroll' }, list)),
      h('div', { class: 'statusbar' }, status,
        h('a', { class: 'mp-old', href: OLD_SITE + OLD_PAGE, target: '_blank', rel: 'noopener',
          onclick: e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); openWeb({ id: 'app:music-old', title: 'Muzyka (stara wersja)', icon: 'music', path: OLD_PAGE, size: [900, 600] }); } } },
          'Otwórz starą wersję')));

    /* ---------- stan przycisków ---------- */
    const syncModes = () => {
      btnShuffle.setAttribute('aria-pressed', String(st.shuffle));
      btnRepeat.setAttribute('aria-pressed', String(st.repeat !== 'off'));
      btnRepeat.dataset.mode = st.repeat;
      btnRepeat.title = REPEAT_LABEL[st.repeat];
      btnRepeat.setAttribute('aria-label', REPEAT_LABEL[st.repeat]);
      const muted = audio.muted || audio.volume === 0;
      btnMute.classList.toggle('muted', muted);
      btnMute.title = muted ? 'Włącz dźwięk' : 'Wycisz';
      btnMute.setAttribute('aria-label', btnMute.title);
    };
    const syncPlay = () => {
      const playing = !audio.paused && !audio.ended;
      btnPlay.classList.toggle('playing', playing);
      btnPlay.title = playing ? 'Wstrzymaj (Spacja)' : 'Odtwórz (Spacja)';
      btnPlay.setAttribute('aria-label', btnPlay.title);
      body.querySelector('.mp').classList.toggle('is-playing', playing);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : (st.index >= 0 ? 'paused' : 'none');
    };

    const makeOrder = () => {
      const idx = st.tracks.map((_, i) => i);
      if (st.shuffle) {
        for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
        // bieżący utwór na początek, żeby "dalej" nie powtórzyło go od razu
        const cur = idx.indexOf(st.index);
        if (cur > 0) { idx.splice(cur, 1); idx.unshift(st.index); }
      }
      st.order = idx;
    };

    const urlOf = t => OLD_SITE + st.base + encodeURIComponent(t.file);

    const rowOf = i => list.children[i];
    const markCurrent = () => {
      for (const li of list.querySelectorAll('.current')) { li.classList.remove('current'); li.setAttribute('aria-selected', 'false'); }
      const li = rowOf(st.index);
      if (li) { li.classList.add('current'); li.setAttribute('aria-selected', 'true'); }
    };

    function load(i, { play = true, at = 0 } = {}) {
      const t = st.tracks[i];
      if (!t) return;
      st.index = i;
      st.pendingSeek = at;
      audio.src = urlOf(t);
      title.textContent = t.title;
      artist.textContent = t.artist || '';
      cover.style.setProperty('--mp-accent', t.accent || '#6366f1');
      cover.dataset.initial = (t.title.match(/[\p{L}\p{N}]/u) || ['♪'])[0].toLocaleUpperCase('pl');
      seek.disabled = false;
      seek.value = '0';
      time.textContent = fmt(at);
      dur.textContent = '--:--';
      w.setTitle(trackName(t) + ' – Muzyka');
      status.textContent = 'Wczytywanie: ' + trackName(t);
      markCurrent();
      rowOf(i)?.scrollIntoView({ block: 'nearest' });
      if ('mediaSession' in navigator && 'MediaMetadata' in window) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || '', album: t.album || 'snakex21 · Muzyka' });
      }
      saveState(true);
      if (play) audio.play().catch(err => { if (err.name !== 'AbortError') status.textContent = 'Kliknij ▶, aby odtworzyć.'; });
      else syncPlay();
    }

    const step = (dir) => {
      if (!st.tracks.length) return;
      if (st.index < 0) return load(st.order[0]);
      const pos = st.order.indexOf(st.index);
      let next = pos + dir;
      if (next >= st.order.length) next = 0;
      if (next < 0) next = st.order.length - 1;
      load(st.order[next]);
    };
    const prev = () => { if (audio.currentTime > 4) { audio.currentTime = 0; return; } step(-1); };
    const next = () => step(1);
    const toggle = () => {
      if (st.index < 0) { load(st.order[0] ?? 0); return; }
      if (audio.paused) audio.play().catch(() => {}); else audio.pause();
    };
    const stop = () => { audio.pause(); if (st.index >= 0) audio.currentTime = 0; saveState(true); };
    const seekBy = (sec) => { if (Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration - 0.25, audio.currentTime + sec)); };
    const setVol = (v) => { audio.volume = Math.max(0, Math.min(1, v)); if (audio.volume > 0) audio.muted = false; vol.value = String(Math.round(audio.volume * 100)); syncModes(); saveState(true); };

    btnPlay.addEventListener('click', toggle);
    btnStop.addEventListener('click', stop);
    btnPrev.addEventListener('click', prev);
    btnNext.addEventListener('click', next);
    btnShuffle.addEventListener('click', () => { st.shuffle = !st.shuffle; makeOrder(); syncModes(); saveState(true); });
    btnRepeat.addEventListener('click', () => { st.repeat = REPEAT[(REPEAT.indexOf(st.repeat) + 1) % REPEAT.length]; syncModes(); saveState(true); });
    btnMute.addEventListener('click', () => { if (audio.volume === 0) setVol(0.5); else { audio.muted = !audio.muted; syncModes(); saveState(true); } });
    vol.addEventListener('input', () => setVol(vol.valueAsNumber / 100));

    let dragging = false;
    seek.addEventListener('input', () => { dragging = true; if (Number.isFinite(audio.duration)) time.textContent = fmt(seek.valueAsNumber / 1000 * audio.duration); });
    seek.addEventListener('change', () => {
      dragging = false;
      if (Number.isFinite(audio.duration)) audio.currentTime = seek.valueAsNumber / 1000 * audio.duration;
    });

    /* ---------- zdarzenia <audio> ---------- */
    audio.addEventListener('loadedmetadata', () => {
      dur.textContent = fmt(audio.duration);
      if (st.pendingSeek > 0 && st.pendingSeek < audio.duration - 1) audio.currentTime = st.pendingSeek;
      st.pendingSeek = 0;
    });
    audio.addEventListener('timeupdate', () => {
      if (!dragging && Number.isFinite(audio.duration) && audio.duration > 0) {
        seek.value = String(Math.round(audio.currentTime / audio.duration * 1000));
        time.textContent = fmt(audio.currentTime);
        seek.style.setProperty('--mp-fill', (audio.currentTime / audio.duration * 100).toFixed(2) + '%');
      }
      if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && Number.isFinite(audio.duration)) {
        try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate }); } catch { /* ignoruj */ }
      }
      saveState();
    });
    audio.addEventListener('playing', () => { const t = st.tracks[st.index]; if (t) status.textContent = 'Odtwarzanie: ' + trackName(t); syncPlay(); });
    audio.addEventListener('pause', () => { const t = st.tracks[st.index]; if (t) status.textContent = 'Wstrzymano: ' + trackName(t); syncPlay(); saveState(true); });
    audio.addEventListener('waiting', () => { status.textContent = 'Buforowanie…'; });
    audio.addEventListener('ended', () => {
      if (st.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
      const pos = st.order.indexOf(st.index);
      if (pos === st.order.length - 1 && st.repeat === 'off') { syncPlay(); status.textContent = 'Koniec listy.'; return; }
      next();
    });
    audio.addEventListener('error', () => {
      if (!audio.getAttribute('src')) return;
      const t = st.tracks[st.index];
      status.textContent = 'Nie udało się odtworzyć: ' + (t ? trackName(t) : 'plik') + '.';
      syncPlay();
    });

    /* ---------- klawiatura ---------- */
    w.el.addEventListener('keydown', e => {
      const tgt = e.target;
      const inText = tgt.matches?.('input[type="search"], input[type="text"], textarea');
      const inRange = tgt.matches?.('input[type="range"]');
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === ' ' && !inText && !(tgt.tagName === 'BUTTON' && !tgt.closest('.mp-list'))) { e.preventDefault(); toggle(); }
      else if (e.key === 'PageUp') { e.preventDefault(); prev(); }
      else if (e.key === 'PageDown') { e.preventDefault(); next(); }
      else if (inText || inRange || tgt.closest?.('.mp-list')) return;
      else if (e.key === 'ArrowRight') { e.preventDefault(); seekBy(5); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seekBy(-5); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setVol(audio.volume + 0.05); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setVol(audio.volume - 0.05); }
    });

    /* ---------- lista utworów ---------- */
    list.addEventListener('click', e => {
      const li = e.target.closest('.mp-row');
      if (!li) return;
      for (const x of list.querySelectorAll('.mp-row[tabindex="0"]')) x.tabIndex = -1;
      li.tabIndex = 0;
      load(Number(li.dataset.i));
    });
    // Menu kontekstowe utworu: Odtwórz, Właściwości (odtwarzacz nie ma kolejki)
    bindMenu(list, ({ target }) => {
      const li = target.closest('.mp-row');
      const t = li && st.tracks[Number(li.dataset.i)];
      if (!t) return null;
      return [
        { label: 'Odtwórz', default: true, icon: 'music', run: () => load(Number(li.dataset.i)) },
        'sep',
        { label: 'Właściwości', run: () => showProperties({ name: t.title, icon: 'music', type: 'Utwór MP3', url: urlOf(t),
          extra: [t.artist ? ['Wykonawca', t.artist] : null, t.album ? ['Album', t.album] : null, ['Plik', t.file]].filter(Boolean) }) }
      ];
    });
    list.addEventListener('keydown', e => {
      const li = e.target.closest('.mp-row');
      if (!li) return;
      if (e.key === 'Enter') { e.preventDefault(); load(Number(li.dataset.i)); return; }
      const rows = [...list.querySelectorAll('.mp-row:not([hidden])')];
      const i = rows.indexOf(li);
      const moves = { ArrowDown: 1, ArrowUp: -1, Home: -i, End: rows.length - 1 - i };
      if (e.key in moves) {
        e.preventDefault();
        const to = rows[Math.max(0, Math.min(rows.length - 1, i + moves[e.key]))];
        li.tabIndex = -1; to.tabIndex = 0; to.focus();
      }
    });
    search.addEventListener('input', () => {
      const q = fold(search.value.trim());
      let shown = 0;
      for (const li of list.children) {
        const hit = !q || fold(li.dataset.search).includes(q);
        li.hidden = !hit;
        if (hit) shown++;
      }
      count.textContent = q ? `${shown} z ${st.tracks.length}` : `${st.tracks.length} utworów`;
    });
    search.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); list.querySelector('.mp-row:not([hidden])')?.focus(); }
      if (e.key === 'Enter') { e.preventDefault(); const li = list.querySelector('.mp-row:not([hidden])'); if (li) load(Number(li.dataset.i)); }
    });

    /* ---------- Media Session (klawisze multimedialne) ---------- */
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* nieobsługiwane */ } };
      set('play', () => (st.index < 0 ? toggle() : audio.play().catch(() => {})));
      set('pause', () => audio.pause());
      set('stop', stop);
      set('previoustrack', prev);
      set('nexttrack', next);
      set('seekbackward', d => seekBy(-(d.seekOffset || 10)));
      set('seekforward', d => seekBy(d.seekOffset || 10));
      set('seekto', d => { if (Number.isFinite(d.seekTime)) audio.currentTime = d.seekTime; });
    }

    syncModes();
    syncPlay();
    loadData('music').then(data => {
      st.base = data.base;
      st.tracks = data.items;
      list.append(...st.tracks.map((t, i) => h('li', {
        class: 'mp-row', role: 'option', tabindex: i ? '-1' : '0', 'aria-selected': 'false',
        dataset: { i, search: [t.title, t.artist, t.album, t.file].join(' ') }, title: t.file
      },
        h('span', { class: 'mp-row-no', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'mp-row-dot', 'aria-hidden': 'true', style: { '--mp-accent': t.accent || '#6366f1' } }),
        h('span', { class: 'mp-row-title' }, t.title),
        h('span', { class: 'mp-row-artist' }, t.artist || ''))));
      count.textContent = `${st.tracks.length} utworów`;
      makeOrder();
      // Ostatnio słuchany utwór wraca na swoją pozycję (bez automatycznego startu).
      const last = saved.file ? st.tracks.findIndex(t => t.file === saved.file) : -1;
      if (last >= 0) {
        load(last, { play: false, at: Number(saved.time) || 0 });
        makeOrder();
        status.textContent = 'Gotowe · ostatnio: ' + trackName(st.tracks[last]);
      } else {
        status.textContent = 'Gotowe · kliknij utwór, aby go odtworzyć.';
      }
    }).catch(() => { status.textContent = 'Nie udało się wczytać listy utworów.'; });

    const onHide = () => saveState(true);
    window.addEventListener('pagehide', onHide);
    w.onClose.push(() => window.removeEventListener('pagehide', onHide));
  }
}
