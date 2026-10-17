'use strict';
// Low-poly (PS1-style) renderer for Cursed MapleStory. game.js keeps every rule, timing and hitbox of Cuphead's fight;
// this file only draws that state with flat-shaded three.js models instead of sprites. World units = Cuphead pixels
// (y up, ground at -250); 1 three.js unit = 100 px, the fight plane is z = 0 and the camera frames it exactly, so what
// you see lines up with the hitboxes. Mano's body even follows his animated collider circle and the punch glove sits
// on the end of his arm box.
window.POLYR = (() => {
  const U = 0.01, GY = -2.5, BIG = 1.15;                                // world px -> units, ground height
  const glc = document.getElementById('p');
  const R = new THREE.WebGLRenderer({ canvas: glc, antialias: true });
  R.setPixelRatio(1);
  // sharp, smooth polygons at the screen's real resolution (capped so big / high-DPI screens stay fast)
  function fit() {
    const w = Math.min(window.__touch ? 1600 : 2400, Math.round(glc.clientWidth * (devicePixelRatio || 1))) || 1280;
    R.setSize(w, Math.round(w * 9 / 16), false);
  }
  addEventListener('resize', fit);

  const S = new THREE.Scene();
  const SKY = 0xa9d9c6;
  S.background = new THREE.Color(SKY);
  S.fog = new THREE.Fog(SKY, 18, 42);
  const FOV = 32, D = 3.6 / Math.tan(FOV / 2 * Math.PI / 180);   // z = 0 plane shows exactly 12.8 x 7.2 units
  const C = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 80);
  C.position.set(0, 0, D);
  S.add(new THREE.HemisphereLight(0xfff4dc, 0x5a6e3a, 0.55));
  const sun = new THREE.DirectionalLight(0xfff0d0, 0.85); sun.position.set(-4, 7, 6); S.add(sun);
  const rim = new THREE.DirectionalLight(0x9fb6ff, 0.3); rim.position.set(5, 2, -4); S.add(rim);

  // ── helpers ───────────────────────────────────────────────────────────────────────────────
  const shared = {};
  const mat = c => shared[c] || (shared[c] = new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  function kit() {                                              // per-model materials, so one model can flash alone
    const m = {}, list = [];
    const get = c => { if (!m[c]) { m[c] = new THREE.MeshLambertMaterial({ color: c, flatShading: true, transparent: true }); list.push(m[c]); } return m[c]; };
    get.flash = (col, k) => { for (const x of list) { x.emissive.setHex(col); x.emissiveIntensity = k; } };
    get.alpha = a => { for (const x of list) { x.opacity = a; x.depthWrite = a > 0.99; } };
    return get;
  }
  function mk(parent, geo, m, p, s, r) {
    const o = new THREE.Mesh(geo, typeof m === 'number' ? mat(m) : m);
    if (p) o.position.set(p[0], p[1], p[2]); if (s) o.scale.set(s[0], s[1], s[2]); if (r) o.rotation.set(r[0], r[1], r[2]);
    parent.add(o); return o;
  }
  const grp = (parent, p) => { const g = new THREE.Group(); if (p) g.position.set(p[0], p[1], p[2]); parent.add(g); return g; };
  const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
  let rng = 7;
  const rnd = () => (rng = (rng * 16807) % 2147483647) / 2147483647;

  // ── stage: Goopy's forest, in polygons ────────────────────────────────────────────────────
  const stage = grp(S);
  const water = [];
  (function buildStage() {
    mk(stage, new THREE.BoxGeometry(26, 0.14, 7), 0x6fb24a, [0, GY - 0.07, -1.6]);              // grass top
    mk(stage, new THREE.BoxGeometry(26, 2.4, 7), 0x7a5233, [0, GY - 1.34, -1.6]);              // dirt
    mk(stage, new THREE.BoxGeometry(26, 0.5, 0.2), 0x5f9a3c, [0, GY - 0.2, 1.9]);              // grass lip
    for (let i = 0; i < 70; i++) {                                                               // tufts
      const x = -11 + rnd() * 22, z = -3.5 + rnd() * 5.2;
      mk(stage, new THREE.ConeGeometry(0.07 + rnd() * 0.06, 0.18 + rnd() * 0.22, 3), rnd() < 0.5 ? 0x5a9c38 : 0x84c45a, [x, GY + 0.08, z], null, [0, rnd() * 3, (rnd() - 0.5) * 0.4]);
    }
    for (let i = 0; i < 16; i++) {                                                               // flowers
      const x = -10 + rnd() * 20, z = -3.2 + rnd() * 1.6, g = grp(stage, [x, GY, z]);
      mk(g, new THREE.CylinderGeometry(0.015, 0.015, 0.25, 3), 0x3f7a2c, [0, 0.12, 0]);
      mk(g, new THREE.TetrahedronGeometry(0.07, 0), [0xf3a0b0, 0xffe066, 0xffffff][i % 3], [0, 0.27, 0]);
    }
    // the stream behind the fight
    mk(stage, new THREE.BoxGeometry(26, 0.04, 1.1), 0x5fb3d6, [0, GY + 0.005, -3.3]);
    for (let i = 0; i < 26; i++) water.push(mk(stage, new THREE.BoxGeometry(0.35 + rnd() * 0.5, 0.02, 0.05), 0xd8f2ff, [-13 + rnd() * 26, GY + 0.04, -3.7 + rnd() * 0.8]));
    for (let i = 0; i < 18; i++) mk(stage, ico(0.12 + rnd() * 0.1, 0), 0x9c9a8e, [-12 + rnd() * 24, GY + 0.04, -2.7 - rnd() * 0.15], [1, 0.6, 1]);
    // mushrooms
    const mush = (x, z, s, cap) => {
      const g = grp(stage, [x, GY, z]); g.scale.setScalar(s);
      mk(g, new THREE.CylinderGeometry(0.16, 0.22, 0.6, 6), 0xf2e8d2, [0, 0.3, 0]);
      mk(g, new THREE.SphereGeometry(0.5, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), cap, [0, 0.55, 0], [1, 0.8, 1]);
      for (let k = 0; k < 5; k++) { const a = k * 1.3; mk(g, new THREE.DodecahedronGeometry(0.07, 0), 0xffffff, [Math.cos(a) * 0.3, 0.83 + (k % 2) * 0.02, Math.sin(a) * 0.3]); }
    };
    mush(-5.2, -2.2, 0.9, 0xd6453b); mush(-4.5, -2.6, 0.55, 0xe0703a); mush(4.8, -2.3, 1.1, 0xd6453b);
    mush(5.7, -2.0, 0.6, 0xc23a6b); mush(-1.6, -4.6, 0.7, 0xd6453b); mush(2.2, -5.0, 0.8, 0xe0703a);
    // trees, near to far
    const tree = (x, z, s, c) => {
      const g = grp(stage, [x, GY, z]); g.scale.setScalar(s);
      mk(g, new THREE.CylinderGeometry(0.28, 0.45, 4.2, 6), 0x6b4a2f, [0, 2.1, 0]);
      mk(g, new THREE.CylinderGeometry(0.12, 0.2, 1.4, 5), 0x6b4a2f, [0.55, 3.3, 0], null, [0, 0, -0.8]);
      mk(g, ico(1.5, 0), c, [0, 4.6, 0], [1, 0.9, 1]);
      mk(g, ico(1.1, 0), c === 0x3f8a3a ? 0x57a84a : 0x3f8a3a, [1.0, 4.1, 0.3]);
      mk(g, ico(1.0, 0), 0x2f6b2c, [-0.9, 4.0, -0.2]);
    };
    tree(-6.9, -1.4, 1.0, 0x3f8a3a); tree(7.1, -1.6, 1.05, 0x57a84a);
    for (let i = 0; i < 14; i++) tree(-13 + i * 2 + rnd() * 1.2, -6 - rnd() * 4, 0.8 + rnd() * 0.5, rnd() < 0.5 ? 0x3f8a3a : 0x4f9a40);
    for (let i = 0; i < 9; i++) mk(stage, ico(3 + rnd() * 2, 0), rnd() < 0.5 ? 0x4c8a5a : 0x5f9a6a, [-22 + i * 5.5, GY - 0.5, -20 - rnd() * 4], [1.6, 0.8, 1]);
    // clouds
    for (let i = 0; i < 6; i++) {
      const g = grp(stage, [-14 + i * 5.5, 2.8 + rnd() * 1.6, -14]); g.userData.cloud = 0.15 + rnd() * 0.2;
      for (let k = 0; k < 4; k++) mk(g, new THREE.DodecahedronGeometry(0.6 + rnd() * 0.5, 0), 0xffffff, [k * 0.7 - 1, rnd() * 0.3, rnd() * 0.3]);
    }
    // foreground bushes at the bottom corners (in front of the fight, like Cuphead's front layer)
    for (const sx of [-1, 1]) {
      mk(stage, ico(0.9, 0), 0x3f8a3a, [sx * 6.9, GY - 0.55, 2.2], [1.3, 0.9, 1]);
      mk(stage, ico(0.6, 0), 0x57a84a, [sx * 6.1, GY - 0.75, 2.6]);
    }
  })();

  // ── shadows ─────────────────────────────────────────────────────────────────────────────
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x1b2a12, transparent: true, opacity: 0.35, depthWrite: false });
  const blob = () => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 10), shadowMat); m.rotation.x = -Math.PI / 2; S.add(m); return m; };
  const bossShadow = blob(), playerShadow = blob();

  // ── Mano ────────────────────────────────────────────────────────────────────────────────
  function manoFace(parent, M, k = 1) {                         // eyes + brows + mustache, facing -x
    const f = grp(parent);
    const lids = [];
    for (const z of [-0.27, 0.27]) {
      lids.push(mk(f, new THREE.SphereGeometry(0.33, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.62), M(0x9a6b44), [-1.12, 1.42, z], [1, 1.15, 1], [0, 0, 0.35]));
      mk(f, new THREE.CylinderGeometry(0.34, 0.34, 0.06, 6), M(0x7a5234), [-1.2, 1.24, z], null, [0, 0, 0.35]);
      mk(f, new THREE.SphereGeometry(0.2, 6, 4), M(0xc8d6e8), [-1.33, 1.15, z]);
      mk(f, new THREE.SphereGeometry(0.07, 4, 3), M(0x1a1a2a), [-1.5, 1.14, z]);
      for (let i = 0; i < 4; i++) mk(f, new THREE.DodecahedronGeometry(0.12, 0), M(0xffffff), [-1.15 + Math.cos(i * 1.6) * 0.13, 1.8 + Math.sin(i * 2.1) * 0.04, z + Math.sin(i * 1.6) * 0.13]);
    }
    const stache = [];
    for (const sgn of [-1, 1]) {
      const pts = [[-1.45, 0.98, 0.05 * sgn], [-1.55, 0.8, 0.28 * sgn], [-1.5, 0.45, 0.42 * sgn], [-1.38, 0.15, 0.4 * sgn], [-1.25, 0.08, 0.22 * sgn], [-1.28, 0.24, 0.14 * sgn], [-1.4, 0.22, 0.2 * sgn]].map(p => new THREE.Vector3(...p));
      stache.push(mk(f, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.11, 5, false), M(0xdcd8cc)));
      mk(f, ico(0.17, 0), M(0xdcd8cc), [-1.48, 0.9, 0.16 * sgn]);
    }
    f.scale.setScalar(k);
    return { f, lids, stache };
  }
  function makeMano() {
    const M = kit();
    const root = grp(S), yaw = grp(root), squash = grp(yaw);
    const body = grp(squash, [0, 0.21, 0]);                   // model's own feet sit at y -0.21: lift to 0
    mk(body, ico(1, 1), M(0xf4dcc0), [0.15, 0.35, 0], [1.55, 0.55, 0.85]);
    mk(body, ico(1, 1), M(0xf7e3c8), [-0.85, 0.95, 0], [0.62, 0.8, 0.62]);
    mk(body, new THREE.CylinderGeometry(0.9, 1.15, 0.18, 7), M(0xe6c6a2), [0.1, -0.12, 0], [1.55, 1, 0.85]);
    const face = manoFace(body, M);
    const shell = grp(body);
    mk(shell, ico(1, 1), M(0xc2283a), [0.55, 1.05, 0], [0.95, 0.9, 0.7]);
    for (const z of [-0.69, 0.69]) mk(shell, new THREE.TorusGeometry(0.42, 0.09, 4, 9), M(0x8e1426), [0.6, 0.95, z]);
    for (const z of [-0.72, 0.72]) mk(shell, new THREE.TorusGeometry(0.2, 0.07, 4, 7), M(0x8e1426), [0.66, 0.92, z]);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; mk(shell, new THREE.ConeGeometry(0.28, 0.55, 4), M(i % 2 ? 0x3f8a3a : 0x57a84a), [0.55 + Math.cos(a) * 0.5, 1.78 + Math.sin(i * 1.3) * 0.06, Math.sin(a) * 0.38], null, [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]); }
    const stalk = grp(shell, [0.45, 1.9, 0]);
    mk(stalk, new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4), M(0x2f6b2c), [0, 0.35, 0]);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; mk(stalk, new THREE.TetrahedronGeometry(0.11, 0), M(0xf3a0b0), [Math.cos(a) * 0.12, 0.72, Math.sin(a) * 0.12]); }
    mk(stalk, new THREE.TetrahedronGeometry(0.07, 0), M(0xffd84a), [0, 0.74, 0]);
    // punch: a stretchy beige arm and a red boxing glove, placed in world space on the arm hitbox
    const arm = mk(S, new THREE.CylinderGeometry(1, 1, 1, 6), M(0xf0d4b4));
    const glove = grp(S);
    mk(glove, ico(1, 1), M(0xd23a2e), [0, 0, 0], [1, 0.85, 0.9]);
    mk(glove, ico(0.45, 0), M(0xd23a2e), [-0.2, 0.55, 0.45]);
    mk(glove, new THREE.CylinderGeometry(0.55, 0.6, 0.45, 7), M(0xf2f0ea), [0.85, 0, 0], null, [0, 0, Math.PI / 2]);
    arm.visible = glove.visible = false;
    return { M, root, yaw, squash, body, face, shell, stalk, arm, glove, yawNow: 0.5 };
  }
  const mano = makeMano();
  const bigMano = makeMano();                                  // the dying big one while the stone drops on him
  bigMano.root.visible = false;

  // ── tombstone (phase 3): Mano's face carved into a stone ─────────────────────────────────
  function makeTomb() {
    const M = kit();
    const root = grp(S), yaw = grp(root), squash = grp(yaw);
    const sh = new THREE.Shape();
    const w = 1.25, h = 2.9;
    sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, h);
    sh.absarc(0, h, w, 0, Math.PI, false); sh.lineTo(-w, 0);
    mk(squash, new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1, curveSegments: 5 }), M(0x8f929c), [0, 0.35, -0.35]);
    mk(squash, new THREE.BoxGeometry(3.0, 0.38, 1.1), M(0x6f727c), [0, 0.19, 0]);                 // base slab
    mk(squash, new THREE.BoxGeometry(0.26, 1.1, 0.3), M(0x9da0aa), [0, 4.85, 0]);                 // cross
    mk(squash, new THREE.BoxGeometry(0.75, 0.24, 0.3), M(0x9da0aa), [0, 5.0, 0]);
    for (let i = 0; i < 6; i++) mk(squash, new THREE.BoxGeometry(0.5 + rnd() * 0.4, 0.04, 0.02), M(0x6c6f78), [-0.6 + rnd() * 1.2, 1.2 + rnd() * 3, 0.44], null, [0, 0, (rnd() - 0.5) * 1.2]);
    // RIP, cut from boxes
    const rip = grp(squash, [0, 1.15, 0.44]);
    const bar = (x, y, w2, h2) => mk(rip, new THREE.BoxGeometry(w2, h2, 0.05), M(0x5a5d66), [x, y, 0]);
    bar(-0.62, 0, 0.1, 0.6); bar(-0.5, 0.25, 0.25, 0.1); bar(-0.4, 0.15, 0.1, 0.2); bar(-0.5, 0.05, 0.25, 0.1); mk(rip, new THREE.BoxGeometry(0.1, 0.36, 0.05), M(0x5a5d66), [-0.45, -0.16, 0], null, [0, 0, 0.45]);   // R's leg
    bar(0, 0, 0.1, 0.6);
    bar(0.38, 0, 0.1, 0.6); bar(0.5, 0.25, 0.25, 0.1); bar(0.6, 0.15, 0.1, 0.2); bar(0.5, 0.05, 0.25, 0.1);
    // Mano's face looks out of the stone, toward the camera
    const faceHolder = grp(squash, [0, 0.95, -0.8]);            // pressed into the stone's front face
    const fh = grp(faceHolder); fh.rotation.y = Math.PI / 2;     // the face set looks down -x; turn it to +z
    const face = manoFace(fh, M, 1.05);
    face.f.position.set(-0.25, 0.35, 0);
    mk(fh, ico(0.75, 1), M(0xf4dcc0), [-0.55, 1.75, 0], [0.5, 0.75, 0.85]);                    // a patch of his skin
    return { M, root, yaw, squash, face };
  }
  const tomb = makeTomb();
  tomb.root.visible = false;

  // ── the player: a MapleStory beginner ───────────────────────────────────────────────────
  function makeHero() {
    const M = kit();
    const root = grp(S), yaw = grp(root), pose = grp(yaw, [0, 0.6, 0]);
    const o = y => y - 0.6;                                      // children placed from the feet, pose pivots mid-body
    const hip = grp(pose, [0, o(0.44), 0]);
    const legs = [], arms = [];
    for (const z of [-0.09, 0.09]) {
      const leg = grp(hip, [0, 0, z]);
      mk(leg, new THREE.BoxGeometry(0.13, 0.34, 0.13), M(0x3b67b8), [0, -0.17, 0]);
      mk(leg, new THREE.BoxGeometry(0.2, 0.09, 0.15), M(0x6b3d1f), [0.04, -0.39, 0]);
      legs.push(leg);
    }
    mk(pose, new THREE.BoxGeometry(0.34, 0.12, 0.3), M(0x3b67b8), [0, o(0.46), 0]);               // shorts
    mk(pose, new THREE.BoxGeometry(0.34, 0.3, 0.28), M(0xf7f7f2), [0, o(0.64), 0]);               // white tee
    for (const z of [-0.2, 0.2]) {
      const arm = grp(pose, [0, o(0.76), z]);
      mk(arm, new THREE.BoxGeometry(0.1, 0.12, 0.1), M(0xf7f7f2), [0, -0.05, 0]);
      mk(arm, new THREE.BoxGeometry(0.08, 0.26, 0.08), M(0xf2c9a0), [0, -0.19, 0]);
      arms.push(arm);
    }
    const head = grp(pose, [0, o(1.08), 0]);
    mk(head, ico(0.3, 1), M(0xf2c9a0), [0, 0, 0]);
    mk(head, ico(0.33, 1), M(0x8a4b22), [-0.06, 0.08, 0], [1, 0.92, 1.02]);                      // hair cap
    for (let i = 0; i < 7; i++) mk(head, new THREE.ConeGeometry(0.09, 0.26, 4), M(0x8a4b22), [-0.12 + Math.cos(i * 0.9) * 0.18, 0.3, Math.sin(i * 0.9) * 0.2], null, [0, 0, 0.6 + (i % 3) * 0.3]);
    mk(head, ico(0.2, 0), M(0xf2c9a0), [0.15, -0.03, 0], [1, 1.1, 1.25]);                        // face
    for (const z of [-0.1, 0.1]) {
      mk(head, new THREE.BoxGeometry(0.05, 0.11, 0.06), M(0x1a1a24), [0.29, 0, z]);
      mk(head, new THREE.BoxGeometry(0.03, 0.03, 0.03), M(0xffffff), [0.31, 0.03, z + 0.01]);
    }
    mk(head, new THREE.BoxGeometry(0.03, 0.03, 0.1), M(0xb5584a), [0.31, -0.13, 0]);
    const halo = mk(root, new THREE.TorusGeometry(0.2, 0.03, 4, 10), M(0xffe066), [0, 1.55, 0], null, [Math.PI / 2, 0, 0]);
    halo.visible = false;
    return { M, root, yaw, pose, legs, arms, head, halo, yawNow: -0.5 };
  }
  const hero = makeHero();
  // a tiny Maple-style tombstone drops where the player falls
  const grave = grp(S);
  mk(grave, new THREE.BoxGeometry(0.5, 0.6, 0.18), 0x8f929c, [0, 0.3, 0]);
  mk(grave, new THREE.BoxGeometry(0.1, 0.3, 0.1), 0x9da0aa, [0, 0.75, 0]);
  mk(grave, new THREE.BoxGeometry(0.26, 0.08, 0.1), 0x9da0aa, [0, 0.8, 0]);
  grave.visible = false;

  // ── bullets: throwing stars ───────────────────────────────────────────────────────────────
  function starGeo(r1, r2, n = 4) {
    const s = new THREE.Shape();
    for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, r = i % 2 ? r2 : r1; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
  }
  const STAR = starGeo(0.26, 0.09), STAR_EX = starGeo(0.5, 0.19, 5);
  const starMat = new THREE.MeshLambertMaterial({ color: 0xf2f6ff, flatShading: true, emissive: 0x8899aa });
  const exMat = new THREE.MeshLambertMaterial({ color: 0xff5a3c, flatShading: true, emissive: 0x802010 });
  const bulletMesh = new Map();

  // ── particles (dust, hits, sparks, the big burst) ─────────────────────────────────────────
  const parts = [];
  const pGeo = { dust: ico(1, 0), shard: new THREE.TetrahedronGeometry(1, 0), chunk: new THREE.DodecahedronGeometry(1, 0) };
  function burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(pGeo[o.geo || 'dust'], new THREE.MeshLambertMaterial({ color: o.colors[i % o.colors.length], flatShading: true, transparent: true }));
      const a = (o.a0 ?? 0) + rnd() * (o.spread ?? Math.PI * 2), sp = (o.speed || 2) * (0.5 + rnd());
      m.position.set(x * U + (rnd() - 0.5) * (o.jx || 0), y * U + (rnd() - 0.5) * (o.jy || 0), (rnd() - 0.5) * (o.jz ?? 0.6));
      const s = (o.size || 0.12) * (0.6 + rnd() * 0.8); m.scale.setScalar(s);
      S.add(m);
      parts.push({ m, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (o.up || 0), vz: (rnd() - 0.5) * (o.vz || 1), life: 0, max: (o.life || 0.5) * (0.7 + rnd() * 0.6),
        g: o.grav || 0, grow: o.grow || 0, s0: s, spin: (rnd() - 0.5) * (o.spin || 6) });
    }
  }
  const DUST = [0xd9c7a0, 0xc7b38a, 0xe8dcc0], BEIGE = [0xf4dcc0, 0xf7e3c8, 0xe6c6a2, 0xc2283a, 0x57a84a];
  function fx(g, name, x, y) {
    const big = /lg_|big_|smash|tomb/.test(name);
    if (/explode/.test(name)) {
      if (name.startsWith('big_')) return;                        // one burst for the pair the engine spawns
      burst(x, y, 46, { geo: 'chunk', colors: BEIGE, speed: 7, up: 2, grav: 14, size: 0.22, life: 1.4, jx: 1.5, jy: 1, spin: 10, vz: 4 });
      burst(x, y - 150, 16, { colors: DUST, speed: 2.5, size: 0.4, grow: 1.5, life: 0.9, jx: 2 });
    } else if (/[Dd]ust/.test(name)) {
      const small = /^(player|cuphead|weapon)/.test(name);
      if (/tomb/.test(name)) {                                  // the stone's slam / landing: grey dirt along the floor
        if (/_bk$/.test(name)) return;
        burst(x, -240, 22, { colors: [0x9c9a8e, 0x8f929c, 0xc7b38a], speed: 3.5, a0: 0.1, spread: Math.PI - 0.2, size: 0.2, grow: 0.9, life: 0.7, jx: 2.6, grav: 2 });
        return;
      }
      const n = big ? 18 : small ? 5 : 9;
      burst(x, y + 10, n, { colors: DUST, speed: big ? 3.2 : 1.4, a0: 0.15, spread: Math.PI - 0.3, size: big ? 0.3 : small ? 0.09 : 0.14, grow: big ? 1.2 : 0.6, life: big ? 0.8 : 0.45, jx: big ? 1.6 : 0.3, grav: -0.5 });
    } else if (/hitFX/.test(name)) {
      burst(x, y, 10, { geo: 'shard', colors: [0xff4040, 0xffffff, 0xffd84a], speed: 4, size: 0.1, life: 0.35, spin: 14 });
    } else if (/peashot_intro/.test(name)) {
      burst(x, y, 2, { geo: 'shard', colors: [0xffffff, 0xd8f2ff], speed: 1, size: 0.06, life: 0.12 });
    } else if (/EX_death/.test(name)) {
      burst(x, y, 16, { geo: 'shard', colors: [0xff5a3c, 0xffd84a, 0xffffff], speed: 5, size: 0.14, life: 0.45, spin: 16 });
    } else if (/peashot_death/.test(name)) {
      burst(x, y, 4, { geo: 'shard', colors: [0xffffff, 0xffe066, 0xd8f2ff], speed: 2.2, size: 0.07, life: 0.22, spin: 14 });
    }
  }
  function updateParts(dt) {
    for (const p of parts) {
      p.life += dt; p.vy -= p.g * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      if (p.g > 0 && p.m.position.y < GY + 0.05) { p.m.position.y = GY + 0.05; p.vy *= -0.3; p.vx *= 0.6; }
      p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.7 * dt;
      const k = p.life / p.max;
      p.m.scale.setScalar(p.s0 * (1 + p.grow * k));
      p.m.material.opacity = 1 - k * k;
      if (k >= 1) { S.remove(p.m); p.m.material.dispose(); p.dead = true; }
    }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].dead) parts.splice(i, 1);
  }

  // ── posing ────────────────────────────────────────────────────────────────────────────────
  function animInfo(a) {                                         // clip now playing and how far into it (0..1)
    if (!a) return { part: '', p: 0, t: 0 };
    const pos = a.pos, dur = a.parts ? a.parts[pos.seg].dur : a.len;
    return { part: a.part || a.name, p: dur > 0 ? clamp01(pos.t / dur) : 1, t: pos.t, dur };
  }
  const YAW_L = 0.5, YAW_R = Math.PI - 0.5;                     // a 3/4 turn toward the camera
  const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

  // squash x/y, lean (radians, + = leaning back), lift, eyelid droop for Mano's current clip
  function manoPose(part, p, t) {
    let sx = 1, sy = 1, lean = 0, lift = 0, droop = 0;
    if (/squish_start/.test(part)) { sy = 1 - 0.32 * ease(p); sx = 1 + 0.22 * ease(p); }
    else if (/squish_loop/.test(part)) { sy = 0.68 + Math.sin(t * 30) * 0.02; sx = 1.22; }
    else if (/squish_end/.test(part)) { sy = lerp(0.68, 1.22, ease(p)); sx = lerp(1.22, 0.86, ease(p)); }
    else if (/jump_up/.test(part)) { sy = 1.2; sx = 0.87; }
    else if (/apex/.test(part)) { sy = lerp(1.15, 0.95, p); sx = lerp(0.9, 1.05, p); }
    else if (/jump_down/.test(part)) { sy = 1.08; sx = 0.94; }
    else if (/punch_(blink_)?start/.test(part)) { lean = 0.35 * ease(p); sy = 1 - 0.12 * ease(p); sx = 1 + 0.08 * ease(p); }
    else if (/punch_pre_hold/.test(part)) { lean = 0.35 + Math.sin(t * 40) * 0.02; sy = 0.88; sx = 1.08; }
    else if (/punch_hold/.test(part)) { lean = -0.3; sx = 1.18; sy = 0.92; }
    else if (/punch_end/.test(part)) { lean = lerp(-0.3, 0, ease(p)); sx = lerp(1.18, 1, p); sy = lerp(0.92, 1, p); }
    else if (/punch/.test(part)) { lean = lerp(0.35, -0.3, ease(p * 2)); sx = lerp(1.08, 1.18, p); sy = 0.92; }
    else if (/intro/.test(part)) {
      const q = clamp01(p * 1.4);
      sy = q < 0.5 ? lerp(0.15, 1.25, q / 0.5) : lerp(1.25, 1, (q - 0.5) / 0.5); sx = 1 / Math.sqrt(sy);
      lift = Math.sin(q * Math.PI) * 0.4;
    }
    else if (/death_ground/.test(part)) { sy = lerp(1, 0.45, ease(p)); sx = lerp(1, 1.35, ease(p)); droop = ease(p); }
    else if (/death_loop/.test(part)) { sy = 0.45 + Math.sin(t * 9) * 0.04; sx = 1.35 - Math.sin(t * 9) * 0.04; droop = 1; }
    else if (/transform/.test(part)) { const w = Math.sin(t * 34) * (1 - p) * 0.12; sy = 1 + w; sx = 1 - w; }
    return { sx, sy, lean, lift, droop };
  }

  function placeMano(m, B, shapes, dt, scale, info, faceDir, opts = {}) {
    m.root.visible = true;
    const pose = manoPose(info.part, info.p, info.t);
    // small Mano's punch is a lunge: the whole body flies along its hit circle (the arm box is the stretched tail
    // left at the root). Big Mano stays put and throws a glove: there the animated circle IS the glove.
    let x = B.x, y = B.y;
    const circle = shapes.find(s => s.c);
    let gloveC = null;
    if (circle && !opts.noFollow) {
      if (B.phase === 1) { x = circle.c[0]; y = B.y + (circle.c[1] - (B.y + 75)); }
      else if (Math.hypot(circle.c[0] - B.x, circle.c[1] - (B.y + 130)) > 40) gloveC = circle.c;
    }
    m.root.position.set(x * U, y * U + pose.lift, 0);
    // turn: the air-turn clips swing him round through facing the camera
    let target = faceDir < 0 ? YAW_L : YAW_R;
    if (/turn/.test(info.part) && B.state === 'air' && B.turning) target = lerp(B.face < 0 ? YAW_L : YAW_R, B.dir < 0 ? YAW_L : YAW_R, ease(info.p));
    m.yawNow = opts.snap ? target : damp(m.yawNow, target, /turn/.test(info.part) ? 30 : 14, dt);
    m.yaw.rotation.y = m.yawNow;
    m.squash.scale.set(scale * pose.sx, scale * pose.sy, scale * Math.sqrt(pose.sx));
    m.squash.rotation.z = -pose.lean;                           // model space: + lean tips his face (at -x) up/back
    for (const l of m.face.lids) l.scale.y = 1.15 * (1 - pose.droop * 0.35);
    const now = performance.now();
    m.face.stache.forEach((s, i) => { s.rotation.x = Math.sin(now / 260 + i * 2) * 0.04; });
    m.stalk.rotation.z = Math.sin(now / 300) * 0.12 - pose.lean * 0.5;
    // the punch: arm + glove ride the arm hitbox exactly
    const box = shapes.find(s => s.p);
    if (box && !opts.noArm) {
      const cx = box.p.reduce((a, q) => a + q[0], 0) / 4, cy = box.p.reduce((a, q) => a + q[1], 0) / 4;
      const e1 = [box.p[1][0] - box.p[0][0], box.p[1][1] - box.p[0][1]], e2 = [box.p[3][0] - box.p[0][0], box.p[3][1] - box.p[0][1]];
      const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
      let ax = l1 >= l2 ? e1 : e2;
      const len = Math.max(l1, l2), thick = Math.min(l1, l2), n = Math.hypot(...ax) || 1;
      ax = [ax[0] / n, ax[1] / n];
      if (ax[0] * faceDir < 0) ax = [-ax[0], -ax[1]];             // point the way he punches
      const tip = [cx + ax[0] * len / 2, cy + ax[1] * len / 2], base = [cx - ax[0] * len / 2, cy - ax[1] * len / 2];
      const ang = Math.atan2(ax[1], ax[0]);
      const mid = [(tip[0] + base[0]) / 2, (tip[1] + base[1]) / 2];
      const thickU = Math.max(0.12, thick * U * (B.phase === 1 ? 0.5 : 0.35));
      m.arm.visible = true;
      m.arm.position.set(mid[0] * U, mid[1] * U, B.phase === 1 ? -0.1 : 0.2);
      m.arm.scale.set(thickU, len * U, thickU);
      m.arm.rotation.set(0, 0, ang - Math.PI / 2);
    } else m.arm.visible = false;
    if (gloveC) {
      const gr = gloveC[2] * U * 0.9, gx = gloveC[0] - x, gy = gloveC[1] - (y + 130);
      m.glove.visible = true;
      m.glove.position.set(gloveC[0] * U, gloveC[1] * U, 0.3);
      m.glove.scale.setScalar(gr);
      m.glove.rotation.set(0, 0, Math.atan2(gy, gx) + Math.PI);      // the white cuff trails behind the fist
    } else m.glove.visible = false;
    return pose;
  }

  let heroRun = 0, wasDead = false, graveY = 0, graveV = 0;
  function placeHero(P, dt, title) {
    const h = hero;
    const dead = P.state === 'dead';
    const blink = !dead && P.inv > 0 && Math.floor(P.inv * 20) % 2;
    h.root.visible = !blink;
    const face = P.face || 1;
    h.yawNow = damp(h.yawNow, face > 0 ? -0.5 : Math.PI + 0.5, 18, dt);
    h.yaw.rotation.y = h.yawNow;
    const name = P.anim ? P.anim.name : 'cuphead_idle';
    const tt = performance.now() / 1000;
    let sx = 1, sy = 1, rz = 0, lift = 0, legA = 0, legB = 0, armF = 0, armB = 0, flash = 0, flashCol = 0;
    const aimArm = d => ({ straight: Math.PI / 2, up: Math.PI, down: 0.15, diagonal_up: Math.PI * 0.75, diagonal_down: Math.PI * 0.25 }[d] ?? Math.PI / 2);
    const dirOf = n => (n.match(/(diagonal_up|diagonal_down|straight|up|down)/) || [])[1] || 'straight';
    if (dead) {
      armF = Math.PI * 0.8 + Math.sin(tt * 4) * 0.2; armB = -armF; legA = 0.3; legB = -0.3;
    } else if (name === 'cuphead_intro_a' || title) {
      armF = Math.PI * 0.85 + Math.sin(tt * 10) * 0.35; lift = Math.abs(Math.sin(tt * 3)) * 0.02;
    } else if (/dash/.test(name)) {
      rz = -0.45; sx = 1.25; sy = 0.85; legA = 0.9; legB = -0.6; armF = 1.2; armB = 1.6;
    } else if (/hit/.test(name)) {
      rz = 0.45; armF = 2.4; armB = 2.0; flash = 0.7; flashCol = 0xff2020;
    } else if (/parry/.test(name)) {
      rz = -tt * 22; flash = 0.6; flashCol = 0xff4fa0; legA = legB = 1.2;
    } else if (/_ex_/.test(name)) {
      rz = 0.15; armF = aimArm(dirOf(name)); armB = 0.6; flash = 0.4; flashCol = 0xffc040; sx = 1.08;
    } else if (!P.ground) {
      rz = -tt * 16; legA = legB = 1.3; armF = 2.2; armB = 2.2; sy = 0.95;
    } else if (/duck/.test(name)) {
      sy = 0.58; sx = 1.12; legA = 1.2; legB = 1.2; armF = /shoot/.test(name) ? Math.PI / 2 : 0.5; armB = 0.4;
    } else if (/run/.test(name)) {
      heroRun += dt * 14;
      legA = Math.sin(heroRun) * 0.9; legB = -legA; lift = Math.abs(Math.cos(heroRun)) * 0.06; rz = -0.12;
      armF = /shoot/.test(name) ? aimArm(/diagonal_up/.test(name) ? 'diagonal_up' : 'straight') : -legA * 0.8;
      armB = legA * 0.8;
    } else {
      const breathe = Math.sin(tt * 3) * 0.02; sy = 1 + breathe; sx = 1 - breathe * 0.5;
      armF = /shoot|aim/.test(name) ? aimArm(dirOf(name)) : 0.12;
      armB = -0.12;
    }
    if (P.hitT > 0) { flash = 0.7; flashCol = 0xff2020; }
    h.root.position.set(P.x * U, (dead ? P.ghostY : P.y) * U + lift, 0.05);
    h.pose.scale.set(sx, sy, 1); h.pose.rotation.z = rz;
    h.legs[0].rotation.z = legA; h.legs[1].rotation.z = legB;
    h.arms[1].rotation.z = armF; h.arms[0].rotation.z = armB;          // arms[1] sits on the camera side
    h.M.flash(flashCol, flash);
    h.M.alpha(dead ? 0.55 : 1);
    h.halo.visible = dead;
    // Maple death: a small tombstone drops where he fell
    if (dead && !wasDead) { grave.visible = true; graveY = 2.5; graveV = 0; grave.position.set(P.x * U, graveY, -0.2); }
    if (!dead) grave.visible = false;
    if (grave.visible && graveY > GY) { graveV -= 30 * dt; graveY = Math.max(GY, graveY + graveV * dt); grave.position.y = graveY; }
    wasDead = dead;
    const hgt = Math.max(0, P.y + 250) * U;
    playerShadow.visible = !dead;
    playerShadow.position.set(P.x * U, GY + 0.01, 0.05);
    playerShadow.scale.set(Math.max(0.12, 0.32 - hgt * 0.06), Math.max(0.07, 0.18 - hgt * 0.03), 1);
  }

  function placeTomb(B, dt, info) {
    const t = tomb;
    t.root.visible = true;
    const part = info.part, p = info.p;
    let lift = 0, sx = 1, sy = 1, tilt = 0, sink = 0, shake = 0;
    if (/smash_start/.test(part)) { lift = 1.4 * ease(p); sy = 1 + 0.05 * p; }
    else if (/smash_pre_hold/.test(part)) { lift = 1.4; shake = 0.04; }
    else if (/smash/.test(part)) {
      const fall = clamp01(info.t / 0.2);
      lift = 1.4 * (1 - fall * fall);
      if (info.t >= 0.2) { const k = clamp01((info.t - 0.2) / 0.3); sy = lerp(0.62, 1, ease(k)); sx = lerp(1.3, 1, ease(k)); }
    }
    else if (/move_(left|right)_start/.test(part)) tilt = 0.12 * ease(p);
    else if (/move_(left|right)/.test(part)) tilt = 0.1 + Math.sin(info.t * 12) * 0.02;
    else if (/turn/.test(part)) tilt = lerp(0.1, -0.1, ease(p));
    else if (/land/.test(part)) { sy = lerp(0.75, 1, ease(p)); sx = lerp(1.2, 1, ease(p)); }
    else if (/death/.test(part)) { sink = ease(info.t / 1.6) * 3.2; shake = 0.03; }
    const dir = B.dir || 1;
    // the stone's root (B.tombY) sits 170 px above its base: Cuphead's stone stands on the ground at y -80
    const baseY = (B.tombY - 170) * U;
    t.root.position.set(B.x * U + (Math.random() - 0.5) * shake, baseY + lift - sink, -0.2);
    t.squash.scale.set(0.92 * sx, 0.92 * sy, 0.92);
    t.squash.rotation.z = -tilt * dir;
    t.yaw.rotation.y = damp(t.yaw.rotation.y, -dir * 0.18, 6, dt);
    for (const l of t.face.lids) l.scale.y = /smash_pre/.test(part) ? 0.8 : 1.15;
  }

  // ── 3D polygon text: the title logo and the READY? / KNOCKOUT! / YOU DIED cards ─────────────
  let FONT = null;
  try { new THREE.FontLoader().load('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_bold.typeface.json', f => { FONT = f; }); } catch (e) {}
  const T3 = new THREE.Scene();
  T3.add(new THREE.HemisphereLight(0xffffff, 0x553322, 0.65));
  const tl = new THREE.DirectionalLight(0xffffff, 0.9); tl.position.set(-3, 5, 7); T3.add(tl);
  const C2 = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 80); C2.position.set(0, 0, D);
  const texts = {};
  function text3(key, str, size, front, side) {
    const t = texts[key];
    if (t && t.str === str) return t.g;
    if (!FONT) return null;
    if (t) T3.remove(t.g);
    const geo = new THREE.TextGeometry(str, { font: FONT, size, height: size * 0.42, curveSegments: 2,
      bevelEnabled: true, bevelThickness: size * 0.06, bevelSize: size * 0.04, bevelSegments: 1 });
    geo.center();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, [new THREE.MeshLambertMaterial({ color: front, flatShading: true }), new THREE.MeshLambertMaterial({ color: side, flatShading: true })]));
    T3.add(g); texts[key] = { str, g };
    return g;
  }
  const BANNER = {
    'READY?': [0xf6e6c0, 0x6b3d1f], 'WALLOP!': [0xff5a3c, 0x5a1408], 'KNOCKOUT!': [0xffd84a, 0xb2301e], 'YOU DIED': [0xd8d4cc, 0x3a3640],
  };
  const backOut = k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  function overlay(st) {
    for (const k in texts) texts[k].g.visible = false;
    const tt = performance.now() / 1000;
    if (st.title) {
      const a = text3('logo1', 'CURSED', 0.72, 0xf6e6c0, 0x6b3d1f), b = text3('logo2', 'MAPLESTORY', 0.8, 0xffb840, 0x7a2a10);
      if (a) { a.visible = true; a.position.set(0, 2.45 + Math.sin(tt * 1.6) * 0.05, 0.4); a.rotation.set(0.12 + Math.sin(tt * 0.9) * 0.05, Math.sin(tt * 0.7) * 0.22, Math.sin(tt * 1.1) * 0.03); }
      if (b) { b.visible = true; b.position.set(0, 1.42 + Math.sin(tt * 1.6 + 1) * 0.05, 0.4); b.rotation.set(0.12 + Math.sin(tt * 0.9 + 0.6) * 0.05, Math.sin(tt * 0.7 + 0.5) * 0.22, -Math.sin(tt * 1.1) * 0.03); }
    }
    const ban = st.banner;
    if (ban && BANNER[ban.text]) {
      const g = text3('banner', ban.text, 1.05, ...BANNER[ban.text]);
      if (g) {
        const p = clamp01(ban.p);
        let k = p < 0.14 ? backOut(p / 0.14) : 1;
        if (ban.kind === 'pop' && p > 0.86) k = Math.max(0, 1 - (p - 0.86) / 0.14);
        g.visible = k > 0.01;
        g.scale.setScalar(Math.max(0.001, k));
        g.position.set(0, 0.35 + (ban.text === 'YOU DIED' ? 0.9 : 0), 1.2);
        g.rotation.set(0.1 + Math.sin(tt * 3) * 0.04, Math.sin(tt * 2.2) * 0.18, Math.sin(tt * 2.7) * 0.05);
      }
    }
  }
  function draw(st) {
    R.autoClear = true; R.render(S, C);
    overlay(st);
    R.autoClear = false; R.clearDepth(); R.render(T3, C2); R.autoClear = true;
  }

  // ── 2D polygon UI (HUD, end panels, title lines), drawn on the HUD canvas in 1280 x 720 units ──
  const PIX = '"Press Start 2P", ui-monospace, monospace';
  function gem(ctx, cx, cy, r, n, light, dark, rot = -Math.PI / 2, ry = r) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]); }
    for (let i = 0; i < n; i++) {                                 // facets: triangles from the centre, two tones
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay); ctx.lineTo(bx, by); ctx.closePath();
      ctx.fillStyle = i % 2 ? dark : light; ctx.fill();
    }
    ctx.beginPath(); pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y)); ctx.closePath();
    ctx.lineWidth = 4; ctx.strokeStyle = '#1a0f08'; ctx.stroke();
  }
  function ptext(ctx, str, x, y, size, fill, stroke = '#1a0f08', align = 'center') {
    ctx.font = `${size}px ${PIX}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.32); ctx.strokeStyle = stroke; ctx.strokeText(str, x, y);
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
  }
  const ui = {
    hud(ctx, P, dmgNums, t, camX, camY, W, H) {
      ctx.save();
      const flash = P.hp === 1 && Math.floor(t * 6) % 2;
      const [l, d] = P.hp <= 0 ? ['#8a8790', '#5c5a62'] : flash ? ['#fff0c0', '#ffb840'] : ['#ef5a44', '#a8281e'];
      gem(ctx, 74, H - 52, 42, 6, l, d, 0);
      ptext(ctx, 'HP', 74, H - 66, 12, '#fff6e0');
      ptext(ctx, P.hp <= 0 ? 'X' : String(Math.min(9, P.hp)), 74, H - 42, 22, '#fff6e0');
      for (let i = 0; i < 5; i++) {                                // EX cards: diamonds that fill from the bottom
        const x = 152 + i * 38, y = H - 52, fill = Math.max(0, Math.min(1, P.card - i));
        gem(ctx, x, y, 15, 4, '#4a3524', '#2e2016', -Math.PI / 2, 24);
        if (fill > 0) {
          ctx.save(); ctx.beginPath(); ctx.rect(x - 20, y + 24 - 48 * fill, 40, 48 * fill); ctx.clip();
          const full = fill >= 1, pulse = full ? 0.5 + 0.5 * Math.sin(t * 8 + i) : 0;
          gem(ctx, x, y, 15, 4, full ? `rgb(255,${216 + pulse * 30 | 0},${74 + pulse * 120 | 0})` : '#e8b84a', full ? '#c98a1a' : '#9a6a20', -Math.PI / 2, 24);
          ctx.restore();
        }
      }
      for (const dn of dmgNums) {                                   // Maple damage numbers, in the pixel font
        ctx.globalAlpha = 1 - Math.max(0, dn.t - 0.5) / 0.4;
        ptext(ctx, String(dn.v), W / 2 + dn.x + camX, H / 2 - dn.y + camY, dn.crit ? 26 : 20, dn.crit ? '#ff4a3a' : '#ffb028', '#3a1500');
      }
      ctx.restore();
    },
    panel(ctx, title, sub, hint, pct, t, W, H) {
      ctx.save();
      const cx = W / 2, cy = H / 2 + 150, w = 360, h = 92, c = 28;
      const pts = [[cx - w + c, cy - h], [cx + w - c, cy - h], [cx + w, cy - h + c], [cx + w, cy + h - c], [cx + w - c, cy + h], [cx - w + c, cy + h], [cx - w, cy + h - c], [cx - w, cy - h + c]];
      for (let i = 0; i < 8; i++) {                                 // faceted octagon
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % 8];
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay); ctx.lineTo(bx, by); ctx.closePath();
        ctx.fillStyle = i % 2 ? 'rgba(30,18,10,0.92)' : 'rgba(46,30,18,0.92)'; ctx.fill();
      }
      ctx.beginPath(); pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y)); ctx.closePath();
      ctx.lineWidth = 4; ctx.strokeStyle = '#f0dcb0'; ctx.stroke();
      ptext(ctx, title, cx, cy - 48, 24, '#ffd84a', '#3a1500');
      ptext(ctx, sub, cx, cy + 4, 13, '#f0dcb0');
      if (pct != null) {                                            // progress through the fight: the hero gem slides along
        const x0 = cx - 260, x1 = cx + 260, y = cy + 34;
        ctx.strokeStyle = '#8a7550'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.strokeStyle = '#ffb840'; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + (x1 - x0) * pct, y); ctx.stroke();
        for (const k of [0, 0.24, 0.69, 1]) gem(ctx, x0 + (x1 - x0) * k, y, 7, 4, '#f0dcb0', '#b89a6a');   // phase changes at 24 % / 69 %
        gem(ctx, x0 + (x1 - x0) * pct, y - 4 + Math.sin(t * 8) * 2, 11, 3, '#6fd0ff', '#2a78b8');
      }
      if (Math.floor(t * 2) % 2) ptext(ctx, hint, cx, cy + 66, 10, '#bba57a');
      ctx.restore();
    },
    title(ctx, t, touch, loading, W, H) {
      ctx.save();
      if (!FONT) { ptext(ctx, 'CURSED', W / 2, 110, 54, '#f6e6c0', '#6b3d1f'); ptext(ctx, 'MAPLESTORY', W / 2, 200, 60, '#ffb840', '#7a2a10'); }
      ptext(ctx, 'IN  RUSE OF A MANO', W / 2, 282, 16, '#f6e6c0', '#3a1500');
      if (loading) ptext(ctx, 'SUMMONING MANO' + '...'.slice(0, 1 + Math.floor(t * 3) % 3), W / 2, 600, 18, '#f0dcb0');
      else {
        if (Math.floor(t * 2) % 2) ptext(ctx, touch ? 'TAP TO START' : 'PRESS ANY KEY', W / 2, 600, 22, '#ffd84a', '#3a1500');
        if (!touch) ptext(ctx, 'ARROWS MOVE  Z JUMP  X SHOOT  SHIFT DASH  C LOCK  V EX  M MUTE', W / 2, 668, 9, '#f0dcb0');
      }
      ctx.restore();
    },
  };

  // ── per frame ─────────────────────────────────────────────────────────────────────────────
  fit();
  function frame(dt, st) {
    const tt = performance.now() / 1000;
    for (const w of water) { w.position.x += dt * 0.9; if (w.position.x > 13) w.position.x -= 26; }
    for (const c of stage.children) if (c.userData.cloud) { c.position.x += c.userData.cloud * dt; if (c.position.x > 18) c.position.x -= 36; }
    C.position.set(-(st.camX || 0) * U, (st.camY || 0) * U, D);
    updateParts(dt);

    if (st.title) {                                              // title: the two of them, idle, side by side
      tomb.root.visible = bigMano.root.visible = grave.visible = false;
      placeHero({ x: -260, y: -250, face: 1, ground: true, state: 'play', inv: 0, anim: null }, dt, true);
      const p = (tt * 1.3) % 1;
      const info = { part: p < 0.35 ? 'squish_start' : p < 0.7 ? 'squish_loop' : 'squish_end', p: (p % 0.35) / 0.35, t: tt };
      placeMano(mano, { x: 260, y: -250, phase: 1, state: 'hop', face: -1, dir: -1 }, [], dt, 0.72, info, -1);
      bossShadow.position.set(2.6, GY + 0.012, 0); bossShadow.scale.set(1.1, 0.6, 1);
      mano.M.flash(0, 0);
      for (const [b, m] of bulletMesh) { S.remove(m); bulletMesh.delete(b); }
      draw(st);
      return;
    }

    const { P, B } = st;
    placeHero(P, dt, false);

    const shapes = st.shapes || [];
    const info = animInfo(B.anim);
    mano.M.flash(0xffffff, B.flash > 0 ? 0.55 : 0);
    tomb.M.flash(0xffffff, B.flash > 0 ? 0.55 : 0);
    bigMano.root.visible = bigMano.arm.visible = bigMano.glove.visible = false;
    let shadowX = B.x, shadowS = 1.1;
    const morphK = B.state === 'morph' ? ease(info.p) : B.phase >= 2 ? 1 : 0;
    const scale = lerp(0.72, BIG, morphK);
    const hideMano = () => { mano.root.visible = mano.arm.visible = mano.glove.visible = false; };
    if (B.state === 'tombfall') {
      // big Mano wobbles on the floor until the falling stone bursts him
      hideMano();
      if (!B.crushed) placeMano(bigMano, { ...B, x: B.bigX, y: -250, phase: 2, state: "lgdeath" }, [], dt, BIG, info, B.bigFace, { noFollow: true, noArm: true, snap: true });
      placeTomb(B, dt, { part: 'fall', p: 0, t: tt });
      shadowS = 1.6;
    } else if (B.phase === 3) {
      hideMano();
      placeTomb(B, dt, info);
      shadowS = 1.7;
    } else {
      tomb.root.visible = false;
      const pose = placeMano(mano, B, shapes, dt, scale, info, B.face);
      const hgt = Math.max(0, B.y + 250) * U;
      shadowS = scale * 1.5 * pose.sx * Math.max(0.35, 1 - hgt * 0.12);
      shadowX = mano.root.position.x / U;
    }
    bossShadow.position.set(shadowX * U, GY + 0.012, 0);
    bossShadow.scale.set(shadowS, shadowS * 0.55, 1);

    // bullets
    const seen = new Set();
    for (const b of st.bullets) {
      let m = bulletMesh.get(b);
      if (!m) { m = new THREE.Mesh(b.ex ? STAR_EX : STAR, b.ex ? exMat : starMat); m.rotation.x = 0.5; S.add(m); bulletMesh.set(b, m); }
      seen.add(b);
      m.position.set(b.x * U, b.y * U, 0.3);
      m.rotation.z -= dt * (b.ex ? 14 : 24);
    }
    for (const [b, m] of bulletMesh) if (!seen.has(b)) { S.remove(m); bulletMesh.delete(b); }

    draw(st);
  }

  return { frame, fx, fit, ui };
})();
