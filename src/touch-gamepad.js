// touch-gamepad.js — overlay de contrôles tactiles réutilisable pour jeux web (paysage).
// Zéro dépendance, sans build (ES module). Par défaut, chaque contrôle SYNTHÉTISE
// l'événement clavier correspondant → un jeu piloté au clavier fonctionne sans le modifier.
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

  const dpad = document.createElement('div');
  dpad.className = 'tg-dpad';
  dpad.innerHTML = `<img src="${asset('dpad')}" alt="croix directionnelle">`;
  for (const dir of ['up', 'down', 'left', 'right']) {
    const z = document.createElement('div');
    z.className = `tg-hit tg-${dir}`;
    bind(z, dir);
    dpad.appendChild(z);
  }

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

  const releaseAll = () => { for (const n of [...pressed]) release(n); };
  window.addEventListener('blur', releaseAll);

  return {
    el: root,
    setVisible(v) { root.classList.toggle('tg-hidden', !v); },
    destroy() { releaseAll(); window.removeEventListener('blur', releaseAll); root.remove(); },
  };
}
