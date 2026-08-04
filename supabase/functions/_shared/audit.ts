/**
 * Shared audit-log helper for sensitive server-side actions.
 *
 * Writes to public.audit_logs with full attribution:
 *   - who (user_id + actor_email + actor_role resolved from public.user_roles)
 *   - what (action / category / target)
 *   - when (created_at default now())
 *   - where from (ip_address / user_agent)
 *
 * Used for: OAuth/API token access, webhook processing, transcript access.
 * Never throws — auditing must not break the calling function.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuditSeverity = "info" | "warn" | "error" | "critical";

export interface AuditEntry {
  action: string;
  category?: string;
  severity?: AuditSeverity;
  user_id?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  risk_score?: number;
  details?: Record<string, unknown>;
  req?: Request;
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function clientIp(req?: Request): string | null {
  if (!req) return null;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? null;
}

async function resolveRole(sb: any, userId?: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
    const roles = (data ?? []).map((r: any) => r.role);
    if (roles.includes("admin")) return "admin";
    if (roles.includes("moderator")) return "moderator";
    return roles[0] ?? "user";
  } catch {
    return null;
  }
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const sb = admin();
    const role = entry.actor_role ?? (await resolveRole(sb, entry.user_id));

    let email = entry.actor_email ?? null;
    if (!email && entry.user_id) {
      const { data } = await sb.from("profiles").select("email").eq("id", entry.user_id).maybeSingle();
      email = data?.email ?? null;
    }

    await sb.from("audit_logs").insert({
      user_id: entry.user_id ?? null,
      actor_email: email,
      actor_role: role,
      action: entry.action,
      category: entry.category ?? "security",
      severity: entry.severity ?? "info",
      target_type: entry.target_type ?? null,
      target_id: entry.target_id ?? null,
      ip_address: clientIp(entry.req),
      user_agent: entry.req?.headers.get("user-agent") ?? null,
      risk_score: entry.risk_score ?? 0,
      details: entry.details ?? {},
    });
  } catch (e) {
    console.warn("logAudit failed (non-fatal):", e);
  }
}

/** Convenience wrappers for the three sensitive categories. */
export const auditTokenAccess = (e: Omit<AuditEntry, "action" | "category">, action: string) =>
  logAudit({ ...e, action, category: "token", severity: e.severity ?? "warn", risk_score: e.risk_score ?? 40 });

export const auditWebhook = (e: Omit<AuditEntry, "action" | "category">, action: string) =>
  logAudit({ ...e, action, category: "webhook", severity: e.severity ?? "info", risk_score: e.risk_score ?? 10 });

export const auditTranscriptAccess = (e: Omit<AuditEntry, "action" | "category">, action: string) =>
  logAudit({ ...e, action, category: "transcript", severity: e.severity ?? "info", risk_score: e.risk_score ?? 25 });
