/**
 * Web Audio API notification chime.
 * Plays a short, pleasant two-tone bell that is urgent without being jarring.
 * Throttled to max 1 play per 2.5 seconds.
 */

let lastPlayTime = 0;

export function playNotificationSound() {
  const now = Date.now();
  if (now - lastPlayTime < 2500) return;
  lastPlayTime = now;

  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playTone = (freq: number, start: number, duration: number, gain = 0.12) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      g.gain.setValueAtTime(gain, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    const t = ctx.currentTime;
    // First tone — bright, urgent (A5)
    playTone(880, t, 0.35, 0.14);
    // Second tone — slightly lower, reinforcing (E5)
    playTone(659.25, t + 0.12, 0.45, 0.10);
    // Soft harmonic overtone for "bell" quality
    playTone(1760, t, 0.20, 0.04);

    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    // Web Audio not available — silently ignore
  }
}
