/**
 * Extra minutes bundle definitions.
 * Prices are in USD — converted to NGN kobo at checkout.
 *
 * SOURCE OF TRUTH DUPLICATION: these prices must exactly match
 * VALID_BUNDLES in supabase/functions/purchase-minutes-bundle/index.ts.
 * There is no shared config or DB table between frontend and edge
 * function — if you change a price here, change it there too, or the
 * checkout dialog's header price and its server-computed subtotal will
 * disagree (as happened before).
 */

export interface MinuteBundle {
  minutes: number;
  price_usd: number;
  label: string;
  popular?: boolean;
}

export const MINUTE_BUNDLES: MinuteBundle[] = [
  { minutes: 100,   price_usd: 10,  label: "100 min" },
  { minutes: 300,   price_usd: 27,  label: "300 min" },
  { minutes: 500,   price_usd: 42,  label: "500 min", popular: true },
  { minutes: 1000,  price_usd: 79,  label: "1,000 min" },
  { minutes: 2000,  price_usd: 149, label: "2,000 min" },
  { minutes: 5000,  price_usd: 349, label: "5,000 min" },
];

export function getBundleByMinutes(minutes: number): MinuteBundle | undefined {
  return MINUTE_BUNDLES.find((b) => b.minutes === minutes);
}