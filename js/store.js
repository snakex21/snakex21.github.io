// Trwałe ustawienia (localStorage), pamięć podręczna sesji (sessionStorage) i prosta szyna zdarzeń.
// Każdy dostęp jest w try/catch: w trybie prywatnym albo przy zablokowanych danych strona działa dalej.

const PREFIX = 'pulpit:';

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* brak miejsca lub blokada */ }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* ignoruj */ }
  },
  keys(prefix = '') {
    try {
      return Object.keys(localStorage).filter(k => k.startsWith(PREFIX + prefix)).map(k => k.slice(PREFIX.length));
    } catch { return []; }
  },
  clear(prefix = '') {
    for (const k of this.keys(prefix)) this.remove(k);
  }
};

export const session = {
  get(key, maxAgeMs = Infinity) {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const { t, v } = JSON.parse(raw);
      return Date.now() - t > maxAgeMs ? null : v;
    } catch { return null; }
  },
  set(key, value) {
    try { sessionStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value })); } catch { /* ignoruj */ }
  }
};

export const bus = new EventTarget();
export function emit(type, detail) { bus.dispatchEvent(new CustomEvent(type, { detail })); }
export function on(type, fn) {
  const handler = e => fn(e.detail);
  bus.addEventListener(type, handler);
  return () => bus.removeEventListener(type, handler);
}
