import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { trackFunnel } from "@/lib/funnel";
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

function emailError(value: string): string | null {
  if (!value) return null; // don't nag before they've typed anything
  if (!EMAIL_RE.test(value)) return "Enter a valid email address.";
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
    return "Connection issue — check your network and try again.";
  }
  return raw || "Something went wrong. Please try again.";
}

/* ────────────────────────────────────────────────────────────────────────
   Trust row — used on both desktop and mobile
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
        color: dark ? "rgba(255,255,255,0.42)" : "#94a3b8",
        fontFamily: "var(--font-body)",
        letterSpacing: "0.005em",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
        <ShieldCheck aria-hidden="true" style={{ width: "12px", height: "12px" }} />
        Encrypted in transit &amp; at rest
      </span>
      <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>
      <span>SOC 2 Type II</span>
      <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>
      <span>GDPR compliant</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Avatar cluster — quiet, immediate social proof for the value panel
   ──────────────────────────────────────────────────────────────────────── */
function AvatarCluster() {
  const initials = ["PN", "JO", "MR", "AK"];
  const tones = ["#60a5fa", "#a78bfa", "#4ade80", "#fb923c"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ display: "flex" }}>
        {initials.map((i, idx) => (
          <div
            key={i}
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              background: `linear-gradient(155deg, ${tones[idx]}33, ${tones[idx]}11)`,
              border: "1.5px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "9px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.75)",
              fontFamily: "var(--font-body)",
              marginLeft: idx === 0 ? 0 : "-8px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            }}
          >
            {i}
          </div>
        ))}
      </div>
      <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", fontFamily: "var(--font-body)", letterSpacing: "0.005em" }}>
        Joined by <strong style={{ color: "rgba(255,255,255,0.72)", fontWeight: 600 }}>200+ revenue teams</strong>
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Login page
   ──────────────────────────────────────────────────────────────────────── */
type Mode = "login" | "signup" | "forgot";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
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

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  const emailErr = touched.email ? emailError(email) : null;
  const passwordErr = touched.password && mode !== "forgot" ? passwordError(password, mode === "signup" ? "signup" : "login") : null;

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!email) return false;
    if (emailError(email)) return false;
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
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
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
          --bg-left: #0c0f1a;
          --bg-right: #080b13;
          --ink: #0f172a;
          --border-subtle: rgba(255,255,255,0.07);
          --text-label: #64748b;
          --text-placeholder: #94a3b8;
          --blue: #1d4ed8;
          --blue-hover: #1e40af;
          --blue-ring: rgba(29,78,216,0.18);
          --green: #4ade80;
          --red: #ef4444;
          --red-ring: rgba(239,68,68,0.14);
          --font-body: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          --font-serif: 'Instrument Serif', Georgia, serif;
          --font-mono: 'Geist Mono', 'JetBrains Mono', monospace;
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
          flex: 0 0 440px;
          background: var(--bg-left);
          padding: 48px 48px 40px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
        }
        .lp-left::after {
          content: '';
          position: absolute; top: 0; right: 0; bottom: 0; width: 1px;
          background: linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.09) 20%, rgba(255,255,255,0.09) 80%, transparent 100%);
        }
        .lp-left::before {
          content: '';
          position: absolute; inset: 0;
          background-image:
            radial-gradient(560px 420px at 8% -8%, rgba(59,130,246,0.14), transparent 60%),
            radial-gradient(480px 380px at 100% 108%, rgba(74,222,128,0.08), transparent 60%),
            url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
          pointer-events: none;
        }

        .lp-left-brand {
          position: relative; z-index: 1;
          display: flex; align-items: center; gap: 10px;
          text-decoration: none;
        }
        .lp-left-brand-name {
          font-size: 15px; font-weight: 700; color: #fff;
          letter-spacing: -0.02em;
        }

        .lp-value-prop {
          position: relative; z-index: 1;
        }
        .lp-value-eyebrow {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.18);
          border-radius: 20px; padding: 5px 12px 5px 10px; margin-bottom: 30px;
          box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset;
        }
        .lp-value-eyebrow-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #4ade80; display: inline-block;
          box-shadow: 0 0 0 3px rgba(74,222,128,0.14);
        }
        .lp-value-eyebrow-text {
          font-size: 11px; font-weight: 600; color: #86efac;
          letter-spacing: 0.02em; font-family: var(--font-body);
        }

        .lp-value-headline {
          font-size: clamp(30px, 2.8vw, 39px);
          font-weight: 400;
          color: #fff;
          line-height: 1.12;
          letter-spacing: -0.025em;
          font-family: var(--font-serif);
          margin-bottom: 16px;
          max-width: 340px;
        }
        .lp-value-headline em {
          font-style: italic;
          color: rgba(255,255,255,0.6);
        }
        .lp-value-sub {
          font-size: 14.5px; color: rgba(255,255,255,0.42);
          line-height: 1.65; max-width: 320px;
          letter-spacing: -0.003em;
        }

        .lp-left-footer {
          position: relative; z-index: 1;
          display: flex; flex-direction: column; gap: 18px;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        /* ── Right form panel ────────────────────────────────────────── */
        .lp-right {
          flex: 1;
          background: linear-gradient(180deg, #fbfcfe 0%, #f4f6fa 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 40px;
          position: relative;
          overflow-y: auto;
        }
        .lp-right::before {
          content: '';
          position: absolute; inset: 0;
          background-image: radial-gradient(680px 520px at 82% 8%, rgba(29,78,216,0.05), transparent 62%);
          pointer-events: none;
        }

        .auth-box {
          position: relative; z-index: 1;
          width: 100%; max-width: 400px;
          background: #ffffff;
          border: 1px solid rgba(15,23,42,0.06);
          border-radius: 20px;
          padding: 36px 36px 32px;
          box-shadow:
            0 1px 2px rgba(15,23,42,0.03),
            0 12px 32px -12px rgba(15,23,42,0.10),
            0 24px 64px -24px rgba(15,23,42,0.08);
          animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px) scale(0.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (prefers-reduced-motion: reduce) {
          .auth-box { animation: none; }
          * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }

        @media (max-width: 1100px) and (min-width: 901px) {
          .auth-box { padding: 30px 28px 26px; }
        }

        .auth-brand {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 26px; text-decoration: none;
        }
        .auth-brand-wordmark {
          font-size: 16px; font-weight: 700; color: var(--ink);
          letter-spacing: -0.02em;
          font-family: var(--font-body);
        }

        .auth-tabs {
          display: flex;
          border-bottom: 1.5px solid #e2e8f0;
          margin-bottom: 24px;
          gap: 0;
        }
        .auth-tab {
          flex: 1; padding: 11px 0; background: none; border: none;
          font-size: 13.5px; font-weight: 600; color: #94a3b8;
          font-family: var(--font-body); cursor: pointer;
          position: relative; transition: color 0.15s ease;
          letter-spacing: -0.01em;
          min-height: 44px;
        }
        .auth-tab::after {
          content: '';
          position: absolute; bottom: -1.5px; left: 0; right: 0; height: 1.5px;
          background: var(--ink); transform: scaleX(0);
          transition: transform 0.2s cubic-bezier(0.4,0,0.2,1);
        }
        .auth-tab--active { color: var(--ink); }
        .auth-tab--active::after { transform: scaleX(1); }
        .auth-tab:focus-visible, .google-btn:focus-visible, .auth-input:focus-visible,
        .submit-btn:focus-visible, .mode-link:focus-visible, .forgot-link:focus-visible,
        .eye-btn:focus-visible, .terms-wrap:focus-visible {
          outline: 2px solid var(--blue); outline-offset: 2px;
        }

        .auth-page-title {
          font-size: 20px; font-weight: 700; color: var(--ink);
          letter-spacing: -0.03em; margin-bottom: 6px;
          font-family: var(--font-body);
        }
        .auth-page-sub {
          font-size: 13px; color: var(--text-label); line-height: 1.55; margin-bottom: 22px;
        }

        .google-btn {
          width: 100%; padding: 12px 16px; min-height: 46px;
          background: #fff; color: #1e293b;
          border: 1.5px solid #e2e8f0; border-radius: 11px;
          font-size: 14.5px; font-weight: 600; font-family: var(--font-body);
          letter-spacing: -0.005em;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.1s ease, transform 0.08s ease-out;
          box-shadow: 0 1px 2px rgba(15,23,42,0.05), 0 1px 0 rgba(255,255,255,0.6) inset;
        }
        .google-btn:hover:not(:disabled) {
          border-color: #cbd5e1;
          box-shadow: 0 4px 14px -2px rgba(15,23,42,0.12), 0 1px 0 rgba(255,255,255,0.6) inset;
        }
        .google-btn:active:not(:disabled) {
          background: #f8fafc;
          transform: scale(0.985);
          box-shadow: 0 1px 2px rgba(15,23,42,0.05) inset;
        }
        .google-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .auth-divider {
          display: flex; align-items: center; gap: 12px; margin: 18px 0;
        }
        .auth-divider-line { flex: 1; height: 1px; background: #e2e8f0; }
        .auth-divider-text { font-size: 11px; color: #94a3b8; font-family: var(--font-mono); letter-spacing: 0.04em; white-space: nowrap; }

        .form-error-banner {
          display: flex; align-items: flex-start; gap: 8px;
          background: #fef2f2; border: 1.5px solid #fecaca;
          border-radius: 10px; padding: 11px 12px;
          font-size: 12.5px; color: #b91c1c; line-height: 1.5;
          margin-bottom: 16px;
        }

        .form-field { margin-bottom: 14px; }
        .form-label {
          display: block; font-size: 12px; font-weight: 600; color: #475569;
          margin-bottom: 6px; letter-spacing: 0.01em;
          font-family: var(--font-body);
        }
        .form-label-row {
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;
        }
        .input-wrap { position: relative; }
        .input-icon {
          position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
          color: #94a3b8; pointer-events: none; display: flex; align-items: center;
        }
        .auth-input {
          width: 100%; padding: 11px 12px 11px 38px; min-height: 44px;
          background: #fbfcfe; border: 1.5px solid #e2e8f0;
          border-radius: 10px; color: var(--ink); font-size: 14.5px;
          font-family: var(--font-body); outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }
        .auth-input::placeholder { color: var(--text-placeholder); }
        .auth-input:hover:not(:focus) { border-color: #cbd5e1; }
        .auth-input:focus {
          background: #fff;
          border-color: var(--blue);
          box-shadow: 0 0 0 3.5px var(--blue-ring);
        }
        .auth-input--error {
          border-color: #fca5a5;
        }
        .auth-input--error:focus {
          border-color: var(--red);
          box-shadow: 0 0 0 3px var(--red-ring);
        }
        .field-error {
          display: flex; align-items: center; gap: 5px;
          font-size: 11.5px; color: #dc2626; margin-top: 6px;
          font-family: var(--font-body); line-height: 1.4;
        }

        .eye-btn {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #94a3b8;
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; border-radius: 6px;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .eye-btn:hover { color: #64748b; background: #f1f5f9; }

        .forgot-link {
          background: none; border: none; cursor: pointer; padding: 2px 0;
          font-size: 12px; color: #64748b; font-family: var(--font-body);
          transition: color 0.15s ease;
          min-height: 20px;
        }
        .forgot-link:hover { color: var(--ink); }

        .terms-wrap {
          display: flex; align-items: flex-start; gap: 11px;
          padding: 12px 14px;
          background: #f8fafc;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
          user-select: none;
          margin-bottom: 4px;
        }
        .terms-wrap:hover { border-color: #cbd5e1; background: #f1f5f9; }
        .terms-wrap--error {
          border-color: #fca5a5 !important;
          background: #fff5f5 !important;
          animation: shake 0.3s ease;
        }
        .terms-wrap--checked {
          border-color: #1d4ed8 !important;
          background: #eff6ff !important;
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
          width: 18px; height: 18px; min-width: 18px;
          border-radius: 5px;
          border: 1.5px solid #cbd5e1;
          background: #fff;
          display: flex; align-items: center; justify-content: center;
          margin-top: 1px;
          transition: background 0.15s ease, border-color 0.15s ease;
          flex-shrink: 0;
        }
        .terms-checkbox--checked { background: #1d4ed8; border-color: #1d4ed8; }
        .terms-checkbox--error { border-color: #f87171; }
        .terms-text { font-size: 12px; color: #64748b; line-height: 1.6; font-family: var(--font-body); }
        .terms-text a { color: #1d4ed8; text-decoration: none; font-weight: 600; }
        .terms-text a:hover { text-decoration: underline; }

        .submit-btn {
          width: 100%; padding: 13px 20px; min-height: 48px;
          background: linear-gradient(180deg, #1e293b 0%, var(--ink) 100%);
          color: #fff;
          border: none; border-radius: 11px;
          font-size: 14.5px; font-weight: 600; font-family: var(--font-body);
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: box-shadow 0.15s ease, transform 0.08s ease-out, opacity 0.15s ease, filter 0.15s ease;
          letter-spacing: -0.01em;
          box-shadow:
            0 1px 0 rgba(255,255,255,0.08) inset,
            0 1px 2px rgba(15,23,42,0.15),
            0 8px 20px -8px rgba(15,23,42,0.35);
          margin-top: 8px;
        }
        .submit-btn:hover:not(:disabled) {
          filter: brightness(1.08);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.1) inset,
            0 2px 4px rgba(15,23,42,0.18),
            0 12px 28px -8px rgba(15,23,42,0.42);
        }
        .submit-btn:active:not(:disabled) {
          transform: scale(0.98);
          filter: brightness(0.98);
        }
        .submit-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .spinner {
          width: 14px; height: 14px; display: inline-block;
          border: 2px solid rgba(255,255,255,0.28); border-top-color: #fff;
          border-radius: 50%; animation: spin 0.7s linear infinite;
        }

        .reset-confirm { text-align: center; padding: 8px 4px 4px; }
        .reset-confirm-icon {
          width: 40px; height: 40px; border-radius: 50%;
          background: #f0fdf4; border: 1px solid #bbf7d0;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 14px;
        }
        .reset-confirm-title {
          font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 6px;
          letter-spacing: -0.01em;
        }
        .reset-confirm-body {
          font-size: 13px; color: var(--text-label); line-height: 1.6; margin-bottom: 18px;
        }
        .reset-confirm-body strong { color: var(--ink); font-weight: 600; }

        .auth-footer-text {
          text-align: center; margin-top: 20px;
          font-size: 13px; color: #64748b;
        }
        .mode-link {
          background: none; border: none; color: var(--ink); font-size: 13px;
          font-weight: 600; font-family: var(--font-body); cursor: pointer;
          padding: 2px 0; text-decoration: underline; text-underline-offset: 3px;
          transition: opacity 0.15s ease;
          min-height: 20px;
        }
        .mode-link:hover { opacity: 0.65; }

        .auth-perks {
          margin-top: 18px; padding-top: 16px;
          border-top: 1px solid #f1f5f9;
          display: flex; flex-direction: column; gap: 7px;
        }
        .auth-perk {
          display: flex; align-items: center; gap: 8px;
          font-size: 12.5px; color: #64748b;
        }
        .perk-icon {
          width: 16px; height: 16px; border-radius: 50%;
          background: #f0fdf4; border: 1px solid #bbf7d0;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }

        .auth-security {
          margin-top: 18px;
        }

        /* ── Mobile (< 900px): single column, form-first ─────────────── */
        .lp-mobile { display: none; }

        @media (max-width: 900px) {
          .lp-root { display: none; }
          .lp-mobile {
            display: flex;
            min-height: 100dvh;
            background: #f8fafc;
            flex-direction: column;
            font-family: var(--font-body);
          }

          .mobile-top-bar {
            background: var(--bg-left);
            padding: 24px 20px 28px;
            position: relative; overflow: hidden; flex-shrink: 0;
          }
          .mobile-top-bar::before {
            content: '';
            position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          }
          .mobile-top-bar::after {
            content: '';
            position: absolute; inset: 0;
            background-image:
              radial-gradient(340px 220px at 12% -10%, rgba(59,130,246,0.16), transparent 60%),
              radial-gradient(300px 200px at 100% 115%, rgba(74,222,128,0.09), transparent 60%),
              url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
            pointer-events: none;
          }

          .mobile-brand {
            position: relative; z-index: 1;
            display: flex; align-items: center; gap: 8px; margin-bottom: 18px;
            text-decoration: none;
          }
          .mobile-brand-name { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }

          .mobile-value-eyebrow {
            position: relative; z-index: 1;
            display: inline-flex; align-items: center; gap: 6px;
            background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.18);
            border-radius: 20px; padding: 4px 10px 4px 8px; margin-bottom: 12px;
          }
          .mobile-value-eyebrow-dot { width: 5px; height: 5px; border-radius: 50%; background: #4ade80; }
          .mobile-value-eyebrow-text { font-size: 10px; font-weight: 600; color: #86efac; letter-spacing: 0.02em; }

          .mobile-hero-text { position: relative; z-index: 1; }
          .mobile-hero-text h1 {
            font-size: clamp(22px, 6.4vw, 26px); font-weight: 400; color: #fff;
            font-family: var(--font-serif); letter-spacing: -0.015em;
            line-height: 1.16; margin-bottom: 7px;
          }
          .mobile-hero-text p {
            font-size: 13.5px; color: rgba(255,255,255,0.44); line-height: 1.5;
            max-width: 30ch;
          }

          .mobile-form-area {
            flex: 1; padding: 18px 16px calc(24px + env(safe-area-inset-bottom, 0px));
            position: relative; z-index: 1;
            overflow-y: auto;
            margin-top: -14px;
          }

          .mobile-form-card {
            background: #fff;
            border: 1px solid rgba(15,23,42,0.06);
            border-radius: 18px;
            padding: 20px 18px 18px;
            box-shadow: 0 1px 2px rgba(15,23,42,0.03), 0 12px 28px -14px rgba(15,23,42,0.16);
            animation: fadeUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }

          .mobile-mode-tabs {
            display: flex; background: #f1f5f9; border-radius: 10px; padding: 3px;
            margin-bottom: 18px; position: relative; z-index: 1;
          }
          .mobile-mode-tab {
            flex: 1; padding: 9px 0; min-height: 40px; background: none; border: none;
            border-radius: 8px; font-size: 13px; font-weight: 600; color: #64748b;
            font-family: var(--font-body); cursor: pointer; transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
          }
          .mobile-mode-tab--active { background: #fff; color: var(--ink); box-shadow: 0 1px 3px rgba(15,23,42,0.1); }
        }

        @media (min-width: 901px) {
          .lp-mobile { display: none !important; }
        }

        /* Respect translucency preference for both surfaces */
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
            <div className="lp-value-eyebrow">
              <span className="lp-value-eyebrow-dot" aria-hidden="true" />
              <span className="lp-value-eyebrow-text">Live on 200+ revenue teams</span>
            </div>
            <h1 className="lp-value-headline">
              Continue where your <em>meetings</em> left off.
            </h1>
            <p className="lp-value-sub">
              Every call, transcript, and coaching insight — exactly where you saved it. Sign in and pick up instantly.
            </p>
          </div>

          <div className="lp-left-footer">
            <AvatarCluster />
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
          <div className="mobile-value-eyebrow">
            <span className="mobile-value-eyebrow-dot" aria-hidden="true" />
            <span className="mobile-value-eyebrow-text">200+ revenue teams</span>
          </div>
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