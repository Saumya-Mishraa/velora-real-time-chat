// Ringtones synthesized with the Web Audio API — no audio assets to ship
// or fail to load. `incoming` is a two-tone ring; `outgoing` is the softer
// ringback the caller hears while waiting.

let ctx = null;
let timer = null;
let nodes = [];

const getCtx = () => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx || ctx.state === "closed") ctx = new AC();
  return ctx;
};

const beep = (audio, freq, start, duration, gainValue) => {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.02);
  gain.gain.setValueAtTime(gainValue, start + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
  nodes.push(osc);
};

export const stopRing = () => {
  clearInterval(timer);
  timer = null;
  nodes.forEach((n) => {
    try {
      n.stop();
    } catch {
      // already stopped
    }
  });
  nodes = [];
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(0);
};

export const startRing = (kind = "incoming") => {
  stopRing();
  const audio = getCtx();
  if (!audio) return;
  audio.resume?.().catch(() => {});

  const cycle = () => {
    const t = audio.currentTime + 0.05;
    if (kind === "incoming") {
      beep(audio, 880, t, 0.35, 0.12);
      beep(audio, 660, t + 0.4, 0.35, 0.12);
      beep(audio, 880, t + 1.2, 0.35, 0.12);
      beep(audio, 660, t + 1.6, 0.35, 0.12);
      if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
    } else {
      beep(audio, 440, t, 1.0, 0.05);
    }
  };
  cycle();
  timer = setInterval(cycle, kind === "incoming" ? 3200 : 3000);
};

export const playTone = (kind) => {
  const audio = getCtx();
  if (!audio) return;
  audio.resume?.().catch(() => {});
  const t = audio.currentTime + 0.02;
  if (kind === "end") {
    beep(audio, 520, t, 0.15, 0.1);
    beep(audio, 380, t + 0.18, 0.2, 0.1);
  } else if (kind === "connected") {
    beep(audio, 660, t, 0.12, 0.08);
    beep(audio, 880, t + 0.14, 0.14, 0.08);
  }
};
