import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_BUNDLES: Record<number, number> = {
  100: 7,
  300: 18,
  500: 30,
  1000: 55,
  2000: 100,
  5000: 240,
};

import { computeBreakdown, breakdownPaymentColumns } from "../_shared/billing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const body = await req.json();
    const { action, minutes, reference } = body;

    const admin = createClient(supabaseUrl, serviceKey);

    // ─── Preview (read-only pricing for the checkout dialog) ───
    if (action === "preview") {
      const previewPrice = VALID_BUNDLES[minutes];
      if (!previewPrice)
        return new Response(JSON.stringify({ error: "Invalid bundle" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      return new Response(
        JSON.stringify({ breakdown: computeBreakdown(previewPrice) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Initialize purchase (get Paystack URL) ───
    if (action === "initialize") {
      const priceUsd = VALID_BUNDLES[minutes];
      if (!priceUsd)
        return new Response(JSON.stringify({ error: "Invalid bundle" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      // Must be on a paid plan
      const { data: sub } = await admin
        .from("subscriptions")
        .select("id, status, plan_name, next_payment_date")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!sub)
        return new Response(
          JSON.stringify({ error: "Active subscription required. Please upgrade first." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      const breakdown = computeBreakdown(priceUsd);
      const amountKobo = breakdown.amount_kobo;
      const ref = `bundle_${user.id.slice(0, 8)}_${minutes}m_${Date.now()}`;

      if (!paystackSecret)
        return new Response(JSON.stringify({ error: "Payment not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount: amountKobo,
          reference: ref,
          currency: "NGN",
          callback_url: `${req.headers.get("origin") || "https://fixsense.app"}/billing?reference=${ref}`,
          metadata: {
            type: "minutes_bundle",
            user_id: user.id,
            minutes,
            subscription_id: sub.id,
          },
        }),
      });

      const psData = await paystackRes.json();
      if (!psData.status)
        return new Response(JSON.stringify({ error: "Payment initialization failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      // Persist the exact breakdown so the invoice can be rebuilt later
      await admin.from("payments").insert({
        user_id: user.id,
        plan_selected: `bundle_${minutes}m`,
        status: "initialized",
        paystack_reference: ref,
        ...breakdownPaymentColumns(breakdown),
      });

      return new Response(
        JSON.stringify({
          authorization_url: psData.data.authorization_url,
          reference: ref,
          breakdown,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Verify purchase ───
    if (action === "verify") {
      if (!reference)
        return new Response(JSON.stringify({ error: "Reference required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      if (!paystackSecret)
        return new Response(JSON.stringify({ error: "Payment not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${paystackSecret}` } }
      );
      const verifyData = await verifyRes.json();

      if (!verifyData.status || verifyData.data.status !== "success")
        return new Response(
          JSON.stringify({ error: "Payment not successful", details: verifyData.data?.gateway_response }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      const meta = verifyData.data.metadata;
      if (meta?.type !== "minutes_bundle" || meta?.user_id !== user.id)
        return new Response(JSON.stringify({ error: "Invalid bundle payment" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      const bundleMinutes = Number(meta.minutes);
      if (!VALID_BUNDLES[bundleMinutes])
        return new Response(JSON.stringify({ error: "Invalid bundle size" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      // Idempotency: refuse to credit the same Paystack reference twice
      const { data: alreadyCredited } = await admin
        .from("payments")
        .select("id")
        .eq("reference", reference)
        .eq("status", "success")
        .maybeSingle();

      if (alreadyCredited) {
        return new Response(
          JSON.stringify({ error: "This payment has already been credited" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get active subscription
      const { data: sub } = await admin
        .from("subscriptions")
        .select("id, extra_minutes, next_payment_date")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!sub)
        return new Response(JSON.stringify({ error: "No active subscription" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      // Claim the reference first so concurrent replays cannot both credit
      const { error: claimErr } = await admin.from("payments").insert({
        user_id: user.id,
        reference,
        amount_ngn: verifyData.data.amount / 100,
        amount_kobo: verifyData.data.amount,
        status: "success",
        channel: verifyData.data.channel || "card",
        currency: "NGN",
        paid_at: verifyData.data.paid_at || new Date().toISOString(),
        gateway_response: verifyData.data.gateway_response || "Approved",
        plan_name: `extra_${bundleMinutes}_minutes`,
      });
      if (claimErr) {
        return new Response(
          JSON.stringify({ error: "This payment has already been credited" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const newExtra = (sub.extra_minutes || 0) + bundleMinutes;
      const expiresAt = sub.next_payment_date || new Date(Date.now() + 30 * 86400000).toISOString();

      const { error: updateErr } = await admin
        .from("subscriptions")
        .update({
          extra_minutes: newExtra,
          extra_minutes_expires_at: expiresAt,
        })
        .eq("id", sub.id);

      if (updateErr)
        return new Response(JSON.stringify({ error: "Failed to add minutes" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      // Create notification
      try {
        await admin.rpc("create_notification", {
          p_user_id: user.id,
          p_type: "system",
          p_title: "Minutes Added!",
          p_message: `${bundleMinutes} extra minutes have been added to your account.`,
          p_link: "/billing",
          p_idempotency_key: `bundle_${reference}`,
        });
      } catch {}

      return new Response(
        JSON.stringify({ success: true, extra_minutes: newExtra, added: bundleMinutes }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
