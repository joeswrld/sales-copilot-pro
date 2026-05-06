/**
 * In-memory rate limiter for Supabase Edge Functions.
 * Uses a sliding window counter per IP/identifier.
 * Also supports temporary blocking after repeated failures.
 */

interface RateEntry {
  count: number;
  resetAt: number;
}

interface BlockEntry {
  blockedUntil: number;
  reason: string;
}

const rateCounts = new Map<string, RateEntry>();
const blocks = new Map<string, BlockEntry>();
const failureCounts = new Map<string, { count: number; firstAt: number }>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateCounts) if (v.resetAt < now) rateCounts.delete(k);
  for (const [k, v] of blocks) if (v.blockedUntil < now) blocks.delete(k);
  for (const [k, v] of failureCounts) if (now - v.firstAt > 600_000) failureCounts.delete(k);
}, 300_000);

export interface RateLimitConfig {
  maxRequests: number;      // max requests per window
  windowMs: number;         // window duration in ms
  maxFailures?: number;     // failures before temp block (default 10)
  blockDurationMs?: number; // block duration in ms (default 15 min)
}

export function getClientIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * Check rate limit. Returns null if allowed, or a Response(429) if blocked.
 */
export function checkRateLimit(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig
): Response | null {
  const key = `${endpoint}:${identifier}`;
  const now = Date.now();

  // Check if blocked
  const block = blocks.get(key);
  if (block && block.blockedUntil > now) {
    const retryAfter = Math.ceil((block.blockedUntil - now) / 1000);
    return new Response(
      JSON.stringify({ error: "Too many requests. Temporarily blocked.", reason: block.reason, retry_after: retryAfter }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
        },
      }
    );
  }

  // Sliding window check
  const entry = rateCounts.get(key);
  if (entry && entry.resetAt > now) {
    entry.count++;
    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", retry_after: retryAfter }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
          },
        }
      );
    }
  } else {
    rateCounts.set(key, { count: 1, resetAt: now + config.windowMs });
  }

  return null;
}

/**
 * Record a failure (e.g. invalid OAuth callback, bad signature).
 * After maxFailures, the identifier is blocked for blockDurationMs.
 */
export function recordFailure(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig
): boolean {
  const key = `${endpoint}:${identifier}`;
  const now = Date.now();
  const maxFail = config.maxFailures ?? 10;
  const blockMs = config.blockDurationMs ?? 900_000; // 15 min

  const entry = failureCounts.get(key);
  if (entry && now - entry.firstAt < 600_000) {
    entry.count++;
    if (entry.count >= maxFail) {
      blocks.set(key, { blockedUntil: now + blockMs, reason: `${entry.count} failures in 10 minutes` });
      failureCounts.delete(key);
      return true; // blocked
    }
  } else {
    failureCounts.set(key, { count: 1, firstAt: now });
  }
  return false;
}
