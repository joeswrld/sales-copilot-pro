import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const USD_TO_NGN_RATE = 1500;

const PLANS: Record<string, { name: string; price_usd: number; calls_limit: number }> = {
  starter: { name: "Starter", price_usd: 19, calls_limit: 50 },
  growth:  { name: "Growth",  price_usd: 49, calls_limit: 300 },
  scale:   { name: "Scale",   price_usd: 99, calls_limit: -1 },
};

const PLAN_ORDER = ["free", "starter", "growth", "scale"];

function planNameToKey(planName: string | null | undefined): string {
  if (!planName) return "starter";
  const lower = planName.toLowerCase();
  if (lower.includes("scale"))   return "scale";
  if (lower.includes("growth"))  return "growth";
  if (lower.includes("starter")) return "starter";
  return "starter";
}

function calculateProration(
  currentPlanPriceNgn: number,
  newPlanPriceNgn: number,
  nextPaymentDate: string | null
): { proratedAmountNgn: number; daysRemaining: number; creditNgn: number } {
  const now = new Date();
  const nextPayment = nextPaymentDate ? new Date(nextPaymentDate) : null;

  if (!nextPayment || nextPayment <= now) {
    return { proratedAmountNgn: newPlanPriceNgn, daysRemaining: 0, creditNgn: 0 };
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.max(0, Math.ceil((nextPayment.getTime() - now.getTime()) / msPerDay));
  const daysInMonth = 30;

  const dailyRateCurrent = currentPlanPriceNgn / daysInMonth;
  const creditNgn = Math.round(dailyRateCurrent * daysRemaining);

  const dailyRateNew = newPlanPriceNgn / daysInMonth;
  const proratedChargeNgn = Math.round(dailyRateNew * daysRemaining);

  const netAmountNgn = Math.max(0, proratedChargeNgn - creditNgn);

  return { proratedAmountNgn: netAmountNgn, daysRemaining, creditNgn };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;

    const { new_plan_key, callback_url, preview_only } = await req.json();

    const newPlanConfig = PLANS[new_plan_key];
    if (!newPlanConfig) {
      return new Response(
        JSON.stringify({ error: "Invalid plan" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Fetch current subscription (needed for both preview and actual upgrade) ──
    const { data: currentSub } = await adminClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // Resolve current plan key from subscription plan_name
    const currentPlanKey = planNameToKey(currentSub?.plan_name);
    const currentPlanConfig = PLANS[currentPlanKey] ?? PLANS.starter;

    const currentPriceNgn = currentPlanConfig.price_usd * USD_TO_NGN_RATE;
    const newPriceNgn = newPlanConfig.price_usd * USD_TO_NGN_RATE;

    const proration = calculateProration(
      currentPriceNgn,
      newPriceNgn,
      currentSub?.next_payment_date ?? null
    );

    const isUpgrade  = PLAN_ORDER.indexOf(new_plan_key) > PLAN_ORDER.indexOf(currentPlanKey);
    const isDowngrade = PLAN_ORDER.indexOf(new_plan_key) < PLAN_ORDER.indexOf(currentPlanKey);

    // ── PREVIEW — return early, NO Paystack calls needed ────────────────────────
    // This is what was failing: the old code fell through to Paystack even for
    // preview_only=true, causing the "Edge Function returned a non-2xx status code"
    // error whenever Paystack credentials were missing or the request was invalid.
    if (preview_only) {
      return new Response(
        JSON.stringify({
          current_plan:          currentPlanKey,
          new_plan:              new_plan_key,
          is_upgrade:            isUpgrade,
          is_downgrade:          isDowngrade,
          current_price_ngn:     currentPriceNgn,
          new_price_ngn:         newPriceNgn,
          prorated_amount_ngn:   proration.proratedAmountNgn,
          credit_ngn:            proration.creditNgn,
          days_remaining:        proration.daysRemaining,
          new_monthly_price_ngn: newPriceNgn,
          new_monthly_price_usd: newPlanConfig.price_usd,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTUAL UPGRADE — hit Paystack ────────────────────────────────────────────
    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!PAYSTACK_SECRET) {
      return new Response(
        JSON.stringify({ error: "Payment provider not configured. Please contact support." }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Cancel existing subscription on Paystack
    if (
      currentSub?.paystack_subscription_code &&
      currentSub?.paystack_email_token &&
      currentSub?.status === "active"
    ) {
      try {
        await fetch("https://api.paystack.co/subscription/disable", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code:  currentSub.paystack_subscription_code,
            token: currentSub.paystack_email_token,
          }),
        });
      } catch (err) {
        console.error("Error cancelling old subscription:", err);
      }
    }

    const fullMonthlyAmountKobo = newPlanConfig.price_usd * USD_TO_NGN_RATE * 100;
    const chargeAmountKobo = isDowngrade
      ? fullMonthlyAmountKobo
      : (proration.proratedAmountNgn * 100 || fullMonthlyAmountKobo);

    // Create or get customer
    const customerRes = await fetch("https://api.paystack.co/customer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: userEmail }),
    });
    const customerData = await customerRes.json();
    if (!customerRes.ok) {
      console.error("Paystack customer error:", customerData);
      return new Response(
        JSON.stringify({ error: customerData.message || "Failed to create customer" }),
        { status: 400, headers: corsHeaders }
      );
    }
    const customerCode = customerData.data?.customer_code || customerData.data?.id;

    // Create Paystack plan
    const planRes = await fetch("https://api.paystack.co/plan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name:     `Fixsense ${newPlanConfig.name} - ${Date.now()}`,
        interval: "monthly",
        amount:   fullMonthlyAmountKobo,
        currency: "NGN",
      }),
    });
    const planData = await planRes.json();

    if (!planData.status || !planData.data?.plan_code) {
      console.error("Paystack plan creation error:", planData);
      return new Response(
        JSON.stringify({ error: planData.message || "Failed to create plan" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const planCode = planData.data.plan_code;

    // Initialize transaction
    const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email:        userEmail,
        amount:       chargeAmountKobo,
        currency:     "NGN",
        plan:         planCode,
        callback_url: callback_url || `${Deno.env.get("SUPABASE_URL")}/functions/v1/paystack-verify`,
        metadata: {
          user_id:             userId,
          plan_key:            new_plan_key,
          plan_name:           newPlanConfig.name,
          plan_price_usd:      newPlanConfig.price_usd,
          calls_limit:         newPlanConfig.calls_limit,
          is_upgrade:          isUpgrade,
          is_downgrade:        isDowngrade,
          prorated_amount_ngn: proration.proratedAmountNgn,
          credit_ngn:          proration.creditNgn,
          custom_fields: [
            { display_name: "User ID",      variable_name: "user_id",      value: userId },
            { display_name: "Plan",         variable_name: "plan_key",     value: new_plan_key },
            { display_name: "Change Type",  variable_name: "change_type",  value: isUpgrade ? "upgrade" : "downgrade" },
          ],
        },
      }),
    });

    const initData = await initRes.json();

    if (!initData.status) {
      return new Response(
        JSON.stringify({ error: initData.message || "Failed to initialize payment" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const reference = initData.data.reference;

    // Mark subscription as pending — do NOT update plan_type
    await adminClient.from("subscriptions").upsert(
      {
        user_id:                userId,
        paystack_customer_code: customerCode,
        status:                 "pending",
        plan_name:              `Fixsense ${newPlanConfig.name}`,
        plan_price_usd:         newPlanConfig.price_usd,
        amount_kobo:            fullMonthlyAmountKobo,
        currency:               "NGN",
      },
      { onConflict: "user_id" }
    );

    // Create payment tracking row
    await adminClient.from("payments").insert({
      user_id:             userId,
      plan_selected:       new_plan_key,
      status:              "initialized",
      paystack_reference:  reference,
      amount_kobo:         chargeAmountKobo,
      currency:            "NGN",
    });

    return new Response(
      JSON.stringify({
        authorization_url:   initData.data.authorization_url,
        reference,
        prorated_amount_ngn: proration.proratedAmountNgn,
        credit_ngn:          proration.creditNgn,
        is_upgrade:          isUpgrade,
        is_downgrade:        isDowngrade,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("paystack-upgrade-subscription error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
