/**
 * User notification preferences (sound, volume, DND, mute, vibration).
 * Persisted to localStorage. Synchronous, no DB required.
 */

export type SoundId = "bell" | "chime" | "ping" | "pulse" | "soft";

export interface NotificationSettings {
  enabled: boolean;          // master toggle (mute)
  sound: SoundId;
  volume: number;            // 0..1
  vibration: boolean;
  dnd: boolean;              // do-not-disturb (silences sound + vibration)
  quietHours: {
    enabled: boolean;
    start: string;           // "HH:MM" 24h
    end: string;             // "HH:MM" 24h
  };
}

const KEY = "notif.settings.v1";

const DEFAULTS: NotificationSettings = {
  enabled: true,
  sound: "bell",
  volume: 0.7,
  vibration: true,
  dnd: false,
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
};

let current: NotificationSettings = load();
const listeners = new Set<(s: NotificationSettings) => void>();

function load(): NotificationSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed, quietHours: { ...DEFAULTS.quietHours, ...(parsed?.quietHours ?? {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getNotificationSettings(): NotificationSettings {
  return current;
}

export function setNotificationSettings(patch: Partial<NotificationSettings>) {
  current = { ...current, ...patch, quietHours: { ...current.quietHours, ...(patch.quietHours ?? {}) } };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch {}
  listeners.forEach(l => l(current));
}

export function subscribeNotificationSettings(fn: (s: NotificationSettings) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function isInQuietHours(now = new Date()): boolean {
  const { quietHours } = current;
  if (!quietHours.enabled) return false;
  const [sh, sm] = quietHours.start.split(":").map(Number);
  const [eh, em] = quietHours.end.split(":").map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s === e) return false;
  // Range may cross midnight
  return s < e ? (cur >= s && cur < e) : (cur >= s || cur < e);
}

/** True when sound/vibration should be silenced (mute, DND, or quiet hours). */
export function isSilenced(): boolean {
  if (!current.enabled) return true;
  if (current.dnd) return true;
  if (isInQuietHours()) return true;
  return false;
}

export const SOUND_PRESETS: { id: SoundId; label: string; description: string }[] = [
  { id: "bell",  label: "Bell",        description: "Bright two-tone bell" },
  { id: "chime", label: "Chime",       description: "Warm ascending chime" },
  { id: "ping",  label: "Ping",        description: "Short crisp ping" },
  { id: "pulse", label: "Pulse",       description: "Urgent double pulse" },
  { id: "soft",  label: "Soft",        description: "Subtle low tone" },
];
