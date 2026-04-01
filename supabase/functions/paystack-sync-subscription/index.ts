import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type PaystackTx = {
  reference: string;
  status: string;
  amount: number;
  paid_at: string | null;
  created_at: string;
  currency: string;
  channel: string | null;
  gateway_response: string | null;
  customer?: { email?: string | null; customer_code?: string | null };
  authorization?: { last4?: string | null; brand?: string | null };
  metadata?: {
    user_id?: string;
    custom_fields?: Array<{ variable_name?: string; value?: string }>;
  } | null;
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

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: authUser }, error: userError } = await userClient.auth.getUser();
    if (userError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = authUser.id;
    const userEmail = authUser.email?.toLowerCase();

    const { reference, include_transactions } = await req.json().catch(() => ({}));
    const includeTransactions = include_transactions !== false;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: subscription } = await adminClient
      .from("subscriptions")
      .select("user_id, status, paystack_customer_code, plan_name, plan_price_usd, amount_kobo")
      .eq("user_id", userId)
      .maybeSingle();

    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY")!;

    let verifiedTransaction: PaystackTx | null = null;
    let matchedTransactions: PaystackTx[] = [];
    let transactions: Array<{
      reference: string;
      status: string;
      amount_kobo: number;
      amount_ngn: number;
      paid_at: string | null;
      created_at: string;
      currency: string;
      channel: string | null;
      gateway_response: string | null;
    }> = [];

    if (reference) {
      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${paystackSecret}` },
      });
      const verifyData = await verifyRes.json();
      if (verifyData?.status && verifyData?.data?.status === "success") {
        verifiedTransaction = verifyData.data as PaystackTx;
      }
    }

    const shouldFetchTransactionList = includeTransactions || !verifiedTransaction;

    if (shouldFetchTransactionList) {
      const listUrl = new URL("https://api.paystack.co/transaction");
      listUrl.searchParams.set("perPage", includeTransactions ? "100" : "20");

      if (subscription?.paystack_customer_code) {
        listUrl.searchParams.set("customer", subscription.paystack_customer_code);
      }

      const txRes = await fetch(listUrl.toString(), {
        headers: { Authorization: `Bearer ${paystackSecret}` },
      });
      const txData = await txRes.json();
      const allTransactions = (txData?.data || []) as PaystackTx[];

      matchedTransactions = allTransactions.filter((tx) => {
        const txEmail = tx.customer?.email?.toLowerCase();
        const emailMatch = !!userEmail && txEmail === userEmail;
        const codeMatch = !!subscription?.paystack_customer_code && tx.customer?.customer_code === subscription.paystack_customer_code;
        const metadataUserIdMatch = tx.metadata?.user_id === userId;
        const metadataFieldMatch =
          tx.metadata?.custom_fields?.some(
            (field) => field?.variable_name === "user_id" && field?.value === userId
          ) ?? false;

        return emailMatch || codeMatch || metadataUserIdMatch || metadataFieldMatch;
      });

      if (matchedTransactions.length === 0 && subscription?.paystack_customer_code && allTransactions.length > 0) {
        // Fallback: when Paystack already scoped by customer, trust this scoped list.
        matchedTransactions = allTransactions;
      }

      if (matchedTransactions.length === 0 && reference) {
        const matchedByReference = allTransactions.find((tx) => tx.reference === reference);
        if (matchedByReference) {
          matchedTransactions = [matchedByReference];
        }
      }

      if (includeTransactions) {
        transactions = matchedTransactions
          .map((tx) => ({
            reference: tx.reference,
            status: tx.status,
            amount_kobo: tx.amount,
            amount_ngn: tx.amount / 100,
            paid_at: tx.paid_at,
            created_at: tx.created_at,
            currency: tx.currency,
            channel: tx.channel,
            gateway_response: tx.gateway_response,
          }))
          .sort((a, b) => new Date(b.paid_at || b.created_at).getTime() - new Date(a.paid_at || a.created_at).getTime());
      }

      if (!verifiedTransaction) {
        verifiedTransaction = matchedTransactions.find((tx) => tx.status === "success") || null;
      }
    }

    let updated = false;

    if (verifiedTransaction && subscription?.status !== "active") {
      const nextDate = new Date();
      nextDate.setMonth(nextDate.getMonth() + 1);

      // Extract plan info from transaction metadata
      const planKey = verifiedTransaction.metadata?.custom_fields?.find(
        (f) => f?.variable_name === "plan_key"
      )?.value;
      const planName = (verifiedTransaction as any).metadata?.plan_name;
      const planPriceUsd = (verifiedTransaction as any).metadata?.plan_price_usd;
      const callsLimit = (verifiedTransaction as any).metadata?.calls_limit;

      const subUpdates: Record<string, unknown> = {
        status: "active",
        updated_at: new Date().toISOString(),
        next_payment_date: verifiedTransaction.paid_at
          ? new Date(new Date(verifiedTransaction.paid_at).setMonth(new Date(verifiedTransaction.paid_at).getMonth() + 1)).toISOString()
          : nextDate.toISOString(),
        paystack_customer_code:
          verifiedTransaction.customer?.customer_code || subscription?.paystack_customer_code || null,
        card_last4: verifiedTransaction.authorization?.last4 || null,
        card_brand: verifiedTransaction.authorization?.brand || null,
      };

      // Update subscription plan details from metadata
      if (planName) subUpdates.plan_name = `Fixsense ${planName}`;
      if (planPriceUsd) subUpdates.plan_price_usd = planPriceUsd;

      const updateResult = await adminClient
        .from("subscriptions")
        .update(subUpdates)
        .eq("user_id", userId)
        .eq("status", "pending");

      if (!updateResult.error) {
        updated = true;

        // NOW update profile plan_type and calls_limit (only after verified payment)
        if (planKey) {
          const resolvedCallsLimit = callsLimit === -1 ? 999999 : (callsLimit || 5);
          await adminClient
            .from("profiles")
            .update({
              plan_type: planKey,
              calls_limit: resolvedCallsLimit,
              billing_status: "active",
            })
            .eq("id", userId);
          console.log("Sync: Updated profile plan after verified payment:", { userId, planKey });
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        updated,
        current_status: subscription?.status ?? "inactive",
        transactions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("paystack-sync-subscription error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
