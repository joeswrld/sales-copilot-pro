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
  | "signup_started"
  | "signup_completed";

const SESSION_KEY = "fx_funnel_session";

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
      metadata,
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
