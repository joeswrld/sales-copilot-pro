import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { trackFunnel, reportPartialLead } from "@/lib/funnel";
import { supabase } from "@/integrations/supabase/client";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Check,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ────────────────────────────────────────────────────────────────────────
   Brand mark
   ──────────────────────────────────────────────────────────────────────── */
function FixsenseLogo({ size = 36, borderRadius = 10 }: { size?: number; borderRadius?: number }) {
  return (
    <img
      src="/fixsense_icon_logo (2).png"
      alt=""
      role="presentation"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius,
        objectFit: "cover",
        flexShrink: 0,
        display: "block",
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Validation helpers — inline, friendly, specific
   ──────────────────────────────────────────────────────────────────────── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Common disposable/temp-mail domains. Not exhaustive — new ones appear
// constantly — but blocks the vast majority of throwaway-inbox services
// people use to dodge signup verification.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "guerrillamail.biz",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org",
  "yopmail.com", "yopmail.fr", "yopmail.net", "throwawaymail.com",
  "trashmail.com", "trashmail.net", "getnada.com", "maildrop.cc",
  "sharklasers.com", "dispostable.com", "fakeinbox.com", "mintemail.com",
  "mailnesia.com", "mohmal.com", "moakt.com", "emailondeck.com",
  "tempinbox.com", "mailcatch.com", "tempr.email", "spamgourmet.com",
  "burnermail.io", "inboxbear.com", "mytemp.email", "temp-mail.io",
  "discard.email", "discardmail.com", "mailtemp.info", "throwam.com",
  "mailnull.com", "spambog.com", "spambox.us", "tempail.com",
  "emailfake.com", "fakemailgenerator.com", "crazymailing.com",
  "correotemporal.org", "harakirimail.com", "kurzepost.de", "tempmailo.com",
]);

function emailError(value: string): string | null {
  if (!value) return null; // don't nag before they've typed anything
  if (!EMAIL_RE.test(value)) return "Enter a valid email address.";
  return null;
}

function disposableEmailError(value: string): string | null {
  if (!value || !EMAIL_RE.test(value)) return null;
  const domain = value.trim().toLowerCase().split("@")[1];
  if (domain && DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return "Temporary or disposable email addresses aren't supported. Please use a permanent email.";
  }
  return null;
}

function passwordError(value: string, mode: "login" | "signup"): string | null {
  if (!value) return null;
  if (mode === "signup" && value.length < 8) return "Use at least 8 characters.";
  if (mode === "login" && value.length < 1) return "Enter your password.";
  return null;
}

function friendlyAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login credentials")) {
    return "That email or password isn't right. Double-check and try again.";
  }
  if (msg.includes("temporary or disposable email") || msg.includes("disposable email")) {
    return "Temporary or disposable email addresses aren't supported. Please use a permanent email.";
  }
  if (msg.includes("user already registered") || msg.includes("already registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (msg.includes("email not confirmed")) {
    return "Please verify your email before signing in.";
  }
  if (msg.includes("password") && msg.includes("least")) {
    return "Your password needs to be at least 8 characters.";
  }
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Connection issue. Check your network and try again.";
  }
  return raw || "Something went wrong. Please try again.";
}

/* ────────────────────────────────────────────────────────────────────────
   Trust row — real, verifiable claims only (see /security)
   ──────────────────────────────────────────────────────────────────────── */
function TrustRow({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: "6px 14px",
        fontSize: "11.5px",
        color: dark ? "rgba(255,255,255,0.42)" : "#8a8a7a",
        fontFamily: "var(--font-body)",
        letterSpacing: "0.005em",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
        <ShieldCheck aria-hidden="true" style={{ width: "12px", height: "12px" }} />
        Encrypted in transit &amp; at rest
      </span>
      <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>
      <span>GDPR compliant</span>
      <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>
      <a
        href="/security"
        style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px" }}
      >
        Security overview
      </a>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Login page
   ──────────────────────────────────────────────────────────────────────── */
const VISITED_KEY = "fixsense_has_visited";

/** True if this looks like the visitor's first time on the login page
 * (no record of a prior visit in localStorage). Fails safe to "not first
 * visit" (login default) if storage is unavailable, e.g. private browsing —
 * matches the fail-silent pattern used in CookieConsent.tsx. */
function isFirstVisit(): boolean {
  try {
    return localStorage.getItem(VISITED_KEY) === null;
  } catch {
    return false;
  }
}

function markVisited(): void {
  try {
    localStorage.setItem(VISITED_KEY, "1");
  } catch {
    // localStorage unavailable — nothing to do, next load just won't know.
  }
}

type Mode = "login" | "signup" | "forgot";

export default function LoginPage() {
  // Mode resolution order:
  //   1. Explicit ?mode=signup / ?mode=login in the URL — set by the landing
  //      page's own CTAs (see LandingPage.tsx: "Start free trial" always
  //      links here with ?mode=signup, "Sign in" always links with
  //      ?mode=login). This is authoritative: a link that says "Start free"
  //      should always open signup, regardless of what this browser did on
  //      a previous visit.
  //   2. Fall back to the old isFirstVisit() localStorage heuristic, for any
  //      link that still points at bare /login with no query param (e.g.
  //      old bookmarks, external links).
  const [searchParams] = useSearchParams();
  const modeParam = searchParams.get("mode");
  const [mode, setMode] = useState<Mode>(() => {
    if (modeParam === "signup" || modeParam === "login") return modeParam;
    return isFirstVisit() ? "signup" : "login";
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  // Kept in sync with fullName so the email-field autofill handler can read
  // the freshest name even if autofill fills both fields in the same tick
  // (React state updates from that tick may not have flushed yet).
  const fullNameRef = useRef(fullName);
  useEffect(() => { fullNameRef.current = fullName; }, [fullName]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // Track which fields the user has actually interacted with, so we validate
  // inline without shouting at someone who hasn't typed anything yet.
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });

  // Guards against duplicate submissions (double click, double-tap, Enter-mash).
  const submittingRef = useRef(false);

  const navigate = useNavigate();
  const { toast } = useToast();

  /* ── Redirect already-authenticated users ──────────────────────────────
     New users (haven't finished onboarding) → /onboarding
     Returning users → their dashboard (or /admin if they're an admin)     */
  useEffect(() => {
    const route = async (uid: string, emailConfirmedAt: string | null | undefined) => {
      if (!emailConfirmedAt) {
        navigate("/verify-email", { replace: true });
        return;
      }
      const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle(),
        supabase.from("profiles").select("onboarding_complete").eq("id", uid).maybeSingle(),
      ]);

      if (roleRow) {
        navigate("/admin", { replace: true });
        return;
      }
      const isNewUser = profileRow?.onboarding_complete === false || profileRow?.onboarding_complete == null;
      navigate(isNewUser ? "/onboarding" : "/dashboard", { replace: true });
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) route(session.user.id, session.user.email_confirmed_at);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) route(session.user.id, session.user.email_confirmed_at);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  /* ── Landing-page CTA / first-visit → Sign Up default ───────────────────
     mode was already lazily initialized above (URL ?mode= param, else the
     isFirstVisit() heuristic); this effect just records the visit for next
     time and logs the funnel event, since switchToSignup's own tracking
     only fires on a manual tab click. */
  useEffect(() => {
    const firstVisit = isFirstVisit();
    markVisited();
    if (mode === "signup") {
      const trigger = modeParam === "signup" ? "landing_cta" : firstVisit ? "first_visit_default" : null;
      if (trigger) void trackFunnel("signup_started", { method: "email", trigger });
    }
    // Intentionally run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Font is now loaded from index.html directly, so it's already downloading
  // before this component ever mounts — no more flash of unstyled text while
  // waiting for a post-mount effect to inject the <link>.

  const emailErr = touched.email ? (emailError(email) || (mode === "signup" ? disposableEmailError(email) : null)) : null;
  const passwordErr = touched.password && mode !== "forgot" ? passwordError(password, mode === "signup" ? "signup" : "login") : null;

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!email) return false;
    if (emailError(email)) return false;
    if (mode === "signup" && disposableEmailError(email)) return false;
    if (mode === "forgot") return true;
    if (!password) return false;
    if (mode === "signup" && password.length < 8) return false;
    if (mode === "signup" && !fullName.trim()) return false;
    return true;
  }, [loading, email, password, mode, fullName]);

  const handleEmailAuth = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Surface every relevant inline error at once on submit attempt.
      setTouched({ email: true, password: true });
      setFormError(null);

      if (emailError(email)) return;
      if (mode === "signup" && disposableEmailError(email)) return;
      if (mode !== "forgot" && passwordError(password, mode === "signup" ? "signup" : "login")) return;

      if (mode === "signup" && !agreeToTerms) {
        setTermsError(true);
        return;
      }
      setTermsError(false);

      // Prevent duplicate submissions (double click / double tap / Enter repeat).
      if (submittingRef.current) return;
      submittingRef.current = true;
      setLoading(true);

      try {
        if (mode === "forgot") {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
          });
          if (error) throw error;
          setResetSent(true);
        } else if (mode === "signup") {
          const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: fullName },
              emailRedirectTo: `${window.location.origin}/verify-email`,
            },
          });
          if (error) throw error;
          void trackFunnel("signup_completed", { method: "email" });
          toast({ title: "Check your email", description: "Click the verification link to activate your account." });
          navigate("/verify-email");
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          if (!data.user?.email_confirmed_at) {
            toast({ title: "Verify your email", description: "You must verify your email before signing in." });
            navigate("/verify-email");
            return;
          }
          // Redirect-on-auth is handled by the session effect above, which also
          // knows whether this user needs onboarding.
        }
      } catch (error: any) {
        // Keep whatever the user typed — never clear the form on error.
        setFormError(friendlyAuthError(error?.message ?? ""));
      } finally {
        setLoading(false);
        submittingRef.current = false;
      }
    },
    [email, password, mode, agreeToTerms, fullName, navigate, toast]
  );

  const handleGoogleSignIn = useCallback(async () => {
    if (mode === "signup" && !agreeToTerms) {
      setTermsError(true);
      return;
    }
    setTermsError(false);
    setFormError(null);

    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);

    if (mode === "signup") void trackFunnel("signup_started", { method: "google" });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      setFormError(friendlyAuthError(error.message));
      setLoading(false);
      submittingRef.current = false;
    }
    // On success the browser navigates away to Google, so no need to reset loading.
  }, [mode, agreeToTerms]);

  const switchToSignup = useCallback(() => {
    void trackFunnel("signup_started", { method: "email" });
    setMode("signup");
    setTermsError(false);
    setFormError(null);
    setTouched({ email: false, password: false });
  }, []);

  const switchToLogin = useCallback(() => {
    setMode("login");
    setAgreeToTerms(false);
    setTermsError(false);
    setFormError(null);
    setResetSent(false);
    setTouched({ email: false, password: false });
  }, []);

  const switchToForgot = useCallback(() => {
    setMode("forgot");
    setFormError(null);
    setResetSent(false);
    setTouched((t) => ({ email: t.email, password: false }));
  }, []);

  /* ── Shared form markup (rendered once, styled responsively) ────────── */
  const formBody = (
    <>
      {mode === "signup" && (
        <div className="signup-go-ahead" role="note">
          <Check aria-hidden="true" style={{ width: "13px", height: "13px", flexShrink: 0 }} />
          <span>Free to start · No credit card required</span>
        </div>
      )}
      {mode !== "forgot" && (
        <>
          <button
            className="google-btn"
            onClick={handleGoogleSignIn}
            type="button"
            disabled={loading}
            aria-label="Continue with Google"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>
          <div className="auth-divider">
            <div className="auth-divider-line" />
            <span className="auth-divider-text">or use email</span>
            <div className="auth-divider-line" />
          </div>
        </>
      )}

      {mode === "forgot" && resetSent ? (
        <div className="reset-confirm" role="status">
          <div className="reset-confirm-icon">
            <Check style={{ width: "16px", height: "16px", color: "#16a34a" }} aria-hidden="true" />
          </div>
          <div className="reset-confirm-title">Check your inbox</div>
          <p className="reset-confirm-body">
            If an account exists for <strong>{email}</strong>, a password reset link is on its way.
          </p>
          <button className="mode-link" onClick={switchToLogin} type="button">
            ← Back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={handleEmailAuth} noValidate>
          {formError && (
            <div className="form-error-banner" role="alert">
              <AlertCircle style={{ width: "14px", height: "14px", flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          {mode === "signup" && (
            <div className="form-field">
              <label className="form-label" htmlFor="fullName">
                Full name
              </label>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden="true">
                  <User style={{ width: "14px", height: "14px" }} />
                </span>
                <input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Johnson"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onAnimationStart={(e) => {
                    // Same autofill-detection as the email field. Name alone
                    // isn't reportable — reportPartialLead requires a valid
                    // email — so this just makes sure the freshest
                    // autofilled name is available if/when the email field
                    // reports (whichever field's autofill animation fires
                    // second will carry both values).
                    if (e.animationName !== "onAutoFillStart") return;
                    const filled = e.currentTarget.value;
                    if (filled && filled !== fullName) setFullName(filled);
                  }}
                  className="auth-input"
                  required
                />
              </div>
            </div>
          )}

          <div className="form-field">
            <label className="form-label" htmlFor="email">
              Work email
            </label>
            <div className="input-wrap">
              <span className="input-icon" aria-hidden="true">
                <Mail style={{ width: "14px", height: "14px" }} />
              </span>
              <input
                id="email"
                type="email"
                inputMode="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, email: true }));
                  // Only ever record what the visitor has actually typed into
                  // this field themselves, and only once per field-visit.
                  if (mode === "signup" && !emailError(email)) {
                    reportPartialLead(email, fullName);
                  }
                }}
                onAnimationStart={(e) => {
                  // Browser autofill filled this field without the user
                  // focusing/blurring it. Treat autofill as "the visitor
                  // supplied this" for capture purposes — same as typing it
                  // — since it's still their own saved data, just filled by
                  // the browser rather than the keyboard. Read straight off
                  // the DOM node: autofill can update the value before
                  // React's controlled state has caught up.
                  if (e.animationName !== "onAutoFillStart") return;
                  const filled = e.currentTarget.value;
                  if (filled && filled !== email) setEmail(filled);
                  if (mode === "signup" && !emailError(filled)) {
                    reportPartialLead(filled, fullNameRef.current);
                  }
                }}
                className={`auth-input${emailErr ? " auth-input--error" : ""}`}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="email"
                aria-invalid={!!emailErr}
                aria-describedby={emailErr ? "email-error" : undefined}
                required
              />
            </div>
            {emailErr && (
              <p className="field-error" id="email-error">
                <AlertCircle style={{ width: "12px", height: "12px" }} aria-hidden="true" />
                {emailErr}
              </p>
            )}
          </div>

          {mode !== "forgot" && (
            <div className="form-field">
              <div className="form-label-row">
                <label className="form-label" style={{ margin: 0 }} htmlFor="password">
                  Password
                </label>
                {mode === "login" && (
                  <button type="button" className="forgot-link" onClick={switchToForgot}>
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden="true">
                  <Lock style={{ width: "14px", height: "14px" }} />
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "signup" ? "Min. 8 characters" : "Enter your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  className={`auth-input${passwordErr ? " auth-input--error" : ""}`}
                  style={{ paddingRight: "40px" }}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  aria-invalid={!!passwordErr}
                  aria-describedby={passwordErr ? "password-error" : undefined}
                  required
                  minLength={mode === "signup" ? 8 : 1}
                />
                <button
                  type="button"
                  className="eye-btn"
                  onClick={() => setShowPassword((p) => !p)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff style={{ width: "14px", height: "14px" }} /> : <Eye style={{ width: "14px", height: "14px" }} />}
                </button>
              </div>
              {passwordErr && (
                <p className="field-error" id="password-error">
                  <AlertCircle style={{ width: "12px", height: "12px" }} aria-hidden="true" />
                  {passwordErr}
                </p>
              )}
            </div>
          )}

          {mode === "signup" && (
            <div style={{ marginBottom: "6px" }}>
              <div
                className={`terms-wrap${termsError ? " terms-wrap--error" : ""}${agreeToTerms ? " terms-wrap--checked" : ""}`}
                onClick={() => {
                  setAgreeToTerms((p) => !p);
                  setTermsError(false);
                }}
                role="checkbox"
                aria-checked={agreeToTerms}
                aria-label="I agree to the Terms of Service, Privacy Policy, and Cookie Policy"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setAgreeToTerms((p) => !p);
                    setTermsError(false);
                  }
                }}
              >
                <div
                  className={`terms-checkbox${agreeToTerms ? " terms-checkbox--checked" : ""}${
                    termsError && !agreeToTerms ? " terms-checkbox--error" : ""
                  }`}
                >
                  {agreeToTerms && (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                      <path d="M2 5.5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="terms-text">
                  I agree to Fixsense's{" "}
                  <a href="/terms" onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">
                    Terms of Service
                  </a>
                  ,{" "}
                  <a href="/privacy" onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">
                    Privacy Policy
                  </a>
                  , and{" "}
                  <a href="/privacy#cookies" onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">
                    Cookie Policy
                  </a>
                  .
                </span>
              </div>
              {termsError && (
                <p className="field-error" style={{ paddingLeft: "2px" }}>
                  <AlertCircle style={{ width: "12px", height: "12px" }} aria-hidden="true" />
                  Please agree to the terms to continue.
                </p>
              )}
            </div>
          )}

          <button type="submit" className="submit-btn" disabled={loading || !canSubmit}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <span>{mode === "forgot" ? "Sending..." : mode === "signup" ? "Creating account..." : "Signing in..."}</span>
              </>
            ) : mode === "forgot" ? (
              "Send reset link"
            ) : mode === "signup" ? (
              <>
                <span>Create free account</span>
                <ArrowRight style={{ width: "14px", height: "14px" }} aria-hidden="true" />
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight style={{ width: "14px", height: "14px" }} aria-hidden="true" />
              </>
            )}
          </button>
        </form>
      )}

      {!(mode === "forgot" && resetSent) && (
        <div className="auth-footer-text">
          {mode === "forgot" ? (
            <button className="mode-link" onClick={switchToLogin} type="button">
              ← Back to sign in
            </button>
          ) : mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button className="mode-link" onClick={switchToLogin} type="button">
                Sign in
              </button>
            </>
          ) : (
            <>
              No account yet?{" "}
              <button className="mode-link" onClick={switchToSignup} type="button">
                Create one free
              </button>
            </>
          )}
        </div>
      )}

      {mode === "signup" && (
        <div className="auth-perks">
          {["5 meetings/month free, no credit card", "AI transcription and summaries included", "Up and running in under 5 minutes"].map(
            (p) => (
              <div key={p} className="auth-perk">
                <div className="perk-icon">
                  <Check style={{ width: "9px", height: "9px", color: "#16a34a" }} aria-hidden="true" />
                </div>
                {p}
              </div>
            )
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --paper: #FAFAF8;
          --paper2: #F3F2ED;
          --panel: #14140F;
          --ink: #17170F;
          --ink2: rgba(23,23,15,0.66);
          --muted: rgba(23,23,15,0.42);
          --faint: rgba(23,23,15,0.28);
          --border: rgba(23,23,15,0.11);
          --border-strong: rgba(23,23,15,0.18);
          --accent: #22315C;
          --accent-ink: #FAFAF8;
          --accent-soft: rgba(34,49,92,0.07);
          --accent-ring: rgba(34,49,92,0.16);
          --good: #2F6B4F;
          --good-soft: rgba(47,107,79,0.09);
          --red: #A23B2E;
          --red-soft: rgba(162,59,46,0.08);
          --red-ring: rgba(162,59,46,0.14);
          --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
        }

        .lp-root {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
          font-family: var(--font-body);
          -webkit-font-smoothing: antialiased;
        }

        /* ── Left brand / value-prop panel (desktop) ─────────────────── */
        .lp-left {
          flex: 0 0 420px;
          background: var(--panel);
          padding: 44px 44px 36px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
        }

        .lp-left-brand {
          position: relative; z-index: 1;
          display: flex; align-items: center; gap: 9px;
          text-decoration: none;
        }
        .lp-left-brand-name {
          font-size: 15px; font-weight: 700; color: #fff;
          letter-spacing: -0.01em;
        }

        .lp-value-prop {
          position: relative; z-index: 1;
        }
        .lp-value-headline {
          font-size: clamp(26px, 2.4vw, 32px);
          font-weight: 700;
          color: #fff;
          line-height: 1.18;
          letter-spacing: -0.02em;
          margin-bottom: 14px;
          max-width: 320px;
        }
        .lp-value-sub {
          font-size: 14px; color: rgba(255,255,255,0.5);
          line-height: 1.6; max-width: 300px;
        }

        .lp-left-footer {
          position: relative; z-index: 1;
          display: flex; flex-direction: column; gap: 16px;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }

        /* ── Right form panel ────────────────────────────────────────── */
        .lp-right {
          flex: 1;
          background: var(--paper);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 44px 40px;
          position: relative;
          overflow-y: auto;
        }

        .auth-box {
          position: relative; z-index: 1;
          width: 100%; max-width: 392px;
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 32px 32px 28px;
          box-shadow: 0 1px 2px rgba(0,0,0,.03), 0 20px 48px -24px rgba(20,20,15,.16);
          animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (prefers-reduced-motion: reduce) {
          .auth-box { animation: none; }
          * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }

        @media (max-width: 1100px) and (min-width: 901px) {
          .auth-box { padding: 28px 24px 24px; }
        }

        .auth-brand {
          display: flex; align-items: center; gap: 9px;
          margin-bottom: 24px; text-decoration: none;
        }
        .auth-brand-wordmark {
          font-size: 15.5px; font-weight: 700; color: var(--ink) !important;
          letter-spacing: -0.01em;
          font-family: var(--font-body);
        }

        .auth-tabs {
          display: flex;
          border-bottom: 1px solid var(--border);
          margin-bottom: 22px;
          gap: 0;
        }
        .auth-tab {
          flex: 1; padding: 10px 0; background: none; border: none;
          font-size: 13.5px; font-weight: 600; color: var(--muted) !important;
          font-family: var(--font-body); cursor: pointer;
          position: relative; transition: color 0.15s ease;
          letter-spacing: -0.005em;
          min-height: 44px;
        }
        .auth-tab::after {
          content: '';
          position: absolute; bottom: -1px; left: 0; right: 0; height: 1.5px;
          background: var(--ink); transform: scaleX(0);
          transition: transform 0.2s cubic-bezier(0.4,0,0.2,1);
        }
        .auth-tab--active { color: var(--ink) !important; }
        .auth-tab--active::after { transform: scaleX(1); }
        .auth-tab:focus-visible, .google-btn:focus-visible, .auth-input:focus-visible,
        .submit-btn:focus-visible, .mode-link:focus-visible, .forgot-link:focus-visible,
        .eye-btn:focus-visible, .terms-wrap:focus-visible {
          outline: 2px solid var(--accent); outline-offset: 2px;
        }

        .auth-page-title {
          font-size: 19px; font-weight: 700; color: var(--ink);
          letter-spacing: -0.02em; margin-bottom: 6px;
          font-family: var(--font-body);
        }
        .auth-page-sub {
          font-size: 13px; color: var(--muted); line-height: 1.55; margin-bottom: 20px;
        }

        .google-btn {
          width: 100%; padding: 11px 16px; min-height: 46px;
          background: #fff; color: var(--ink) !important;
          border: 1px solid var(--border-strong); border-radius: 8px;
          font-size: 14px; font-weight: 600; font-family: var(--font-body);
          letter-spacing: -0.005em;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: border-color 0.15s ease, background 0.1s ease, transform 0.08s ease-out;
        }
        .google-btn:hover:not(:disabled) {
          border-color: var(--ink);
          background: rgba(23,23,15,.02);
        }
        .google-btn:active:not(:disabled) {
          transform: scale(0.985);
        }
        .google-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .auth-divider {
          display: flex; align-items: center; gap: 12px; margin: 18px 0;
        }
        .auth-divider-line { flex: 1; height: 1px; background: var(--border); }
        .auth-divider-text { font-size: 10.5px; color: var(--faint); font-family: var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }

        .form-error-banner {
          display: flex; align-items: flex-start; gap: 8px;
          background: var(--red-soft); border: 1px solid rgba(162,59,46,0.22);
          border-radius: 8px; padding: 11px 12px;
          font-size: 12.5px; color: var(--red); line-height: 1.5;
          margin-bottom: 16px;
        }

        .form-field { margin-bottom: 14px; }
        .form-label {
          display: block; font-size: 12px; font-weight: 600; color: var(--ink2);
          margin-bottom: 6px; letter-spacing: 0.005em;
          font-family: var(--font-body);
        }
        .form-label-row {
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;
        }
        .input-wrap { position: relative; }
        .input-icon {
          position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
          color: var(--faint); pointer-events: none; display: flex; align-items: center;
        }
        .auth-input {
          width: 100%; padding: 11px 12px 11px 38px; min-height: 44px;
          background: var(--paper2); border: 1px solid var(--border);
          border-radius: 8px; color: var(--ink); font-size: 14px;
          font-family: var(--font-body); outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }
        .auth-input::placeholder { color: var(--faint); }
        .auth-input:hover:not(:focus) { border-color: var(--border-strong); }
        .auth-input:focus {
          background: #fff;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-ring);
        }
        .auth-input--error {
          border-color: rgba(162,59,46,0.4);
        }
        /* Autofill detection: browsers apply a transition/animation-name
           change to autofilled inputs before any user interaction, which
           lets us catch "filled by autofill but never blurred" cases that
           a plain onBlur handler would miss entirely. */
        @keyframes onAutoFillStart { from {} to {} }
        @keyframes onAutoFillCancel { from {} to {} }
        .auth-input:-webkit-autofill { animation-name: onAutoFillStart; }
        .auth-input:not(:-webkit-autofill) { animation-name: onAutoFillCancel; }
        .auth-input--error:focus {
          border-color: var(--red);
          box-shadow: 0 0 0 3px var(--red-ring);
        }
        .field-error {
          display: flex; align-items: center; gap: 5px;
          font-size: 11.5px; color: var(--red); margin-top: 6px;
          font-family: var(--font-body); line-height: 1.4;
        }

        .eye-btn {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: var(--faint);
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; border-radius: 6px;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .eye-btn:hover { color: var(--ink2); background: var(--paper2); }

        .forgot-link {
          background: none; border: none; cursor: pointer; padding: 2px 0;
          font-size: 12px; color: var(--muted) !important; font-family: var(--font-body);
          transition: color 0.15s ease;
          min-height: 20px;
        }
        .forgot-link:hover { color: var(--ink) !important; }

        .terms-wrap {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 12px 14px;
          background: var(--paper2);
          border: 1px solid var(--border);
          border-radius: 8px;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
          user-select: none;
          margin-bottom: 4px;
        }
        .terms-wrap:hover { border-color: var(--border-strong); }
        .terms-wrap--error {
          border-color: rgba(162,59,46,0.4) !important;
          background: var(--red-soft) !important;
          animation: shake 0.3s ease;
        }
        .terms-wrap--checked {
          border-color: var(--accent) !important;
          background: var(--accent-soft) !important;
        }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-4px); }
          40%      { transform: translateX(4px); }
          60%      { transform: translateX(-3px); }
          80%      { transform: translateX(3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .terms-wrap--error { animation: none; }
        }
        .terms-checkbox {
          width: 17px; height: 17px; min-width: 17px;
          border-radius: 4px;
          border: 1.5px solid var(--border-strong);
          background: #fff;
          display: flex; align-items: center; justify-content: center;
          margin-top: 1px;
          transition: background 0.15s ease, border-color 0.15s ease;
          flex-shrink: 0;
        }
        .terms-checkbox--checked { background: var(--accent); border-color: var(--accent); }
        .terms-checkbox--error { border-color: rgba(162,59,46,0.5); }
        .terms-text { font-size: 12px; color: var(--muted); line-height: 1.6; font-family: var(--font-body); }
        .terms-text a { color: var(--accent); text-decoration: none; font-weight: 600; }
        .terms-text a:hover { text-decoration: underline; }

        .submit-btn {
          width: 100%; padding: 12px 20px; min-height: 46px;
          background: var(--accent);
          color: var(--accent-ink) !important;
          border: 1px solid var(--accent); border-radius: 8px;
          font-size: 14px; font-weight: 600; font-family: var(--font-body);
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: opacity 0.15s ease, transform 0.08s ease-out;
          letter-spacing: -0.005em;
          margin-top: 6px;
        }
        .submit-btn:hover:not(:disabled) {
          opacity: 0.9;
        }
        .submit-btn:active:not(:disabled) {
          transform: scale(0.985);
        }
        .submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .spinner {
          width: 14px; height: 14px; display: inline-block;
          border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
          border-radius: 50%; animation: spin 0.7s linear infinite;
        }

        .reset-confirm { text-align: center; padding: 6px 4px 4px; }
        .reset-confirm-icon {
          width: 38px; height: 38px; border-radius: 50%;
          background: var(--good-soft); border: 1px solid rgba(47,107,79,0.25);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 14px;
        }
        .reset-confirm-title {
          font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 6px;
          letter-spacing: -0.01em;
        }
        .reset-confirm-body {
          font-size: 13px; color: var(--muted); line-height: 1.6; margin-bottom: 18px;
        }
        .reset-confirm-body strong { color: var(--ink); font-weight: 600; }

        .auth-footer-text {
          text-align: center; margin-top: 20px;
          font-size: 13px; color: var(--muted);
        }
        .mode-link {
          background: none; border: none; color: var(--ink) !important; font-size: 13px;
          font-weight: 600; font-family: var(--font-body); cursor: pointer;
          padding: 2px 0; text-decoration: underline; text-underline-offset: 3px;
          transition: opacity 0.15s ease;
          min-height: 20px;
        }
        .mode-link:hover { opacity: 0.65; }

        .auth-perks {
          margin-top: 18px; padding-top: 16px;
          border-top: 1px solid var(--border);
          display: flex; flex-direction: column; gap: 7px;
        }
        .auth-perk {
          display: flex; align-items: center; gap: 8px;
          font-size: 12.5px; color: var(--muted);
        }
        .perk-icon {
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--good-soft); border: 1px solid rgba(47,107,79,0.25);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }

        .auth-security {
          margin-top: 18px;
        }

        .signup-go-ahead {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 600; color: var(--good);
          background: var(--good-soft); border: 1px solid rgba(47,107,79,0.2);
          border-radius: 7px; padding: 7px 10px; margin-bottom: 14px;
        }

        /* ── Mobile (< 900px): single column, form-first ─────────────── */
        .lp-mobile { display: none; }

        @media (max-width: 900px) {
          .lp-root { display: none; }
          .lp-mobile {
            display: flex;
            min-height: 100dvh;
            background: var(--paper2);
            flex-direction: column;
            font-family: var(--font-body);
          }

          .mobile-top-bar {
            background: var(--panel);
            padding: 22px 20px 26px;
            position: relative; flex-shrink: 0;
          }

          .mobile-brand {
            position: relative; z-index: 1;
            display: flex; align-items: center; gap: 8px; margin-bottom: 18px;
            text-decoration: none;
          }
          .mobile-brand-name { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.01em; }

          .mobile-hero-text { position: relative; z-index: 1; }
          .mobile-hero-text h1 {
            font-size: clamp(20px, 5.6vw, 23px); font-weight: 700; color: #fff;
            letter-spacing: -0.02em;
            line-height: 1.22; margin-bottom: 6px;
          }
          .mobile-hero-text p {
            font-size: 13px; color: rgba(255,255,255,0.5); line-height: 1.5;
            max-width: 30ch;
          }

          .mobile-form-area {
            flex: 1; padding: 18px 16px calc(24px + env(safe-area-inset-bottom, 0px));
            position: relative; z-index: 1;
            overflow-y: auto;
            margin-top: -12px;
          }

          .mobile-form-card {
            background: #fff;
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 20px 18px 18px;
            box-shadow: 0 1px 2px rgba(0,0,0,.03), 0 16px 32px -20px rgba(20,20,15,.18);
            animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }

          .mobile-mode-tabs {
            display: flex; background: var(--paper2); border-radius: 8px; padding: 3px;
            margin-bottom: 18px; position: relative; z-index: 1;
          }
          .mobile-mode-tab {
            flex: 1; padding: 9px 0; min-height: 40px; background: none; border: none;
            border-radius: 6px; font-size: 13px; font-weight: 600; color: var(--muted) !important;
            font-family: var(--font-body); cursor: pointer; transition: background 0.15s ease, color 0.15s ease;
          }
          .mobile-mode-tab--active { background: #fff; color: var(--ink) !important; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
        }

        @media (min-width: 901px) {
          .lp-mobile { display: none !important; }
        }

        @media (prefers-contrast: more) {
          .auth-input, .google-btn, .terms-wrap { border-width: 2px; }
        }
      `}</style>

      {/* ══════════════════════════ DESKTOP (≥ 901px) ══════════════════════════ */}
      <div className="lp-root">
        <div className="lp-left">
          <a href="/" className="lp-left-brand">
            <FixsenseLogo size={28} borderRadius={8} />
            <span className="lp-left-brand-name">Fixsense</span>
          </a>

          <div className="lp-value-prop">
            <h1 className="lp-value-headline">
              {mode === "login"
                ? "Continue where your meetings left off."
                : mode === "signup"
                ? "Never take meeting notes again."
                : "Reset your password."}
            </h1>
            <p className="lp-value-sub">
              {mode === "login"
                ? "Every call, transcript, and summary is exactly where you left it. Sign in and pick up instantly."
                : mode === "signup"
                ? "5 meetings a month, free. No credit card, no setup call, ready in minutes."
                : "Enter the email on your account and we'll send you a secure reset link."}
            </p>
          </div>

          <div className="lp-left-footer">
            <TrustRow tone="dark" />
          </div>
        </div>

        <div className="lp-right">
          <div className="auth-box">
            <a href="/" className="auth-brand">
              <FixsenseLogo size={28} borderRadius={8} />
              <span className="auth-brand-wordmark">Fixsense</span>
            </a>

            {mode === "forgot" ? (
              <>
                <div className="auth-page-title">Reset your password</div>
                <p className="auth-page-sub">Enter the email on your account and we'll send a reset link.</p>
              </>
            ) : (
              <div className="auth-tabs" role="tablist" aria-label="Sign in or create account">
                <button
                  role="tab"
                  aria-selected={mode === "login"}
                  className={`auth-tab ${mode === "login" ? "auth-tab--active" : ""}`}
                  onClick={switchToLogin}
                  type="button"
                >
                  Sign in
                </button>
                <button
                  role="tab"
                  aria-selected={mode === "signup"}
                  className={`auth-tab ${mode === "signup" ? "auth-tab--active" : ""}`}
                  onClick={switchToSignup}
                  type="button"
                >
                  Create account
                </button>
              </div>
            )}

            {formBody}

            <div className="auth-security">
              <TrustRow tone="light" />
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════ MOBILE (< 901px) ══════════════════════════ */}
      <div className="lp-mobile">
        <div className="mobile-top-bar">
          <a href="/" className="mobile-brand">
            <FixsenseLogo size={26} borderRadius={7} />
            <span className="mobile-brand-name">Fixsense</span>
          </a>
          <div className="mobile-hero-text">
            <h1>
              {mode === "login"
                ? "Continue where your meetings left off."
                : mode === "signup"
                ? "Start for free."
                : "Reset your password."}
            </h1>
            <p>
              {mode === "login"
                ? "Sign in to pick up your calls, notes, and insights."
                : mode === "signup"
                ? "5 meetings a month, free. No credit card."
                : "We'll email you a secure reset link."}
            </p>
          </div>
        </div>

        <div className="mobile-form-area">
          <div className="mobile-form-card">
            {mode !== "forgot" && (
              <div className="mobile-mode-tabs" role="tablist" aria-label="Sign in or create account">
                <button
                  role="tab"
                  aria-selected={mode === "login"}
                  className={`mobile-mode-tab ${mode === "login" ? "mobile-mode-tab--active" : ""}`}
                  onClick={switchToLogin}
                  type="button"
                >
                  Sign in
                </button>
                <button
                  role="tab"
                  aria-selected={mode === "signup"}
                  className={`mobile-mode-tab ${mode === "signup" ? "mobile-mode-tab--active" : ""}`}
                  onClick={switchToSignup}
                  type="button"
                >
                  Create account
                </button>
              </div>
            )}

            {formBody}

            <div className="auth-security">
              <TrustRow tone="light" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}