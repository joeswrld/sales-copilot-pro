/**
 * Fixsense product analytics + session replay tracker.
 *
 * Captures, entirely first-party (no third-party scripts):
 *   - sessions (device / browser / OS / country / timezone / screen)
 *   - page views + navigation journeys
 *   - clicks with viewport-relative coordinates (click maps / heatmaps)
 *   - rage clicks (3+ clicks on the same element within 1s)
 *   - dead clicks (click that produces no DOM / route / scroll change)
 *   - scroll depth
 *   - element impressions for buttons & CTAs (to find *ignored* buttons)
 *   - JS errors + unhandled rejections
 *
 * Privacy: no input values, no text typed by users, no DOM snapshots.
 * Everything is written through the guarded `analytics_ingest` RPC.
 */

import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "fx_pa_session";
const SESSION_TS_KEY = "fx_pa_session_ts";
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min inactivity ends a session
const FLUSH_MS = 5000;
const MAX_BUFFER = 60;

export type PAEvent =
  | "page_view"
  | "click"
  | "rage_click"
  | "dead_click"
  | "scroll"
  | "error"
  | "element_view"
  | "form_submit";

interface QueuedEvent {
  event: PAEvent;
  ts: string;
  path: string | null;
  selector?: string | null;
  label?: string | null;
  x?: number | null;
  y?: number | null;
  vw?: number | null;
  vh?: number | null;
  scroll_pct?: number | null;
  metadata?: Record<string, unknown>;
}

/* ── environment fingerprint (non-identifying) ───────────────── */

function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}

function detectOs(ua: string): string {
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

function detectDevice(): string {
  const w = window.innerWidth;
  if (/iPad|Tablet/.test(navigator.userAgent) || (w >= 768 && w < 1024)) return "Tablet";
  if (w < 768) return "Mobile";
  return "Desktop";
}

/** Best-effort country from the browser locale region (never an IP lookup). */
function detectCountry(): string | null {
  try {
    const langs = [navigator.language, ...(navigator.languages ?? [])];
    for (const l of langs) {
      const region = l?.split("-")[1];
      if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    return tz ? tz.split("/")[0].slice(0, 8) : null;
  } catch {
    return null;
  }
}

/* ── session id ──────────────────────────────────────────────── */

function newId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random()}`; }
}

let sessionStartedAt = new Date().toISOString();

export function paSessionId(): string {
  try {
    const last = Number(localStorage.getItem(SESSION_TS_KEY) ?? 0);
    let id = localStorage.getItem(SESSION_KEY);
    if (!id || !last || Date.now() - last > SESSION_TTL_MS) {
      id = newId();
      sessionStartedAt = new Date().toISOString();
      localStorage.setItem(SESSION_KEY, id);
      localStorage.setItem(`${SESSION_KEY}_start`, sessionStartedAt);
    } else {
      sessionStartedAt = localStorage.getItem(`${SESSION_KEY}_start`) ?? sessionStartedAt;
    }
    localStorage.setItem(SESSION_TS_KEY, String(Date.now()));
    return id;
  } catch {
    return "anonymous";
  }
}

/* ── selector + label helpers ────────────────────────────────── */

function cssPath(el: Element | null): string | null {
  if (!el) return null;
  const parts: string[] = [];
  let node: Element | null = el;
  for (let i = 0; node && i < 4 && node.tagName !== "BODY"; i++) {
    let part = node.tagName.toLowerCase();
    const testId = node.getAttribute("data-testid") ?? node.getAttribute("data-funnel");
    if (testId) { parts.unshift(`${part}[${testId}]`); break; }
    if (node.id) { parts.unshift(`#${node.id}`); break; }
    const cls = (node.getAttribute("class") ?? "")
      .split(/\s+/).filter((c) => c && !c.includes("[") && c.length < 22).slice(0, 2).join(".");
    if (cls) part += `.${cls}`;
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ").slice(0, 300) || null;
}

function labelOf(el: Element | null): string | null {
  if (!el) return null;
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.slice(0, 120);
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 120) : (el.getAttribute("title") ?? null);
}

function interactiveAncestor(el: Element | null): Element | null {
  let node: Element | null = el;
  for (let i = 0; node && i < 5; i++) {
    const tag = node.tagName;
    if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "SELECT" ||
        tag === "TEXTAREA" || node.getAttribute("role") === "button" ||
        node.hasAttribute("data-funnel")) return node;
    node = node.parentElement;
  }
  return null;
}

/** Snapshot of the state-bearing attributes on a clicked element, used to
 * detect toggle/switch/menu-style UI changes that a dead-click check based
 * only on innerHTML length would otherwise miss. */
function elementStateSnapshot(el: Element | null): string {
  if (!el) return "";
  return [
    el.className,
    el.getAttribute("aria-expanded"),
    el.getAttribute("aria-checked"),
    el.getAttribute("aria-pressed"),
    el.getAttribute("aria-selected"),
    el.getAttribute("data-state"),
    el.hasAttribute("disabled") ? "disabled" : "",
    (el as HTMLInputElement).checked !== undefined ? String((el as HTMLInputElement).checked) : "",
  ].join("|");
}

/* ── tracker core ────────────────────────────────────────────── */

let buffer: QueuedEvent[] = [];
let started = false;
let currentPath = typeof location !== "undefined" ? location.pathname : "/";
let maxScrollPct = 0;
let flushTimer: number | undefined;
let lastClick = { selector: "", at: 0, count: 0 };
const seenElements = new Set<string>();

function push(e: QueuedEvent) {
  buffer.push(e);
  if (buffer.length >= MAX_BUFFER) void flush();
}

export function paTrack(event: PAEvent, extra: Partial<QueuedEvent> = {}) {
  push({
    event,
    ts: new Date().toISOString(),
    path: currentPath,
    vw: window.innerWidth,
    vh: window.innerHeight,
    ...extra,
  });
}

export async function flush(): Promise<void> {
  if (!buffer.length) return;
  const events = buffer;
  buffer = [];
  try {
    await (supabase as any).rpc("analytics_ingest", {
      _session: {
        id: paSessionId(),
        started_at: sessionStartedAt,
        path: currentPath,
        entry_path: sessionStorage.getItem("fx_pa_entry") ?? currentPath,
        device: detectDevice(),
        browser: detectBrowser(navigator.userAgent),
        os: detectOs(navigator.userAgent),
        country: detectCountry(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
        screen_w: window.screen?.width ?? null,
        screen_h: window.screen?.height ?? null,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent.slice(0, 400),
      },
      _events: events,
    });
  } catch {
    /* analytics must never break the app */
  }
}

export function paPageView(path: string) {
  currentPath = path;
  maxScrollPct = 0;
  seenElements.clear();
  try {
    if (!sessionStorage.getItem("fx_pa_entry")) sessionStorage.setItem("fx_pa_entry", path);
  } catch { /* ignore */ }
  paTrack("page_view", { metadata: { title: document.title.slice(0, 120) } });
  void flush();
}

/**
 * Filters out errors that don't originate from this app's own bundled code.
 * Browser extensions (password managers, wallets, ad blockers, etc.) run
 * content scripts in the page context and throw errors that bubble to
 * `window` just like real app errors — e.g. the well-known extension
 * bridge error "Object Not Found Matching Id:N, MethodName:update,
 * ParamCount:N". These are not actionable and were flooding this
 * dashboard, so we only keep errors whose source file is same-origin
 * (i.e. actually part of our build), or that have no filename/stack at
 * all but a message that looks like a real runtime error rather than an
 * extension artifact.
 */
function isOwnAppError(source: string, message: string): boolean {
  if (/extension:\/\//i.test(source)) return false;
  if (/Object Not Found Matching Id/i.test(message)) return false;
  if (/^ResizeObserver loop/i.test(message)) return false; // benign browser noise
  if (!source) {
    // No filename/stack — most likely a cross-origin script error
    // ("Script error." with no detail) or an extension artifact.
    // Real same-origin errors always carry a filename/stack.
    return !/^script error\.?$/i.test(message.trim()) && message.trim().length > 0;
  }
  try {
    const url = new URL(source, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

/* debounce rapid-fire error flushes so a noisy loop (extension or
   otherwise) can't hammer the ingest endpoint with a flush call per event */
let errorFlushTimer = 0;
function scheduleErrorFlush() {
  if (errorFlushTimer) return;
  errorFlushTimer = window.setTimeout(() => {
    errorFlushTimer = 0;
    void flush();
  }, 1000);
}

function scrollPct(): number {
  const doc = document.documentElement;
  const total = doc.scrollHeight - window.innerHeight;
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((window.scrollY / total) * 100)));
}

export function startProductAnalytics() {
  if (started || typeof window === "undefined") return;
  started = true;
  paSessionId();

  /* clicks + rage clicks + dead clicks */
  document.addEventListener(
    "click",
    (ev) => {
      const target = ev.target as Element | null;
      const el = interactiveAncestor(target) ?? target;
      const selector = cssPath(el);
      const label = labelOf(el);
      const base = {
        selector,
        label,
        x: Math.round((ev as MouseEvent).clientX),
        y: Math.round((ev as MouseEvent).clientY),
      };

      const now = Date.now();
      if (selector && selector === lastClick.selector && now - lastClick.at < 1000) {
        lastClick.count += 1;
        lastClick.at = now;
      } else {
        lastClick = { selector: selector ?? "", at: now, count: 1 };
      }

      if (lastClick.count >= 3) {
        paTrack("rage_click", { ...base, metadata: { repeats: lastClick.count } });
        void flush();
        return;
      }

      paTrack("click", base);

      // dead click: nothing changed ~1.2s after clicking an interactive-looking element.
      // We check DOM length, scroll, route, AND a snapshot of state-bearing attributes
      // (aria-*, data-state, class, disabled, checked) on the clicked element itself,
      // since a toggle/switch/menu can change meaningfully without moving the DOM
      // length by more than a few chars. 700ms was also too tight for anything that
      // waits on a network round-trip (e.g. a Supabase call) before updating the UI.
      const pathBefore = location.pathname;
      const htmlLen = document.body.innerHTML.length;
      const scrollBefore = window.scrollY;
      const elStateBefore = elementStateSnapshot(el);
      const isInteractive = !!interactiveAncestor(target);
      window.setTimeout(() => {
        if (!isInteractive) return;
        const stillAttached = document.contains(el);
        const unchanged =
          location.pathname === pathBefore &&
          Math.abs(document.body.innerHTML.length - htmlLen) < 40 &&
          Math.abs(window.scrollY - scrollBefore) < 10 &&
          // if the element itself is gone (e.g. modal/menu closed or item removed),
          // that IS a change — don't call it dead
          stillAttached &&
          elementStateSnapshot(el) === elStateBefore;
        if (unchanged) paTrack("dead_click", base);
      }, 1200);
    },
    true,
  );

  /* scroll depth */
  let scrollRaf = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollRaf) return;
      scrollRaf = window.requestAnimationFrame(() => {
        scrollRaf = 0;
        const pct = scrollPct();
        if (pct > maxScrollPct + 9) {
          maxScrollPct = pct;
          paTrack("scroll", { scroll_pct: pct });
        }
      });
    },
    { passive: true },
  );

  /* element impressions for buttons / CTAs (ignored-button detection) */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const sel = cssPath(entry.target);
        if (!sel || seenElements.has(sel)) continue;
        seenElements.add(sel);
        paTrack("element_view", { selector: sel, label: labelOf(entry.target) });
        io.unobserve(entry.target);
      }
    }, { threshold: 0.5 });

    const observeAll = () => {
      document
        .querySelectorAll('button, a[href], [role="button"], [data-funnel]')
        .forEach((el) => { if (!seenElements.has(cssPath(el) ?? "")) io.observe(el); });
    };
    observeAll();
    window.setInterval(observeAll, 4000);
  }

  /* form submits */
  document.addEventListener(
    "submit",
    (ev) => {
      const form = ev.target as Element | null;
      paTrack("form_submit", { selector: cssPath(form), label: labelOf(form) });
    },
    true,
  );

  /* errors */
  window.addEventListener("error", (ev) => {
    const filename = String((ev as ErrorEvent).filename ?? "");
    const message = String(ev.message ?? "");
    if (!isOwnAppError(filename, message)) return;
    paTrack("error", {
      label: (ev.message ?? "Error").slice(0, 120),
      metadata: {
        message: message.slice(0, 300),
        source: filename.slice(0, 200),
        line: (ev as ErrorEvent).lineno ?? null,
      },
    });
    scheduleErrorFlush();
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const reason = (ev as PromiseRejectionEvent).reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? "");
    const stack = reason instanceof Error ? String(reason.stack ?? "") : "";
    if (!isOwnAppError(stack, message)) return;
    paTrack("error", {
      label: message.slice(0, 120),
      metadata: { message: message.slice(0, 300), kind: "unhandledrejection" },
    });
    scheduleErrorFlush();
  });

  /* periodic + lifecycle flush */
  flushTimer = window.setInterval(() => void flush(), FLUSH_MS);
  document.addEventListener("visibilitychange", () => { if (document.hidden) void flush(); });
  window.addEventListener("pagehide", () => void flush());
}

export function stopProductAnalytics() {
  if (flushTimer) window.clearInterval(flushTimer);
  started = false;
  void flush();
}