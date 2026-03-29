import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const USD_TO_NGN_RATE = 1500;

const PLANS: Record<string, { name: string; price_usd: number; calls_limit: number; team_members_limit: number }> = {
  starter: { name: "Starter", price_usd: 19, calls_limit: 50, team_members_limit: 3 },
  growth:  { name: "Growth",  price_usd: 49, calls_limit: 300, team_members_limit: 10 },
  scale:   { name: "Scale",   price_usd: 99, calls_limit: -1,  team_members_limit: -1 },
};

async function resolveUser(
  authHeader: string
): Promise<{ userId: string; userEmail: string } | null> {
  const token = authHeader.replace("Bearer ", "");

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data?.user?.id) {
      return { userId: data.user.id, userEmail: data.user.email ?? "" };
    }
    if (error) console.warn("service-role getUser error:", error.message);
  } catch (e) {
    console.warn("service-role getUser threw:", e);
  }

  try {
    const parts   = token.split(".");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload?.sub) {
      return { userId: payload.sub, userEmail: payload.email ?? "" };
    }
  } catch (e) {
    console.warn("JWT decode fallback failed:", e);
  }

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

    const { userId, userEmail } = resolved;
    const { callback_url, plan_key } = await req.json();

    const planConfig = PLANS[plan_key || "starter"];
    if (!planConfig) {
      return new Response(
        JSON.stringify({ error: "Invalid plan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const amount_ngn_kobo = planConfig.price_usd * USD_TO_NGN_RATE * 100;
    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY")!;

    // 1. Create/get Paystack customer
    const customerRes = await fetch("https://api.paystack.co/customer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: userEmail }),
    });
    const customerData = await customerRes.json();
    const customerCode = customerData.data?.customer_code || customerData.data?.id;

    // 2. Create Paystack plan
    const planRes = await fetch("https://api.paystack.co/plan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `Fixsense ${planConfig.name} - ${Date.now()}`,
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Initialize transaction
    const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: userEmail,
        amount: amount_ngn_kobo,
        currency: "NGN",
        plan: planData.data.plan_code,
        callback_url: callback_url || `${Deno.env.get("SUPABASE_URL")}/functions/v1/paystack-verify`,
        metadata: {
          user_id: userId,
          plan_key,
          plan_name: planConfig.name,
          plan_price_usd: planConfig.price_usd,
          calls_limit: planConfig.calls_limit,
          custom_fields: [
            { display_name: "User ID",  variable_name: "user_id",  value: userId },
            { display_name: "Plan",     variable_name: "plan_key", value: plan_key },
          ],
        },
      }),
    });

    const initData = await initRes.json();
    if (!initData.status) {
      return new Response(
        JSON.stringify({ error: initData.message || "Failed to initialize" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reference = initData.data.reference;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Record subscription as PENDING — plan only activates after webhook/verify
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

    // Track this checkout attempt
    await adminClient.from("payments").insert({
      user_id: userId,
      plan_selected: plan_key,
      status: "initialized",
      paystack_reference: reference,
      amount_kobo: amount_ngn_kobo,
      currency: "NGN",
    });

    return new Response(
      JSON.stringify({ authorization_url: initData.data.authorization_url, reference }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("paystack-create-subscription error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});