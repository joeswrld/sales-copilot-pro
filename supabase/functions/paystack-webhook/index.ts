import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

function verifySignature(body: string, signature: string, secret: string): boolean {
  const hash = createHmac("sha512", secret).update(body).digest("hex");
  return hash === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY")!;
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";

    if (!verifySignature(rawBody, signature, PAYSTACK_SECRET)) {
      console.error("Invalid webhook signature");
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event;
    const data = event.data;

    console.log("Paystack webhook event:", eventType);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userId = data.metadata?.user_id;
    const customerEmail = data.customer?.email;
    const customerCode = data.customer?.customer_code;

    console.log("Webhook data:", { userId, customerEmail, customerCode, eventType });

    // Helper to find and update subscription
    const updateSubscription = async (updates: Record<string, unknown>) => {
      let result;
      
      // Try by user_id first
      if (userId) {
        result = await supabase
          .from("subscriptions")
          .update(updates)
          .eq("user_id", userId);
        if (!result.error) {
          console.log("Updated by user_id:", userId);
          return result;
        }
      }
      
      // Try by customer_code
      if (customerCode) {
        result = await supabase
          .from("subscriptions")
          .update(updates)
          .eq("paystack_customer_code", customerCode);
        if (!result.error) {
          console.log("Updated by customer_code:", customerCode);
          return result;
        }
      }
      
      // Try by email through profiles
      if (customerEmail) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", customerEmail)
          .maybeSingle();
        
        if (profile?.id) {
          result = await supabase
            .from("subscriptions")
            .update(updates)
            .eq("user_id", profile.id);
          console.log("Updated by email match:", customerEmail, "->", profile.id);
          return result;
        }
      }
      
      console.error("Could not find subscription to update");
      return null;
    };

    switch (eventType) {
      case "subscription.create": {
        const updates: Record<string, unknown> = {
          paystack_subscription_code: data.subscription_code,
          paystack_email_token: data.email_token,
          status: "active",
          next_payment_date: data.next_payment_date,
          updated_at: new Date().toISOString(),
        };
        await updateSubscription(updates);
        break;
      }

      case "charge.success": {
        const authorization = data.authorization;
        const planKey = data.metadata?.plan_key;
        const planName = data.metadata?.plan_name;
        const planPriceUsd = data.metadata?.plan_price_usd;
        const callsLimit = data.metadata?.calls_limit;

        const updates: Record<string, unknown> = {
          status: "active",
          updated_at: new Date().toISOString(),
        };

        // Update plan details from metadata (set during checkout)
        if (planName) updates.plan_name = `Fixsense ${planName}`;
        if (planPriceUsd) updates.plan_price_usd = planPriceUsd;

        if (authorization) {
          updates.card_last4 = authorization.last4;
          updates.card_brand = authorization.brand;
        }

        // Calculate next payment date as ~30 days from now
        const nextDate = new Date();
        nextDate.setMonth(nextDate.getMonth() + 1);
        updates.next_payment_date = nextDate.toISOString();

        if (data.plan?.plan_code && data.plan_object?.next_payment_date) {
          updates.next_payment_date = data.plan_object.next_payment_date;
        }

        await updateSubscription(updates);

        // NOW update the user's profile plan_type and calls_limit (only after payment success)
        if (planKey && userId) {
          const resolvedCallsLimit = callsLimit === -1 ? 999999 : (callsLimit || 5);
          await supabase
            .from("profiles")
            .update({
              plan_type: planKey,
              calls_limit: resolvedCallsLimit,
              billing_status: "active",
            })
            .eq("id", userId);
          console.log("Updated profile plan after payment:", { userId, planKey, resolvedCallsLimit });
        } else if (customerEmail) {
          // Fallback: find user by email
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", customerEmail)
            .maybeSingle();
          if (profile?.id && planKey) {
            const resolvedCallsLimit = callsLimit === -1 ? 999999 : (callsLimit || 5);
            await supabase
              .from("profiles")
              .update({
                plan_type: planKey,
                calls_limit: resolvedCallsLimit,
                billing_status: "active",
              })
              .eq("id", profile.id);
            console.log("Updated profile plan (via email) after payment:", { email: customerEmail, planKey });
          }
        }
        break;
      }

      case "invoice.create": {
        // Invoice created for upcoming charge
        console.log("Invoice created for:", data.customer?.customer_code);
        break;
      }

      case "subscription.disable": {
        const updates = {
          status: "cancelled",
          updated_at: new Date().toISOString(),
        };

        if (data.subscription_code) {
          await supabase
            .from("subscriptions")
            .update(updates)
            .eq("paystack_subscription_code", data.subscription_code);
        }
        break;
      }

      case "invoice.payment_failed": {
        if (userId) {
          await supabase
            .from("subscriptions")
            .update({
              status: "past_due",
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        }
        break;
      }

      default:
        console.log("Unhandled event:", eventType);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Server error", { status: 500 });
  }
});
