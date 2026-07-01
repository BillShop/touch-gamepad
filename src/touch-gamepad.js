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
 *   dpadDiagonalWidth  largeur angulaire d'un coin diagonal, en degrés (défaut 30) — plus
 *                   petit = directions pures plus larges, diagonales plus difficiles à viser
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
    dpadDiagonalWidth = 30,
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

  // Centres angulaires (0 = droite, 90 = bas, 180 = gauche, 270 = haut ; y vers le bas).
  const CARDINALS = [
    { c: 0, d: ['right'] }, { c: 90, d: ['down'] }, { c: 180, d: ['left'] }, { c: 270, d: ['up'] },
  ];
  const DIAGONALS = [
    { c: 45, d: ['down', 'right'] }, { c: 135, d: ['down', 'left'] },
    { c: 225, d: ['up', 'left'] }, { c: 315, d: ['up', 'right'] },
  ];
  const angDiff = (a, b) => { const d = Math.abs(a - b); return d > 180 ? 360 - d : d; };

  // Directions actives pour un point donné (coordonnées client). Chaque coin diagonal
  // occupe `dpadDiagonalWidth` degrés ; le reste va à la cardinale la plus proche → les
  // directions pures sont plus larges (60° par défaut) que les diagonales (30°).
  function dpadDirs(clientX, clientY) {
    const r = dpad.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const dead = (Math.min(r.width, r.height) / 2) * dpadDeadzone;
    const set = new Set();
    if (Math.hypot(dx, dy) < dead) return set;       // zone morte : aucune direction
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;    // -180..180
    if (a < 0) a += 360;                             // 0..360
    const half = allowDiagonals ? dpadDiagonalWidth / 2 : 0;
    let dirs = DIAGONALS.find((g) => angDiff(a, g.c) <= half)?.d;   // dans un coin ?
    if (!dirs) {                                                    // sinon cardinale la plus proche
      dirs = CARDINALS.reduce((best, g) => (angDiff(a, g.c) < angDiff(a, best.c) ? g : best)).d;
    }
    for (const d of dirs) set.add(d);
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
