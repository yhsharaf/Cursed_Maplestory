'use strict';
// Cursed MapleStory: Cuphead's "Ruse of an Ooze" with Goopy Le Grande redrawn as Mano and Cuphead
// redrawn as a random Maple character. World units = Cuphead pixels, y up, camera centred on (0, 0).

// SlimeLevel bounds: left/right 658, bottom 250 -> every root (player, Goopy) stands on y -250
const W = 1280, H = 720, GROUND = -250, FPS = 24, WALL = 658, PWALL = 658 - 25;   // player collider is 50 wide
const cv = document.getElementById('c');
let ctx = cv.getContext('2d');            // swapped briefly while pre-rendering the stage layers
// The canvas backing store matches the real on-screen pixels; everything draws in 1280x720 units through a
// scale transform. (Letting the browser shrink a 1280x720 canvas with nearest-neighbour dropped pixel rows and
// columns, so moving sprites shimmered/flickered.)
let VS = 1, stageCache = null;
// touch device (or ?touch=1): phone controls, lighter art, smaller canvas
const TOUCH = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
window.__touch = TOUCH;
function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  // layout width (clientWidth ignores the 90-degree turn phones get when held upright)
  // capped at 1920 wide: a 150%-scaled screen gave a 2480x1395 canvas, ~3.5 MP redrawn every frame
  const w = Math.min(TOUCH ? 1280 : 1920, Math.max(320, Math.round(cv.clientWidth * dpr))), h = Math.round(w * H / W);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; stageCache = null; }
  VS = cv.width / W;
}
addEventListener('resize', fitCanvas);
const beginFrame = () => ctx.setTransform(VS, 0, 0, VS, 0, 0);

// ── input ────────────────────────────────────────────────────────────────────────────────────
const KEYMAP = {
  ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
  z: 'jump', Z: 'jump', ' ': 'jump', k: 'jump', K: 'jump',
  x: 'shoot', X: 'shoot', j: 'shoot', J: 'shoot',
  Shift: 'dash', l: 'dash', L: 'dash', c: 'lock', C: 'lock', v: 'ex', V: 'ex', e: 'ex', E: 'ex',
  Enter: 'start', r: 'retry', R: 'retry', m: 'mute', M: 'mute', g: 'vhs', G: 'vhs',
};
const held = {}, pressed = {};
let anyKey = false;
addEventListener('keydown', e => {
  const k = KEYMAP[e.key];
  anyKey = true;
  if (!k) return;
  e.preventDefault();
  if (k === 'shoot') { if (!e.repeat) { held.shoot = !held.shoot; if (held.shoot) pressed.shoot = true; } return; }   // fire: on / off switch
  if (!held[k]) pressed[k] = true;
  held[k] = true;
});
addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k && k !== 'shoot') held[k] = false; });
// on-screen buttons (index.html) press the same actions as the keyboard
window.__input = {
  down(k) {
    if (!held[k]) pressed[k] = true; held[k] = true; anyKey = true;
    if (typeof AC !== 'undefined' && AC.state !== 'running') AC.resume();   // phones only allow audio after a touch
  },
  up(k) { held[k] = false; },
  held,
};
addEventListener('blur', () => { for (const k in held) held[k] = false; });

// ── assets ───────────────────────────────────────────────────────────────────────────────────
const A = {};            // atlas -> {imgs, frames, anims}
let LAYOUT = [];
const loadImg = src => new Promise((ok, bad) => { const i = new Image(); i.onload = () => i.decode().then(() => ok(i), () => ok(i)); i.onerror = bad; i.src = src; });

// The game is low-poly only now (poly.js draws it, sound.js plays it). The sprite sheets and the Cuphead-art mode were
// removed; the atlas .json files stay because their frame lists give every animation its exact Cuphead timing.
const ORIG = false;
const POLY = !!window.POLYR;                       // false only if three.js could not load (no internet)
async function loadAtlas(g) {
  const j = await (await fetch(`assets/${g}.json`)).json();
  const imgs = [];                                 // timing data only, no images
  const anims = {};
  for (const n of Object.keys(j.frames)) {
    const m = n.match(/^(.*)_(\d+)$/);
    if (!m) continue;
    (anims[m[1]] = anims[m[1]] || []).push([+m[2], n]);
  }
  for (const k in anims) anims[k] = anims[k].sort((a, b) => a[0] - b[0]).map(x => x[1]);
  A[g] = { imgs, frames: j.frames, anims };
}

function draw(g, name, x, y, o = {}) {
  const a = A[g], f = a && a.frames[name];
  if (!f) return;
  const [si, sx, sy, w, h, ax, ay, k] = f;
  const sc = o.scale || 1;
  ctx.save();
  ctx.translate(Math.round(W / 2 + x + camX), Math.round(H / 2 - y + camY));
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale((o.flip ? -1 : 1) * sc, sc);
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  if (o.op) ctx.globalCompositeOperation = o.op;
  ctx.imageSmoothingEnabled = k < 2; ctx.imageSmoothingQuality = 'medium';   // k >= 2 = Maple pixel art
  ctx.drawImage(a.imgs[si], sx, sy, w, h, -ax * k, -ay * k, w * k, h * k);
  ctx.restore();
}
// distance from a frame's pivot down to the bottom of its art (so feet can stand on GROUND)
const footOff = (g, n) => { const f = A[g].frames[n]; return (f[4] - f[6]) * f[7]; };

// Cuphead's real AnimationClips (frame order, holds, ping-pong, 24/30 fps) decoded by tools/build_clips.py.
// An engine animation name maps to one clip, or to a SEQUENCE: [[clip, seconds?], ...] — each part plays once
// (or for `seconds` if given, looping inside it); the last part loops when the Anim loops.
let CLIPS = {};
const dirClip = d => d === 'straight' ? 'forward' : d;
const SEQ = {
  cuphead_idle: 'idle', cuphead_run: 'run', cuphead_run_shoot: 'run_shoot_forward',
  cuphead_run_shoot_diagonal_up: 'run_shoot_diagonal_up', cuphead_jump: 'jump', cuphead_parry: 'parry',
  cuphead_duck: 'duck_transition_in', cuphead_duck_idle: 'duck_idle',
  cuphead_duck_shoot: [['duck_shooting_fire'], ['duck_shooting_hold']],
  cuphead_dash_pre: 'dash_ground_pre', cuphead_dash: 'dash_ground', cuphead_dash_air_pre: 'dash_air_pre', cuphead_dash_air: 'dash_air',
  cuphead_hit: 'hit_ground', cuphead_hit_air: 'hit_air', cuphead_ghost: 'death_level_idle', cuphead_intro_a: 'intro_cuphead',
  // Goopy, small
  slime_intro: 'small_slime_intro',
  slime_jump: [['small_slime_jump_squish_start'], ['small_slime_jump_squish_loop', 0.3], ['small_slime_jump_squish_end']],
  slime_air_up: 'small_slime_jump_up', slime_up_down_trans: 'small_slime_jump_apex', slime_air_down: 'small_slime_jump_down',
  // punch_cr: start -> Punch_Pre_Hold for preHold (0.65 s) -> strike -> Punch_Hold for mainHold (0.4 s) -> end
  slime_punch: [['small_slime_punch_start'], ['small_slime_punch_pre_hold', 0.65], ['small_slime_punch'], ['small_slime_punch_hold', 0.4], ['small_slime_punch_end']],
  slime_punch_turnseq: [['small_slime_punch_start_turn'], ['small_slime_punch_pre_hold', 0.65], ['small_slime_punch'], ['small_slime_punch_hold', 0.4], ['small_slime_punch_end']],
  slime_air_up_turn: 'small_slime_jump_up_turn', slime_air_down_turn: 'small_slime_jump_down_turn',
  slime_morph: 'small_slime_transform',
  // Goopy, big
  lg_slime_idle: 'big_slime_jump_squish_loop',
  lg_slime_jump: [['big_slime_jump_squish_start'], ['big_slime_jump_squish_loop', 0.3], ['big_slime_jump_squish_end']],
  lg_slime_air_up: 'big_slime_jump_up', lg_slime_up_down_trans: 'big_slime_jump_apex', lg_slime_air_down: 'big_slime_jump_down',
  lg_slime_punch: [['big_slime_punch_start'], ['big_slime_punch_pre_hold', 0.65], ['big_slime_punch'], ['big_slime_punch_hold', 0.4], ['big_slime_punch_end']],
  // big Goopy's first punch winds up with the blinking variant
  lg_slime_punch_first: [['big_slime_punch_blink_start'], ['big_slime_punch_pre_hold', 0.65], ['big_slime_punch'], ['big_slime_punch_hold', 0.4], ['big_slime_punch_end']],
  lg_slime_punch_first_turnseq: [['big_slime_punch_blink_start_turn'], ['big_slime_punch_pre_hold', 0.65], ['big_slime_punch'], ['big_slime_punch_hold', 0.4], ['big_slime_punch_end']],
  lg_slime_punch_turnseq: [['big_slime_punch_start_turn'], ['big_slime_punch_pre_hold', 0.65], ['big_slime_punch'], ['big_slime_punch_hold', 0.4], ['big_slime_punch_end']],
  lg_slime_air_up_turn: 'big_slime_jump_up_turn', lg_slime_air_down_turn: 'big_slime_jump_down_turn',
  lg_slime_death: [['big_slime_death_ground'], ['big_slime_death_loop', 0.8]],
  // tombstone
  slime_tomb_trans: 'tombstone_land',
  // starting to slide from rest / turning round at a wall, then the slide loop
  slime_tomb_go_lt: [['tombstone_move_left_start'], ['tombstone_move_left']],
  slime_tomb_go_rt: [['tombstone_move_right_start'], ['tombstone_move_right']],
  slime_tomb_turn_lt: [['tombstone_turn_right_to_left'], ['tombstone_move_left']],
  slime_tomb_turn_rt: [['tombstone_turn_left_to_right'], ['tombstone_move_right']],
  // smash: start -> pre-hold for anticipationHold (0.35 s, Normal) -> slam
  slime_tomb_smash: [['tombstone_smash_start'], ['tombstone_smash_pre_hold', 0.35], ['tombstone_smash']],
  lg_slime_death_loop: 'big_slime_death_loop',
  slime_tomb_death: 'tombstone_death',
};
for (const d of ['straight', 'up', 'down', 'diagonal_up', 'diagonal_down']) {
  SEQ['cuphead_shoot_' + d] = [['shoot_' + dirClip(d) + '_fire'], ['shoot_' + dirClip(d) + '_hold']];
  SEQ['cuphead_aim_' + d] = 'locked_' + dirClip(d);
  SEQ['cuphead_ex_' + d] = 'ex_' + dirClip(d) + '_ground';
  SEQ['cuphead_ex_' + d + '_air'] = 'ex_' + dirClip(d) + '_air';
}

class Anim {
  constructor(g, name, loop = true, fps = FPS) {
    this.g = g; this.name = name; this.loop = loop; this.fps = fps; this.t = 0;
    const seq = SEQ[name];
    const parts = seq == null ? null : (typeof seq === 'string' ? [[seq]] : seq);
    if (parts && parts.every(p => CLIPS[p[0]])) {
      this.parts = parts.map(([c, sec]) => ({ name: c, clip: CLIPS[c], dur: sec != null ? sec : CLIPS[c].len }));
      this.len = this.parts.reduce((a, p) => a + p.dur, 0);
    } else {
      this.frames = A[g].anims[name] || [];
      if (!this.frames.length) console.warn('missing anim', g, name);
      this.len = this.frames.length / fps;
    }
  }
  // which part of a sequence we are in, and the time inside it
  get pos() {
    let t = this.t;
    if (this.parts) {
      const last = this.parts.length - 1;
      for (let p = 0; p <= last; p++) {
        const part = this.parts[p];
        if (t < part.dur || p === last) {
          if (p === last && t >= part.dur) t = this.loop ? (t % part.clip.len) : part.dur - 1e-4;
          return { seg: p, t };
        }
        t -= part.dur;
      }
    }
    return { seg: 0, t };
  }
  get seg() { return this.pos.seg; }
  get part() { return this.parts ? this.parts[this.pos.seg].name : this.name; }   // clip name now playing
  get i() {                                         // frame / key index (used for hit timing)
    if (!this.parts) { const n = Math.floor(this.t * this.fps); return this.loop ? n % this.frames.length : Math.min(n, this.frames.length - 1); }
    let n = 0; const { seg, t } = this.pos;
    for (let p = 0; p < seg; p++) n += this.parts[p].clip.keys.length;
    return n + this.keyIndex(this.parts[seg].clip, t);
  }
  keyIndex(c, t, keys = c.keys) {
    const lt = c.len > 0 ? t % c.len : 0;
    let k = 0;
    while (k + 1 < keys.length && keys[k + 1][0] <= lt + 1e-6) k++;
    return k;
  }
  // a second sprite layer of the clip (e.g. the tombstone slam's "Front"); null = hidden / not animated
  layer(name) {
    if (!this.parts) return null;
    const { seg, t } = this.pos, c = this.parts[seg].clip, keys = c.layers && c.layers[name];
    return keys && keys.length ? keys[this.keyIndex(c, t, keys)][1] : null;
  }
  get done() { return !this.loop && this.t >= this.len; }
  get frame() {
    if (!this.parts) return this.frames[this.i];
    const { seg, t } = this.pos, c = this.parts[seg].clip;
    return c.keys[this.keyIndex(c, t)][1];
  }
  update(dt) { this.t += dt; }
}

// ── audio ────────────────────────────────────────────────────────────────────────────────────
const AC = new (window.AudioContext || window.webkitAudioContext)();
const master = AC.createGain(); master.connect(AC.destination);
const SND = {};
let music = null, muted = false;
// low-poly version: our own synthesized sound (sound.js) instead of Cuphead's / MapleStory's audio files
const OWN_SOUND = POLY && !!window.SYNTH;
if (OWN_SOUND) SYNTH.init(AC, master);
async function loadAudio() {
  if (OWN_SOUND) return;
  const list = await (await fetch('audio/list.json')).json();
  await Promise.all(list.map(async n => {
    try { SND[n] = await AC.decodeAudioData(await (await fetch(`audio/${n}.ogg`)).arrayBuffer()); } catch (e) { console.warn('audio', n, e); }
  }));
}
function sfx(base, vol = 0.7, rate = 1) {
  if (OWN_SOUND) { SYNTH.play(base, vol, rate); return; }
  const opts = Object.keys(SND).filter(k => k === base || k.startsWith(base + '_') && /^_\w{1,4}$/.test(k.slice(base.length)));
  if (!opts.length) return;
  const src = AC.createBufferSource(); src.buffer = SND[opts[Math.floor(Math.random() * opts.length)]];
  src.playbackRate.value = rate;
  const g = AC.createGain(); g.gain.value = vol; src.connect(g); g.connect(master); src.start();
}
function playMusic() {
  if (OWN_SOUND) { SYNTH.music(); return; }
  if (music || !SND.mus_slime) return;
  music = AC.createBufferSource(); music.buffer = SND.mus_slime; music.loop = true;
  const g = AC.createGain(); g.gain.value = 0.45; music.connect(g); g.connect(master); music.start();
}

// ── world state ──────────────────────────────────────────────────────────────────────────────
let camX = 0, camY = 0, shakeT = 0, shakeAmp = 0;
let mode = 'loading', modeT = 0, fx = [], bullets = [], dmgNums = [];
let P, B, bannerAnim = null, totalHp = 0, dealt = 0;
const shake = (t, a) => { shakeT = Math.max(shakeT, t); shakeAmp = Math.max(shakeAmp, a); };
function spawnFx(g, name, x, y, o = {}) {
  if (POLY) POLYR.fx(g, name, x, y, o);
  if (!A[g].anims[name]) return;
  fx.push({ anim: new Anim(g, name, false, o.fps || FPS), x, y, flip: o.flip, rot: o.rot, front: o.front, vx: o.vx || 0, vy: o.vy || 0 });
}
const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

// ── player (cursed Maple character on Cuphead's skeleton) ───────────────────────────────────
const AIM = { straight: [1, 0], up: [0, 1], down: [0, -1], diagonal_up: [0.7071, 0.7071], diagonal_down: [0.7071, -0.7071] };
// LevelPlayerWeaponManager.ProjectilePosition.Get (Cuphead, not Chalice): bullet spawn per pose, from the root
const GUN = { straight: [78, 64], up: [27, 158], diagonal_up: [71, 107], diagonal_down: [71, 20], down: [28, -11] };
const GUN_RUN = { straight: [70, 46], diagonal_up: [73, 107] };
const GUN_AIR = { straight: [78, 64], up: [0, 158], diagonal_up: [71, 107], diagonal_down: [71, 20], down: [0, -11] };
const GUN_DUCK = [102, 24], GUN_EX = [0, 54];
// LevelPlayerColliderManager on the player prefab: [centre y, width, height] from the root
const PCOL = { default: [62, 50, 105], air: [57, 50, 50], ducking: [25, 50, 35], dashing: [55, 100, 45] };

function newPlayer() {
  return { x: -350, y: GROUND, vx: 0, vy: 0, face: 1, ground: true, hp: 5, inv: 0, hitT: 0, dashT: 0, dashPre: 0,
    airDash: true, parried: false, parryT: 0, shootCD: 0, shootAlt: 0, exT: 0, exFired: false, exDir: 'straight',
    card: 0, ducking: false, anim: new Anim('player', 'cuphead_intro_a', false), state: 'intro', jumpHeld: false, ghostY: 0 };
}

function setPA(name, loop = true, keep = false) {
  if (P.anim.name === name) return;
  const t = P.anim.t;
  P.anim = new Anim('player', name, loop);
  if (keep) P.anim.t = t;
}

function aimDir(lockOrAir) {
  const h = (held.right ? 1 : 0) - (held.left ? 1 : 0), v = (held.up ? 1 : 0) - (held.down ? 1 : 0);
  if (v > 0) return h ? 'diagonal_up' : 'up';
  if (v < 0 && lockOrAir) return h ? 'diagonal_down' : 'down';
  return 'straight';
}

function fire(dir, ex) {
  const [gx, gy] = ex ? GUN_EX : !P.ground ? GUN_AIR[dir] : P.ducking ? GUN_DUCK : (P.vx && GUN_RUN[dir]) || GUN[dir];
  const [dx, dy] = AIM[dir];
  const vx = dx * P.face, vy = dy;
  const x = P.x + gx * P.face, y = P.y + gy;
  const rot = -Math.atan2(vy, vx);
  if (ex) {
    bullets.push({ x, y, vx: vx * 1250, vy: vy * 1250, rot, dmg: 30, ex: true, life: 1.6,
      anim: new Anim('pfx', 'weapon_peashot_EX_intro', false), loopName: 'weapon_peashot_EX_loop' });
    spawnFx('pfx', 'weapon_ex_dust_a', P.x - P.face * 30, P.y + 40, { flip: P.face < 0 });
    sfx('sfx_player_ex_forward_ground', 0.7); sfx('maple_slashblast', 0.5);
    shake(0.15, 6);
  } else {
    const wob = (P.shootAlt ^= 1) ? 7 : -7;
    bullets.push({ x: x - vy * wob, y: y + vx * wob * 0.6, vx: vx * 1800, vy: vy * 1800, rot, dmg: 4, life: 0.9,
      anim: new Anim('pfx', 'weapon_peashot_main') });
    spawnFx('pfx', 'weapon_peashot_intro_' + (P.shootAlt ? 'a' : 'b'), x, y, { rot, front: true });
    if (Math.random() < 0.35) sfx('sfx_player_weapon_peashot', 0.18, 0.95 + Math.random() * 0.1);
  }
}

function hurtPlayer() {
  if (P.inv > 0 || P.hp <= 0 || mode !== 'fight') return;
  P.hp--; P.inv = 2.0; P.hitT = 0.25; P.dashT = 0; P.exT = 0;
  sfx('sfx_player_hit', 0.8); shake(0.25, 10);
  spawnFx('pfx', 'player_hitFX' + 'abc'[Math.floor(Math.random() * 3)], P.x, P.y + 55, { front: true });
  if (P.hp <= 0) {
    P.state = 'dead'; P.anim = new Anim('player', 'cuphead_ghost'); P.ghostY = P.y;
    sfx('sfx_player_death', 0.8); sfx('maple_tombstone', 0.8);
    mode = 'dead'; modeT = 0; bannerAnim = null;
  } else {
    P.vy = P.ground ? 0 : 300;
    setPA(P.ground ? 'cuphead_hit' : 'cuphead_hit_air', false);
  }
}

function updatePlayer(dt) {
  if (P.state === 'dead') { P.anim.update(dt); P.ghostY += 110 * dt; return; }
  P.inv = Math.max(0, P.inv - dt);
  if (P.state === 'intro') {
    P.anim.update(dt);
    if (P.anim.done) { P.state = 'play'; setPA('cuphead_idle'); }
    return;
  }
  const canAct = mode === 'fight';
  const hdir = canAct ? (held.right ? 1 : 0) - (held.left ? 1 : 0) : 0;

  if (P.hitT > 0) {                                   // knocked: brief stun
    P.hitT -= dt; P.anim.update(dt);
    P.vy -= 4800 * dt; P.y += P.vy * dt;
    if (P.y <= GROUND) { P.y = GROUND; P.vy = 0; P.ground = true; }
    return;
  }
  if (P.dashT > 0) {                                  // dash: fixed speed, no gravity
    P.dashT -= dt; P.anim.update(dt);
    if (P.anim.done) setPA(P.ground ? 'cuphead_dash' : 'cuphead_dash_air');
    P.x = Math.max(-PWALL, Math.min(PWALL, P.x + P.face * 1150 * dt));
    if (P.dashT <= 0) { P.vy = 0; if (P.ground) setPA('cuphead_idle'); }
    return;
  }
  if (P.exT > 0) {                                    // EX move: freeze, fire on the big frame
    P.exT -= dt; P.anim.update(dt);
    if (!P.exFired && P.anim.i >= (P.ground ? 4 : 1)) { P.exFired = true; fire(P.exDir, true); }
    if (!P.ground) { P.y = Math.max(GROUND, P.y); }
    if (P.exT <= 0) setPA(P.ground ? 'cuphead_idle' : 'cuphead_jump');
    return;
  }

  // jump / parry
  if (canAct && pressed.jump) {
    if (P.ground && !(held.down && !held.lock && pressed.dash)) {
      P.vy = 1560; P.ground = false; P.jumpHeld = true; P.parried = false;
      sfx('sfx_player_jump', 0.5);
      spawnFx('pfx', 'cuphead_jump_dust_b', P.x, P.y - 8);
    } else if (!P.ground && !P.parried) {
      P.parried = true; P.parryT = 8 / FPS; setPA('cuphead_parry', false);
      sfx('sfx_player_parry_slap', 0.4);
    }
  }
  if (!held.jump) P.jumpHeld = false;
  if (!P.jumpHeld && P.vy > 450) P.vy = 450;          // short hop

  // dash
  if (canAct && pressed.dash && (P.ground || P.airDash)) {
    if (hdir) P.face = hdir;
    if (!P.ground) P.airDash = false;
    P.dashT = 0.3; P.anim = new Anim('player', P.ground ? 'cuphead_dash_pre' : 'cuphead_dash_air_pre', false);
    sfx('sfx_player_dash', 0.6);
    spawnFx('pfx', 'player_dashDustA', P.x, P.y + 20, { flip: P.face < 0 });
    return;
  }

  // EX
  const lockOrAir = held.lock || !P.ground;
  if (canAct && pressed.ex && P.card >= 1) {
    if (hdir) P.face = hdir;
    P.card -= 1; P.exFired = false;
    P.exDir = aimDir(true);
    if (P.exDir === 'down' && P.ground) P.exDir = 'straight';
    const nm = `cuphead_ex_${P.exDir}${P.ground ? '' : '_air'}`;
    P.anim = new Anim('player', nm, false); P.exT = P.anim.len;
    P.vy = 0;
    return;
  }

  // movement
  P.ducking = canAct && P.ground && held.down && !held.lock;
  if (hdir) P.face = hdir;
  P.vx = (held.lock || P.ducking) ? 0 : hdir * 490;
  P.x = Math.max(-PWALL, Math.min(PWALL, P.x + P.vx * dt));
  if (!P.ground) {
    P.vy -= 4800 * dt; P.y += P.vy * dt;
    if (P.y <= GROUND) {
      P.y = GROUND; P.vy = 0; P.ground = true; P.airDash = true;
      sfx('sfx_player_land_ground', 0.4);
      spawnFx('pfx', 'playerDust' + 'ABCDEF'[Math.floor(Math.random() * 6)], P.x + 1, P.y - 8);
    }
  }
  if (P.parryT > 0) P.parryT -= dt;

  // shooting
  const dir = P.ducking ? 'straight' : aimDir(lockOrAir);
  const shooting = canAct && held.shoot;
  P.shootCD -= dt;
  if (shooting && P.shootCD <= 0) { P.shootCD = 0.115; fire(dir, false); }

  // animation
  if (!P.ground) setPA(P.parryT > 0 ? 'cuphead_parry' : 'cuphead_jump', P.parryT <= 0);
  else if (P.ducking) {
    if (P.anim.name === 'cuphead_duck' && !P.anim.done) {}
    else if (!P.anim.name.startsWith('cuphead_duck')) setPA('cuphead_duck', false);
    else setPA(shooting ? 'cuphead_duck_shoot' : 'cuphead_duck_idle');
  } else if (P.vx) setPA(shooting ? (dir === 'diagonal_up' ? 'cuphead_run_shoot_diagonal_up' : 'cuphead_run_shoot') : 'cuphead_run', true, true);
  else if (shooting) setPA('cuphead_shoot_' + dir);
  else if (held.lock) setPA('cuphead_aim_' + dir);
  else setPA('cuphead_idle');
  P.anim.update(dt);
}

function playerBox() {
  const [cy, w, h] = P.dashT > 0 ? PCOL.dashing : !P.ground ? PCOL.air : P.ducking ? PCOL.ducking : PCOL.default;
  return [P.x - w / 2, P.y + cy - h / 2, P.x + w / 2, P.y + cy + h / 2];
}

function drawPlayer() {
  // the Cuphead sprite child sits at the player's root (0, 0): draw the sprite origin right at P
  if (P.state === 'dead') {
    draw('player', P.anim.frame, P.x, P.ghostY + 40, { flip: P.face < 0, alpha: 0.85 });
    return;
  }
  if (P.inv > 0 && Math.floor(P.inv * 20) % 2) return;     // invincibility blink
  draw('player', P.anim.frame, P.x, P.y, { flip: P.face < 0 });
}

// ── boss: Goopy Le Grande's brain wearing Mano's face ───────────────────────────────────────
// B.x = the boss object's root x (Goopy: body centre; tombstone: its centre), B.y = Goopy's feet (GROUND when
// landed). Sprite offsets are the scene's own (level20): Goopy's Sprite child sits at (-126, +184) from his root,
// mirrored with him, so turning never moves his body; the Tombstone's Sprite child sits at (-35, 0).
// LevelProperties.Slime (Normal): 1200 HP; big Goopy from 76 %, tombstone from 31 %
const BOSS_HP = 1200, TO_BIG = 0.76 * BOSS_HP, TO_TOMB = 0.31 * BOSS_HP;
const GOOPY = {                          // LevelProperties.Slime.Jump / Punch (Normal) + SlimeLevelSlime fields
  1: { delay: 0.2, high: [2350, 840, 6500], low: [2000, 780, 6500], jumps: [5, 8], maxX: 560, punchMax: 200, punchMin: -1000,
       pattern: 'HJ,LJ,HJ,LJ,D.5,LJ,RJ,HJ,LJ,HJ,LJ,LJ,HJ,RJ,LJ,LJ' },
  2: { delay: 0.3, high: [2850, 820, 7500], low: [2250, 760, 7500], jumps: [5, 8], maxX: 500, punchMax: 200, punchMin: -425,
       pattern: 'HJ,HJ,LJ,HJ,RJ,LJ,D.5,LJ,HL,LJ,RJ,HJ,LJ,LJ,HJ,LJ,LJ', firstPunchAfter: 2 },
};
const PUNCH_TURN_AT = { small_slime_punch_start_turn: 0.25, big_slime_punch_start_turn: 0.292, big_slime_punch_blink_start_turn: 0.25 };
const TOMB = { groundY: -80, startY: 550, fallTime: 0.2, crushY: 70, maxX: 500, speed: 950, attackDelay: [2, 4],
  offsets: [-130, 70, 0, 130, -70, 0] }; // LevelProperties.Slime.Tombstone (Normal) + SlimeLevelTombstone code
function bossOrigin(phase, flip) {
  if (phase === 3) return [B.x - 35, B.tombY];
  return [B.x - 126 * (flip ? -1 : 1), B.y + 184];
}
function newBoss() {
  return { phase: 1, hp: BOSS_HP, x: 369, y: GROUND, pi: 0, jumpsLeft: 0, firstPunchLeft: 0, firstPunchDone: false,
    wantsToTransform: false, dieOnLand: false, goingUp: false, speedX: 0, gravity: 6500, vx: 0, vy: 0, face: -1, dir: -1, state: 'intro', t: 0,
    anim: new Anim('boss', 'slime_intro', false), jumps: 0, flash: 0, hits: 0, wait: 0, turning: false,
    turnPunch: false, tombY: TOMB.groundY, maxJumps: 3, tombAt: 0, offsetIndex: Math.floor(Math.random() * 6),
    slideFrom: 0, slideTo: 0, slideT: 0, slideDur: 0, wantsToSmash: false, smashTimer: 0, offset: 0,
    crushed: false, bigX: 0, bigFace: -1, dealDamage: false, hittable: true, events: {} };
}
const setBA = (name, loop = true) => { if (B.anim.name !== name) B.anim = new Anim('boss', name, loop); };

// ── Cuphead's own hitboxes (tools/extract_colliders.py -> assets/colliders.json) ──────────────
// Each boss object has circles / boxes on its root (offsets mirrored when Goopy faces right). Clips animate them:
// the punch throws the body circle forward and stretches + rotates the arm box, the slam drops the stone's circle
// to the floor. A value the playing clip doesn't animate falls back to the scene's value (Unity write-defaults).
let COL = null;
function colVal(key, base) {
  const part = B.anim.parts ? B.anim.part : null, c = part && COL && COL.clips[part];
  const arr = c && c.curves[key];
  if (!arr) return base;
  const t = B.anim.pos.t, lt = c.len > 0 ? t % (c.len + 1e-9) : 0;
  return arr[Math.min(arr.length - 1, Math.floor(lt * COL.rate))];
}
function bossShapes() {
  const out = [];
  if (B.phase === 3) {
    if (B.state === 'tombfall') return out;
    out.push({ c: [B.x + colVal('|Circle|m_Offset.x', 0), B.tombY + colVal('|Circle|m_Offset.y', 170), colVal('|Circle|m_Radius', 100)] });
    return out;
  }
  if (B.state === 'tombfall' || B.state === 'lgdeath') return out;
  const s = B.face > 0 ? -1 : 1, rx = B.x, ry = B.y;               // art faces left: facing right mirrors x
  const base = B.phase === 1 ? [0, 75, 80] : [0, 130, 80];
  if (colVal('|Circle|m_Enabled', 1) > 0.5)
    out.push({ c: [rx + s * colVal('|Circle|m_Offset.x', base[0]), ry + colVal('|Circle|m_Offset.y', base[1]), colVal('|Circle|m_Radius', base[2])] });
  if (B.phase === 2) out.push({ c: [rx, ry + 130, 160] });           // big Goopy's second, unanimated body circle
  const arm = B.phase === 1 ? 'ArmCollider|' : '|';
  const ox = colVal(arm + 'Box|m_Offset.x', 0), oy = colVal(arm + 'Box|m_Offset.y', 0);
  const w = colVal(arm + 'Box|m_Size.x', 1), h = colVal(arm + 'Box|m_Size.y', 1);
  if (w > 2 && h > 2) {
    const a = colVal(arm + 'Transform|angle', 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    out.push({ p: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const lx = ox + u * w / 2, ly = oy + v * h / 2;
      return [rx + s * (lx * ca - ly * sa), ry + (lx * sa + ly * ca)];
    }) });
  }
  return out;
}
function bossHittable() {
  if (B.state === 'dead' || B.state === 'morph' || B.state === 'lgdeath' || B.state === 'tombfall' || B.state === 'tombland') return false;
  return B.phase < 3 || B.hittable;                    // the slam switches the stone's damage receiver off
}
function bossDealsDamage() {
  if (B.state === 'dead' || B.state === 'lgdeath' || B.state === 'morph' || B.state === 'intro' || B.state === 'tombfall') return false;
  return B.phase < 3 || B.dealDamage;                  // Goopy hurts on any contact; the stone only while slamming
}
function shapeHasPoint(sh, x, y) {
  if (sh.c) return (x - sh.c[0]) ** 2 + (y - sh.c[1]) ** 2 <= sh.c[2] ** 2;
  let inside = false;
  for (let i = 0, j = sh.p.length - 1; i < sh.p.length; j = i++) {
    const [xi, yi] = sh.p[i], [xj, yj] = sh.p[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function shapeHitsBox(sh, b) {                           // b = [x0, y0, x1, y1]
  if (sh.c) {
    const nx = Math.max(b[0], Math.min(sh.c[0], b[2])), ny = Math.max(b[1], Math.min(sh.c[1], b[3]));
    return (nx - sh.c[0]) ** 2 + (ny - sh.c[1]) ** 2 <= sh.c[2] ** 2;
  }
  const box = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
  const axes = [[1, 0], [0, 1]];
  for (let i = 0; i < sh.p.length; i++) {
    const [x0, y0] = sh.p[i], [x1, y1] = sh.p[(i + 1) % sh.p.length];
    axes.push([y0 - y1, x1 - x0]);
  }
  for (const [axx, axy] of axes) {                     // separating axis test
    const pr = pts => pts.map(([x, y]) => x * axx + y * axy);
    const a = pr(box), c = pr(sh.p);
    if (Math.max(...a) < Math.min(...c) || Math.max(...c) < Math.min(...a)) return false;
  }
  return true;
}

function damageBoss(d, x, y) {
  if (B.state === 'dead' || B.hp <= 0) return;
  B.hp -= d; dealt += d; B.flash = 0.05; B.hits++;
  if (B.phase === 1 && B.hp <= TO_BIG) B.wantsToTransform = true;      // Transform(): morphs on a landing near the middle
  if (B.phase === 2 && B.hp <= TO_TOMB) B.dieOnLand = true;
  P.card = Math.min(5, P.card + d / 45);
  if (B.hits % 9 === 0) sfx('maple_mano_damage', 0.45, 0.8 + Math.random() * 0.5);
  if (!ORIG && (d >= 10 || Math.random() < 0.18)) dmgNums.push({ x: x + (Math.random() - 0.5) * 40, y, v: Math.round(d * (37 + Math.random() * 30)), t: 0, crit: d >= 10 });
}

function bossLand(big) {
  B.y = GROUND; B.vy = 0; B.speedX = 0;
  if (big) { sfx('sfx_slime_big_land', 0.8); shake(0.3, 14); spawnFx('bfx', 'lg_slime_dust_a', B.x, B.y + 12); }
  else { sfx('sfx_slime_small_land', 0.6); shake(0.12, 5); spawnFx('bfx', 'smDustA', B.x, B.y - 13); }
}

function updateBoss(dt) {
  B.anim.update(dt); B.flash = Math.max(0, B.flash - dt);
  const px = P.x;
  const airborne = B.state === 'air';

  if (B.phase === 3 && B.hp <= 0 && B.state !== 'dead') {
    B.state = 'dead'; B.anim = new Anim('boss', 'slime_tomb_death');
    sfx('sfx_slime_tombstone_death', 0.9); sfx('maple_mano_die', 0.9);
    knockout();
  }

  const pre = B.phase === 1 ? 'slime_' : 'lg_slime_', G = GOOPY[B.phase];
  switch (B.state) {
    case 'intro':
      if (B.anim.i === 3 && !B.said) { B.said = true; sfx('sfx_slime_small_intro_anim', 0.6); }
      if (B.anim.done) startJumping();
      break;
    case 'hop':                                       // squish start -> squish loop for the ground delay -> squish end
      if (B.anim.done) {
        const c = G.pattern[B.pi];
        const high = c[0] === 'H' || (c[0] === 'R' && Math.random() < 0.5);
        const [vy, vx, g] = high ? G.high : G.low;
        B.vy = vy; B.speedX = vx; B.gravity = g; B.dir = B.face; B.goingUp = true;
        B.state = 'air'; B.anim = new Anim('boss', pre + 'air_up');
        sfx(B.phase === 1 ? 'sfx_slime_small_jump' : 'sfx_slime_big_jump', 0.6);
      }
      break;
    case 'air': {
      B.vy -= B.gravity * dt; B.y += B.vy * dt; B.x += B.dir * B.speedX * dt;
      if (B.vy < 0 && B.goingUp) {                     // "Apex"
        B.goingUp = false;
        if (!B.turning) B.anim = new Anim('boss', pre + 'up_down_trans', false);
      }
      // hit maxX: snap to it, reverse; if already falling, drop straight down (speedX 0); turn_cr flips at the end
      if (!B.turning && ((B.dir < 0 && B.x <= -G.maxX) || (B.dir > 0 && B.x >= G.maxX))) {
        B.x = B.dir * G.maxX; B.dir = -B.dir;
        if (!B.goingUp) B.speedX = 0;
        B.turning = true; B.anim = new Anim('boss', pre + (B.goingUp ? 'air_up_turn' : 'air_down_turn'), false);
      }
      if (B.turning) {
        if (B.anim.done) { B.turning = false; B.face = B.dir; B.anim = new Anim('boss', pre + (B.goingUp ? 'air_up' : 'air_down')); }
      } else if (B.anim.name === pre + 'up_down_trans' && B.anim.done) B.anim = new Anim('boss', pre + 'air_down');
      if (B.y <= GROUND) {
        if (B.turning) { B.turning = false; B.face = B.dir; }
        bossLand(B.phase === 2);
        onLanding();
      }
      break;
    }
    case 'punch': {
      const part = B.anim.part, flipAt = PUNCH_TURN_AT[part];
      if (B.turnPunch && flipAt != null && B.anim.pos.t >= flipAt) { B.turnPunch = false; B.face = -B.face; B.dir = B.face; }
      if (/slime_punch$/.test(part) && !B.said) {
        B.said = true;
        if (B.phase === 1) sfx('sfx_slime_small_stretch_punch', 0.7);
        else { sfx('sfx_slime_big_punch', 0.8); sfx('sfx_slime_big_punch_voice', 0.7); shake(0.2, 8); }
      }
      if (B.anim.done) {
        if (B.dieOnLand) { startBigDeath(); break; }
        startJumping();
      }
      break;
    }
    case 'idle':
      B.wait -= dt; if (B.wait <= 0) startJumping();
      break;
    case 'morph':
      if (B.anim.done) {
        B.phase = 2; B.state = 'idle'; B.wait = 0; B.anim = new Anim('boss', 'lg_slime_idle');
        B.firstPunchLeft = GOOPY[2].firstPunchAfter; B.firstPunchDone = false;
        if (B.hp <= TO_TOMB) B.dieOnLand = true;
      }
      break;
    case 'lgdeath':                                    // big Goopy collapses, then keeps wobbling while the stone drops
      if (B.anim.done) {
        B.state = 'tombfall'; B.bigX = B.x; B.bigFace = B.face; B.crushed = false;
        B.anim = new Anim('boss', 'lg_slime_death_loop');
        B.x = Math.max(-TOMB.maxX, Math.min(TOMB.maxX, B.x)); B.tombY = TOMB.startY; B.tombAt = 0;
        sfx('sfx_slime_tombstone_drop_onto_slime', 1); sfx('maple_tombstone', 0.9);
      }
      break;
    case 'tombfall':                                   // intro_cr: linear drop 550 -> -80 in 0.2 s
      B.tombAt += dt;
      B.tombY = TOMB.startY + (TOMB.groundY - TOMB.startY) * Math.min(1, B.tombAt / TOMB.fallTime);
      if (!B.crushed && B.tombY <= TOMB.crushY) {      // crush_slime_cr: big Goopy bursts as the stone passes y 70
        B.crushed = true; shake(0.7, 20);
        spawnFx('boss', 'lg_slime_explode', B.bigX, GROUND + 270, { flip: B.bigFace > 0 });
        spawnFx('boss', 'big_lg_slime_explode', B.bigX, GROUND + 220, { flip: B.bigFace > 0, front: true });
      }
      if (B.tombAt >= TOMB.fallTime) {
        B.tombY = TOMB.groundY; B.phase = 3; B.state = 'tombland';
        B.anim = new Anim('boss', 'slime_tomb_trans', false);           // tombstone_land
        spawnFx('bfx', 'slime_tomb_dust', B.x, TOMB.groundY);
      }
      break;
    case 'tombland':
      if (B.anim.done) startTombMove(true);
      break;
    case 'tombmove': {                                  // move_cr: eased slides wall to wall at moveSpeed
      B.slideT += dt;
      const u = Math.min(1, B.slideT / B.slideDur), e = 0.5 - 0.5 * Math.cos(Math.PI * u);   // easeInOutSine
      B.x = B.slideFrom + (B.slideTo - B.slideFrom) * e;
      B.smashTimer -= dt;
      if (B.smashTimer <= 0) B.wantsToSmash = true;
      if (B.finalPass) {                               // stops as soon as it passes the player + this round's offset
        const target = P.x + B.offset;
        if ((B.dir > 0 && B.x > target) || (B.dir < 0 && B.x < target) || u >= 1) {
          B.x = Math.max(-TOMB.maxX, Math.min(TOMB.maxX, u >= 1 ? B.x : target));
          startTombSmash(); break;
        }
      } else if (u >= 1) {                             // reached a wall: turn round, then the next slide
        B.dir = -B.dir;
        startSlide(B.wantsToSmash, false);
      }
      if (B.slideSfx <= 0) { B.slideSfx = 0.42; sfx('sfx_slime_tombstone_slide', 0.35); } else B.slideSfx -= dt;
      break;
    }
    case 'tombsmash': {                                 // smash_cr + the slam clip's animation events
      const part = B.anim.part, t = B.anim.pos.t;
      if (part === 'tombstone_smash_pre_hold' && !B.events.pre) {
        B.events.pre = true; sfx('sfx_slime_tombstone_splat', 0.9); sfx('sfx_slime_tombstone_splat_start', 0.7);
      }
      if (part === 'tombstone_smash') {
        B.hittable = !(t >= 0.125 && t < 0.5);
        B.dealDamage = t >= 0.167 && t < 0.458;
        if (t >= 0.208 && !B.events.hit) {             // OnSmash: camera shake 30 / 0.7 s, slam dust front + back
          B.events.hit = true; shake(0.7, 30);
          spawnFx('bfx', 'slime_tomb_smash_dust', B.x, TOMB.groundY, { front: true });
          spawnFx('bfx', 'slime_tomb_smash_dust_bk', B.x, TOMB.groundY);
        }
      }
      if (B.anim.done) { B.dealDamage = false; B.hittable = true; startTombMove(false); }
      break;
    }
    case 'dead':
      break;
  }
}

// jump_cr start: random place in the jump pattern, 5-8 jumps before the next punch
function startJumping() {
  const G = GOOPY[B.phase];
  if (typeof G.pattern === 'string') G.pattern = G.pattern.split(',').map(x => x.trim());
  B.pi = Math.floor(Math.random() * G.pattern.length);
  B.jumpsLeft = G.jumps[0] + Math.floor(Math.random() * (G.jumps[1] - G.jumps[0] + 1));
  startHop();
}
function startHop() {                    // Goopy keeps hopping the way he faces; only walls turn him around
  const G = GOOPY[B.phase];
  if (typeof G.pattern === 'string') G.pattern = G.pattern.split(',').map(x => x.trim());
  let delay = G.delay;
  if (G.pattern[B.pi][0] === 'D') {                     // "D.5": this squish waits 0.5 s instead
    delay = parseFloat(G.pattern[B.pi].slice(1)) || G.delay;
    B.pi = (B.pi + 1) % G.pattern.length;
  }
  B.state = 'hop'; B.said = false; B.dir = B.face;
  B.anim = new Anim('boss', B.phase === 1 ? 'slime_jump' : 'lg_slime_jump', false);
  B.anim.parts[1].dur = delay;                         // Jump_Squish_Loop is held for the ground delay
  B.anim.len = B.anim.parts.reduce((a, q) => a + q.dur, 0);
}
function onLanding() {                   // jump_cr, after touching the ground
  const G = GOOPY[B.phase];
  if (B.phase === 1 && B.wantsToTransform && Math.abs(B.x) < 350) {
    B.state = 'morph'; B.anim = new Anim('boss', 'slime_morph', false);
    sfx('sfx_slime_small_transform', 0.8); sfx('maple_mano_skill', 0.7);
    return;
  }
  if (B.phase === 2 && B.dieOnLand) { startBigDeath(); return; }
  B.pi = (B.pi + 1) % G.pattern.length;
  if (B.phase === 2 && !B.firstPunchDone) {             // big Goopy's first punch comes after 2 jumps
    if (--B.firstPunchLeft <= 0) { B.firstPunchDone = true; startPunch(true); return; }
  } else if (--B.jumpsLeft <= 0 && inPunchPosition()) { startPunch(false); return; }
  startHop();
}
function inPunchPosition() {             // he needs room: punching right only from x < 200, left only from x > -200
  const G = GOOPY[B.phase];
  return P.x > B.x ? (B.x < G.punchMax && B.x > G.punchMin) : (B.x > -G.punchMax && B.x < -G.punchMin);
}
function startPunch(first) {
  B.said = false; B.state = 'punch';
  B.turnPunch = (P.x > B.x ? 1 : -1) !== B.face;        // flips at the clip's PunchTurn event (see 'punch')
  const pre = B.phase === 1 ? 'slime_' : 'lg_slime_';
  B.anim = new Anim('boss', pre + 'punch' + (first ? '_first' : '') + (B.turnPunch ? '_turnseq' : ''), false);
}
function startBigDeath() {
  B.dieOnLand = false; B.state = 'lgdeath'; B.anim = new Anim('boss', 'lg_slime_death', false);
  sfx('sfx_slime_big_death_voice', 0.8); sfx('maple_mano_die', 0.6, 0.7);
}
// StartMove: random direction, next attack offset, a fresh 2-4 s countdown to the next smash
function startTombMove(first) {
  B.state = 'tombmove'; B.dir = Math.random() < 0.5 ? -1 : 1;
  B.offsetIndex = (B.offsetIndex + 1) % TOMB.offsets.length; B.offset = TOMB.offsets[B.offsetIndex];
  B.wantsToSmash = false;
  B.smashTimer = TOMB.attackDelay[0] + Math.random() * (TOMB.attackDelay[1] - TOMB.attackDelay[0]);
  if (first) sfx('sfx_slime_tombstone_taunts', 0.7);
  startSlide(false, true);
}
function startSlide(finalPass, fromRest) {
  B.finalPass = finalPass;
  B.slideFrom = B.x; B.slideTo = B.dir * TOMB.maxX; B.slideT = 0; B.slideSfx = 0;
  B.slideDur = Math.max(0.05, Math.abs(B.slideTo - B.slideFrom) / TOMB.speed);
  const side = B.dir < 0 ? 'lt' : 'rt';
  B.anim = new Anim('boss', (fromRest ? 'slime_tomb_go_' : 'slime_tomb_turn_') + side);
}
function startTombSmash() {
  B.state = 'tombsmash'; B.events = {};
  B.anim = new Anim('boss', 'slime_tomb_smash', false);
}

function drawBoss() {
  const flip = B.phase < 3 && B.face > 0;               // Goopy's art faces left
  // Goopy's real shadow sits on the floor under his sprite origin (scene: y -60), smaller the higher he is
  if (B.phase < 3 && B.state !== 'lgdeath' && B.state !== 'tombfall') {
    const h = Math.max(0, B.y - GROUND), sh = A.bfx.anims[B.phase === 1 ? 'slime_shadow' : 'lg_slime_shadow'];
    if (sh) draw('bfx', sh[Math.min(sh.length - 1, Math.floor(h / 70))], B.x - 129 * (flip ? -1 : 1), GROUND + 187, { flip });  // Shadow child (-129, 187)
  }
  const name = B.anim.frame;
  if (B.state === 'tombfall') {                     // dying big Goopy until the stone bursts him, stone falling
    if (!B.crushed) draw('boss', name, B.bigX - 126 * (B.bigFace > 0 ? -1 : 1), GROUND + 184, { flip: B.bigFace > 0 });
    draw('boss', 'slime_tomb_fall_0001', B.x - 35, B.tombY);
    return;
  }
  if (B.phase === 3 && B.state === 'tombmove') {    // dirt kicked up under the sliding stone (Dirt child: 0, -70)
    const dirt = A.bfx.anims.slime_tomb_groundfx_dirt;
    if (dirt) draw('bfx', dirt[Math.floor(stageT * FPS) % dirt.length], B.x, TOMB.groundY - 70, { flip: B.dir < 0 });
  }
  const [ox, oy] = bossOrigin(B.phase, flip);
  const alpha = B.state === 'dead' ? Math.max(0, 1 - Math.max(0, modeT - 1.2) / 1.5) : 1;
  const front = B.phase === 3 ? B.anim.layer('Front') : null;     // Front child sits where the Sprite child does
  for (const n of [name, front]) {
    if (!n) continue;                                // a blank key hides that layer (the stone vanishes on impact)
    draw('boss', n, ox, oy, { flip, alpha });
    if (B.flash > 0) draw('boss', n, ox, oy, { flip, alpha: 0.18, op: 'lighter' });
  }
}

// ── bullets / fx ─────────────────────────────────────────────────────────────────────────────
function updateBullets(dt) {
  const shapes = bossHittable() ? bossShapes() : [];
  for (const b of bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.anim.update(dt);
    if (b.loopName && b.anim.done) b.anim = new Anim('pfx', b.loopName);
    if (!b.dead && shapes.some(sh => shapeHasPoint(sh, b.x, b.y))) {
      b.dead = true; damageBoss(b.dmg, b.x, b.y);
      spawnFx('pfx', b.ex ? 'weapon_peashot_EX_death' : 'weapon_peashot_death', b.x, b.y, { rot: b.rot, front: true });
      if (b.ex) shake(0.15, 8);
    }
    if (b.y < GROUND - 30 && !b.dead) { b.dead = true; spawnFx('pfx', 'weapon_peashot_death', b.x, GROUND - 25, { front: true }); }
  }
  bullets = bullets.filter(b => !b.dead && b.life > 0 && Math.abs(b.x) < 760 && b.y < 480);
}
function updateFx(dt) {
  for (const f of fx) { f.anim.update(dt); f.x += f.vx * dt; f.y += f.vy * dt; }
  fx = fx.filter(f => !f.anim.done);
  for (const d of dmgNums) { d.t += dt; d.y += 60 * dt; }
  dmgNums = dmgNums.filter(d => d.t < 0.9);
}

// ── stage ────────────────────────────────────────────────────────────────────────────────────
const LAYER_ORDER = { 1476054201: 0, 0: 1, 1109567125: 2, 723413933: 6, 1332646295: 7 };
let BACK = [], FRONT = [], stageT = 0;
function buildStage() {
  const items = LAYOUT.filter(r => r.root === 'LevelArt' && (A.bg.frames[r.sprite]))
    .map(r => ({ ...r, L: LAYER_ORDER[r.layer] ?? 5 }))
    .sort((a, b) => a.L - b.L || a.order - b.order);
  BACK = items.filter(r => r.L < 7); FRONT = items.filter(r => r.L >= 7);
}
function drawStage(list) {
  for (const r of list) {
    let n = r.sprite;
    if (n.startsWith('slime_bg_stream_')) n = A.bg.anims.slime_bg_stream[Math.floor(stageT * 12) % A.bg.anims.slime_bg_stream.length];
    draw('bg', n, r.x, r.y, { scale: Math.abs(r.sx), flip: r.sx < 0 });
  }
}
// The stage never changes except the stream, so the back and front layers are drawn once into canvases at
// the real canvas size (was ~4.5 ms of huge textures every frame).
function renderLayer(list) {
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  const keep = ctx, kx = camX, ky = camY;
  ctx = c.getContext('2d'); camX = camY = 0;
  ctx.setTransform(VS, 0, 0, VS, 0, 0);
  drawStage(list);
  ctx = keep; camX = kx; camY = ky;
  return c;
}
function stageLayer(which) {
  if (!stageCache) {
    const isStream = r => r.sprite.startsWith('slime_bg_stream_');
    stageCache = { back: renderLayer(BACK.filter(r => !isStream(r))), stream: BACK.filter(isStream), front: renderLayer(FRONT) };
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(stageCache[which], Math.round(camX * VS), Math.round(camY * VS));
  ctx.restore();
  if (which === 'back') drawStage(stageCache.stream);     // the stream sits right above the back layer
}

// ── cursed post-processing ───────────────────────────────────────────────────────────────────
const grain = [];
function makeGrain() {
  for (let n = 0; n < 6; n++) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const g = c.getContext('2d'), d = g.createImageData(320, 180);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = Math.random() < 0.5 ? 60 : 0;
    }
    for (let s = 0; s < 6; s++) {                     // film scratches / hairs
      const x = Math.random() * 320;
      for (let y = 0; y < 180; y++) { const i = (y * 320 + Math.floor(x + Math.sin(y / 9) * 1.5)) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = 20; d.data[i + 3] = 90; }
    }
    g.putImageData(d, 0, 0); grain.push(c);
  }
}
let vignette = null;
let tearT = 3, tear = 0, vhsOn = false;          // VHS tear glitch: off by default, G toggles
function postFx(dt) {
  ctx.save();
  if (!ORIG) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(232, 205, 160, 1)'; ctx.globalAlpha = 0.28; ctx.fillRect(0, 0, W, H); }
  // grain: plain alpha blend ('overlay' over the whole screen cost ~4 ms a frame)
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ORIG ? 0.12 : 0.22;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(grain[Math.abs(Math.floor(stageT * FPS)) % grain.length], 0, 0, W, H);
  ctx.globalAlpha = 1;
  if (!vignette) {
    vignette = document.createElement('canvas'); vignette.width = 640; vignette.height = 360;
    const g = vignette.getContext('2d'), vg = g.createRadialGradient(320, 180, 126, 320, 180, 342);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, ORIG ? 'rgba(25,10,0,0.45)' : 'rgba(25,10,0,0.75)');
    g.fillStyle = vg; g.fillRect(0, 0, 640, 360);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(vignette, 0, 0, W, H);
  // cursed VHS tear: a band of the frame slides sideways for a moment
  tearT -= dt;
  if (tearT <= 0) { tear = vhsOn ? 0.12 + Math.random() * 0.1 : 0; tearT = 2 + Math.random() * 5; }
  if (tear > 0) {
    tear -= dt;
    for (let i = 0; i < 3; i++) {
      const y = Math.random() * H, h = 6 + Math.random() * 40, dx = (Math.random() - 0.5) * 60;
      ctx.drawImage(cv, 0, y * VS, cv.width, h * VS, dx, y, W, h);
    }
  }
  ctx.restore();
}

// ── HUD / banners ────────────────────────────────────────────────────────────────────────────
function drawUIFrame(name, x, y, scale = 1, alpha = 1) {     // UI in screen pixels, (x, y) = frame centre
  const f = A.ui.frames[name]; if (!f) return;
  const [si, sx, sy, w, h] = f;
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(A.ui.imgs[si], sx, sy, w, h, x - w * scale / 2, y - h * scale / 2, w * scale, h * scale);
  ctx.restore();
}
function drawHUD() {
  const hpName = P.hp <= 0 ? 'hud_hp_dead' : (P.hp === 1 && Math.floor(stageT * 6) % 2 ? 'hud_hp_1_flash_0001' : `hud_hp_${P.hp}`);
  drawUIFrame(hpName, 70, H - 36, 1.3);
  for (let i = 0; i < 5; i++) {
    const fill = Math.max(0, Math.min(1, P.card - i)), x = 140 + i * 30, y = H - 38;
    if (fill >= 1) drawUIFrame('hud_ch_card_flip_0006', x, y, 1.3);
    else if (fill > 0) {
      const f = A.ui.frames.hud_ch_card_flip_0001, [si, sx, sy, w, h] = f, s = 1.3;
      ctx.save(); ctx.beginPath(); ctx.rect(x - 20, y + h * s / 2 - h * s * fill, 40, h * s * fill); ctx.clip();
      ctx.drawImage(A.ui.imgs[si], sx, sy, w, h, x - w * s / 2, y - h * s / 2, w * s, h * s); ctx.restore();
    }
  }
  // Maple-style damage numbers on the boss (cursed)
  ctx.save(); ctx.textAlign = 'center'; ctx.font = 'bold 30px "Arial Black", Impact, sans-serif'; ctx.lineWidth = 5;
  for (const d of dmgNums) {
    const a = 1 - Math.max(0, d.t - 0.5) / 0.4;
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#3a1500'; ctx.fillStyle = d.crit ? '#ff4040' : '#ffb028';
    const x = W / 2 + d.x + camX, y = H / 2 - d.y + camY;
    ctx.strokeText(d.v, x, y); ctx.fillText(d.v, x, y);
  }
  ctx.restore();
}
function drawBanner(name, alpha = 1) {
  if (name) drawUIFrame(name, W / 2, H / 2, name.startsWith('FightText') ? 2.5 : 0.95, alpha);   // FightText is a 512x288 full-screen card
}

// ── modes ────────────────────────────────────────────────────────────────────────────────────
function startFight() {
  P = newPlayer(); B = newBoss(); fx = []; bullets = []; dmgNums = []; dealt = 0;
  totalHp = BOSS_HP;
  mode = 'ready'; modeT = 0; bannerAnim = new Anim('ui', 'FightText_GetReady', false);
  sfx('sfx_level_announcer_0001', 0.9);
  setTimeout(() => { if (mode === 'ready') sfx('sfx_level_announcer_0002', 0.9); }, 1300);
  playMusic();
}
function knockout() {
  mode = 'ko'; modeT = 0; bannerAnim = new Anim('ui', 'FightText_KO', false);
  sfx('sfx_level_knockout_boom_01', 1); sfx('sfx_level_announcer_knockout_0004', 1);
  setTimeout(() => sfx('sfx_level_knockout_bell', 0.8), 400);
  setTimeout(() => sfx('maple_levelup', 0.9), 1800);
}

let last = performance.now(), slow = 1;
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // first rAF stamp can predate load
  try { if (!window.__paused) tick(dt); } finally { requestAnimationFrame(frame); }   // __paused: tests step by hand
}
function tick(dt) {
  stageT += dt;
  if (pressed.mute) { muted = !muted; master.gain.value = muted ? 0 : 1; }
  if (pressed.vhs) vhsOn = !vhsOn;

  if (mode === 'loading' || mode === 'title') {
    drawTitle(dt);
    if (mode === 'title' && anyKey) { AC.resume(); startFight(); }
  } else {
    modeT += dt;
    slow = mode === 'ko' && modeT < 1.2 ? 0.25 : 1;
    const sdt = dt * slow;
    if (mode === 'ready') { bannerAnim.update(dt); if (bannerAnim.done) { mode = 'fight'; bannerAnim = null; } }
    if (bannerAnim && mode !== 'ready') bannerAnim.update(dt);
    updatePlayer(sdt);
    if (mode !== 'ready') updateBoss(sdt); else B.anim.update(sdt * (B.anim.i < 2 ? 1 : 0.0001));
    updateBullets(sdt); updateFx(sdt);
    if (mode === 'fight' && bossDealsDamage() && bossShapes().some(sh => shapeHitsBox(sh, playerBox()))) hurtPlayer();
    if ((mode === 'dead' && modeT > 2.5) || (mode === 'ko' && modeT > 4.5)) {
      if (pressed.jump || pressed.start || pressed.retry || pressed.shoot) startFight();
    }
    if (mode === 'dead' && !bannerAnim && modeT > 0.8) bannerAnim = new Anim('ui', 'you_died_text', false);
    render(dt);
  }
  for (const k in pressed) delete pressed[k];
  anyKey = false;
}

function render(dt) {
  beginFrame();
  if (shakeT > 0) { shakeT -= dt; camX = (Math.random() - 0.5) * shakeAmp; camY = (Math.random() - 0.5) * shakeAmp; } else { camX = camY = 0; shakeAmp = 0; }
  ctx.imageSmoothingEnabled = false;
  if (POLY) {                                         // 3D scene on the canvas behind; this one only keeps the HUD
    ctx.clearRect(0, 0, W, H);
    // Cuphead's banner cards become 3D polygon text (their animations still time the fight)
    let banner = null;
    if (bannerAnim && !(mode === 'ko' && bannerAnim.done)) {
      const p = Math.min(1, bannerAnim.t / (bannerAnim.len || 1)), n = bannerAnim.name;
      banner = n === 'FightText_GetReady' ? { text: p < 0.55 ? 'READY?' : 'WALLOP!', p: p < 0.55 ? p / 0.55 : (p - 0.55) / 0.45, kind: 'pop' }
        : { text: n === 'FightText_KO' ? 'KNOCKOUT!' : 'YOU DIED', p, kind: 'hold' };
    }
    POLYR.frame(dt, { P, B, bullets, camX, camY, banner, shapes: B.state === 'dead' ? [] : bossShapes() });
    if (OWN_SOUND) SYNTH.mood(B.phase, mode);
    if (window.DEBUG_BOXES) debugBoxes();
    POLYR.ui.hud(ctx, P, dmgNums, stageT, camX, camY, W, H);
    const again = TOUCH ? 'TAP TO FIGHT AGAIN' : 'Z / ENTER TO FIGHT AGAIN';
    if (mode === 'dead' && modeT > 2.5)
      POLYR.ui.panel(ctx, 'MANO STILL STANDS', `PROGRESS ${Math.round(Math.min(1, dealt / totalHp) * 100)}%  -  PHASE ${B.phase} OF 3`, again, Math.min(1, dealt / totalHp), stageT, W, H);
    if (mode === 'ko' && modeT > 4)
      POLYR.ui.panel(ctx, 'MANO KNOCKED OUT!', `${dealt.toFixed(0)} DAMAGE  -  HP LEFT ${P.hp}`, again, null, stageT, W, H);
    return;
  }
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  stageLayer('back');
  for (const f of fx) if (!f.front) draw(f.anim.g, f.anim.frame, f.x, f.y, { flip: f.flip, rot: f.rot });
  drawBoss();
  drawPlayer();
  for (const b of bullets) draw('pfx', b.anim.frame, b.x, b.y, { rot: b.rot });
  for (const f of fx) if (f.front) draw(f.anim.g, f.anim.frame, f.x, f.y, { flip: f.flip, rot: f.rot });
  stageLayer('front');
  if (window.DEBUG_BOXES) debugBoxes();
  postFx(dt);
  drawHUD();
  if (bannerAnim && !(mode === 'ko' && bannerAnim.done)) drawBanner(bannerAnim.frame);
  if (mode === 'dead' && modeT > 2.5) drawDeathCard();
  if (mode === 'ko' && modeT > 4) drawWin();
}

function debugBoxes() {
  ctx.save(); ctx.lineWidth = 2;
  const box = (b, c) => { if (!b) return; ctx.strokeStyle = c; ctx.strokeRect(W / 2 + b[0] + camX, H / 2 - b[3] + camY, b[2] - b[0], b[3] - b[1]); };
  box(playerBox(), '#0f0');
  ctx.strokeStyle = bossDealsDamage() ? '#f00' : '#ff0';
  for (const sh of bossShapes()) {
    ctx.beginPath();
    if (sh.c) ctx.arc(W / 2 + sh.c[0] + camX, H / 2 - sh.c[1] + camY, sh.c[2], 0, 7);
    else sh.p.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](W / 2 + x + camX, H / 2 - y + camY));
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}

function panel(lines, sub) {
  ctx.save();
  ctx.fillStyle = 'rgba(15, 8, 4, 0.82)'; ctx.fillRect(W / 2 - 330, H / 2 + 70, 660, 150);
  ctx.strokeStyle = '#d8c39a'; ctx.lineWidth = 3; ctx.strokeRect(W / 2 - 330, H / 2 + 70, 660, 150);
  ctx.textAlign = 'center'; ctx.fillStyle = '#f3e3c0';
  ctx.font = 'bold 34px Georgia, serif'; ctx.fillText(lines, W / 2, H / 2 + 120);
  ctx.font = '22px Georgia, serif'; ctx.fillText(sub, W / 2, H / 2 + 165);
  ctx.font = '16px Georgia, serif'; ctx.fillStyle = '#bba57a'; ctx.fillText('Z / Enter to fight again', W / 2, H / 2 + 200);
  ctx.restore();
}
function drawDeathCard() {
  const pct = Math.min(1, dealt / totalHp);
  panel('MANO STILL STANDS', `progress ${(pct * 100).toFixed(0)}%   ·   phase ${B.phase} of 3`);
  const x0 = W / 2 - 260, x1 = W / 2 + 260, y = H / 2 + 92;
  ctx.save(); ctx.strokeStyle = '#d8c39a'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.restore();
  const run = A.ui.anims.deathcard_ch_run; drawUIFrame(run[Math.floor(stageT * FPS) % run.length], x0 + (x1 - x0) * pct, y - 4, 0.28);
}
function drawWin() {
  panel('MANO HAS BEEN KNOCKED OUT', `${dealt.toFixed(0)} damage · HP left ${P.hp}`);
}

// title screen
function drawTitle(dt) {
  beginFrame();
  if (POLY) {                                          // 3D title: logo + the two of them in the forest
    ctx.clearRect(0, 0, W, H); POLYR.frame(dt, { title: true });
    POLYR.ui.title(ctx, stageT, TOUCH, mode === 'loading', W, H);
    return;
  }
  ctx.fillStyle = '#120a05'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.textAlign = 'center';
  ctx.fillStyle = '#f0dcb0'; ctx.font = 'bold 76px Georgia, serif';
  const j = () => (Math.random() - 0.5) * 3;
  ctx.fillText('CURSED MAPLESTORY', W / 2 + j(), 150 + j());
  ctx.font = 'italic 30px Georgia, serif'; ctx.fillStyle = '#c9a66b';
  ctx.fillText('in  "Ruse of a Mano"', W / 2, 200);
  if (mode === 'title') {
    camX = camY = 0;
    const p = A.player.anims.cuphead_idle, b = A.boss.anims.slime_jump;
    if (!POLY) {
      draw('player', p[Math.floor(stageT * FPS) % p.length], -260, -120, {});
      draw('boss', b[Math.floor(stageT * FPS) % b.length], 260, -90, {});
    }
    ctx.font = '24px Georgia, serif'; ctx.fillStyle = Math.floor(stageT * 2) % 2 ? '#f0dcb0' : '#8a7550';
    ctx.fillText(TOUCH ? 'TAP TO START' : 'PRESS ANY KEY', W / 2, 560);
    ctx.font = '16px Georgia, serif'; ctx.fillStyle = '#a08a60';
    if (!TOUCH) ctx.fillText('Arrows/WASD move · Z/Space jump (again in air = parry) · X/J shoot · Shift/L dash · C lock aim · V/E EX · M mute' + (POLY ? '' : ' · G glitch FX'), W / 2, 640);
  } else {
    ctx.font = '24px Georgia, serif'; ctx.fillStyle = '#8a7550'; ctx.fillText('summoning Mano…', W / 2, 560);
  }
  ctx.restore();
  if (grain.length && !POLY) postFx(dt);
}

// ── boot ─────────────────────────────────────────────────────────────────────────────────────
(async () => {
  makeGrain();
  fitCanvas();
  requestAnimationFrame(frame);
  if (!POLY) {                                     // the 3D library comes from the internet
    ctx.fillStyle = '#120a05'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#f0dcb0'; ctx.font = '28px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText('Cursed MapleStory needs an internet connection to load its 3D engine.', W / 2, H / 2);
    window.__paused = true; return;
  }
  await Promise.all(['boss', 'bfx', 'player', 'pfx', 'ui'].map(loadAtlas));
  CLIPS = await (await fetch('assets/clips.json')).json();
  COL = await (await fetch('assets/colliders.json')).json();
  if (!POLY) buildStage();
  for (const g in A) for (const img of A[g].imgs) ctx.drawImage(img, 0, 0, 1, 1);   // GPU upload now, not mid-fight
  await loadAudio();
  mode = 'title';
  // debug hook: __game.sim(seconds) steps the game at 60 Hz even when the tab is in the background
  window.__game = { get P() { return P; }, get B() { return B; }, get mode() { return mode; }, A,
    sim(sec) { for (let i = 0; i < sec * 60; i++) tick(1 / 60); }, press(k) { pressed[k] = true; held[k] = true; anyKey = true; }, release(k) { held[k] = false; } };
})();
