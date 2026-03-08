import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Fixed conversion rate: 1 USD = 1,500 NGN
const USD_TO_NGN_RATE = 1500;

// Plan configurations (prices in USD)
const PLANS: Record<string, { name: string; price_usd: number; calls_limit: number }> = {
  starter: { name: "Starter", price_usd: 19, calls_limit: 50 },
  growth: { name: "Growth", price_usd: 49, calls_limit: 300 },
  scale: { name: "Scale", price_usd: 99, calls_limit: -1 },
};

const PLAN_ORDER = ["starter", "growth", "scale"];

function calculateProration(
  currentPlanPriceNgn: number,
  newPlanPriceNgn: number,
  nextPaymentDate: string | null
): { proratedAmountNgn: number; daysRemaining: number; creditNgn: number } {
  const now = new Date();
  const nextPayment = nextPaymentDate ? new Date(nextPaymentDate) : null;
  
  if (!nextPayment || nextPayment <= now) {
    // No active billing cycle, charge full amount
    return {
      proratedAmountNgn: newPlanPriceNgn,
      daysRemaining: 0,
      creditNgn: 0,
    };
  }

  // Calculate days remaining in current billing cycle
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.max(0, Math.ceil((nextPayment.getTime() - now.getTime()) / msPerDay));
  const daysInMonth = 30;

  // Calculate credit from current plan
  const dailyRateCurrent = currentPlanPriceNgn / daysInMonth;
  const creditNgn = Math.round(dailyRateCurrent * daysRemaining);

  // Calculate prorated charge for new plan
  const dailyRateNew = newPlanPriceNgn / daysInMonth;
  const proratedChargeNgn = Math.round(dailyRateNew * daysRemaining);

  // Net amount: new prorated charge minus credit
  const netAmountNgn = Math.max(0, proratedChargeNgn - creditNgn);

  return {
    proratedAmountNgn: netAmountNgn,
    daysRemaining,
    creditNgn,
  };
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
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;

    const { new_plan_key, callback_url, preview_only } = await req.json();

    // Validate new plan
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

    // Get current subscription
    const { data: currentSub, error: subError } = await adminClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (subError) {
      console.error("Error fetching subscription:", subError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch current subscription" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Determine current plan
    const currentPlanName = currentSub?.plan_name?.toLowerCase() || "";
    let currentPlanKey = "starter";
    if (currentPlanName.includes("scale")) currentPlanKey = "scale";
    else if (currentPlanName.includes("growth")) currentPlanKey = "growth";
    else if (currentPlanName.includes("starter")) currentPlanKey = "starter";

    const currentPlanConfig = PLANS[currentPlanKey] || PLANS.starter;
    const currentPriceNgn = currentPlanConfig.price_usd * USD_TO_NGN_RATE;
    const newPriceNgn = newPlanConfig.price_usd * USD_TO_NGN_RATE;

    // Calculate proration
    const proration = calculateProration(
      currentPriceNgn,
      newPriceNgn,
      currentSub?.next_payment_date
    );

    const isUpgrade = PLAN_ORDER.indexOf(new_plan_key) > PLAN_ORDER.indexOf(currentPlanKey);
    const isDowngrade = PLAN_ORDER.indexOf(new_plan_key) < PLAN_ORDER.indexOf(currentPlanKey);

    // If preview only, return proration details
    if (preview_only) {
      return new Response(
        JSON.stringify({
          current_plan: currentPlanKey,
          new_plan: new_plan_key,
          is_upgrade: isUpgrade,
          is_downgrade: isDowngrade,
          current_price_ngn: currentPriceNgn,
          new_price_ngn: newPriceNgn,
          prorated_amount_ngn: proration.proratedAmountNgn,
          credit_ngn: proration.creditNgn,
          days_remaining: proration.daysRemaining,
          new_monthly_price_ngn: newPriceNgn,
          new_monthly_price_usd: newPlanConfig.price_usd,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY")!;

    // If user has an active subscription, cancel it first
    if (currentSub?.paystack_subscription_code && currentSub?.paystack_email_token && currentSub?.status === "active") {
      try {
        const cancelRes = await fetch(
          `https://api.paystack.co/subscription/disable`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              code: currentSub.paystack_subscription_code,
              token: currentSub.paystack_email_token,
            }),
          }
        );
        const cancelData = await cancelRes.json();
        console.log("Cancelled old subscription:", cancelData);
      } catch (err) {
        console.error("Error cancelling old subscription:", err);
      }
    }

    // For downgrades with credit remaining, we charge 0 for now and start new plan
    // For upgrades, we charge the prorated difference
    const chargeAmountKobo = isDowngrade 
      ? 0 // Downgrade: no immediate charge, starts on next cycle
      : proration.proratedAmountNgn * 100;

    // Full monthly amount for the new plan (in kobo)
    const fullMonthlyAmountKobo = newPlanConfig.price_usd * USD_TO_NGN_RATE * 100;

    // Create or get Paystack customer
    const customerRes = await fetch("https://api.paystack.co/customer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: userEmail }),
    });
    const customerData = await customerRes.json();
    const customerCode =
      customerData.data?.customer_code || customerData.data?.id;

    // Create a new Paystack plan dynamically
    const planRes = await fetch("https://api.paystack.co/plan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `Fixsense ${newPlanConfig.name} - ${Date.now()}`,
        interval: "monthly",
        amount: fullMonthlyAmountKobo,
        currency: "NGN",
      }),
    });
    const planData = await planRes.json();

    if (!planData.status || !planData.data?.plan_code) {
      console.error("Failed to create Paystack plan:", planData);
      return new Response(
        JSON.stringify({ error: planData.message || "Failed to create plan" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const planCode = planData.data.plan_code;
    console.log(`Created Paystack plan: ${planCode} for ${isUpgrade ? 'upgrade' : 'downgrade'} to ${newPlanConfig.name}`);

    // Initialize transaction with prorated amount (or full if downgrade/no proration)
    const transactionAmount = chargeAmountKobo > 0 ? chargeAmountKobo : fullMonthlyAmountKobo;
    
    const initRes = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: userEmail,
          amount: transactionAmount,
          currency: "NGN",
          plan: planCode,
          callback_url:
            callback_url ||
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/paystack-verify`,
          metadata: {
            user_id: userId,
            plan_key: new_plan_key,
            plan_name: newPlanConfig.name,
            plan_price_usd: newPlanConfig.price_usd,
            calls_limit: newPlanConfig.calls_limit,
            is_upgrade: isUpgrade,
            is_downgrade: isDowngrade,
            prorated_amount_ngn: proration.proratedAmountNgn,
            credit_ngn: proration.creditNgn,
            custom_fields: [
              {
                display_name: "User ID",
                variable_name: "user_id",
                value: userId,
              },
              {
                display_name: "Plan",
                variable_name: "plan_key",
                value: new_plan_key,
              },
              {
                display_name: "Change Type",
                variable_name: "change_type",
                value: isUpgrade ? "upgrade" : "downgrade",
              },
            ],
          },
        }),
      }
    );

    const initData = await initRes.json();

    if (!initData.status) {
      return new Response(
        JSON.stringify({ error: initData.message || "Failed to initialize" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Update subscription record to pending
    await adminClient.from("subscriptions").upsert(
      {
        user_id: userId,
        paystack_customer_code: customerCode,
        status: "pending",
        plan_name: `Fixsense ${newPlanConfig.name}`,
        plan_price_usd: newPlanConfig.price_usd,
        amount_kobo: fullMonthlyAmountKobo,
        currency: "NGN",
      },
      { onConflict: "user_id" }
    );

    // Update profile's plan_type and calls_limit
    await adminClient
      .from("profiles")
      .update({
        plan_type: new_plan_key,
        calls_limit: newPlanConfig.calls_limit === -1 ? 999999 : newPlanConfig.calls_limit,
      })
      .eq("id", userId);

    return new Response(
      JSON.stringify({
        authorization_url: initData.data.authorization_url,
        reference: initData.data.reference,
        prorated_amount_ngn: proration.proratedAmountNgn,
        credit_ngn: proration.creditNgn,
        is_upgrade: isUpgrade,
        is_downgrade: isDowngrade,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
