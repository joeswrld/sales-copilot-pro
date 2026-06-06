/**
 * Timezone helpers.
 *
 * - User's preferred IANA timezone is loaded from `user_preferences.timezone`
 *   and cached per session. Falls back to the browser's tz when unset.
 * - Conversions use the platform `Intl` API (no extra dependency).
 */

import { supabase } from "@/integrations/supabase/client";

let cachedTz: string | null = null;
let cacheUserId: string | null = null;
let inFlight: Promise<string> | null = null;

const listeners = new Set<(tz: string) => void>();

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Get the user's preferred timezone (cached). Falls back to browser tz. */
export async function getUserTimezone(userId?: string | null): Promise<string> {
  if (!userId) return cachedTz ?? browserTimezone();
  if (cachedTz && cacheUserId === userId) return cachedTz;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data } = await supabase
        .from("user_preferences")
        .select("timezone")
        .eq("user_id", userId)
        .maybeSingle();
      const tz = (data?.timezone as string | null) || browserTimezone();
      cachedTz = tz;
      cacheUserId = userId;
      listeners.forEach((l) => l(tz));
      return tz;
    } catch {
      const tz = browserTimezone();
      cachedTz = tz;
      cacheUserId = userId;
      return tz;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Synchronous accessor for the last-resolved timezone (or browser fallback). */
export function getUserTimezoneSync(): string {
  return cachedTz ?? browserTimezone();
}

/** Update the cached timezone (call after the user saves a new preference). */
export function setUserTimezone(tz: string, userId?: string | null) {
  cachedTz = tz;
  if (userId) cacheUserId = userId;
  listeners.forEach((l) => l(tz));
}

export function subscribeUserTimezone(fn: (tz: string) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Convert a "YYYY-MM-DD" + "HH:MM" wall-clock pair in the given IANA timezone
 * to an absolute UTC ISO string. Works without date-fns-tz by binary-searching
 * the offset via Intl.
 */
export function zonedDateTimeToUtcIso(date: string, time: string, tz: string): string {
  // Naive UTC moment as if the wall-clock were UTC.
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naiveUtcMs = Date.UTC(y, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, 0);

  // Compute the offset of that instant in the target tz.
  const offsetMs = tzOffsetMs(naiveUtcMs, tz);
  // The real UTC instant for the wall-clock is naive - offset.
  let utcMs = naiveUtcMs - offsetMs;
  // Refine once to handle DST boundaries.
  const refined = tzOffsetMs(utcMs, tz);
  if (refined !== offsetMs) utcMs = naiveUtcMs - refined;
  return new Date(utcMs).toISOString();
}

/** Offset (in ms) between the wall-clock in `tz` at instant `utcMs` and UTC. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - utcMs;
}

/** Format an instant in the given timezone (or user's tz). */
export function formatInTimezone(
  iso: string | Date,
  tz?: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const zone = tz || getUserTimezoneSync();
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: zone })
      .format(typeof iso === "string" ? new Date(iso) : iso);
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** Return the wall-clock "YYYY-MM-DD" and "HH:MM" of `iso` in `tz`. */
export function splitZonedDateTime(iso: string, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`,
  };
}
