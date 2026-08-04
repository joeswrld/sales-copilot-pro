// Rate-limited resend of the email-verification message.
// Limits: 1 per 60s per email, 5 per hour per IP.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const lastByEmail = new Map<string, number>();

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { email, redirectTo } = await req.json().catch(() => ({}));

    // Only allow redirects to trusted Fixsense origins (open-redirect / phishing guard)
    const ALLOWED_ORIGINS = [
      "https://fixsense.com.ng",
      "https://www.fixsense.com.ng",
      "https://app.fixsense.com.ng",
      "https://fixsense.app",
    ];
    let safeRedirect: string | undefined = "https://fixsense.com.ng/verify-email";
    if (typeof redirectTo === "string" && redirectTo.length < 500) {
      try {
        const u = new URL(redirectTo);
        if (ALLOWED_ORIGINS.includes(u.origin)) safeRedirect = u.toString();
      } catch { /* keep default */ }
    }
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "invalid_email" }, 400);
    }
    const normEmail = email.trim().toLowerCase();

    const now = Date.now();
    const last = lastByEmail.get(normEmail) ?? 0;
    if (now - last < 60_000) {
      return json({ error: "cooldown", retry_after: Math.ceil((60_000 - (now - last)) / 1000) }, 429);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // IP hourly cap via signup_ip_log
    const ip = clientIp(req);
    const { data: hashRow } = await admin.rpc("hash_identifier", { _value: ip });
    const ipHash = hashRow as unknown as string | null;
    if (ipHash) {
      const { count } = await admin
        .from("signup_ip_log")
        .select("*", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .eq("event", "resend_verify")
        .gt("created_at", new Date(Date.now() - 3_600_000).toISOString());
      if ((count ?? 0) >= 5) return json({ error: "ip_rate_limit" }, 429);
    }

    const { error } = await admin.auth.resend({
      type: "signup",
      email: normEmail,
      options: { emailRedirectTo: safeRedirect },
    });
    if (error) return json({ error: error.message }, 400);

    lastByEmail.set(normEmail, now);
    if (ipHash) {
      await admin.from("signup_ip_log").insert({ ip_hash: ipHash, event: "resend_verify" });
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
