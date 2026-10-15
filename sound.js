// 8-бит звуки (WebAudio: осцилляторы + шум) и фоновый чиптюн
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  function ac() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (e) {
        return null;
      }
      master = ctx.createGain();
      master.gain.value = 0.3;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, endFreq) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function noise(dur, vol) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol || 0.15;
    src.connect(g);
    g.connect(master);
    src.start(t);
  }

  // Простой 16-шаговый луп: бас + мелодия + хэт
  const BASS = [131, 131, 196, 131, 147, 131, 175, 196, 131, 131, 196, 131, 220, 196, 175, 147];
  const LEAD = [523, 0, 659, 0, 784, 0, 659, 0, 587, 0, 523, 0, 392, 659, 523, 0];

  function musicTick() {
    const i = step % 16;
    tone(BASS[i], 0.13, 'triangle', 0.09);
    if (LEAD[i]) tone(LEAD[i], 0.1, 'square', 0.04);
    if (i % 4 === 2) noise(0.03, 0.05);
    step++;
  }

  const Sound = {
    unlock: function () { ac(); },
    isMuted: function () { return muted; },
    toggleMute: function () { muted = !muted; return muted; },
    shoot: function () { tone(1150, 0.09, 'square', 0.09, 200); },
    hit: function () { noise(0.16, 0.2); tone(180, 0.16, 'square', 0.1, 60); },
    hurt: function () { tone(420, 0.35, 'sawtooth', 0.14, 70); noise(0.25, 0.18); },
    pickup: function () {
      tone(660, 0.08, 'square', 0.11);
      root.setTimeout(function () { tone(880, 0.08, 'square', 0.11); }, 70);
      root.setTimeout(function () { tone(1320, 0.12, 'square', 0.11); }, 140);
    },
    start: function () {
      tone(523, 0.09, 'square', 0.1);
      root.setTimeout(function () { tone(784, 0.09, 'square', 0.1); }, 90);
      root.setTimeout(function () { tone(1046, 0.16, 'square', 0.1); }, 180);
    },
    over: function () {
      const notes = [392, 330, 262, 196];
      notes.forEach(function (n, i) {
        root.setTimeout(function () { tone(n, 0.28, 'square', 0.12); }, i * 190);
      });
    },
    startMusic: function () {
      if (musicTimer) return;
      step = 0;
      musicTimer = root.setInterval(musicTick, 150);
    },
    stopMusic: function () {
      if (musicTimer) {
        root.clearInterval(musicTimer);
        musicTimer = null;
      }
    }
  };

  root.Sound = Sound;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
})(typeof window !== 'undefined' ? window : globalThis);
