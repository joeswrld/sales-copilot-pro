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

    const { new_plan_key, callback_url } = await req.json();

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
        // Continue anyway - we'll create a new subscription
      }
    }

    // Calculate NGN amount
    const amount_ngn_kobo = newPlanConfig.price_usd * USD_TO_NGN_RATE * 100;

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
        amount: amount_ngn_kobo,
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
    console.log(`Created Paystack plan: ${planCode} for upgrade to ${newPlanConfig.name}`);

    // Initialize transaction with new plan
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
          amount: amount_ngn_kobo,
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
            is_upgrade: true,
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
                display_name: "Upgrade",
                variable_name: "is_upgrade",
                value: "true",
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

    // Update subscription record to pending upgrade
    await adminClient.from("subscriptions").upsert(
      {
        user_id: userId,
        paystack_customer_code: customerCode,
        status: "pending",
        plan_name: `Fixsense ${newPlanConfig.name}`,
        plan_price_usd: newPlanConfig.price_usd,
        amount_kobo: amount_ngn_kobo,
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
