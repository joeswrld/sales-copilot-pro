/**
 * _shared/billing.ts — single source of truth for money math.
 *
 * Every checkout (new subscription, plan change, minutes bundle) MUST use
 * computeBreakdown() so the numbers charged to Paystack, the numbers stored
 * on the `payments` row, and the numbers shown in the UI are identical.
 *
 * VAT is 10%.
 */

export const VAT_RATE = 0.10;
export const USD_TO_NGN_RATE = 1500;

export interface Breakdown {
  subtotal_usd: number;
  vat_usd: number;
  total_usd: number;
  exchange_rate: number;
  vat_rate: number;
  total_ngn: number;
  amount_kobo: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build the authoritative breakdown for a USD subtotal. */
export function computeBreakdown(subtotalUsd: number): Breakdown {
  const subtotal_usd = round2(subtotalUsd);
  const vat_usd = round2(subtotal_usd * VAT_RATE);
  const total_usd = round2(subtotal_usd + vat_usd);
  const total_ngn = Math.round(total_usd * USD_TO_NGN_RATE);

  return {
    subtotal_usd,
    vat_usd,
    total_usd,
    exchange_rate: USD_TO_NGN_RATE,
    vat_rate: VAT_RATE,
    total_ngn,
    amount_kobo: total_ngn * 100,
  };
}

/** Columns to persist on a `payments` row so invoices can be rebuilt exactly. */
export function breakdownPaymentColumns(b: Breakdown) {
  return {
    amount_kobo: b.amount_kobo,
    currency: "NGN",
    subtotal_usd: b.subtotal_usd,
    vat_usd: b.vat_usd,
    total_usd: b.total_usd,
    exchange_rate: b.exchange_rate,
    vat_rate: b.vat_rate,
  };
}
