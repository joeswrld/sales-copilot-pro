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
    plan_key?: string;
    custom_fields?: Array<{ variable_name?: string; value?: string }>;
  } | null;
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

    const { userId, userEmail } = resolved;

    const body = await req.json().catch(() => ({}));
    const { reference, include_transactions, mark_abandoned } = body;
    const includeTransactions = include_transactions !== false;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Mark abandoned checkout ───────────────────────────────────────────
    if (mark_abandoned && reference) {
      await adminClient
        .from("payments")
        .update({ status: "abandoned", updated_at: new Date().toISOString() })
        .eq("paystack_reference", reference)
        .eq("user_id", userId)
        .in("status", ["initialized", "pending"]);

      return new Response(
        JSON.stringify({ ok: true, marked_abandoned: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: subscription } = await adminClient
      .from("subscriptions")
      .select("user_id, status, paystack_customer_code, plan_name, plan_price_usd, amount_kobo")
      .eq("user_id", userId)
      .maybeSingle();

    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");

    // If Paystack isn't configured, return a safe degraded response
    if (!paystackSecret) {
      return new Response(
        JSON.stringify({
          ok:             true,
          updated:        false,
          current_status: subscription?.status ?? "inactive",
          transactions:   [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let verifiedTransaction: PaystackTx | null = null;
    let matchedTransactions: PaystackTx[]       = [];
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

    // Verify a specific reference if provided
    if (reference) {
      const verifyRes  = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${paystackSecret}` } }
      );
      const verifyData = await verifyRes.json();
      if (verifyData?.status && verifyData?.data?.status === "success") {
        verifiedTransaction = verifyData.data as PaystackTx;
      } else if (verifyData?.data?.status === "abandoned") {
        await adminClient
          .from("payments")
          .update({ status: "abandoned", updated_at: new Date().toISOString() })
          .eq("paystack_reference", reference)
          .eq("user_id", userId);
      }
    }

    const shouldFetchList = includeTransactions || !verifiedTransaction;

    if (shouldFetchList) {
      const listUrl = new URL("https://api.paystack.co/transaction");
      listUrl.searchParams.set("perPage", includeTransactions ? "100" : "20");
      if (subscription?.paystack_customer_code) {
        listUrl.searchParams.set("customer", subscription.paystack_customer_code);
      }

      const txRes  = await fetch(listUrl.toString(), {
        headers: { Authorization: `Bearer ${paystackSecret}` },
      });
      const txData = await txRes.json();
      const allTransactions = (txData?.data || []) as PaystackTx[];

      matchedTransactions = allTransactions.filter((tx) => {
        const txEmail         = tx.customer?.email?.toLowerCase();
        const emailMatch      = !!userEmail && txEmail === userEmail.toLowerCase();
        const codeMatch       = !!subscription?.paystack_customer_code &&
          tx.customer?.customer_code === subscription.paystack_customer_code;
        const metaUserIdMatch = tx.metadata?.user_id === userId;
        const metaFieldMatch  =
          tx.metadata?.custom_fields?.some(
            (f) => f?.variable_name === "user_id" && f?.value === userId
          ) ?? false;
        return emailMatch || codeMatch || metaUserIdMatch || metaFieldMatch;
      });

      // Last-resort: if we got results but none matched our filters, use all
      if (matchedTransactions.length === 0 && subscription?.paystack_customer_code && allTransactions.length > 0) {
        matchedTransactions = allTransactions;
      }
      if (matchedTransactions.length === 0 && reference) {
        const byRef = allTransactions.find((tx) => tx.reference === reference);
        if (byRef) matchedTransactions = [byRef];
      }

      if (includeTransactions) {
        transactions = matchedTransactions
          .map((tx) => ({
            reference:        tx.reference,
            status:           tx.status,
            amount_kobo:      tx.amount,
            amount_ngn:       tx.amount / 100,
            paid_at:          tx.paid_at,
            created_at:       tx.created_at,
            currency:         tx.currency,
            channel:          tx.channel,
            gateway_response: tx.gateway_response,
          }))
          .sort(
            (a, b) =>
              new Date(b.paid_at || b.created_at).getTime() -
              new Date(a.paid_at || a.created_at).getTime()
          );
      }

      if (!verifiedTransaction) {
        verifiedTransaction =
          matchedTransactions.find((tx) => tx.status === "success") || null;
      }
    }

    let updated = false;

    // ── Ask Paystack for the authoritative next_payment_date via /subscription
    let paystackNextPaymentDate: string | null = null;
    if (subscription?.paystack_customer_code) {
      try {
        const subRes = await fetch(
          `https://api.paystack.co/subscription?customer=${encodeURIComponent(subscription.paystack_customer_code)}&perPage=10`,
          { headers: { Authorization: `Bearer ${paystackSecret}` } }
        );
        const subJson = await subRes.json();
        const active = (subJson?.data || []).find((s: any) => s?.status === "active")
          ?? (subJson?.data || [])[0];
        if (active?.next_payment_date) paystackNextPaymentDate = active.next_payment_date;
      } catch (e) {
        console.warn("paystack /subscription lookup failed:", e);
      }
    }

    if (verifiedTransaction || paystackNextPaymentDate) {
      const computedNext =
        paystackNextPaymentDate
          ?? (verifiedTransaction?.paid_at
                ? new Date(new Date(verifiedTransaction.paid_at).setMonth(
                    new Date(verifiedTransaction.paid_at).getMonth() + 1
                  )).toISOString()
                : null);

      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (computedNext) patch.next_payment_date = computedNext;
      if (verifiedTransaction?.customer?.customer_code)
        patch.paystack_customer_code = verifiedTransaction.customer.customer_code;
      if (verifiedTransaction?.authorization?.last4)
        patch.card_last4 = verifiedTransaction.authorization.last4;
      if (verifiedTransaction?.authorization?.brand)
        patch.card_brand = verifiedTransaction.authorization.brand;

      // Only flip to active from a non-active state; never downgrade an active row here.
      if (verifiedTransaction && subscription?.status !== "active") {
        patch.status = "active";
      }

      const { error: updateErr } = await adminClient
        .from("subscriptions")
        .update(patch)
        .eq("user_id", userId);

      if (!updateErr) {
        updated = true;
        if (reference && verifiedTransaction) {
          await adminClient
            .from("payments")
            .update({ status: "success", updated_at: new Date().toISOString() })
            .eq("paystack_reference", reference)
            .eq("user_id", userId);
        }
      } else {
        console.error("subscription update failed:", updateErr);
      }
    }

    return new Response(
      JSON.stringify({
        ok:             true,
        updated,
        current_status: subscription?.status ?? "inactive",
        transactions,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("paystack-sync-subscription error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});