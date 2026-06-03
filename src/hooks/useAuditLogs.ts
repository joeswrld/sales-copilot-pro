import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AuditLog {
  id: string;
  user_id: string | null;
  actor_email: string | null;
  team_id: string | null;
  action: string;
  category: string | null;
  severity: "info" | "warn" | "error" | "critical";
  target_type: string | null;
  target_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device: string | null;
  browser: string | null;
  country: string | null;
  city: string | null;
  risk_score: number;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AuditFilters {
  search?: string;
  actions?: string[];
  severities?: string[];
  from?: Date;
  to?: Date;
  pageSize?: number;
}

export function useAuditLogs(filters: AuditFilters = {}) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const pageSize = filters.pageSize ?? 100;

  const buildQuery = useCallback(
    (cursor: string | null) => {
      let q = (supabase as any).from("audit_logs").select("*").order("created_at", { ascending: false }).limit(pageSize);
      if (cursor) q = q.lt("created_at", cursor);
      if (filters.actions?.length) q = q.in("action", filters.actions);
      if (filters.severities?.length) q = q.in("severity", filters.severities);
      if (filters.from) q = q.gte("created_at", filters.from.toISOString());
      if (filters.to) q = q.lte("created_at", filters.to.toISOString());
      if (filters.search) {
        const s = `%${filters.search}%`;
        q = q.or(`actor_email.ilike.${s},action.ilike.${s},target_id.ilike.${s},user_id.ilike.${s}`);
      }
      return q;
    },
    [filters.actions, filters.severities, filters.from, filters.to, filters.search, pageSize],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    cursorRef.current = null;
    const { data } = await buildQuery(null);
    const rows = (data as AuditLog[]) || [];
    setLogs(rows);
    setHasMore(rows.length === pageSize);
    if (rows.length) cursorRef.current = rows[rows.length - 1].created_at;
    setLoading(false);
  }, [buildQuery, pageSize]);

  const loadMore = useCallback(async () => {
    if (!cursorRef.current || !hasMore) return;
    const { data } = await buildQuery(cursorRef.current);
    const rows = (data as AuditLog[]) || [];
    setLogs((prev) => [...prev, ...rows]);
    setHasMore(rows.length === pageSize);
    if (rows.length) cursorRef.current = rows[rows.length - 1].created_at;
  }, [buildQuery, hasMore, pageSize]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // Realtime — prepend new rows that match filters
  useEffect(() => {
    const channel = (supabase as any)
      .channel("audit-logs-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, (payload: any) => {
        const row = payload.new as AuditLog;
        if (filters.severities?.length && !filters.severities.includes(row.severity)) return;
        if (filters.actions?.length && !filters.actions.includes(row.action)) return;
        setLogs((prev) => [row, ...prev].slice(0, 500));
      })
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [filters.severities, filters.actions]);

  return { logs, loading, hasMore, loadMore, refresh: loadInitial };
}
