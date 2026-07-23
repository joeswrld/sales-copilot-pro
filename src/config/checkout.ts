/**
 * checkout.ts — Shared checkout math for the billing UI.
 *
 * Single source of truth for how a USD price becomes an NGN charge:
 * Subtotal (USD) → convert to NGN → VAT (10%) → Total.
 *
 * NOTE ON THE EXCHANGE RATE: Paystack settles in NGN using its own
 * rate at the moment of charge. USD_TO_NGN in src/config/plans.ts is
 * a fixed reference rate used for on-screen estimates only — it is
 * NOT fetched live. If/when a live-rate feed is wired in, swap the
 * constant read below for that source; every screen that shows a
 * converted amount already reads through getCheckoutBreakdown, so
 * they'll all update together.
 */

import { USD_TO_NGN } from "@/config/plans";

/** VAT rate applied to all Fixsense subscriptions and minute bundles. */
export const VAT_RATE = 0.10;

export interface CheckoutBreakdown {
  subtotalUsd: number;
  subtotalNgn: number;
  vatUsd: number;
  vatNgn: number;
  totalUsd: number;
  totalNgn: number;
  exchangeRate: number;
}

/** Compute subtotal → VAT → total in both USD and NGN from a USD price. */
export function getCheckoutBreakdown(subtotalUsd: number, exchangeRate: number = USD_TO_NGN): CheckoutBreakdown {
  const vatUsd = subtotalUsd * VAT_RATE;
  const totalUsd = subtotalUsd + vatUsd;
  return {
    subtotalUsd,
    subtotalNgn: subtotalUsd * exchangeRate,
    vatUsd,
    vatNgn: vatUsd * exchangeRate,
    totalUsd,
    totalNgn: totalUsd * exchangeRate,
    exchangeRate,
  };
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(amount);
}

/** Format a plain NGN amount (not kobo) — for on-screen conversions ahead of charge. */
export function formatNGNAmount(amount: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(amount);
}