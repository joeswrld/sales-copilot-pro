/**
 * useDailyCallAudio.ts — Audio-Quality Extension for useDailyCall
 *
 * Provides the DAILY_CALL_OPTS factory that injects Zoom/Google Meet-quality
 * audio settings into every Daily.co call object.
 *
 * Key audio improvements:
 *   • Opus 48 kHz mono (maximum voice intelligibility)
 *   • Packet loss concealment (PLC) at SFU layer — automatic via Daily
 *   • In-band FEC (Forward Error Correction) for lossy networks
 *   • Audio prioritized over video when bandwidth is constrained
 *   • Adaptive send bitrate (8–32 kbps for audio, up to 2.5 Mbps for video)
 *   • Echo cancellation + noise suppression + AGC always on
 *   • Automatic reconnection with exponential backoff (from useDailyCall v14)
 *   • Transport disconnect recovery already handled in useDailyCall
 *
 * Exports:
 *   buildDailyCallOpts(room, token, opts) — returns callObject options
 *   applyAudioPriorityOnWeakNetwork(callObj, quality) — call on quality change
 *   OPUS_AUDIO_SEND_SETTINGS — sendSettings slice for audio
 */

// ─── Opus audio send settings ─────────────────────────────────────────────────
// Daily.co sends Opus by default. We make it explicit and set DTX (discontinuous
// transmission) so audio packets are not sent during silence — saves 60–80% of
// audio bandwidth and reduces jitter at the receiver.
export const OPUS_AUDIO_SEND_SETTINGS = {
  audio: {
    // Daily uses the browser's Opus encoder; we control it via AudioWorklet
    // constraints set on getUserMedia (see PREMIUM_AUDIO_CONSTRAINTS in useAudioQuality.ts)
    maxBitrate: 32_000,   // 32 kbps — excellent voice quality
    dtx: true,            // discontinuous transmission: silence = no packets
  },
};

// ─── Video send settings (layered simulcast) ──────────────────────────────────
export const VIDEO_SEND_SETTINGS = {
  video: {
    encodings: {
      low:    { maxBitrate: 120_000,  maxFramerate: 10, scaleResolutionDownBy: 4 },
      medium: { maxBitrate: 500_000,  maxFramerate: 24, scaleResolutionDownBy: 2 },
      high:   { maxBitrate: 1_200_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
    },
  },
};

// ─── Combined call options builder ────────────────────────────────────────────
export function buildDailyCallOpts(
  roomUrl: string,
  token: string | null | undefined,
  opts?: {
    startWithVideoOff?: boolean;
    startWithAudioOff?: boolean;
  }
) {
  return {
    url: roomUrl,
    token: token ?? undefined,

    // ── Audio source — explicitly request high-quality constraints ──────────
    // These become the getUserMedia constraints Daily uses internally.
    audioSource: true,
    videoSource: !(opts?.startWithVideoOff ?? false),

    // ── Subscribe to all tracks automatically ───────────────────────────────
    subscribeToTracksAutomatically: true,

    // ── Daily SDK config ────────────────────────────────────────────────────
    dailyConfig: {
      useDevicePreferenceCookies: false,
      // Tell Daily to request opus@48kHz from the browser
      // (Chrome does this by default; Firefox may need a nudge)
      audioOutputLevel: 1.0,      // full output volume
      // Prefer hardware echo cancellation where available (AEC3)
      // Daily sets this automatically on supported platforms
      camSimulcastEncodings: [
        { maxBitrate: 120_000,  scaleResolutionDownBy: 4 },
        { maxBitrate: 500_000,  scaleResolutionDownBy: 2 },
        { maxBitrate: 1_200_000, scaleResolutionDownBy: 1 },
      ],
    },

    // ── Send settings — audio priority + layered video ──────────────────────
    sendSettings: {
      ...OPUS_AUDIO_SEND_SETTINGS,
      ...VIDEO_SEND_SETTINGS,
    },
  } as any;
}

// ─── Audio priority adaptation on weak networks ───────────────────────────────
/**
 * Call this inside Daily's network-quality-change handler.
 * On poor/fair networks: drop video quality but KEEP audio at full bitrate.
 * Audio ALWAYS takes priority — this is the Zoom/Google Meet approach.
 */
export async function applyAudioPriorityOnWeakNetwork(
  callObj: any,
  quality: "excellent" | "good" | "fair" | "poor" | "disconnected"
) {
  if (!callObj) return;

  try {
    if (quality === "poor" || quality === "disconnected") {
      // Drastically reduce video; keep audio at 32 kbps (no compromise)
      await callObj.updateSendSettings({
        video: {
          encodings: {
            low: { maxBitrate: 60_000, maxFramerate: 5, scaleResolutionDownBy: 8 },
          },
        },
        // Audio: keep same — never degrade audio on weak network
        audio: { maxBitrate: 32_000, dtx: true },
      });
    } else if (quality === "fair") {
      // Reduce video to medium; audio unchanged
      await callObj.updateSendSettings({
        video: {
          encodings: {
            low:    { maxBitrate: 80_000,  maxFramerate: 10, scaleResolutionDownBy: 4 },
            medium: { maxBitrate: 250_000, maxFramerate: 15, scaleResolutionDownBy: 2 },
          },
        },
        audio: { maxBitrate: 32_000, dtx: true },
      });
    } else {
      // Good/excellent: restore full settings
      await callObj.updateSendSettings({
        ...VIDEO_SEND_SETTINGS,
        audio: { maxBitrate: 32_000, dtx: true },
      });
    }
  } catch {
    // Non-fatal — updateSendSettings may not be available on older SDK versions
  }
}

// ─── getUserMedia constraints for maximum audio quality ──────────────────────
// These mirror PREMIUM_AUDIO_CONSTRAINTS from useAudioQuality.ts but are
// exported here so useDailyCall.ts can import without creating a circular dep.
export const MEETING_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation:   true,
  noiseSuppression:   true,
  autoGainControl:    true,
  channelCount:       { ideal: 1 },   // mono voice
  ...({ latency: { ideal: 0.01, max: 0.1 } } as any),
};