/* =========================================================================
 * sfx.js —— 用 WebAudio 即时合成战斗音效（零素材）
 * 仅作占位反馈：挥击 / 命中 / 弹反清脆声 / 破防钟鸣 / 失手。
 * 正式版应替换为一致的 BGM + 采样音效层（不要用 Seedance 逐片段音频）。
 * ========================================================================= */
class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  _ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  _tone(freq, dur, type = 'sine', gain = 0.2, slideTo = null) {
    if (!this.enabled) return;
    const ctx = this._ensure();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }
  _noise(dur, gain = 0.3, hp = 800) {
    if (!this.enabled) return;
    const ctx = this._ensure();
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = hp;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(filt).connect(g).connect(ctx.destination);
    src.start(t);
  }
  swing()  { this._noise(0.18, 0.18, 1200); this._tone(220, 0.18, 'triangle', 0.12, 120); }
  hit()    { this._noise(0.22, 0.35, 500);  this._tone(90, 0.25, 'square', 0.22, 50); }
  parry()  { this._tone(1400, 0.12, 'square', 0.18, 2600); this._tone(2100, 0.3, 'sine', 0.16); this._noise(0.1, 0.2, 3000); }
  ultimate(){ this._tone(160, 0.5, 'sawtooth', 0.22, 420); this._noise(0.5, 0.25, 300); }
  break_()  { this._tone(70, 0.9, 'sine', 0.3, 40); this._tone(520, 0.9, 'sine', 0.18); }
  miss()   { this._tone(180, 0.12, 'sine', 0.12, 110); }
  heal()   { this._tone(520, 0.3, 'sine', 0.14, 880); }
  victory(){ [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.4, 'triangle', 0.18), i * 140)); }
}
window.Sfx = Sfx;
