import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AnalyticsRange } from "./useAdminAnalytics";

export interface PAFilters {
  device: string | null;
  browser: string | null;
  country: string | null;
  path: string | null;
  user: string | null;
  frictionOnly: boolean;
}

export const emptyFilters: PAFilters = {
  device: null, browser: null, country: null, path: null, user: null, frictionOnly: false,
};

export interface Overview {
  sessions: number; users: number; page_views: number; clicks: number;
  rage_clicks: number; dead_clicks: number; errors: number;
  avg_duration_sec: number; bounce_rate: number; avg_scroll_pct: number;
  conversion_rate: number; signups: number;
}

export interface PageRow {
  path: string; views: number; sessions: number; exits: number; exit_rate: number;
  rage_clicks: number; dead_clicks: number; errors: number; avg_scroll_pct: number;
}

export interface SessionRow {
  id: string; user_id: string | null; email: string | null; full_name: string | null;
  avatar_url: string | null; started_at: string; duration_sec: number; page_views: number;
  clicks: number; rage_clicks: number; dead_clicks: number; errors: number;
  max_scroll_pct: number; device: string | null; browser: string | null; os: string | null;
  country: string | null; entry_path: string | null; exit_path: string | null;
  referrer: string | null; event_count: number;
}

export interface FrictionRow {
  kind: string; path: string | null; selector: string | null; label: string | null;
  occurrences: number; sessions: number; sample: string | null;
}

export interface IgnoredRow {
  selector: string; label: string | null; path: string | null;
  seen: number; clicked: number; click_rate: number;
}

export interface JourneyRow { from_path: string; to_path: string; transitions: number }
export interface ClickPoint { gx: number; gy: number; kind: string; hits: number; top_label: string | null }
export interface ScrollRow { depth_pct: number; sessions: number; reach_pct: number }
export interface SeriesRow { bucket: string; sessions: number; page_views: number; rage_clicks: number; dead_clicks: number; errors: number }

export interface FilterOptions { devices: string[]; browsers: string[]; countries: string[]; paths: string[] }

export function useProductAnalytics(range: AnalyticsRange, filters: PAFilters, heatPath: string | null) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [friction, setFriction] = useState<FrictionRow[]>([]);
  const [ignored, setIgnored] = useState<IgnoredRow[]>([]);
  const [journeys, setJourneys] = useState<JourneyRow[]>([]);
  const [clickMap, setClickMap] = useState<ClickPoint[]>([]);
  const [scroll, setScroll] = useState<ScrollRow[]>([]);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [options, setOptions] = useState<FilterOptions>({ devices: [], browsers: [], countries: [], paths: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supa = supabase as any;
    const base = { _from: range.from.toISOString(), _to: range.to.toISOString() };
    const f = {
      _device: filters.device, _browser: filters.browser,
      _country: filters.country, _user: filters.user,
    };

    const [ov, tp, sl, fr, ig, jr, cm, sd, sr, fo] = await Promise.all([
      supa.rpc("analytics_overview", { ...base, ...f, _path: filters.path }),
      supa.rpc("analytics_top_pages", { ...base, ...f, _limit: 30 }),
      supa.rpc("analytics_sessions_list", {
        ...base, ...f, _path: filters.path, _friction_only: filters.frictionOnly, _limit: 100, _offset: 0,
      }),
      supa.rpc("analytics_friction", { ...base, _limit: 30 }),
      supa.rpc("analytics_ignored_elements", { ...base, _path: filters.path, _limit: 25 }),
      supa.rpc("analytics_journeys", { ...base, _limit: 40 }),
      supa.rpc("analytics_click_map", { ...base, _path: heatPath, _device: filters.device, _grid: 40 }),
      supa.rpc("analytics_scroll_depth", { ...base, _path: heatPath, _device: filters.device }),
      supa.rpc("analytics_series", { ...base, _bucket: range.bucket }),
      supa.rpc("analytics_filter_options", base),
    ]);

    const firstError = [ov, tp, sl, fr, ig, jr, cm, sd, sr, fo].find((r) => r?.error);
    if (firstError?.error) setError(firstError.error.message);

    setOverview((ov.data && ov.data[0]) || null);
    setPages(tp.data || []);
    setSessions(sl.data || []);
    setFriction(fr.data || []);
    setIgnored(ig.data || []);
    setJourneys(jr.data || []);
    setClickMap(cm.data || []);
    setScroll(sd.data || []);
    setSeries(sr.data || []);
    if (fo.data) {
      setOptions({
        devices: fo.data.devices ?? [],
        browsers: fo.data.browsers ?? [],
        countries: fo.data.countries ?? [],
        paths: fo.data.paths ?? [],
      });
    }
    setLoading(false);
  }, [
    range.from, range.to, range.bucket,
    filters.device, filters.browser, filters.country, filters.path, filters.user, filters.frictionOnly,
    heatPath,
  ]);

  useEffect(() => { load(); }, [load]);

  return {
    overview, pages, sessions, friction, ignored, journeys,
    clickMap, scroll, series, options, loading, error, refresh: load,
  };
}

export function useSessionReplay(sessionId: string | undefined) {
  const [data, setData] = useState<{ session: any; events: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!sessionId) return;
    (async () => {
      setLoading(true);
      const { data: res } = await (supabase as any).rpc("analytics_session_replay", { _session_id: sessionId });
      if (active) {
        setData(res?.session ? { session: res.session, events: res.events ?? [] } : null);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [sessionId]);

  return { data, loading };
}
