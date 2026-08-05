import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackFunnel, trackFunnelOnce, isTrialCta } from "@/lib/funnel";

/**
 * Global funnel tracker.
 * - logs a page_view on every route change (public marketing + app pages)
 * - logs a trial_click whenever a "Start Free Trial"-style CTA is clicked anywhere
 */
export default function FunnelTracker() {
  const location = useLocation();

  useEffect(() => {
    void trackFunnel("page_view", { search: location.search || null });
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (isTrialCta(target)) {
        trackFunnelOnce(`trial:${location.pathname}`, "trial_click", { from: location.pathname });
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [location.pathname]);

  return null;
}
