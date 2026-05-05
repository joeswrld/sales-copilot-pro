// supabase/functions/paystack-upgrade-subscription/index.ts
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

  const msPerDay           = 24 * 60 * 60 * 1000;
  const daysRemaining      = Math.max(0, Math.ceil((nextPayment.getTime() - now.getTime()) / msPerDay));
  const daysInMonth        = 30;
  const creditNgn          = Math.round((currentPlanPriceNgn / daysInMonth) * daysRemaining);
  const proratedChargeNgn  = Math.round((newPlanPriceNgn / daysInMonth) * daysRemaining);
  const netAmountNgn       = Math.max(0, proratedChargeNgn - creditNgn);

  return { proratedAmountNgn: netAmountNgn, daysRemaining, creditNgn };
}

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
    const authHeader = req.headers.get("Authorization") ?? "";

    // Log auth header presence (not value) to help debug 401s
    console.log("Auth header present:", authHeader.startsWith("Bearer ") && authHeader.length > 10);

    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — missing or malformed Authorization header" }),
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

    const { userId, userEmail } = resolved;

    const body = await req.json().catch(() => ({}));
    const { new_plan_key, callback_url, preview_only } = body;

    console.log("Request body:", { userId, new_plan_key, preview_only });

    const newPlanConfig = PLANS[new_plan_key];
    if (!newPlanConfig) {
      return new Response(
        JSON.stringify({ error: `Invalid plan: ${new_plan_key}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Fetch current subscription ────────────────────────────────────────
    const { data: currentSub } = await adminClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const currentPlanKey    = planNameToKey(currentSub?.plan_name);
    const currentPlanConfig = PLANS[currentPlanKey] ?? PLANS.starter;
    const currentPriceNgn   = currentPlanConfig.price_usd * USD_TO_NGN_RATE;
    const newPriceNgn       = newPlanConfig.price_usd * USD_TO_NGN_RATE;

    const proration = calculateProration(
      currentPriceNgn,
      newPriceNgn,
      currentSub?.next_payment_date ?? null
    );

    const isUpgrade   = PLAN_ORDER.indexOf(new_plan_key) > PLAN_ORDER.indexOf(currentPlanKey);
    const isDowngrade = PLAN_ORDER.indexOf(new_plan_key) < PLAN_ORDER.indexOf(currentPlanKey);

    // ── PREVIEW — pure arithmetic, zero Paystack calls ────────────────────
    if (preview_only) {
      console.log("Returning preview for:", { currentPlanKey, new_plan_key, isUpgrade });
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

    // ── ACTUAL UPGRADE — hit Paystack ─────────────────────────────────────
    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!PAYSTACK_SECRET) {
      return new Response(
        JSON.stringify({ error: "Payment provider not configured. Please contact support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cancel existing Paystack subscription if active
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

    // Create / get Paystack customer
    const customerRes  = await fetch("https://api.paystack.co/customer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: userEmail }),
    });
    const customerData = await customerRes.json();
    if (!customerRes.ok) {
      return new Response(
        JSON.stringify({ error: customerData.message || "Failed to create customer" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const customerCode = customerData.data?.customer_code || customerData.data?.id;

    // Create Paystack plan
    const planRes  = await fetch("https://api.paystack.co/plan", {
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
      return new Response(
        JSON.stringify({ error: planData.message || "Failed to create plan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize transaction
    const initRes  = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email:        userEmail,
        amount:       chargeAmountKobo,
        currency:     "NGN",
        plan:         planData.data.plan_code,
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
            { display_name: "User ID",     variable_name: "user_id",     value: userId },
            { display_name: "Plan",        variable_name: "plan_key",    value: new_plan_key },
            { display_name: "Change Type", variable_name: "change_type", value: isUpgrade ? "upgrade" : "downgrade" },
          ],
        },
      }),
    });
    const initData = await initRes.json();
    if (!initData.status) {
      return new Response(
        JSON.stringify({ error: initData.message || "Failed to initialize payment" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reference = initData.data.reference;

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

    await adminClient.from("payments").insert({
      user_id:            userId,
      plan_selected:      new_plan_key,
      status:             "initialized",
      paystack_reference: reference,
      amount_kobo:        chargeAmountKobo,
      currency:           "NGN",
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});