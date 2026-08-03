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
    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 120) : null;
    const feedback = typeof body?.feedback === "string" ? body.feedback.slice(0, 1000) : null;
    const retentionOutcome =
      typeof body?.retention_outcome === "string" ? body.retention_outcome.slice(0, 40) : "cancelled";
    const retentionOfferShown = body?.retention_offer_shown === true;

    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY")!;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: sub } = await adminClient
      .from("subscriptions")
      .select(
        "id, plan, active_plan, plan_name, plan_price_usd, next_payment_date, billing_cycle_end, expires_at, paystack_subscription_code, paystack_email_token, paystack_customer_code"
      )
      .eq("user_id", userId)
      .maybeSingle();

    // Resolve the Paystack subscription server-side so cancellation ALWAYS
    // reaches Paystack — never rely on codes supplied by the client.
    let subscriptionCode: string | null = sub?.paystack_subscription_code ?? null;
    let emailToken: string | null = sub?.paystack_email_token ?? null;

    if ((!subscriptionCode || !emailToken) && sub?.paystack_customer_code) {
      try {
        const listRes = await fetch(
          `https://api.paystack.co/subscription?customer=${encodeURIComponent(sub.paystack_customer_code)}`,
          { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
        );
        const listData = await listRes.json();
        const active = (listData?.data ?? []).find(
          (s: Record<string, unknown>) => s.status === "active" || s.status === "attention"
        );
        if (active) {
          subscriptionCode = (active.subscription_code as string) ?? subscriptionCode;
          emailToken = (active.email_token as string) ?? emailToken;
        }
      } catch (e) {
        console.warn("Paystack subscription lookup failed:", e);
      }
    }

    // Disabling on Paystack stops the NEXT charge — the current paid period is untouched.
    let paystackCancelled = false;
    if (subscriptionCode && emailToken) {
      const res = await fetch("https://api.paystack.co/subscription/disable", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: subscriptionCode, token: emailToken }),
      });

      const data = await res.json();
      paystackCancelled = data?.status === true;

      // "already disabled"/"not found" is an acceptable end state — anything else is a hard failure.
      const msg = String(data?.message ?? "").toLowerCase();
      if (!paystackCancelled && !msg.includes("disable") && !msg.includes("not found")) {
        return new Response(
          JSON.stringify({ error: data.message || "Failed to cancel on Paystack" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      console.warn("No Paystack subscription code found for user", userId);
    }

    // Access continues until the end of the period the user already paid for.
    const fallback = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const accessUntil =
      sub?.next_payment_date ?? sub?.billing_cycle_end ?? sub?.expires_at ?? fallback;

    await adminClient
      .from("subscriptions")
      .update({
        // Status stays "active" — the plan is only revoked at period end.
        cancel_at_period_end: true,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        cancellation_feedback: feedback,
        retention_outcome: retentionOutcome,
        retention_offer_shown: retentionOfferShown,
        reactivated_at: null,
        expires_at: accessUntil,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    // Immutable churn log powering the admin churn-reason analytics.
    await adminClient.from("churn_events").insert({
      user_id: userId,
      subscription_id: sub?.id ?? null,
      plan: sub?.active_plan ?? sub?.plan ?? sub?.plan_name ?? null,
      event_type: "cancelled",
      cancellation_reason: reason,
      cancellation_feedback: feedback,
      retention_outcome: retentionOutcome,
      retention_offer_shown: retentionOfferShown,
      mrr_usd: sub?.plan_price_usd ?? 0,
      access_until: accessUntil,
    });

    return new Response(
      JSON.stringify({
        success: true,
        cancel_at_period_end: true,
        paystack_cancelled: paystackCancelled,
        expires_at: accessUntil,
        cancellation_reason: reason,
        retention_outcome: retentionOutcome,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("paystack-cancel-subscription error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});