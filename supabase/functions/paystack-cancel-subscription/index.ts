import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function resolveUser(
  authHeader: string
): Promise<{ userId: string; userEmail: string } | null> {
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token || token.split(".").length !== 3) {
    console.error("resolveUser: token missing or malformed");
    return null;
  }

  // Validate JWT via service-role getUser (checks signature + expiry)
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data?.user?.id) {
      return { userId: data.user.id, userEmail: data.user.email ?? "" };
    }
    if (error) console.warn("resolveUser: getUser error:", error.message);
  } catch (e) {
    console.warn("resolveUser: getUser threw:", e);
  }

  console.error("resolveUser: authentication failed");
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resolved = await resolveUser(authHeader);
    if (!resolved) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — could not verify token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId } = resolved;
    const { subscription_code, email_token } = await req.json();

    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY")!;

    const res = await fetch(
      "https://api.paystack.co/subscription/disable",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: subscription_code,
          token: email_token,
        }),
      }
    );

    const data = await res.json();

    if (!data.status) {
      return new Response(
        JSON.stringify({ error: data.message || "Failed to cancel" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await adminClient
      .from("subscriptions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("paystack-cancel-subscription error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});