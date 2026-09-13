/**
 * Lightweight first-party funnel tracking.
 *
 * Answers the three admin questions:
 *   - how many people visited the website        → `page_view` (distinct sessions)
 *   - how many clicked "Start Free Trial"        → `trial_click`
 *   - how many started sign-up but didn't finish → `signup_started` - `signup_completed`
 *
 * No third-party scripts, no cookies: a random session id in localStorage.
 */

import { supabase } from "@/integrations/supabase/client";

export type FunnelEvent =
  | "page_view"
  | "trial_click"
  | "signup_tab_opened"
  | "signup_abandoned_lead"
  | "signup_submitted"
  | "signup_started"
  | "signup_completed";

const SESSION_KEY = "fx_funnel_session";

/**
 * Best-effort bot signal, checked client-side before we log anything.
 *
 * This is NOT a security control — a bot can trivially spoof navigator
 * properties. It exists purely to keep the funnel_events table honest, so
 * "how many real visitors converted" doesn't get drowned out by crawlers,
 * headless-browser scrapers, and uptime checkers. Real bot *blocking*
 * (rate limiting, WAF rules, CAPTCHA) has to happen at the network edge or
 * on signup — see the note in AuthPanel.tsx.
 */
const BOT_UA = /HeadlessChrome|PhantomJS|bot|crawl|spider|slurp|facebookexternalhit|bytespider|ahrefsbot|semrushbot|mj12bot|dotbot|read-aloud/i;

export function looksLikeBot(): boolean {
  try {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    if (BOT_UA.test(ua)) return true;
    // Headless Chrome sometimes strips "Headless" from the UA string but
    // still reports webdriver=true and no plugins.
    if ((navigator as any).webdriver === true) return true;
    return false;
  } catch {
    return false;
  }
}

export function funnelSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

/** Fire-and-forget: never blocks or throws in the UI. */
export async function trackFunnel(
  event: FunnelEvent,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    await (supabase as any).from("funnel_events").insert({
      session_id: funnelSessionId(),
      event,
      path: typeof location !== "undefined" ? location.pathname : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 400) : null,
      user_id: data.session?.user?.id ?? null,
      // Flagged, not filtered: keep the row (useful for spotting scraping
      // spikes) but mark it so funnel/conversion dashboards can exclude it.
      metadata: { ...metadata, is_likely_bot: looksLikeBot() },
    });
  } catch {
    /* analytics must never break the app */
  }
}

/** De-duplicate an event per session (e.g. one trial_click per page load). */
const fired = new Set<string>();
export function trackFunnelOnce(key: string, event: FunnelEvent, metadata?: Record<string, unknown>) {
  if (fired.has(key)) return;
  fired.add(key);
  void trackFunnel(event, metadata);
}

/**
 * Partial-lead capture for abandoned signups.
 *
 * Records the email (and name, if given) the visitor has typed into the
 * signup form themselves — never anything they haven't entered, and never
 * before they've left the field. This lets the team follow up on people who
 * started signing up and dropped off, similar to standard cart/lead
 * recovery. Disclosed in the Privacy Policy under "Website Visitors &
 * Abandoned Sign-ups".
 *
 * Gated behind the `partial_lead_capture_enabled` platform_config flag
 * (see is_partial_lead_capture_enabled RPC) so it can ship disabled and be
 * turned on later once the Privacy Policy's 14-day change-notice period has
 * run, without needing a new deploy.
 *
 * Fires at most once per funnel session (further edits to the field don't
 * re-send), and only once the email looks syntactically valid — this is
 * never sent from a keystroke, only from a field the visitor has committed.
 */
const partialLeadSent = new Set<string>();

// Cache the flag for the lifetime of the tab so we're not round-tripping to
// the DB on every blur. Re-checked on a fresh page load.
let captureEnabledCache: Promise<boolean> | null = null;
async function isPartialLeadCaptureEnabled(): Promise<boolean> {
  if (!captureEnabledCache) {
    captureEnabledCache = (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("is_partial_lead_capture_enabled");
        if (error) return false;
        return data === true;
      } catch {
        return false;
      }
    })();
  }
  return captureEnabledCache;
}

export async function reportPartialLead(email: string, fullName?: string): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
  const key = funnelSessionId();
  if (partialLeadSent.has(key)) return;
  if (!(await isPartialLeadCaptureEnabled())) return;
  partialLeadSent.add(key);
  await trackFunnel("signup_abandoned_lead", {
    method: "email",
    partial_email: trimmed,
    partial_name: fullName?.trim() || null,
  });
}

const TRIAL_CTA = /start\s*(your\s*)?free\s*trial|start\s*free|try\s*(it\s*)?free|get\s*started\s*free/i;

/** True when a clicked element looks like a "Start Free Trial" CTA. */
export function isTrialCta(el: Element | null): boolean {
  let node: Element | null = el;
  for (let i = 0; node && i < 4; i++) {
    if (node.getAttribute?.("data-funnel") === "trial-cta") return true;
    const text = (node.textContent || "").trim().slice(0, 80);
    if (text && TRIAL_CTA.test(text)) return true;
    node = node.parentElement;
  }
  return false;
}