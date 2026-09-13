/**
 * Vercel Routing Middleware — blocks known scraper/automation traffic
 * before it ever reaches the SPA.
 *
 * This project is a static Vite SPA (not Next.js), so this uses Vercel's
 * framework-agnostic Routing Middleware API via `@vercel/functions`
 * (`next()`/`Response`), not `next/server`.
 *
 * Why this exists: funnel_events showed ~43% of "visitors" were
 * HeadlessChrome, AhrefsBot, Bytespider, and similar — none of them are
 * prospects, and they were drowning out real conversion numbers. robots.txt
 * disallows the well-behaved crawlers among these (AhrefsBot, SemrushBot,
 * etc.) but is a courtesy convention only — it does nothing against a
 * scripted browser that doesn't identify itself as a crawler, or simply
 * ignores robots.txt, which is why this exists as a second, enforced layer.
 *
 * Deliberately NOT blocked here (handled by robots.txt / are real users):
 *   - Googlebot, Bingbot, Twitterbot, facebookexternalhit — legitimate
 *     crawlers this site wants indexing/preview access for.
 *   - GPTBot, ChatGPT-User, ClaudeBot, Claude-User, anthropic-ai,
 *     PerplexityBot — AI crawlers explicitly allowed in robots.txt.
 *   - Anything ambiguous. A false positive here means a real prospect
 *     gets turned away, which is worse than an uncounted bot visit.
 *
 * Only runs on page navigations (see `config.matcher`) — never on assets,
 * API calls, or Supabase/edge-function requests, so a bad rule here can't
 * break the app for real users, only page loads.
 */
import { next } from "@vercel/functions";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|json|txt|xml|woff2?|ttf)$).*)",
  ],
};

const BLOCKED_UA = /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|python-requests|scrapy|curl\/|wget\/|bytespider|ahrefsbot|semrushbot|mj12bot|dotbot|blexbot|serpstatbot|petalbot|censysinspect|zgrab/i;

// If any of these appear in the UA, always allow — takes priority over
// BLOCKED_UA so a legitimate crawler is never caught by an overlapping
// substring match.
const ALWAYS_ALLOW_UA = /Googlebot|Bingbot|Twitterbot|facebookexternalhit|GPTBot|ChatGPT-User|ClaudeBot|Claude-User|anthropic-ai|PerplexityBot/i;

export default function middleware(request: Request) {
  const ua = request.headers.get("user-agent") || "";

  if (!ALWAYS_ALLOW_UA.test(ua) && BLOCKED_UA.test(ua)) {
    return new Response("Not found", { status: 404 });
  }

  return next();
}