// billing-lifecycle
// Cron-run every hour. Reconciles subscription state with Paystack, handles
// failed renewals, grace period, retry escalation, and hard downgrade to Free
// after 5 failed retries + 24h final grace.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRIES = 5;
const RETRY_INTERVAL_HOURS = 24;
const FINAL_GRACE_HOURS = 24;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY")!;
  const now = new Date();
  const nowIso = now.toISOString();

  const summary = {
    checked: 0, charged_ok: 0, charged_failed: 0, entered_past_due: 0,
    entered_grace: 0, downgraded: 0, restored: 0, errors: [] as string[],
  };

  try {
    // 1) Downgrade users whose FINAL grace period expired.
    const { data: expiredGrace } = await admin
      .from("subscriptions")
      .select("id, user_id, plan_name")
      .in("status", ["grace_period"])
      .lt("grace_period_ends_at", nowIso);

    for (const sub of expiredGrace ?? []) {
      await downgradeToFree(admin, sub);
      summary.downgraded++;
    }

    // 2) Find subscriptions needing renewal or retry.
    const { data: due } = await admin
      .from("subscriptions")
      .select("*")
      .in("status", ["active", "past_due"])
      .or(`next_payment_date.lte.${nowIso},next_retry_at.lte.${nowIso}`)
      .limit(200);

    for (const sub of due ?? []) {
      summary.checked++;
      try {
        if (!sub.paystack_customer_code || !sub.amount_kobo) {
          // Can't charge — treat as failed renewal.
          await markFailure(admin, sub, "no_payment_method", null);
          summary.charged_failed++;
          continue;
        }

        // Attempt charge_authorization via Paystack.
        // Requires authorization_code — Paystack recurring uses subscription
        // code auto-renewal, so we call `charge_authorization` when we have it,
        // otherwise rely on Paystack's own retries and just record.
        const authCode = (sub as any).authorization_code ?? null;
        let success = false;
        let reason: string | null = null;
        let reference: string | null = null;

        if (authCode) {
          const res = await fetch("https://api.paystack.co/transaction/charge_authorization", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: (sub as any).email ?? undefined,
              amount: sub.amount_kobo,
              authorization_code: authCode,
              currency: sub.currency || "NGN",
              metadata: { subscription_id: sub.id, source: "billing-lifecycle" },
            }),
          });
          const body = await res.json().catch(() => ({}));
          success = body?.data?.status === "success";
          reference = body?.data?.reference ?? null;
          reason = success ? null : (body?.data?.gateway_response || body?.message || "charge_failed");
        } else {
          // No auth code — schedule a soft retry and mark past_due
          reason = "missing_authorization_code";
        }

        // Log attempt
        await admin.from("payment_retry_schedule").insert({
          user_id: sub.user_id,
          subscription_id: sub.id,
          retry_number: (sub.retry_count ?? 0) + 1,
          scheduled_at: nowIso,
          attempted_at: nowIso,
          succeeded: success,
          failure_reason: reason,
          paystack_reference: reference,
        });

        if (success) {
          const nextDate = new Date(now);
          nextDate.setMonth(nextDate.getMonth() + 1);
          await admin.from("subscriptions").update({
            status: "active",
            subscription_status: "active",
            payment_status: "success",
            payment_failure_reason: null,
            retry_count: 0,
            next_retry_at: null,
            next_payment_date: nextDate.toISOString(),
            billing_cycle_start: nowIso,
            billing_cycle_end: nextDate.toISOString(),
            grace_period_ends_at: null,
            last_payment_attempt: nowIso,
            minutes_used: 0,
            extra_minutes: 0,
            extra_minutes_expires_at: null,
            updated_at: nowIso,
          }).eq("id", sub.id);
          summary.charged_ok++;
          summary.restored++;
        } else {
          await markFailure(admin, sub, reason || "charge_failed", nowIso);
          summary.charged_failed++;
          const nextCount = (sub.retry_count ?? 0) + 1;
          if (nextCount >= MAX_RETRIES) summary.entered_grace++;
          else summary.entered_past_due++;
        }
      } catch (e) {
        summary.errors.push(`${sub.id}: ${(e as Error).message}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("billing-lifecycle fatal", e);
    return new Response(JSON.stringify({ error: (e as Error).message, summary }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function markFailure(admin: any, sub: any, reason: string, attemptedAt: string | null) {
  const nextCount = (sub.retry_count ?? 0) + 1;
  const updates: Record<string, unknown> = {
    payment_status: "failed",
    payment_failure_reason: reason,
    retry_count: nextCount,
    last_payment_attempt: attemptedAt,
    updated_at: new Date().toISOString(),
  };

  if (nextCount >= MAX_RETRIES) {
    // Final grace period
    const graceEnd = new Date();
    graceEnd.setHours(graceEnd.getHours() + FINAL_GRACE_HOURS);
    updates.status = "grace_period";
    updates.subscription_status = "grace_period";
    updates.grace_period_ends_at = graceEnd.toISOString();
    updates.next_retry_at = null;
    await notify(admin, sub.user_id,
      "⚠️ Final warning — update your payment method",
      `We've tried ${MAX_RETRIES} times to renew your ${sub.plan_name} plan and it keeps failing (${reason}). You have 24 hours to update your card or you'll be downgraded to Free.`,
      "billing");
  } else {
    const nextRetry = new Date();
    nextRetry.setHours(nextRetry.getHours() + RETRY_INTERVAL_HOURS);
    updates.status = "past_due";
    updates.subscription_status = "past_due";
    updates.next_retry_at = nextRetry.toISOString();
    await notify(admin, sub.user_id,
      "Payment failed — please update your card",
      `Retry ${nextCount} of ${MAX_RETRIES} failed (${reason}). We'll try again in ${RETRY_INTERVAL_HOURS}h. Update your card in Billing to avoid losing premium access.`,
      "billing");
  }

  await admin.from("subscriptions").update(updates).eq("id", sub.id);
}

async function downgradeToFree(admin: any, sub: { id: string; user_id: string; plan_name: string }) {
  const { data: freePlan } = await admin
    .from("plans")
    .select("id, name")
    .or("name.eq.free,name.eq.Free")
    .maybeSingle();

  await admin.from("subscriptions").update({
    status: "cancelled",
    subscription_status: "cancelled",
    payment_status: "downgraded",
    plan_id: freePlan?.id ?? null,
    plan_name: "free",
    active_plan: "free",
    plan: "free",
    grace_period_ends_at: null,
    next_retry_at: null,
    next_payment_date: null,
    extra_minutes: 0,
    extra_minutes_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", sub.id);

  await admin.from("billing_audit_log").insert({
    user_id: sub.user_id,
    action: "auto_downgrade",
    old_plan: sub.plan_name,
    new_plan: "free",
    reason: "payment_failed_max_retries",
  }).catch(() => {});

  await notify(admin, sub.user_id,
    "Your plan was downgraded to Free",
    "We couldn't renew your subscription after 5 attempts and the 24h grace period ended. You've been moved to Free. Reactivate anytime from Billing.",
    "billing");
}

async function notify(admin: any, userId: string, title: string, body: string, category: string) {
  await admin.from("notifications").insert({
    user_id: userId, title, body, category, is_read: false,
  }).catch(() => {});
}
