import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { UAParser } from "https://esm.sh/ua-parser-js@2.0.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anon = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: { user }, error: authErr } = await anon.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { action, category, severity = "info", target_type, target_id, details = {} } = body;
    if (!action || typeof action !== "string" || action.length > 100) {
      return new Response(JSON.stringify({ error: "invalid action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["info", "warn", "error", "critical"].includes(severity)) {
      return new Response(JSON.stringify({ error: "invalid severity" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const ua = req.headers.get("user-agent") || "";
    const country = req.headers.get("cf-ipcountry") || null;
    const city = req.headers.get("cf-ipcity") || null;

    let device: string | null = null;
    let browser: string | null = null;
    try {
      const parser = new UAParser(ua);
      const d = parser.getDevice();
      const b = parser.getBrowser();
      const os = parser.getOS();
      device = [d.vendor, d.model, d.type, os.name].filter(Boolean).join(" ") || null;
      browser = [b.name, b.version].filter(Boolean).join(" ") || null;
    } catch { /* ignore */ }

    const service = createClient(supabaseUrl, serviceKey);

    // Compute simple risk: failed_login + critical events in last 24h
    let risk = 0;
    try {
      const { count: failed } = await service
        .from("audit_logs").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).ilike("action", "%login_failed%")
        .gte("created_at", new Date(Date.now() - 86400000).toISOString());
      const { count: critical } = await service
        .from("audit_logs").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).in("severity", ["error", "critical"])
        .gte("created_at", new Date(Date.now() - 86400000).toISOString());
      risk = Math.min(100, (failed || 0) * 10 + (critical || 0) * 15);
    } catch { /* ignore */ }

    const { error: insErr } = await service.from("audit_logs").insert({
      user_id: user.id,
      actor_email: user.email,
      action,
      category: category || null,
      severity,
      target_type: target_type || null,
      target_id: target_id ? String(target_id).slice(0, 200) : null,
      ip_address: ip,
      user_agent: ua.slice(0, 500) || null,
      device,
      browser,
      country,
      city,
      risk_score: risk,
      details,
    });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, risk_score: risk }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("log-activity error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
