/**
 * send-push-notification — sends real Web Push to all active subscriptions for a user.
 *
 * Auth modes (any one is sufficient):
 *  1. Service-role bearer token (internal cron / direct edge-to-edge calls)
 *  2. Authenticated user JWT where `user_id` in body === auth.uid()  (self-only)
 *  3. `x-internal-token` header matching the vault secret `internal_push_token`
 *     (used by the DB trigger on the `notifications` table)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") || "mailto:notifications@fixsense.app";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (e) {
    console.error("[Push] setVapidDetails failed:", e);
  }
}

let cachedInternalToken: string | null = null;
async function getInternalToken(admin: any): Promise<string | null> {
  if (cachedInternalToken) return cachedInternalToken;
  try {
    const { data } = await admin
      .from("vault" as any)
      .rpc("read_internal_push_token");
    if (data) {
      cachedInternalToken = data as string;
      return cachedInternalToken;
    }
  } catch {
    /* fall through */
  }
  // Fallback: query vault.decrypted_secrets directly via SQL
  try {
    const { data, error } = await admin
      .schema("vault" as any)
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", "internal_push_token")
      .maybeSingle();
    if (!error && data?.decrypted_secret) {
      cachedInternalToken = data.decrypted_secret;
      return cachedInternalToken;
    }
  } catch (e) {
    console.warn("[Push] vault read failed:", e);
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const internalHeader = req.headers.get("x-internal-token") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;

    const body = await req.json().catch(() => ({}));
    const { user_id, title, message, link, tag } = body;
    if (!user_id || !message) {
      return new Response(
        JSON.stringify({ error: "user_id and message required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey,
    );

    let authorized = isServiceRole;

    if (!authorized && internalHeader) {
      const expected = await getInternalToken(admin);
      if (expected && internalHeader === expected) authorized = true;
    }

    if (!authorized) {
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: corsHeaders,
        });
      }
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error } = await anonClient.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: corsHeaders,
        });
      }
      if (user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: corsHeaders,
        });
      }
    }

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, failed_count")
      .eq("user_id", user_id)
      .eq("is_active", true)
      .lt("failed_count", 10);

    const payload = JSON.stringify({
      title: title || "Fixsense",
      body: message,
      url: link || "/dashboard",
      tag: tag || "fixsense-notification",
      icon: "/fixsense_icon_logo (2).png",
      badge: "/fixsense_icon_logo (2).png",
      requireInteraction: false,
      vibrate: [200, 100, 200],
    });

    let sent = 0;
    let failed = 0;
    const failedIds: string[] = [];

    await Promise.all(
      (subs || []).map(async (sub: any) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
            { TTL: 60 * 60 * 24 },
          );
          sent++;
        } catch (err: any) {
          failed++;
          console.error(
            `[Push] send failed (${err?.statusCode}):`,
            err?.body || err?.message,
          );
          // 404 / 410 = subscription gone, deactivate
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            failedIds.push(sub.id);
          } else {
            // Bump failure counter
            await admin
              .from("push_subscriptions")
              .update({ failed_count: (sub.failed_count || 0) + 1 })
              .eq("id", sub.id);
          }
        }
      }),
    );

    if (failedIds.length) {
      await admin
        .from("push_subscriptions")
        .update({ is_active: false })
        .in("id", failedIds);
    }

    return new Response(
      JSON.stringify({ ok: true, sent, failed, total: (subs || []).length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("send-push-notification error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
