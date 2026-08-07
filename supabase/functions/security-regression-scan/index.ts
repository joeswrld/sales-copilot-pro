/**
 * security-regression-scan
 *
 * Automated security regression scanner. Calls the vetted, parameter-free
 * database probe `public.security_scan_probe()` (SECURITY DEFINER, read-only)
 * and records results in `security_scan_runs` / `security_scan_findings`,
 * flagging brand-new findings and auto-resolving ones that no longer reproduce.
 *
 * Trigger sources:
 *   - "deploy" / "cron" → server-to-server with the CRON_SECRET header
 *   - "manual"          → admin clicks "Run scan" in the admin UI (admin JWT)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAudit } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


interface ProbeRow {
  finding_key: string;
  title: string;
  severity: string;
  category: string;
  detail: string;
  metadata: Record<string, unknown> | null;
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = admin();
  let trigger = "manual";
  let actorId: string | null = null;
  let actorEmail: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const requested = typeof body?.trigger === "string" ? body.trigger : "manual";

    // ── Authorization: CRON_SECRET (deploy/cron) OR an admin JWT (manual) ──
    const cronSecret = Deno.env.get("CRON_SECRET");
    const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;

    if (isCron) {
      trigger = requested === "deploy" ? "deploy" : "cron";
    } else {
      const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
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
      trigger = "manual";
    }

    // ── Start a run ────────────────────────────────────────────────────
    const { data: run, error: runErr } = await sb
      .from("security_scan_runs")
      .insert({ status: "running", trigger_source: trigger })
      .select("id")
      .single();
    if (runErr) throw runErr;
    const runId = run.id as string;

    // ── Execute the probe suite ────────────────────────────────────────
    const { data: probe, error: probeErr } = await sb.rpc("security_scan_probe");
    if (probeErr) {
      await sb
        .from("security_scan_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_text: probeErr.message,
        })
        .eq("id", runId);
      throw new Error(`probe failed: ${probeErr.message}`);
    }
    const findings = (probe ?? []) as ProbeRow[];

    // ── Reconcile against previously open findings ─────────────────────
    const { data: existing } = await sb
      .from("security_scan_findings")
      .select("id, finding_key, state")
      .neq("state", "resolved");

    const existingByKey = new Map<string, string>(
      (existing ?? []).map((f: any) => [f.finding_key, f.id]),
    );
    const seenKeys = new Set(findings.map((f) => f.finding_key));
    const now = new Date().toISOString();
    let newCount = 0;

    for (const f of findings) {
      const priorId = existingByKey.get(f.finding_key);
      if (priorId) {
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
          .eq("id", priorId);
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
        status: "completed",
        finished_at: now,
        total_findings: findings.length,
        new_findings: newCount,
        resolved_findings: resolvedIds.length,
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
