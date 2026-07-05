// Server-side free-trial gate.
// Requires a verified email, uses hashed identifiers + IP rate limit as risk signals.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    // SERVER-SIDE email verification enforcement
    if (!user.email_confirmed_at) {
      return json({ ok: false, reason: "email_not_verified" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const fingerprint = typeof body?.fingerprint === "string" ? body.fingerprint.slice(0, 512) : "";
    const ip = clientIp(req);
    const googleSub =
      (user.identities?.find((i: any) => i.provider === "google")?.id as string | undefined) ??
      (user.user_metadata?.sub as string | undefined) ??
      "";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data, error } = await admin.rpc("start_trial", {
      _user_id: user.id,
      _email: user.email ?? "",
      _google_sub: googleSub,
      _ip: ip,
      _fingerprint: fingerprint,
    });
    if (error) return json({ ok: false, reason: "rpc_error", detail: error.message }, 500);
    return json(data);
  } catch (e) {
    return json({ ok: false, reason: "internal", detail: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
