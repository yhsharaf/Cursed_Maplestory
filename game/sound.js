'use strict';
// Our own sound for Cursed MapleStory: every effect and the music are synthesized live with Web Audio (no audio
// files), retro-console style to match the low-poly look. game.js still asks for sounds by their old names
// (sfx_player_jump, sfx_slime_big_land, ...); RECIPES below turns each name into a short synth patch.
window.SYNTH = (() => {
  let ac = null, out = null, sfxBus = null, musBus = null, noiseBuf = null;

  function init(audioCtx, dest) {
    ac = audioCtx;
    out = ac.createDynamicsCompressor(); out.threshold.value = -14; out.ratio.value = 4; out.connect(dest);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(out);
    musBus = ac.createGain(); musBus.gain.value = 0.55; musBus.connect(out);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // ── building blocks ───────────────────────────────────────────────────────────────────────
  const now = () => ac.currentTime;
  let level = 1;                                               // the calling sfx's volume, set by play()
  function env(g, t0, vol, a, dur) {                          // quick attack, exponential fall to silence
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(a + 0.01, dur));
  }
  // one oscillator note with a pitch sweep f0 -> f1 (and optional vibrato)
  function tone(o) {
    const t0 = (o.at ?? now()) + (o.delay || 0), dur = o.t || 0.2;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + (o.sweep || dur));
    if (o.vib) {
      const lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = o.vibRate || 18; lg.gain.value = o.vib; lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t0); lfo.stop(t0 + dur + 0.05);
    }
    let node = osc;
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 1; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.bus || sfxBus);
    env(g, t0, (o.vol ?? 0.2) * (o.bus ? 1 : level), o.a || 0.004, dur);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  // filtered noise burst with a filter sweep f0 -> f1
  function noise(o) {
    const t0 = (o.at ?? now()) + (o.delay || 0), dur = o.t || 0.2;
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = o.ftype || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f0 || 1000, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
    const g = ac.createGain();
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    env(g, t0, (o.vol ?? 0.2) * (o.bus ? 1 : level), o.a || 0.003, dur);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  }
  const boom = (k, v = 0.5, at) => {                          // low thump + rumble; k = size
    tone({ type: 'sine', f0: 140 / k, f1: 32, t: 0.35 * k, vol: v, at });
    noise({ ftype: 'lowpass', f0: 900, f1: 80, t: 0.4 * k, vol: v * 0.7, at });
  };
  const arp = (notes, step, o) => notes.forEach((f, i) => tone({ ...o, f0: f, delay: (o.delay || 0) + i * step }));
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);          // MIDI note -> Hz

  // ── the patches, matched to game.js sound names by keyword (first match wins) ─────────────
  const RECIPES = [
    ['peashot', r => tone({ f0: 1500 * r, f1: 900 * r, t: 0.05, vol: 0.1 })],
    ['ex_forward', () => {
      noise({ ftype: 'highpass', f0: 600, f1: 4000, t: 0.25, vol: 0.3 });
      tone({ type: 'sawtooth', f0: 900, f1: 120, t: 0.35, vol: 0.22, lp: 2500 });
      arp([1568, 2093, 2637], 0.04, { type: 'square', t: 0.08, vol: 0.08, delay: 0.05 });
    }],
    ['slashblast', () => {}],                                   // the EX already rings out
    ['player_hit', () => { tone({ f0: 320, f1: 70, t: 0.28, vol: 0.26 }); noise({ f0: 2000, f1: 300, t: 0.18, vol: 0.24 }); }],
    ['player_death', () => arp([hz(72), hz(67), hz(64), hz(60), hz(55)], 0.13, { type: 'triangle', t: 0.22, vol: 0.32 })],
    ['maple_tombstone', () => { tone({ type: 'sine', f0: 1400, f1: 300, t: 0.18, vol: 0.08 }); boom(0.8, 0.4, now() + 0.18); }],
    ['player_jump', () => tone({ f0: 280, f1: 720, t: 0.11, vol: 0.14 })],
    ['parry', () => { tone({ type: 'triangle', f0: 1320, t: 0.12, vol: 0.26 }); tone({ type: 'triangle', f0: 1980, t: 0.18, vol: 0.18, delay: 0.05 }); }],
    ['player_dash', () => noise({ ftype: 'highpass', f0: 800, f1: 5000, t: 0.18, vol: 0.24 })],
    ['land_ground', () => noise({ ftype: 'lowpass', f0: 700, f1: 120, t: 0.07, vol: 0.24 })],
    ['mano_damage', r => tone({ type: 'sine', f0: 260 * r, f1: 170 * r, t: 0.09, vol: 0.24, vib: 30, vibRate: 40 })],
    ['big_land', () => boom(1.4, 0.6)],
    ['small_land', () => { boom(0.7, 0.45); tone({ type: 'sine', f0: 300, f1: 140, t: 0.12, vol: 0.14, vib: 25 }); }],
    ['small_jump', () => tone({ type: 'sine', f0: 170, f1: 560, t: 0.24, sweep: 0.2, vol: 0.28, vib: 16, vibRate: 22 })],
    ['big_jump', () => tone({ type: 'sine', f0: 100, f1: 330, t: 0.34, sweep: 0.3, vol: 0.34, vib: 12, vibRate: 16 })],
    ['tombstone_death', () => {
      for (let i = 0; i < 6; i++) boom(0.6 + Math.random() * 0.5, 0.32, now() + i * 0.14);
      noise({ ftype: 'lowpass', f0: 1800, f1: 60, t: 1.4, vol: 0.32 });
    }],
    ['mano_die', r => tone({ type: 'sawtooth', f0: 420 * r, f1: 70 * r, t: 1.0, sweep: 0.95, vol: 0.2, lp: 1400, vib: 18, vibRate: 7 })],
    ['intro_anim', () => tone({ type: 'sine', f0: 140, f1: 620, t: 0.35, sweep: 0.3, vol: 0.28, vib: 20, vibRate: 12 })],
    ['stretch_punch', () => { tone({ type: 'sawtooth', f0: 160, f1: 980, t: 0.26, vol: 0.18, lp: 1800 }); noise({ f0: 600, f1: 3000, t: 0.22, vol: 0.15 }); }],
    ['big_punch_voice', () => tone({ type: 'sawtooth', f0: 190, f1: 140, t: 0.3, vol: 0.22, lp: 800, q: 6 })],
    ['big_punch', () => { noise({ ftype: 'highpass', f0: 400, f1: 3000, t: 0.2, vol: 0.24 }); boom(1, 0.5, now() + 0.12); }],
    ['drop_onto_slime', () => { tone({ type: 'sine', f0: 1700, f1: 260, t: 0.22, vol: 0.14 }); boom(1.6, 0.7, now() + 0.2); }],
    ['tombstone_slide', () => noise({ f0: 380, f1: 260, q: 3, t: 0.38, vol: 0.14 })],
    ['splat_start', () => tone({ type: 'square', f0: 220, f1: 880, t: 0.32, vol: 0.08 })],
    ['tombstone_splat', () => { boom(1.8, 0.75); noise({ f0: 2500, f1: 200, t: 0.5, vol: 0.28 }); }],
    ['small_transform', () => arp([hz(60), hz(64), hz(67), hz(72), hz(76), hz(79), hz(84)], 0.07, { type: 'square', t: 0.12, vol: 0.1 })],
    ['mano_skill', () => arp([2637, 3136, 3520, 4186], 0.05, { type: 'triangle', t: 0.12, vol: 0.1, delay: 0.5 })],
    ['big_death_voice', () => tone({ type: 'sawtooth', f0: 300, f1: 60, t: 1.2, sweep: 1.1, vol: 0.22, lp: 900, vib: 24, vibRate: 6 })],
    ['taunts', () => [0, 0.16, 0.32].forEach((d, i) => tone({ type: 'sawtooth', f0: 210 - i * 15, f1: 180 - i * 15, t: 0.13, vol: 0.2, lp: 900, q: 5, delay: d }))],
    ['announcer_0001', () => { tone({ f0: hz(67), t: 0.16, vol: 0.14 }); tone({ f0: hz(74), t: 0.3, vol: 0.14, delay: 0.18 }); }],
    ['announcer_0002', () => { [hz(60), hz(64), hz(67), hz(72)].forEach(f => tone({ f0: f, t: 0.35, vol: 0.08 })); boom(1, 0.45); }],
    ['knockout_boom', () => boom(2, 0.8)],
    ['announcer_knockout', () => [[72, 76, 79], [71, 74, 77], [72, 76, 79, 84]].forEach((ch, i) =>
      ch.forEach(n => tone({ f0: hz(n), t: i === 2 ? 0.6 : 0.16, vol: 0.07, delay: 0.25 + i * 0.18 })))],
    ['knockout_bell', () => [1, 2.76, 5.4].forEach((k, i) => tone({ type: 'sine', f0: 660 * k, t: 2.2 - i * 0.5, vol: 0.16 / (i + 1), a: 0.002 }))],
    ['levelup', () => arp([hz(72), hz(76), hz(79), hz(84), hz(88), hz(91)], 0.09, { type: 'square', t: 0.2, vol: 0.08 })],
  ];
  function play(name, vol = 0.7, rate = 1) {
    if (!ac) return;
    const r = RECIPES.find(([k]) => name.includes(k));
    if (!r) return;
    level = Math.min(1.5, 0.35 + vol);
    try { r[1](rate || 1); } catch (e) {}
    level = 1;
  }

  // ── music: an original swing tune, "Mano's Ragtime Hop", sequenced live ──────────────────────
  // 16 bars of swung eighths: melody (square), oom-pah bass (triangle) + chord stabs, drums (noise / sine).
  const N = s => {                                            // "C5" -> MIDI, "." rest, "-" hold
    if (s === '.' || s === '-') return s;
    const m = s.match(/^([A-G])(#|b)?(\d)$/);
    return 12 * (+m[3] + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  };
  const MEL = [
    'C5 . A4 C5 F5 - E5 F5', 'A5 - G5 F5 E5 F5 G5 .', 'F#5 - A5 F#5 D5 - C5 D5', 'F#5 E5 D5 C5 A4 - . .',
    'B4 D5 G5 - F5 D5 B4 D5', 'F5 - E5 D5 B4 - G4 .', 'E5 G5 Bb5 - A5 G5 E5 C5', 'G5 - - . E5 F5 G5 .',
    'D5 F5 Bb5 - A5 Bb5 F5 D5', 'Ab5 - F5 D5 B4 - D5 F5', 'A5 - G5 F5 C5 F5 A5 C6', 'C6 - A5 F#5 D5 - F#5 A5',
    'G5 F5 D5 Bb4 G4 Bb4 D5 F5', 'E5 - G5 - Bb5 - A5 G5', 'F5 - A4 - C5 - F5 -', 'E5 F5 G5 A5 Bb5 - C6 .',
  ].map(b => b.split(' ').map(N));
  const CH = ['F A C', 'F A C', 'D F# A C', 'D F# A C', 'G B D F', 'G B D F', 'C E G Bb', 'C E G Bb',
              'Bb D F', 'B D F Ab', 'C F A', 'D F# A C', 'G Bb D F', 'C E G Bb', 'F A C', 'C E G Bb']
    .map(c => c.split(' ').map(n => N(n + '3')));
  let playing = false, step = 0, nextT = 0, bpm = 144, octave = 0, duck = 1;
  function schedule() {
    const swing = 0.62;                                         // long-short eighths
    while (nextT < now() + 0.12) {
      const bar = Math.floor(step / 8) % 16, e = step % 8, beat = 60 / bpm;
      const len = (e % 2 ? 1 - swing : swing) * beat, t = nextT;
      const m = MEL[bar][e];                                    // melody
      if (typeof m === 'number') {
        let hold = 1; while (e + hold < 8 && MEL[bar][e + hold] === '-') hold++;
        tone({ type: 'square', f0: hz(m + 12 * octave), t: Math.max(0.08, beat * 0.5 * hold * 0.92), vol: 0.07 * duck, at: t, bus: musBus, lp: 3200 });
      }
      const ch = CH[bar];                                       // oom-pah: root (then fifth) on 1 and 3, chord on 2 and 4
      if (e === 0 || e === 4) tone({ type: 'triangle', f0: hz(ch[0] - 12 + (e === 4 ? 7 : 0)), t: beat * 0.45, vol: 0.22 * duck, at: t, bus: musBus });
      if (e === 2 || e === 6) ch.forEach(n => tone({ type: 'square', f0: hz(n + 12), t: beat * 0.18, vol: 0.022 * duck, at: t, bus: musBus, lp: 2000 }));
      if (e === 0 || e === 4) tone({ type: 'sine', f0: 130, f1: 45, t: 0.14, vol: 0.32 * duck, at: t, bus: musBus });   // kick
      if (e === 2 || e === 6) noise({ f0: 1800, q: 0.8, t: 0.1, vol: 0.12 * duck, at: t, bus: musBus });              // snare
      noise({ ftype: 'highpass', f0: 7000, t: 0.03, vol: (e % 2 ? 0.03 : 0.05) * duck, at: t, bus: musBus });         // hat
      nextT += len; step++;
    }
  }
  function music() {
    if (!ac || playing) return;
    playing = true; step = 0; nextT = now() + 0.1;
    setInterval(schedule, 25); schedule();
  }
  // the fight's mood: faster and an octave up as Mano gets angrier; quiet behind the end screens
  function mood(phase, mode) {
    bpm = phase >= 3 ? 172 : phase === 2 ? 158 : 144;
    octave = phase >= 3 ? 1 : 0;
    duck = mode === 'dead' || mode === 'ko' ? 0.35 : 1;
  }
  return { init, play, music, mood };
})();
