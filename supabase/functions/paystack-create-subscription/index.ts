import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Fixed conversion rate: 1 USD = 1,500 NGN
const USD_TO_NGN_RATE = 1500;

// Plan configurations (prices in USD cents)
const PLANS: Record<string, { name: string; price_usd: number; calls_limit: number; team_members_limit: number }> = {
  starter: { name: "Starter", price_usd: 19, calls_limit: 50, team_members_limit: 3 },
  growth: { name: "Growth", price_usd: 49, calls_limit: 300, team_members_limit: 10 },
  scale: { name: "Scale", price_usd: 99, calls_limit: -1, team_members_limit: -1 },
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

    const { callback_url, plan_key } = await req.json();

    // Validate plan
    const planConfig = PLANS[plan_key || "starter"];
    if (!planConfig) {
      return new Response(
        JSON.stringify({ error: "Invalid plan" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Calculate NGN amount from USD price
    // Formula: USD * 1500 (NGN rate) * 100 (to kobo)
    const amount_ngn_kobo = planConfig.price_usd * USD_TO_NGN_RATE * 100;

    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY")!;

    // 1. Create or get Paystack customer
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

    // 2. Create a new Paystack plan dynamically for each subscription
    // This ensures each plan has the correct pricing
    const planRes = await fetch("https://api.paystack.co/plan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `Fixsense ${planConfig.name} - ${Date.now()}`,
        interval: "monthly",
        amount: amount_ngn_kobo, // Amount in kobo (NGN)
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
    console.log(`Created Paystack plan: ${planCode} for ${planConfig.name}`);

    // 3. Initialize transaction with plan (charged in NGN)
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
          amount: amount_ngn_kobo, // Amount in kobo (NGN)
          currency: "NGN",
          plan: planCode,
          callback_url:
            callback_url ||
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/paystack-verify`,
          metadata: {
            user_id: userId,
            plan_key: plan_key,
            plan_name: planConfig.name,
            plan_price_usd: planConfig.price_usd,
            calls_limit: planConfig.calls_limit,
            custom_fields: [
              {
                display_name: "User ID",
                variable_name: "user_id",
                value: userId,
              },
              {
                display_name: "Plan",
                variable_name: "plan_key",
                value: plan_key,
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

    // 4. Upsert subscription record with both USD and NGN amounts
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await adminClient.from("subscriptions").upsert(
      {
        user_id: userId,
        paystack_customer_code: customerCode,
        status: "pending",
        plan_name: `Fixsense ${planConfig.name}`,
        plan_price_usd: planConfig.price_usd,
        amount_kobo: amount_ngn_kobo,
        currency: "NGN",
      },
      { onConflict: "user_id" }
    );

    // Also update the profile's plan_type and calls_limit
    await adminClient
      .from("profiles")
      .update({
        plan_type: plan_key,
        calls_limit: planConfig.calls_limit === -1 ? 999999 : planConfig.calls_limit,
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
