/**
 * Extra minutes bundle definitions.
 * Prices are in USD — converted to NGN kobo at checkout.
 */

export interface MinuteBundle {
  minutes: number;
  price_usd: number;
  label: string;
  popular?: boolean;
}

export const MINUTE_BUNDLES: MinuteBundle[] = [
  { minutes: 100,   price_usd: 7,   label: "100 min" },
  { minutes: 300,   price_usd: 18,  label: "300 min" },
  { minutes: 500,   price_usd: 30,  label: "500 min", popular: true },
  { minutes: 1000,  price_usd: 55,  label: "1,000 min" },
  { minutes: 2000,  price_usd: 100, label: "2,000 min" },
  { minutes: 5000,  price_usd: 240, label: "5,000 min" },
];

export function getBundleByMinutes(minutes: number): MinuteBundle | undefined {
  return MINUTE_BUNDLES.find((b) => b.minutes === minutes);
}
