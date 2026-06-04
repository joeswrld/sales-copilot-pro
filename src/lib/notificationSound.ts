/**
 * Web Audio API notification chimes with multiple sound presets, user
 * volume control, DND / mute / quiet-hours awareness, and mobile vibration.
 * Throttled to max 1 play per 2.5 seconds (force=true bypasses throttle for previews).
 */

import { getNotificationSettings, isSilenced, type SoundId } from "./notificationSettings";

let lastPlayTime = 0;

type Tone = { freq: number; start: number; duration: number; gain?: number; type?: OscillatorType };

const PATTERNS: Record<SoundId, (t: number) => Tone[]> = {
  bell:  (t) => [
    { freq: 880,    start: t,        duration: 0.35, gain: 0.14 },
    { freq: 659.25, start: t + 0.12, duration: 0.45, gain: 0.10 },
    { freq: 1760,   start: t,        duration: 0.20, gain: 0.04 },
  ],
  chime: (t) => [
    { freq: 523.25, start: t,        duration: 0.25, gain: 0.10 },
    { freq: 659.25, start: t + 0.10, duration: 0.25, gain: 0.10 },
    { freq: 783.99, start: t + 0.20, duration: 0.40, gain: 0.12 },
  ],
  ping:  (t) => [
    { freq: 1320,   start: t,        duration: 0.15, gain: 0.14 },
    { freq: 2640,   start: t,        duration: 0.10, gain: 0.05 },
  ],
  pulse: (t) => [
    { freq: 740,    start: t,         duration: 0.18, gain: 0.16, type: "square" },
    { freq: 740,    start: t + 0.22,  duration: 0.18, gain: 0.16, type: "square" },
  ],
  soft:  (t) => [
    { freq: 392,    start: t,        duration: 0.50, gain: 0.10 },
    { freq: 261.63, start: t + 0.05, duration: 0.55, gain: 0.06 },
  ],
};

export function playNotificationSound(opts: { force?: boolean; soundOverride?: SoundId; volumeOverride?: number } = {}) {
  const { force = false, soundOverride, volumeOverride } = opts;
  const settings = getNotificationSettings();

  if (!force && isSilenced()) return;

  const now = Date.now();
  if (!force && now - lastPlayTime < 2500) return;
  lastPlayTime = now;

  const soundId = soundOverride ?? settings.sound;
  const volume = Math.max(0, Math.min(1, volumeOverride ?? settings.volume));
  if (volume <= 0) return;

  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);

    const t = ctx.currentTime;
    const tones = (PATTERNS[soundId] ?? PATTERNS.bell)(t);

    let maxEnd = 0;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = tone.type ?? "sine";
      osc.frequency.setValueAtTime(tone.freq, tone.start);
      g.gain.setValueAtTime(tone.gain ?? 0.12, tone.start);
      g.gain.exponentialRampToValueAtTime(0.001, tone.start + tone.duration);
      osc.connect(g);
      g.connect(master);
      osc.start(tone.start);
      osc.stop(tone.start + tone.duration);
      maxEnd = Math.max(maxEnd, tone.start - t + tone.duration);
    }

    setTimeout(() => ctx.close().catch(() => {}), Math.ceil(maxEnd * 1000) + 200);
  } catch {
    // Web Audio not available — silently ignore
  }

  // Vibration on mobile devices (only when not silenced)
  if (!force && settings.vibration && typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate([120, 60, 120]); } catch {}
  } else if (force && opts.soundOverride && settings.vibration && "vibrate" in navigator) {
    try { navigator.vibrate(80); } catch {}
  }
}
