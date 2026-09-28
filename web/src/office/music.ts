// The sound of the office, synthesised live with Web Audio (no audio files):
// a 12/8 West African marimba groove whose layers follow how busy the office is, and marimba
// sound effects for real events, all in F major so everything sits together.
//
// Marimba voice: tuned-bar partials (1, ~3.9, ~9.2× the fundamental) with fast decays on the
// upper partials, a short mallet "thock", a slight stereo spread and a small room reverb.

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// four bars: F | Bb | F | C  (chord tones as MIDI notes, low to high)
const CHORDS = [
  { root: 41, tones: [60, 65, 69, 72, 77, 81] }, // F
  { root: 46, tones: [62, 65, 70, 74, 77, 82] }, // Bb
  { root: 41, tones: [60, 65, 69, 72, 77, 81] }, // F
  { root: 36, tones: [60, 64, 67, 72, 76, 79] }, // C
];
// 12 pulses per bar (12/8). Lead and answer interlock; the answer fills the lead's gaps.
const LEAD_A: Record<number, number> = { 0: 2, 2: 3, 3: 4, 5: 3, 7: 2, 8: 1, 10: 2 };
const LEAD_B: Record<number, number> = { 0: 3, 2: 4, 3: 5, 5: 4, 7: 3, 8: 2, 10: 0 };
const ANSWER: Record<number, number> = { 1: 5, 4: 3, 6: 4, 9: 5, 11: 3 };
const BASS: Record<number, number> = { 0: 0, 4: 7, 6: 12, 10: 7 }; // semitones above the root
const BELL = new Set([0, 2, 4, 5, 7, 9, 11]); // the standard 12/8 bell pattern
const PULSE = 60 / (96 * 3); // dotted quarter = 96 bpm

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private verb!: GainNode;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private next = 0; // audio time of the next pulse
  private pulse = 0; // pulses since start
  private intensity = 0.35; // 0 quiet … 1 full groove
  on = false;

  private setup() {
    if (this.ctx) return this.ctx;
    const c = new AudioContext();
    this.ctx = c;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    comp.connect(this.master).connect(c.destination);
    // small room: a decaying stereo noise impulse
    const len = Math.floor(c.sampleRate * 1.8), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const conv = c.createConvolver(); conv.buffer = ir;
    this.verb = c.createGain(); this.verb.gain.value = 0.22;
    this.verb.connect(conv).connect(comp);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0;
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.75;
    this.musicBus.connect(comp); this.sfxBus.connect(comp);
    this.musicBus.connect(this.verb); this.sfxBus.connect(this.verb);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const nd = this.noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return c;
  }

  // ---------------------------------------------------------------- instruments
  private marimba(midi: number, t: number, vel: number, pan: number, out: AudioNode, len = 1) {
    const c = this.ctx!, f = mtof(midi);
    const p = c.createStereoPanner(); p.pan.value = pan; p.connect(out);
    const body = Math.min(1.9, Math.max(0.28, 1.5 * Math.sqrt(262 / f))) * len;
    const partials: [number, number, number][] = [[1, 1, body], [3.93, 0.28, body * 0.18], [9.2, 0.07, body * 0.06]];
    for (const [ratio, g, decay] of partials) {
      if (f * ratio > 16000) continue;
      const o = c.createOscillator(), e = c.createGain();
      o.type = 'sine'; o.frequency.value = f * ratio;
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g * vel * 0.32, t + 0.003); e.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(e).connect(p); o.start(t); o.stop(t + decay + 0.05);
    }
    // the mallet
    const n = c.createBufferSource(), bp = c.createBiquadFilter(), ne = c.createGain();
    n.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = Math.min(8000, f * 2.5); bp.Q.value = 1.2;
    ne.gain.setValueAtTime(vel * 0.09, t); ne.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    n.connect(bp).connect(ne).connect(p); n.start(t, Math.random() * 0.5); n.stop(t + 0.04);
  }
  private shaker(t: number, vel: number, out: AudioNode) {
    const c = this.ctx!, n = c.createBufferSource(), hp = c.createBiquadFilter(), e = c.createGain(), p = c.createStereoPanner();
    n.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 6500; p.pan.value = 0.35;
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(vel * 0.05, t + 0.008); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(hp).connect(e).connect(p).connect(out); n.start(t, Math.random() * 0.8); n.stop(t + 0.09);
  }
  private bell(t: number, vel: number, out: AudioNode, hi = true) {
    const c = this.ctx!, p = c.createStereoPanner(); p.pan.value = -0.4; p.connect(out);
    for (const [f, g] of [[hi ? 1180 : 880, 1], [hi ? 1870 : 1395, 0.5]] as const) {
      const o = c.createOscillator(), e = c.createGain(); o.type = 'sine'; o.frequency.value = f;
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g * vel * 0.045, t + 0.002); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(e).connect(p); o.start(t); o.stop(t + 0.2);
    }
  }
  private drum(t: number, vel: number, out: AudioNode) {
    const c = this.ctx!, o = c.createOscillator(), e = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.14);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(vel * 0.35, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(e).connect(out); o.start(t); o.stop(t + 0.35);
  }
  private wood(t: number, vel: number, out: AudioNode) {
    const c = this.ctx!, n = c.createBufferSource(), bp = c.createBiquadFilter(), e = c.createGain();
    n.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 6;
    e.gain.setValueAtTime(vel * 0.5, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(bp).connect(e).connect(out); n.start(t); n.stop(t + 0.08);
  }

  // ---------------------------------------------------------------- the groove
  private schedule() {
    const c = this.ctx!;
    while (this.next < c.currentTime + 0.14) {
      const t = this.next, i = this.pulse % 12, bar = Math.floor(this.pulse / 12), chord = CHORDS[bar % 4];
      const k = this.intensity, out = this.musicBus;
      const swing = i % 2 ? PULSE * 0.06 : 0; // a little lilt on the off-pulses
      const lead = Math.floor(bar / 4) % 2 ? LEAD_B : LEAD_A;
      if (BASS[i] != null) this.marimba(chord.root + 12 + BASS[i], t, 0.75, -0.1, out, 1.3);
      if (lead[i] != null) this.marimba(chord.tones[lead[i]], t + swing, (i === 0 ? 0.62 : 0.5) * (0.75 + k * 0.35), 0.2, out);
      if (k > 0.45 && ANSWER[i] != null) this.marimba(chord.tones[ANSWER[i]] + 12, t + swing, 0.32, -0.3, out, 0.8);
      this.shaker(t + swing, (i % 3 === 0 ? 1 : 0.55) * (0.5 + k * 0.6), out);
      if (k > 0.3 && (i === 0 || i === 7)) this.drum(t, i === 0 ? 0.9 : 0.6, out);
      if (k > 0.7 && BELL.has(i)) this.bell(t, i === 0 ? 1 : 0.7, out);
      // every eighth bar, a short high call on the last pulses
      if (bar % 8 === 7 && (i === 8 || i === 10)) this.marimba(chord.tones[5] + (i === 8 ? 0 : 2), t, 0.45, 0.35, out);
      this.next += PULSE; this.pulse++;
    }
    // the groove relaxes back towards quiet when nothing is happening
    this.intensity = Math.max(0.35, this.intensity - 0.0035);
  }

  // ---------------------------------------------------------------- public
  setOn(on: boolean) {
    this.on = on;
    if (on) {
      const c = this.setup();
      if (c.state === 'suspended') void c.resume();
      this.musicBus.gain.cancelScheduledValues(c.currentTime);
      this.musicBus.gain.setTargetAtTime(0.5, c.currentTime, 0.8);
      if (this.timer == null) { this.next = c.currentTime + 0.1; this.timer = window.setInterval(() => this.schedule(), 30); }
    } else if (this.ctx) {
      this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      const c = this.ctx;
      window.setTimeout(() => { if (!this.on && this.timer != null) { clearInterval(this.timer); this.timer = null; void c.suspend(); } }, 600);
    }
  }
  /** Something happened in the office: bring the full groove in for a while. */
  bump(to = 0.85) { this.intensity = Math.max(this.intensity, to); }

  private sfx(fn: (t: number, out: AudioNode) => void) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + 0.01;
    // duck the groove a touch so the event reads
    this.musicBus.gain.setTargetAtTime(0.32, t, 0.03); this.musicBus.gain.setTargetAtTime(0.5, t + 0.25, 0.3);
    fn(t, this.sfxBus);
  }
  coin() { this.sfx((t, o) => { this.marimba(84, t, 0.8, 0.3, o, 0.6); this.marimba(89, t + 0.07, 0.75, 0.35, o, 0.7); }); }
  ding() { this.sfx((t, o) => { this.marimba(79, t, 0.7, 0.4, o); this.marimba(86, t + 0.12, 0.6, 0.45, o); this.bell(t + 0.12, 0.8, o); }); }
  thud() { this.sfx((t, o) => { this.drum(t, 1.1, o); this.wood(t + 0.01, 0.9, o); this.marimba(53, t, 0.7, 0, o, 1.4); }); }
  chime() { this.sfx((t, o) => [77, 79, 81, 84, 89].forEach((m, i) => this.marimba(m, t + i * 0.085, 0.7, -0.3 + i * 0.15, o))); }
  cash() { this.sfx((t, o) => { [72, 77, 81, 84].forEach((m, i) => this.marimba(m, t + i * 0.06, 0.75, 0.2, o, 0.8)); this.bell(t + 0.24, 1, o); }); }
  sad() { this.sfx((t, o) => { this.marimba(69, t, 0.6, 0, o, 1.2); this.marimba(65, t + 0.28, 0.55, 0, o, 1.2); this.marimba(62, t + 0.56, 0.5, 0, o, 1.6); }); }

  destroy() {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}
