import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { startProductAnalytics, paPageView, flush } from "@/lib/analytics";

/**
 * Mounts the first-party product-analytics / session-replay recorder once and
 * reports a page view on every route change.
 */
export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    startProductAnalytics();
    return () => { void flush(); };
  }, []);

  useEffect(() => {
    paPageView(location.pathname);
  }, [location.pathname]);

  return null;
}
