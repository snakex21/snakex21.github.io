// Gadżety: zegar, pogoda (Open-Meteo, bez klucza) i cytat dnia.
// Te same widżety są na pulpicie (panel z prawej) i w oknie "Gadżety".

import { openWindow } from '../wm.js';
import { h, icon, fetchJSON } from '../util.js';
import { store, session, on, emit } from '../store.js';

export const DEFAULT_CITY = { name: 'Tarnów', admin: 'małopolskie', lat: 50.0121, lon: 20.9858 };
export const getCity = () => {
  const c = store.get('city');
  return c && Number.isFinite(c.lat) && Number.isFinite(c.lon) ? c : DEFAULT_CITY;
};

/** Wyszukuje miasto w geokoderze Open-Meteo i zapisuje je jako miasto pogody. */
export async function setCityByName(name) {
  const url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=pl&format=json&name=' + encodeURIComponent(name);
  const data = await fetchJSON(url);
  const r = data.results?.[0];
  if (!r) throw new Error('Nie znaleziono miasta');
  const city = { name: r.name, admin: r.admin1 || r.country || '', lat: r.latitude, lon: r.longitude };
  store.set('city', city);
  emit('city:change', city);
  return city;
}

const WMO = {
  0: 'Bezchmurnie', 1: 'Przeważnie słonecznie', 2: 'Częściowe zachmurzenie', 3: 'Pochmurno',
  45: 'Mgła', 48: 'Mgła osadzająca szadź',
  51: 'Lekka mżawka', 53: 'Mżawka', 55: 'Gęsta mżawka', 56: 'Marznąca mżawka', 57: 'Marznąca mżawka',
  61: 'Słaby deszcz', 63: 'Deszcz', 65: 'Ulewa', 66: 'Marznący deszcz', 67: 'Marznący deszcz',
  71: 'Słaby śnieg', 73: 'Śnieg', 75: 'Intensywny śnieg', 77: 'Ziarna śniegu',
  80: 'Przelotny deszcz', 81: 'Przelotne opady', 82: 'Gwałtowne ulewy', 85: 'Przelotny śnieg', 86: 'Śnieżyca',
  95: 'Burza', 96: 'Burza z gradem', 99: 'Silna burza z gradem'
};

// Zapasowe cytaty (polskie przysłowia), gdy serwis z cytatami nie odpowiada.
const PROVERBS = [
  'Kto rano wstaje, temu Pan Bóg daje.',
  'Nie od razu Kraków zbudowano.',
  'Lepszy wróbel w garści niż gołąb na dachu.',
  'Kto pyta, nie błądzi.',
  'Ziarnko do ziarnka, a zbierze się miarka.',
  'Cierpliwość to klucz do sukcesu.',
  'Co nagle, to po diable.',
  'Praktyka czyni mistrza.',
  'Gdzie dwóch się bije, tam trzeci korzysta.',
  'Mądry Polak po szkodzie.'
];

const dayIndex = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);

/* ---------- Zegar ---------- */
function clockGadget() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'clock-face');
  svg.setAttribute('aria-hidden', 'true');
  let marks = '';
  for (let i = 0; i < 12; i++) {
    const a = i * 30 * Math.PI / 180;
    const r1 = i % 3 ? 41 : 37;
    marks += `<line x1="${50 + Math.sin(a) * r1}" y1="${50 - Math.cos(a) * r1}" x2="${50 + Math.sin(a) * 45}" y2="${50 - Math.cos(a) * 45}" class="tick${i % 3 ? '' : ' major'}"/>`;
  }
  svg.innerHTML = `<circle cx="50" cy="50" r="48" class="rim"/>${marks}
    <line x1="50" y1="50" x2="50" y2="26" class="hand hour"/>
    <line x1="50" y1="50" x2="50" y2="14" class="hand minute"/>
    <line x1="50" y1="58" x2="50" y2="10" class="hand second"/>
    <circle cx="50" cy="50" r="3" class="pin"/>`;
  const [hourH, minH, secH] = svg.querySelectorAll('.hand');
  const time = h('div', { class: 'gadget-big' });
  const date = h('div', { class: 'gadget-sub' });
  const el = h('section', { class: 'gadget gadget-clock', 'aria-label': 'Zegar' }, svg, h('div', {}, time, date));
  const tick = () => {
    const d = new Date();
    const s = d.getSeconds(), m = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + m / 60;
    hourH.setAttribute('transform', `rotate(${hr * 30} 50 50)`);
    minH.setAttribute('transform', `rotate(${m * 6} 50 50)`);
    secH.setAttribute('transform', `rotate(${s * 6} 50 50)`);
    time.textContent = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    date.textContent = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  tick();
  const timer = setInterval(tick, 1000);
  return { el, stop: () => clearInterval(timer) };
}

/* ---------- Pogoda ---------- */
async function getWeather(city) {
  const key = `weather:${city.lat.toFixed(2)},${city.lon.toFixed(2)}`;
  const cached = session.get(key, 15 * 60 * 1000);
  if (cached) return cached;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m' +
    '&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto';
  const data = await fetchJSON(url);
  session.set(key, data);
  return data;
}

function weatherGadget() {
  const body = h('div', { class: 'weather-body' }, h('p', { class: 'muted' }, 'Wczytywanie pogody…'));
  const el = h('section', { class: 'gadget gadget-weather', 'aria-label': 'Pogoda' },
    h('span', { class: 'gadget-icon' }, icon('weather')), body);
  const load = async () => {
    const city = getCity();
    try {
      const d = await getWeather(city);
      const c = d.current;
      body.replaceChildren(
        h('div', { class: 'gadget-big' }, Math.round(c.temperature_2m) + '°C'),
        h('div', { class: 'gadget-sub' }, WMO[c.weather_code] || 'Pogoda'),
        h('div', { class: 'gadget-sub muted' }, `${city.name} · odczuwalna ${Math.round(c.apparent_temperature)}° · wiatr ${Math.round(c.wind_speed_10m)} km/h`),
        d.daily ? h('div', { class: 'gadget-sub muted' }, `Dziś: ${Math.round(d.daily.temperature_2m_min[0])}° / ${Math.round(d.daily.temperature_2m_max[0])}°`) : ''
      );
    } catch {
      body.replaceChildren(h('p', { class: 'muted' }, `Brak danych pogodowych dla: ${city.name}.`));
    }
  };
  load();
  const timer = setInterval(load, 20 * 60 * 1000);
  const off = on('city:change', load);
  return { el, stop: () => { clearInterval(timer); off(); } };
}

/* ---------- Cytat dnia ---------- */
async function getQuote() {
  const today = dayIndex();
  const cached = store.get('quote');
  if (cached && cached.day === today) return cached;
  let q;
  try {
    const d = await fetchJSON(`https://dummyjson.com/quotes/${(today % 1400) + 1}`, { timeout: 6000 });
    q = { text: d.quote, author: d.author };
  } catch {
    q = { text: PROVERBS[today % PROVERBS.length], author: 'przysłowie polskie' };
  }
  const value = { ...q, day: today };
  store.set('quote', value);
  return value;
}

function quoteGadget() {
  const text = h('blockquote', { class: 'quote-text' }, '…');
  const author = h('figcaption', { class: 'quote-author muted' });
  const el = h('section', { class: 'gadget gadget-quote', 'aria-label': 'Cytat dnia' },
    h('h3', { class: 'gadget-title' }, 'Cytat dnia'), h('figure', {}, text, author));
  getQuote().then(q => { text.textContent = '„' + q.text + '”'; author.textContent = '– ' + q.author; });
  return { el, stop: () => {} };
}

function buildAll() {
  return [clockGadget(), weatherGadget(), quoteGadget()];
}

/* ---------- Panel na pulpicie ---------- */
let desktopParts = [];
export function mountDesktopGadgets(container) {
  const render = () => {
    desktopParts.forEach(p => p.stop());
    desktopParts = [];
    const visible = store.get('gadgetsOnDesktop', true);
    container.hidden = !visible;
    container.replaceChildren();
    if (!visible) return;
    desktopParts = buildAll();
    container.append(...desktopParts.map(p => p.el));
  };
  render();
  on('gadgets:toggle', render);
}

/* ---------- Okno ---------- */
export function open() {
  return openWindow({
    id: 'app:gadgets',
    title: 'Gadżety',
    icon: 'gadget',
    width: 380,
    height: 560,
    minWidth: 280,
    render(body, win) {
      const parts = buildAll();
      win.onClose.push(() => parts.forEach(p => p.stop()));
      const cityInput = h('input', { class: 'field', type: 'text', value: getCity().name, 'aria-label': 'Miasto pogody', autocomplete: 'address-level2' });
      const msg = h('span', { class: 'muted', role: 'status' });
      const form = h('form', { class: 'city-form' },
        h('label', {}, 'Miasto: ', cityInput),
        h('button', { class: 'btn', type: 'submit' }, 'Ustaw'), msg);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const name = cityInput.value.trim();
        if (!name) return;
        msg.textContent = 'Szukam…';
        try {
          const c = await setCityByName(name);
          cityInput.value = c.name;
          msg.textContent = `Ustawiono: ${c.name}${c.admin ? ' (' + c.admin + ')' : ''}`;
        } catch { msg.textContent = 'Nie znaleziono takiego miasta.'; }
      });
      body.append(h('div', { class: 'gadget-window' }, ...parts.map(p => p.el), form));
    }
  });
}
