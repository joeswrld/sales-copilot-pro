import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import {
  Home,
  ArrowLeft,
  Search,
  LayoutDashboard,
  PhoneCall,
  CreditCard,
  LifeBuoy,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ────────────────────────────────────────────────────────────────────────
   Site-search — a small, real index of top-level routes.
   Kept intentionally short: this isn't a full-text search, it's "quick
   navigation for someone who mistyped or followed a stale link."
   ──────────────────────────────────────────────────────────────────────── */
type NavTarget = { label: string; path: string; hint: string; icon: typeof Home };

const LOGGED_OUT_LINKS: NavTarget[] = [
  { label: "Home", path: "/", hint: "Back to the homepage", icon: Home },
  { label: "Pricing", path: "/pricing", hint: "Plans and pricing", icon: CreditCard },
  { label: "Sign in", path: "/login", hint: "Access your account", icon: LayoutDashboard },
  { label: "Contact", path: "/contact", hint: "Get in touch", icon: LifeBuoy },
];

const LOGGED_IN_LINKS: NavTarget[] = [
  { label: "Dashboard", path: "/dashboard", hint: "Your calls and insights", icon: LayoutDashboard },
  { label: "Live call", path: "/live", hint: "Start or join a call", icon: PhoneCall },
  { label: "Billing", path: "/billing", hint: "Plan and usage", icon: CreditCard },
  { label: "Support", path: "/contact", hint: "Get help", icon: LifeBuoy },
];

/* ────────────────────────────────────────────────────────────────────────
   404 numerals with restrained, physical cursor parallax.
   - Springs (damping 1.0-equivalent, critically damped) — no bounce,
     since this is ambient motion, not a flick or release with carried
     momentum.
   - Fully interruptible: the spring always retargets from wherever it
     currently sits, so a fast mouse move never causes a visible jump.
   - Disabled outright under prefers-reduced-motion, per the skill.
   ──────────────────────────────────────────────────────────────────────── */
function ParallaxDigits() {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rawXBack = useMotionValue(0);
  const rawYBack = useMotionValue(0);
  // Critically damped: settles smoothly with no overshoot — right for
  // ambient / hover-driven motion, as opposed to a released gesture.
  const x = useSpring(rawX, { damping: 30, stiffness: 120, mass: 0.5 });
  const y = useSpring(rawY, { damping: 30, stiffness: 120, mass: 0.5 });
  const xBack = useSpring(rawXBack, { damping: 30, stiffness: 90, mass: 0.6 });
  const yBack = useSpring(rawYBack, { damping: 30, stiffness: 90, mass: 0.6 });

  useEffect(() => {
    if (prefersReducedMotion) return;
    const el = ref.current;
    if (!el) return;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width - 0.5;
      const relY = (e.clientY - rect.top) / rect.height - 0.5;
      // Small max travel — restrained, not a gimmick. The back layer
      // travels a bit further in the opposite direction for depth.
      rawX.set(relX * 14);
      rawY.set(relY * 10);
      rawXBack.set(relX * -20);
      rawYBack.set(relY * -14);
    };
    const handlePointerLeave = () => {
      rawX.set(0);
      rawY.set(0);
      rawXBack.set(0);
      rawYBack.set(0);
    };

    window.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [prefersReducedMotion, rawX, rawY, rawXBack, rawYBack]);

  return (
    <div ref={ref} className="relative select-none">
      {/* Soft blurred duplicate behind, drifting opposite — cheap sense of
          depth without a real 3D transform or extra asset. Both numeral
          layers are decorative (aria-hidden); the page's real <h1> lives
          in the text block below so the page still has proper heading
          semantics for screen readers. */}
      <motion.div
        style={prefersReducedMotion ? undefined : { x: xBack, y: yBack }}
        className="pointer-events-none absolute inset-0 -z-10 font-display text-[clamp(5.5rem,22vw,11rem)] font-bold leading-[0.9] tracking-[-0.03em] text-primary/10 blur-[2px]"
        aria-hidden="true"
      >
        404
      </motion.div>
      <motion.div
        style={prefersReducedMotion ? undefined : { x, y }}
        className="font-display text-[clamp(5.5rem,22vw,11rem)] font-bold leading-[0.9] tracking-[-0.03em] text-foreground"
        aria-hidden="true"
      >
        404
      </motion.div>
    </div>
  );
}

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const [query, setQuery] = useState("");

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    const previousTitle = document.title;
    document.title = "Page not found — Fixsense";
    return () => {
      document.title = previousTitle;
    };
  }, [location.pathname]);

  const links = user ? LOGGED_IN_LINKS : LOGGED_OUT_LINKS;
  const primaryTarget = user ? "/dashboard" : "/";
  const primaryLabel = user ? "Back to dashboard" : "Back to home";

  const filteredLinks = query.trim()
    ? links.filter(
        (l) =>
          l.label.toLowerCase().includes(query.trim().toLowerCase()) ||
          l.hint.toLowerCase().includes(query.trim().toLowerCase())
      )
    : links;

  const canGoBack = typeof window !== "undefined" && window.history.length > 1;

  const fade = prefersReducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { type: "spring" as const, damping: 22, stiffness: 220 },
      };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center text-center">
        <motion.div {...fade}>
          <ParallaxDigits />
        </motion.div>

        <motion.div
          {...fade}
          transition={{ ...fade.transition, delay: 0.05 }}
          className="mt-2 space-y-2"
        >
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-foreground">
            This page took a wrong turn
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {loading
              ? "We couldn't find that page."
              : "We couldn't find that page. It may have moved, or the link was mistyped."}
          </p>
          {/* Wayfinding: show exactly what was requested, so a person (or
              support) can diagnose a bad link rather than guess. */}
          <p className="truncate rounded-md bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
            {location.pathname}
          </p>
        </motion.div>

        <motion.div
          {...fade}
          transition={{ ...fade.transition, delay: 0.1 }}
          className="mt-6 flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center"
        >
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to={primaryTarget}>
              <Home className="mr-2 h-4 w-4" aria-hidden="true" />
              {primaryLabel}
            </Link>
          </Button>
          {canGoBack && (
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Go back
            </Button>
          )}
        </motion.div>

        <motion.div
          {...fade}
          transition={{ ...fade.transition, delay: 0.15 }}
          className="mt-10 w-full"
        >
          <div className="relative mb-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search where you meant to go…"
              className="pl-9"
              aria-label="Filter quick links"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredLinks.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.path}
                  to={l.path}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98]"
                  style={{ transition: "transform 100ms ease-out, background-color 150ms ease-out, border-color 150ms ease-out" }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {l.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {l.hint}
                    </span>
                  </span>
                </Link>
              );
            })}
            {filteredLinks.length === 0 && (
              <p className="col-span-full py-4 text-sm text-muted-foreground">
                Nothing matches "{query}". Try{" "}
                <Link to="/contact" className="text-primary underline underline-offset-2">
                  contacting support
                </Link>
                .
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default NotFound;