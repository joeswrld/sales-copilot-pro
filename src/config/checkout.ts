/**
 * checkout.ts — Billing display helpers for the checkout UI.
 *
 * IMPORTANT: This file does NOT compute VAT, subtotal, total, or the
 * exchange rate. That used to happen here client-side and it drifted
 * from what the backend actually charged Paystack (the backend never
 * applied VAT; this file always did) — that mismatch is exactly the
 * bug this refactor fixes.
 *
 * The server (paystack-create-subscription, paystack-upgrade-subscription,
 * purchase-minutes-bundle — all via supabase/functions/_shared/billing.ts)
 * is now the single source of truth for every number in the breakdown.
 * The frontend only ever displays a `ServerBreakdown` object returned by
 * one of those edge functions (via a `preview_only`/`preview` call before
 * charging, or the response of the real charge). Nothing here recomputes
 * VAT or converts currency.
 */

/** Breakdown as returned by the server. Field names match the edge
 *  function response's `breakdown` object exactly. */
export interface ServerBreakdown {
  subtotal_usd: number;
  vat_usd: number;
  total_usd: number;
  exchange_rate: number;
  vat_rate: number;
  total_ngn: number;
  amount_kobo: number;
}

/**
 * FIX: paystack-upgrade-subscription's preview response now also carries
 * these top-level proration fields alongside `breakdown`. When
 * `is_prorated` is true, `breakdown.subtotal_usd` is intentionally NOT
 * the flat monthly plan price — it's the prorated charge for the days
 * remaining in the current billing cycle. The UI must label this so it
 * never looks like a mismatch with the plan's sticker price.
 */
export interface PreviewMeta {
  is_new_subscription?: boolean;
  is_upgrade?: boolean;
  is_downgrade?: boolean;
  is_prorated?: boolean;
  days_remaining?: number;
  credit_usd?: number;
  new_monthly_price_usd?: number;
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(amount);
}

/** Format a plain NGN amount (not kobo) — for on-screen conversions ahead of charge. */
export function formatNGNAmount(amount: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(amount);
}