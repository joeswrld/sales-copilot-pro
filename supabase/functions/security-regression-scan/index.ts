/**
 * security-regression-scan
 *
 * Automated security regression scanner. Runs a suite of SQL/config checks
 * against the live database and records results in
 * `security_scan_runs` / `security_scan_findings`, marking findings that
 * disappeared as `resolved` and new ones as `new`.
 *
 * Trigger sources:
 *   - "deploy"  → called after each deploy (CRON_SECRET header)
 *   - "cron"    → scheduled re-run
 *   - "manual"  → admin clicks "Run scan" in the admin UI (JWT + admin role)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { logAudit } from "../_shared/audit.ts";

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface Finding {
  finding_key: string;
  title: string;
  severity: Severity;
  category: string;
  detail: string;
  metadata?: Record<string, unknown>;
}

interface Check {
  key: string;
  title: string;
  severity: Severity;
  category: string;
  sql: string;
  /** Rows returned => a finding (one per row). */
  detail: (row: Record<string, unknown>) => string;
}

const CHECKS: Check[] = [
  {
    key: "rls_disabled",
    title: "Table in public schema without RLS enabled",
    severity: "critical",
    category: "rls",
    sql: `select c.relname as table_name
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false`,
    detail: (r) => `public.${r.table_name} has row level security disabled`,
  },
  {
    key: "rls_no_policy",
    title: "RLS enabled but no policies defined",
    severity: "high",
    category: "rls",
    sql: `select c.relname as table_name
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
            and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
    detail: (r) => `public.${r.table_name} has RLS on but zero policies — it is unreadable and unwritable`,
  },
  {
    key: "anon_write_policy",
    title: "Anonymous role can write via an unrestricted policy",
    severity: "high",
    category: "rls",
    sql: `select c.relname as table_name, p.polname as policy_name, p.polcmd as cmd
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and p.polcmd in ('w','d','*')
            and 'anon' = any (select rolname from pg_roles where oid = any (p.polroles))
            and coalesce(pg_get_expr(p.polqual, p.polrelid), 'true') = 'true'`,
    detail: (r) => `policy "${r.policy_name}" on public.${r.table_name} lets anon modify rows with no restriction`,
  },
  {
    key: "security_definer_mutable_search_path",
    title: "SECURITY DEFINER function without a fixed search_path",
    severity: "medium",
    category: "functions",
    sql: `select p.proname as function_name
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosecdef = true
            and not exists (
              select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
              where cfg like 'search_path=%'
            )`,
    detail: (r) => `public.${r.function_name}() is SECURITY DEFINER without "SET search_path" (search-path hijack risk)`,
  },
  {
    key: "public_storage_bucket",
    title: "Storage bucket is publicly readable",
    severity: "high",
    category: "storage",
    sql: `select id from storage.buckets where public = true`,
    detail: (r) => `storage bucket "${r.id}" is public — objects are readable without a signed URL`,
  },
  {
    key: "plaintext_token_column",
    title: "Token/secret column readable by client roles",
    severity: "critical",
    category: "secrets",
    sql: `select table_name, column_name, grantee
          from information_schema.column_privileges
          where table_schema = 'public'
            and privilege_type = 'SELECT'
            and grantee in ('anon','authenticated')
            and (column_name ilike '%access_token%'
              or column_name ilike '%refresh_token%'
              or column_name ilike '%secret%'
              or column_name = 'key_hash')`,
    detail: (r) => `${r.grantee} can select public.${r.table_name}.${r.column_name}`,
  },
  {
    key: "role_column_on_profile_table",
    title: "Privilege column stored outside user_roles",
    severity: "high",
    category: "authorization",
    sql: `select table_name, column_name
          from information_schema.columns
          where table_schema = 'public'
            and table_name in ('profiles','users','user_preferences')
            and column_name in ('role','is_admin','admin')`,
    detail: (r) => `public.${r.table_name}.${r.column_name} allows privilege escalation — roles belong in public.user_roles`,
  },
  {
    key: "security_definer_view",
    title: "View defined with SECURITY DEFINER semantics",
    severity: "medium",
    category: "rls",
    sql: `select c.relname as view_name
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'v'
            and coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=false%'`,
    detail: (r) => `view public.${r.view_name} bypasses the caller's RLS`,
  },
];

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function runSql(sb: any, sql: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await sb.rpc("security_scan_query", { _sql: sql });
  if (error) throw new Error(`${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = admin();
  let trigger = "manual";
  let actorId: string | null = null;
  let actorEmail: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    trigger = typeof body?.trigger === "string" ? body.trigger : "manual";

    // ── Authorization: CRON_SECRET (deploy/cron) OR an admin JWT (manual) ──
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedCron = req.headers.get("x-cron-secret");
    const isCron = !!cronSecret && providedCron === cronSecret;

    if (!isCron) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const jwt = authHeader.replace("Bearer ", "");
      if (!jwt) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      actorId = userData.user.id;
      actorEmail = userData.user.email ?? null;
      const { data: isAdmin } = await sb.rpc("has_role", { _user_id: actorId, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin role required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      trigger = trigger === "manual" ? "manual" : trigger;
    }

    // ── Start a run ────────────────────────────────────────────────────
    const { data: run, error: runErr } = await sb
      .from("security_scan_runs")
      .insert({ status: "running", trigger_source: trigger })
      .select("id")
      .single();
    if (runErr) throw runErr;
    const runId = run.id as string;

    // ── Execute checks ─────────────────────────────────────────────────
    const findings: Finding[] = [];
    const checkErrors: string[] = [];

    for (const check of CHECKS) {
      try {
        const rows = await runSql(sb, check.sql);
        for (const row of rows) {
          const suffix = Object.values(row).join(":").slice(0, 120);
          findings.push({
            finding_key: `${check.key}:${suffix}`,
            title: check.title,
            severity: check.severity,
            category: check.category,
            detail: check.detail(row),
            metadata: row,
          });
        }
      } catch (e) {
        checkErrors.push(`${check.key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ── Reconcile against previously open findings ─────────────────────
    const { data: existing } = await sb
      .from("security_scan_findings")
      .select("id, finding_key, state")
      .neq("state", "resolved");

    const existingByKey = new Map<string, { id: string; state: string }>(
      (existing ?? []).map((f: any) => [f.finding_key, { id: f.id, state: f.state }]),
    );
    const seenKeys = new Set(findings.map((f) => f.finding_key));
    const now = new Date().toISOString();
    let newCount = 0;

    for (const f of findings) {
      const prior = existingByKey.get(f.finding_key);
      if (prior) {
        await sb
          .from("security_scan_findings")
          .update({
            run_id: runId,
            state: "open",
            severity: f.severity,
            title: f.title,
            detail: f.detail,
            metadata: f.metadata ?? {},
            last_seen_at: now,
            updated_at: now,
          })
          .eq("id", prior.id);
      } else {
        newCount++;
        await sb.from("security_scan_findings").insert({
          run_id: runId,
          finding_key: f.finding_key,
          title: f.title,
          severity: f.severity,
          category: f.category,
          detail: f.detail,
          metadata: f.metadata ?? {},
          state: "new",
          first_seen_at: now,
          last_seen_at: now,
        });
      }
    }

    // Anything previously open that no longer reproduces is resolved.
    const resolvedIds = (existing ?? [])
      .filter((f: any) => !seenKeys.has(f.finding_key))
      .map((f: any) => f.id);
    if (resolvedIds.length) {
      await sb
        .from("security_scan_findings")
        .update({ state: "resolved", resolved_at: now, updated_at: now })
        .in("id", resolvedIds);
    }

    await sb
      .from("security_scan_runs")
      .update({
        status: checkErrors.length ? "completed_with_errors" : "completed",
        finished_at: now,
        total_findings: findings.length,
        new_findings: newCount,
        resolved_findings: resolvedIds.length,
        error_text: checkErrors.length ? checkErrors.join(" | ") : null,
      })
      .eq("id", runId);

    await logAudit({
      action: "security_regression_scan",
      category: "security",
      severity: newCount > 0 ? "warn" : "info",
      user_id: actorId,
      actor_email: actorEmail,
      target_type: "security_scan_run",
      target_id: runId,
      risk_score: newCount > 0 ? 50 : 5,
      details: { trigger, total: findings.length, new: newCount, resolved: resolvedIds.length },
      req,
    });

    return new Response(
      JSON.stringify({
        run_id: runId,
        trigger,
        total_findings: findings.length,
        new_findings: newCount,
        resolved_findings: resolvedIds.length,
        check_errors: checkErrors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("security-regression-scan failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
