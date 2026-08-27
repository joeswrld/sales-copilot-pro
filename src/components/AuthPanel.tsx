import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
   AuthPanel — the exact sign-in / create-account box from the Login page,
   extracted so it can be reused verbatim (same validation, same Supabase
   calls, same copy) anywhere else in the product that needs the real
   authentication flow — currently LoginPage.tsx and the /welcome
   experience (WelcomePage.tsx). There is only one implementation of
   "how Fixsense signs someone in"; both call sites render this.
   ──────────────────────────────────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (!value) return null;
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

export function TrustRow({ tone = "light" }: { tone?: "light" | "dark" }) {
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
        Security
      </a>
    </div>
  );
}

export type AuthMode = "login" | "signup" | "forgot";

export interface AuthPanelProps {
  /** Which tab is shown first. */
  initialMode?: AuthMode;
  /** Where Supabase should send the browser back to after a Google OAuth redirect. Defaults to /dashboard, same as the standalone login page. */
  oauthRedirectPath?: string;
  /** Where email/password sign-in sends an already-verified user. Defaults to the same onboarding/dashboard routing the login page uses. If provided, this overrides that routing for the "returning user" case only — new signups still always go to /verify-email, unchanged. */
  onSignedIn?: () => void;
  /** Fires the moment a "Create free account" submission succeeds (before the verify-email redirect), so a host page (e.g. the welcome flow) can react — e.g. advance its own step. */
  onSignupSubmitted?: () => void;
  /** Extra funnel-tracking context merged into every trackFunnel call this panel makes, so calls from inside a different flow (e.g. "welcome_flow") are distinguishable in analytics from the standalone /login page. */
  trackingSource?: string;
  /** Hide the "Sign in / Create account" tab switcher — used when the host page already established which one it wants (e.g. the welcome flow, which is signup-only). */
  hideTabs?: boolean;
  /** Fires whenever the internal mode (login/signup/forgot) changes, so a host page can mirror it purely for its own copy (e.g. a headline that says "Reset your password" while forgot-password is active) without owning any auth state itself. */
  onModeChange?: (mode: AuthMode) => void;
}

/**
 * The actual authentication box: tabs, Google OAuth button, and the
 * email/password form, including all client-side validation and the
 * exact Supabase calls LoginPage.tsx has always made. No new auth
 * system — this *is* the LoginPage auth system, just reusable.
 */
export default function AuthPanel({
  initialMode = "signup",
  oauthRedirectPath = "/dashboard",
  onSignedIn,
  onSignupSubmitted,
  trackingSource,
  hideTabs = false,
  onModeChange,
}: AuthPanelProps) {
  const [mode, setModeState] = useState<AuthMode>(initialMode);
  const setMode = useCallback(
    (m: AuthMode) => {
      setModeState(m);
      onModeChange?.(m);
    },
    [onModeChange]
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const fullNameRef = useRef(fullName);
  useEffect(() => { fullNameRef.current = fullName; }, [fullName]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });

  const submittingRef = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  /* ── Redirect already-authenticated users ────────────────────────────
     Same routing rules as the standalone login page: unverified → verify
     email, admins → /admin, brand-new users → /onboarding, everyone else
     → their dashboard. If the host page supplied onSignedIn, it's given
     the chance to run first (e.g. to advance the welcome flow's own
     state) — the underlying navigation still runs on the same tick. */
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

      onSignedIn?.();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

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
          void trackFunnel("signup_completed", { method: "email", ...(trackingSource ? { source: trackingSource } : {}) });
          onSignupSubmitted?.();
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
        }
      } catch (error: any) {
        setFormError(friendlyAuthError(error?.message ?? ""));
      } finally {
        setLoading(false);
        submittingRef.current = false;
      }
    },
    [email, password, mode, agreeToTerms, fullName, navigate, toast, trackingSource, onSignupSubmitted]
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

    if (mode === "signup") void trackFunnel("signup_started", { method: "google", ...(trackingSource ? { source: trackingSource } : {}) });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${oauthRedirectPath}` },
    });
    if (error) {
      setFormError(friendlyAuthError(error.message));
      setLoading(false);
      submittingRef.current = false;
    }
  }, [mode, agreeToTerms, trackingSource, oauthRedirectPath]);

  const switchToSignup = useCallback(() => {
    void trackFunnel("signup_started", { method: "email", ...(trackingSource ? { source: trackingSource } : {}) });
    setMode("signup");
    setTermsError(false);
    setFormError(null);
    setTouched({ email: false, password: false });
  }, [trackingSource]);

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

  return (
    <div className="ap-root">
      <style>{`
        .ap-root {
          --paper: #FAFAF8;
          --paper2: #F3F2ED;
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
          font-family: var(--font-body);
        }
        .ap-root *, .ap-root *::before, .ap-root *::after { box-sizing: border-box; }

        .ap-tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 22px; gap: 0; }
        .ap-tab {
          flex: 1; padding: 10px 0; background: none; border: none;
          font-size: 13.5px; font-weight: 600; color: var(--muted) !important;
          font-family: var(--font-body); cursor: pointer;
          position: relative; transition: color 0.15s ease;
          letter-spacing: -0.005em; min-height: 44px;
        }
        .ap-tab::after {
          content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 1.5px;
          background: var(--ink); transform: scaleX(0);
          transition: transform 0.2s cubic-bezier(0.4,0,0.2,1);
        }
        .ap-tab--active { color: var(--ink) !important; }
        .ap-tab--active::after { transform: scaleX(1); }
        .ap-tab:focus-visible, .ap-google-btn:focus-visible, .ap-input:focus-visible,
        .ap-submit-btn:focus-visible, .ap-mode-link:focus-visible, .ap-forgot-link:focus-visible,
        .ap-eye-btn:focus-visible, .ap-terms-wrap:focus-visible {
          outline: 2px solid var(--accent); outline-offset: 2px;
        }

        .ap-google-btn {
          width: 100%; padding: 11px 16px; min-height: 46px;
          background: #fff; color: var(--ink) !important;
          border: 1px solid var(--border-strong); border-radius: 8px;
          font-size: 14px; font-weight: 600; font-family: var(--font-body);
          letter-spacing: -0.005em;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: border-color 0.15s ease, background 0.1s ease, transform 0.08s ease-out;
        }
        .ap-google-btn:hover:not(:disabled) { border-color: var(--ink); background: rgba(23,23,15,.02); }
        .ap-google-btn:active:not(:disabled) { transform: scale(0.985); }
        .ap-google-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .ap-divider { display: flex; align-items: center; gap: 12px; margin: 18px 0; }
        .ap-divider-line { flex: 1; height: 1px; background: var(--border); }
        .ap-divider-text { font-size: 10.5px; color: var(--faint); font-family: var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }

        .ap-error-banner {
          display: flex; align-items: flex-start; gap: 8px;
          background: var(--red-soft); border: 1px solid rgba(162,59,46,0.22);
          border-radius: 8px; padding: 11px 12px;
          font-size: 12.5px; color: var(--red); line-height: 1.5;
          margin-bottom: 16px;
        }

        .ap-field { margin-bottom: 14px; }
        .ap-label { display: block; font-size: 12px; font-weight: 600; color: var(--ink2); margin-bottom: 6px; letter-spacing: 0.005em; font-family: var(--font-body); }
        .ap-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .ap-input-wrap { position: relative; }
        .ap-input-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--faint); pointer-events: none; display: flex; align-items: center; }
        .ap-input {
          width: 100%; padding: 11px 12px 11px 38px; min-height: 44px;
          background: var(--paper2); border: 1px solid var(--border);
          border-radius: 8px; color: var(--ink); font-size: 14px;
          font-family: var(--font-body); outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }
        .ap-input::placeholder { color: var(--faint); }
        .ap-input:hover:not(:focus) { border-color: var(--border-strong); }
        .ap-input:focus { background: #fff; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
        .ap-input--error { border-color: rgba(162,59,46,0.4); }
        @keyframes apAutoFillStart { from {} to {} }
        @keyframes apAutoFillCancel { from {} to {} }
        .ap-input:-webkit-autofill { animation-name: apAutoFillStart; }
        .ap-input:not(:-webkit-autofill) { animation-name: apAutoFillCancel; }
        .ap-input--error:focus { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-ring); }
        .ap-field-error { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--red); margin-top: 6px; font-family: var(--font-body); line-height: 1.4; }

        .ap-eye-btn {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: var(--faint);
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; border-radius: 6px;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .ap-eye-btn:hover { color: var(--ink2); background: var(--paper2); }

        .ap-forgot-link {
          background: none; border: none; cursor: pointer; padding: 2px 0;
          font-size: 12px; color: var(--muted) !important; font-family: var(--font-body);
          transition: color 0.15s ease; min-height: 20px;
        }
        .ap-forgot-link:hover { color: var(--ink) !important; }

        .ap-terms-wrap {
          display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px;
          background: var(--paper2); border: 1px solid var(--border); border-radius: 8px;
          cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease;
          user-select: none; margin-bottom: 4px;
        }
        .ap-terms-wrap:hover { border-color: var(--border-strong); }
        .ap-terms-wrap--error { border-color: rgba(162,59,46,0.4) !important; background: var(--red-soft) !important; animation: apShake 0.3s ease; }
        .ap-terms-wrap--checked { border-color: var(--accent) !important; background: var(--accent-soft) !important; }
        @keyframes apShake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
        @media (prefers-reduced-motion: reduce) { .ap-terms-wrap--error { animation: none; } }
        .ap-terms-checkbox {
          width: 17px; height: 17px; min-width: 17px; border-radius: 4px;
          border: 1.5px solid var(--border-strong); background: #fff;
          display: flex; align-items: center; justify-content: center; margin-top: 1px;
          transition: background 0.15s ease, border-color 0.15s ease; flex-shrink: 0;
        }
        .ap-terms-checkbox--checked { background: var(--accent); border-color: var(--accent); }
        .ap-terms-checkbox--error { border-color: rgba(162,59,46,0.5); }
        .ap-terms-text { font-size: 12px; color: var(--muted); line-height: 1.6; font-family: var(--font-body); }
        .ap-terms-text a { color: var(--accent); text-decoration: none; font-weight: 600; }
        .ap-terms-text a:hover { text-decoration: underline; }

        .ap-submit-btn {
          width: 100%; padding: 12px 20px; min-height: 46px;
          background: var(--accent); color: var(--accent-ink) !important;
          border: 1px solid var(--accent); border-radius: 8px;
          font-size: 14px; font-weight: 600; font-family: var(--font-body);
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: opacity 0.15s ease, transform 0.08s ease-out;
          letter-spacing: -0.005em; margin-top: 6px;
        }
        .ap-submit-btn:hover:not(:disabled) { opacity: 0.9; }
        .ap-submit-btn:active:not(:disabled) { transform: scale(0.985); }
        .ap-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .ap-spinner { width: 14px; height: 14px; display: inline-block; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; animation: apSpin 0.7s linear infinite; }
        @keyframes apSpin { to { transform: rotate(360deg); } }

        .ap-reset-confirm { text-align: center; padding: 6px 4px 4px; }
        .ap-reset-confirm-icon { width: 38px; height: 38px; border-radius: 50%; background: var(--good-soft); border: 1px solid rgba(47,107,79,0.25); display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }
        .ap-reset-confirm-title { font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 6px; letter-spacing: -0.01em; }
        .ap-reset-confirm-body { font-size: 13px; color: var(--muted); line-height: 1.6; margin-bottom: 18px; }
        .ap-reset-confirm-body strong { color: var(--ink); font-weight: 600; }

        .ap-footer-text { text-align: center; margin-top: 20px; font-size: 13px; color: var(--muted); }
        .ap-mode-link {
          background: none; border: none; color: var(--ink) !important; font-size: 13px;
          font-weight: 600; font-family: var(--font-body); cursor: pointer;
          padding: 2px 0; text-decoration: underline; text-underline-offset: 3px;
          transition: opacity 0.15s ease; min-height: 20px;
        }
        .ap-mode-link:hover { opacity: 0.65; }

        .ap-verify-notice { margin-top: 14px; font-size: 12px; line-height: 1.55; color: var(--muted); text-align: center; }
        .ap-verify-notice .ap-mode-link { font-size: 12px; }

        .ap-perks { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 7px; }
        .ap-perk { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); }
        .ap-perk-icon { width: 16px; height: 16px; border-radius: 50%; background: var(--good-soft); border: 1px solid rgba(47,107,79,0.25); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

        .ap-security { margin-top: 18px; }

        .ap-go-ahead {
          display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--good);
          background: var(--good-soft); border: 1px solid rgba(47,107,79,0.2);
          border-radius: 7px; padding: 7px 10px; margin-bottom: 14px;
        }

        @media (prefers-contrast: more) {
          .ap-input, .ap-google-btn, .ap-terms-wrap { border-width: 2px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ap-root * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }
      `}</style>

      {!hideTabs && mode !== "forgot" && (
        <div className="ap-tabs" role="tablist" aria-label="Sign in or create account">
          <button
            role="tab"
            aria-selected={mode === "login"}
            className={`ap-tab ${mode === "login" ? "ap-tab--active" : ""}`}
            onClick={switchToLogin}
            type="button"
          >
            Sign in
          </button>
          <button
            role="tab"
            aria-selected={mode === "signup"}
            className={`ap-tab ${mode === "signup" ? "ap-tab--active" : ""}`}
            onClick={switchToSignup}
            type="button"
          >
            Create account
          </button>
        </div>
      )}

      {mode === "signup" && (
        <div className="ap-go-ahead" role="note">
          <Check aria-hidden="true" style={{ width: "13px", height: "13px", flexShrink: 0 }} />
          <span>Free to start · No credit card required</span>
        </div>
      )}

      {mode !== "forgot" && (
        <>
          <button
            className="ap-google-btn"
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
          <div className="ap-divider">
            <div className="ap-divider-line" />
            <span className="ap-divider-text">or use email</span>
            <div className="ap-divider-line" />
          </div>
        </>
      )}

      {mode === "forgot" && resetSent ? (
        <div className="ap-reset-confirm" role="status">
          <div className="ap-reset-confirm-icon">
            <Check style={{ width: "16px", height: "16px", color: "#16a34a" }} aria-hidden="true" />
          </div>
          <div className="ap-reset-confirm-title">Check your inbox</div>
          <p className="ap-reset-confirm-body">
            If an account exists for <strong>{email}</strong>, a password reset link is on its way.
          </p>
          <button className="ap-mode-link" onClick={switchToLogin} type="button">
            ← Back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={handleEmailAuth} noValidate>
          {formError && (
            <div className="ap-error-banner" role="alert">
              <AlertCircle style={{ width: "14px", height: "14px", flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          {mode === "signup" && (
            <div className="ap-field">
              <label className="ap-label" htmlFor="ap-fullName">
                Full name
              </label>
              <div className="ap-input-wrap">
                <span className="ap-input-icon" aria-hidden="true">
                  <User style={{ width: "14px", height: "14px" }} />
                </span>
                <input
                  id="ap-fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Johnson"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onAnimationStart={(e) => {
                    if (e.animationName !== "apAutoFillStart") return;
                    const filled = e.currentTarget.value;
                    if (filled && filled !== fullName) setFullName(filled);
                  }}
                  className="ap-input"
                  required
                />
              </div>
            </div>
          )}

          <div className="ap-field">
            <label className="ap-label" htmlFor="ap-email">
              Work email
            </label>
            <div className="ap-input-wrap">
              <span className="ap-input-icon" aria-hidden="true">
                <Mail style={{ width: "14px", height: "14px" }} />
              </span>
              <input
                id="ap-email"
                type="email"
                inputMode="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, email: true }));
                  if (mode === "signup" && !emailError(email)) {
                    reportPartialLead(email, fullName);
                  }
                }}
                onAnimationStart={(e) => {
                  if (e.animationName !== "apAutoFillStart") return;
                  const filled = e.currentTarget.value;
                  if (filled && filled !== email) setEmail(filled);
                  if (mode === "signup" && !emailError(filled)) {
                    reportPartialLead(filled, fullNameRef.current);
                  }
                }}
                className={`ap-input${emailErr ? " ap-input--error" : ""}`}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="email"
                aria-invalid={!!emailErr}
                aria-describedby={emailErr ? "ap-email-error" : undefined}
                required
              />
            </div>
            {emailErr && (
              <p className="ap-field-error" id="ap-email-error">
                <AlertCircle style={{ width: "12px", height: "12px" }} aria-hidden="true" />
                {emailErr}
              </p>
            )}
          </div>

          {mode !== "forgot" && (
            <div className="ap-field">
              <div className="ap-label-row">
                <label className="ap-label" style={{ margin: 0 }} htmlFor="ap-password">
                  Password
                </label>
                {mode === "login" && (
                  <button type="button" className="ap-forgot-link" onClick={switchToForgot}>
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="ap-input-wrap">
                <span className="ap-input-icon" aria-hidden="true">
                  <Lock style={{ width: "14px", height: "14px" }} />
                </span>
                <input
                  id="ap-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "signup" ? "Min. 8 characters" : "Enter your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  className={`ap-input${passwordErr ? " ap-input--error" : ""}`}
                  style={{ paddingRight: "40px" }}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  aria-invalid={!!passwordErr}
                  aria-describedby={passwordErr ? "ap-password-error" : undefined}
                  required
                  minLength={mode === "signup" ? 8 : 1}
                />
                <button
                  type="button"
                  className="ap-eye-btn"
                  onClick={() => setShowPassword((p) => !p)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff style={{ width: "14px", height: "14px" }} /> : <Eye style={{ width: "14px", height: "14px" }} />}
                </button>
              </div>
              {passwordErr && (
                <p className="ap-field-error" id="ap-password-error">
                  <AlertCircle style={{ width: "12px", height: "12px" }} aria-hidden="true" />
                  {passwordErr}
                </p>
              )}
            </div>
          )}

          {mode === "signup" && (
            <div style={{ marginBottom: "6px" }}>
              <div
                className={`ap-terms-wrap${termsError ? " ap-terms-wrap--error" : ""}${agreeToTerms ? " ap-terms-wrap--checked" : ""}`}
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
                  className={`ap-terms-checkbox${agreeToTerms ? " ap-terms-checkbox--checked" : ""}${
                    termsError && !agreeToTerms ? " ap-terms-checkbox--error" : ""
                  }`}
                >
                  {agreeToTerms && (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                      <path d="M2 5.5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="ap-terms-text">
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
                <p className="ap-field-error" style={{ paddingLeft: "2px" }}>
                  <AlertCircle style={{ width: "12px", height: "12px" }} aria-hidden="true" />
                  Please agree to the terms to continue.
                </p>
              )}
            </div>
          )}

          <button type="submit" className="ap-submit-btn" disabled={loading || !canSubmit}>
            {loading ? (
              <>
                <span className="ap-spinner" aria-hidden="true" />
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

          {mode === "signup" && (
            <p className="ap-verify-notice">
              We'll email a confirmation link to verify your address — click it to activate your
              account. Prefer to skip that? <button type="button" className="ap-mode-link" onClick={handleGoogleSignIn}>Sign up with Google</button> instead.
            </p>
          )}
        </form>
      )}

      {!(mode === "forgot" && resetSent) && (
        <div className="ap-footer-text">
          {mode === "forgot" ? (
            <button className="ap-mode-link" onClick={switchToLogin} type="button">
              ← Back to sign in
            </button>
          ) : mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button className="ap-mode-link" onClick={switchToLogin} type="button">
                Sign in
              </button>
            </>
          ) : (
            <>
              No account yet?{" "}
              <button className="ap-mode-link" onClick={switchToSignup} type="button">
                Create one free
              </button>
            </>
          )}
        </div>
      )}

      {mode === "signup" && (
        <div className="ap-perks">
          {["30 min/month free, no credit card", "AI transcription and summaries included", "Up and running in under 5 minutes"].map(
            (p) => (
              <div key={p} className="ap-perk">
                <div className="ap-perk-icon">
                  <Check style={{ width: "9px", height: "9px", color: "#16a34a" }} aria-hidden="true" />
                </div>
                {p}
              </div>
            )
          )}
        </div>
      )}

      <div className="ap-security">
        <TrustRow tone="light" />
      </div>
    </div>
  );
}