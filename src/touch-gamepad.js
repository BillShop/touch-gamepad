// touch-gamepad.js — overlay de contrôles tactiles réutilisable pour jeux web (paysage).
// Zéro dépendance, sans build (ES module). Par défaut, chaque contrôle SYNTHÉTISE
// l'événement clavier correspondant → un jeu piloté au clavier fonctionne sans le modifier.
//
// La croix directionnelle se pilote au glissé (le doigt peut passer d'une direction à
// l'autre sans relâcher) et gère les DIAGONALES. Tout est multi-touch : plusieurs doigts
// simultanés (ex. une diagonale + deux boutons d'action) fonctionnent.
//
// Usage minimal :
//   import { createTouchGamepad } from './src/touch-gamepad.js';
//   const pad = createTouchGamepad({ mapping: { A: 'Space', B: 'ArrowUp' }, labels: { A: 'Tir', B: 'Saut' } });
//   // ... plus tard : pad.destroy();

const DEFAULTS = {
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  A: 'Space', B: 'ArrowUp', X: null, Y: null,
  select: 'ShiftLeft', start: 'Enter',
};

const FACES = ['X', 'Y', 'A', 'B'];
const FACE_ASSET = { X: 'btn_blue', Y: 'btn_green', A: 'btn_red', B: 'btn_yellow' };

// Traduit un `code` clavier (KeyboardEvent.code) vers une valeur `key` plausible.
function codeToKey(code) {
  if (code === 'Space') return ' ';
  if (code === 'Enter') return 'Enter';
  if (code.startsWith('Arrow')) return code;
  if (code.startsWith('Shift')) return 'Shift';
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/**
 * Crée un overlay de manette tactile.
 * @param {object} options
 *   mount           élément hôte (défaut document.body)
 *   assetsPath      dossier des PNG (défaut ../assets/ relatif à ce module)
 *   mapping         { up,down,left,right,A,B,X,Y,select,start } → code clavier ou null
 *   labels          libellés d'action optionnels, ex. { A:'Tir', B:'Saut' }
 *   onlyOnTouch     n'afficher que sur écran tactile (défaut true)
 *   synthesizeKeyboard  émettre keydown/keyup (défaut true) — drop-in clavier
 *   keyTarget       cible des événements clavier (défaut window)
 *   onInput         callback (name, pressed) à chaque appui/relâche
 *   dpadDeadzone    rayon mort au centre de la croix, en fraction du rayon (défaut 0.22)
 *   allowDiagonals  autoriser deux directions simultanées sur la croix (défaut true)
 * @returns {{ el, setVisible(v), destroy() }}
 */
export function createTouchGamepad(options = {}) {
  const {
    mount = document.body,
    assetsPath = new URL('../assets/', import.meta.url).href,
    mapping = {},
    labels = {},
    onlyOnTouch = true,
    synthesizeKeyboard = true,
    keyTarget = window,
    onInput = null,
    dpadDeadzone = 0.22,
    allowDiagonals = true,
  } = options;

  const map = { ...DEFAULTS, ...mapping };
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const pressed = new Set();
  const asset = (name) => `${assetsPath}${name}.png`;

  function press(name) {
    if (pressed.has(name)) return;
    pressed.add(name);
    const code = map[name];
    if (code && synthesizeKeyboard) {
      keyTarget.dispatchEvent(new KeyboardEvent('keydown', { code, key: codeToKey(code), bubbles: true, cancelable: true }));
    }
    if (onInput) onInput(name, true);
  }
  function release(name) {
    if (!pressed.has(name)) return;
    pressed.delete(name);
    const code = map[name];
    if (code && synthesizeKeyboard) {
      keyTarget.dispatchEvent(new KeyboardEvent('keyup', { code, key: codeToKey(code), bubbles: true, cancelable: true }));
    }
    if (onInput) onInput(name, false);
  }

  function bind(el, name) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* ok */ }
      el.classList.add('tg-active');
      press(name);
    });
    const up = () => { el.classList.remove('tg-active'); release(name); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  const root = document.createElement('div');
  root.className = 'tg-root';
  if (onlyOnTouch && !isTouch) root.classList.add('tg-hidden');

  const sys = document.createElement('div');
  sys.className = 'tg-sys';
  for (const name of ['select', 'start']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tg-pill tg-${name}`;
    b.innerHTML = `<img src="${asset('pill')}" alt=""><span>${name.toUpperCase()}</span>`;
    bind(b, name);
    sys.appendChild(b);
  }

  // Croix directionnelle : surface unique pilotée au glissé + multi-touch.
  // On calcule la/les direction(s) selon l'angle du doigt autour du centre
  // (8 secteurs → 4 axes + 4 diagonales), avec une zone morte centrale.
  const DIRS = ['up', 'down', 'left', 'right'];
  const dpad = document.createElement('div');
  dpad.className = 'tg-dpad';
  dpad.innerHTML = `<img src="${asset('dpad')}" alt="croix directionnelle">`;
  const hits = {};
  for (const dir of DIRS) {
    const z = document.createElement('div');
    z.className = `tg-hit tg-${dir}`;   // purement visuel : ne capte plus les pointeurs
    dpad.appendChild(z);
    hits[dir] = z;
  }

  // Directions actives pour un point donné (coordonnées client).
  function dpadDirs(clientX, clientY) {
    const r = dpad.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy);
    const dead = (Math.min(r.width, r.height) / 2) * dpadDeadzone;
    const set = new Set();
    if (dist < dead) return set;                     // zone morte : aucune direction
    // Octant 0=droite,1=bas-droite,2=bas,3=bas-gauche,4=gauche,5=haut-gauche,6=haut,7=haut-droite
    const a = (Math.atan2(dy, dx) * 180) / Math.PI;  // -180..180 (y vers le bas)
    const oct = ((Math.round(a / 45) % 8) + 8) % 8;
    const OCTANTS = [
      ['right'], ['down', 'right'], ['down'], ['down', 'left'],
      ['left'], ['up', 'left'], ['up'], ['up', 'right'],
    ];
    for (const d of OCTANTS[oct]) set.add(d);
    if (!allowDiagonals && set.size > 1) {           // garder l'axe dominant
      set.clear();
      set.add(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
    }
    return set;
  }

  // Suivi par pointeur → union des directions tenues par tous les doigts sur la croix.
  const dpadPointers = new Map();  // pointerId → Set<dir>
  function syncDpad() {
    const union = new Set();
    for (const s of dpadPointers.values()) for (const d of s) union.add(d);
    for (const dir of DIRS) {
      const on = union.has(dir);
      hits[dir].classList.toggle('tg-active', on);
      if (on) press(dir); else release(dir);
    }
  }
  dpad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { dpad.setPointerCapture(e.pointerId); } catch { /* ok */ }
    dpadPointers.set(e.pointerId, dpadDirs(e.clientX, e.clientY));
    syncDpad();
  });
  dpad.addEventListener('pointermove', (e) => {
    if (!dpadPointers.has(e.pointerId)) return;
    dpadPointers.set(e.pointerId, dpadDirs(e.clientX, e.clientY));
    syncDpad();
  });
  const dpadUp = (e) => {
    if (!dpadPointers.delete(e.pointerId)) return;
    syncDpad();
  };
  dpad.addEventListener('pointerup', dpadUp);
  dpad.addEventListener('pointercancel', dpadUp);

  const faces = document.createElement('div');
  faces.className = 'tg-faces';
  for (const name of FACES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tg-btn tg-${name}`;
    const act = labels[name] ? `<span class="tg-act">${labels[name]}</span>` : '';
    b.innerHTML = `<img src="${asset(FACE_ASSET[name])}" alt=""><span class="tg-lbl">${name}</span>${act}`;
    bind(b, name);
    faces.appendChild(b);
  }

  root.append(sys, dpad, faces);
  mount.appendChild(root);

  const releaseAll = () => {
    dpadPointers.clear();
    for (const dir of DIRS) hits[dir].classList.remove('tg-active');
    for (const n of [...pressed]) release(n);
  };
  window.addEventListener('blur', releaseAll);

  return {
    el: root,
    setVisible(v) { root.classList.toggle('tg-hidden', !v); },
    destroy() { releaseAll(); window.removeEventListener('blur', releaseAll); root.remove(); },
  };
}
