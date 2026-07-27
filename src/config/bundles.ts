/**
 * Extra minutes bundle definitions.
 * Prices are in USD — converted to NGN kobo at checkout.
 *
 * This is the frontend's fast-render cache of the same rows stored in the
 * `pricing_bundles` Supabase table (the backend reads that table directly
 * via supabase/functions/_shared/pricing.ts). Keep both in sync.
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