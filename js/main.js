// Start pulpitu: ikony SVG, motyw, menedżer okien, pulpit, pasek zadań, menu Start i gadżety.

import { initWM } from './wm.js';
import { initDesktop } from './desktop.js';
import { initTaskbar } from './taskbar.js';
import { initStartMenu } from './startmenu.js';
import { initLauncher } from './launcher.js';
import { verifyTheme } from './themes.js';
import { syncProgman } from './apps/progman.js';
import { on } from './store.js';
import { mountDesktopGadgets } from './apps/gadgets.js';
import { apps, launch } from './apps/registry.js';
import { initMenus } from './menus.js';

async function loadSprite() {
  try {
    const res = await fetch(new URL('../icons/icons.svg', import.meta.url));
    if (res.ok) document.getElementById('sprite').innerHTML = await res.text();
  } catch { /* bez ikon pulpit nadal działa */ }
}

async function boot() {
  await loadSprite();
  await verifyTheme();   // ustawia też cechy układu motywu (data-taskbar, data-start…)
  initWM(document.getElementById('windows'));
  initDesktop(document.getElementById('desk-icons'));
  initTaskbar();
  initMenus();
  mountDesktopGadgets(document.getElementById('gadgets'));
  await initStartMenu();
  await initLauncher();
  syncProgman();
  on('theme:change', syncProgman);
  document.documentElement.classList.add('ready');

  // Link bezpośredni do programu, np. https://snakex21.github.io/#programs
  const openFromHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && apps[id] && !apps[id].href) launch(id);
  };
  openFromHash();
  window.addEventListener('hashchange', openFromHash);
}

boot();
