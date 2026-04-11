import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function FixsenseLogo({ size = 36, borderRadius = 10 }: { size?: number; borderRadius?: number }) {
  return (
    <img
      src="/fixsense_icon_logo (2).png"
      alt="Fixsense"
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

const testimonials = [
  {
    quote: "Fixsense replaced our entire post-call review process. Managers now have visibility across every rep without sitting on recordings.",
    name: "Priya Nair",
    role: "Chief Revenue Officer",
    company: "Cloudpath",
    avatar: "PN",
    metric: "90 → 45 day ramp",
    metricLabel: "Rep Ramp Time",
  },
  {
    quote: "The objection detection alone justified the contract. We stopped guessing what killed deals and started fixing it systematically.",
    name: "James Okafor",
    role: "VP of Sales",
    company: "Launchflow",
    avatar: "JO",
    metric: "+31%",
    metricLabel: "Close Rate Lift",
  },
  {
    quote: "Our sales org runs on data. Fixsense gave us call-level analytics we never thought possible without a dedicated ops team.",
    name: "Marcus Reid",
    role: "Head of Revenue",
    company: "Vantex Technologies",
    avatar: "MR",
    metric: "3× faster",
    metricLabel: "Pipeline Visibility",
  },
];

function TestimonialPanel() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setActive((p) => (p + 1) % testimonials.length);
        setVisible(true);
      }, 350);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const t = testimonials[active];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div>
        <div style={{ marginBottom: "52px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "4px", padding: "5px 12px", marginBottom: "36px",
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
            <span style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Geist Mono', 'JetBrains Mono', monospace" }}>
              Live on 200+ revenue teams
            </span>
          </div>
          <h2 style={{
            fontSize: "clamp(26px, 2.8vw, 38px)", fontWeight: 700,
            color: "#fff", lineHeight: 1.18, letterSpacing: "-0.04em",
            fontFamily: "'Instrument Serif', 'Georgia', serif",
            marginBottom: "14px",
          }}>
            Every conversation<br />
            <span style={{ color: "rgba(255,255,255,0.38)", fontStyle: "italic" }}>becomes intelligence.</span>
          </h2>
          <p style={{
            fontSize: "14px", color: "rgba(255,255,255,0.38)", lineHeight: 1.7,
            fontFamily: "'DM Sans', sans-serif", maxWidth: "360px",
          }}>
            Fixsense analyzes every sales call — surfacing the patterns, objections, and signals that close deals.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0", marginBottom: "48px" }}>
          {[
            { val: "10k+", lbl: "Calls analyzed" },
            { val: "99%", lbl: "Transcription accuracy" },
            { val: "30%", lbl: "Avg close rate lift" },
          ].map((s, i) => (
            <div key={i} style={{
              flex: 1, paddingRight: "24px", marginRight: "24px",
              borderRight: i < 2 ? "1px solid rgba(255,255,255,0.08)" : "none",
            }}>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "#fff", letterSpacing: "-0.04em", fontFamily: "'Instrument Serif', Georgia, serif" }}>{s.val}</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "3px", fontFamily: "'DM Sans', sans-serif" }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "12px", padding: "28px 28px 24px",
          opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 0.35s ease, transform 0.35s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
            <div style={{
              display: "flex", alignItems: "baseline", gap: "8px",
              background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.15)",
              borderRadius: "4px", padding: "5px 12px",
            }}>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "#4ade80", fontFamily: "'Instrument Serif', Georgia, serif" }}>{t.metric}</span>
              <span style={{ fontSize: "10px", color: "rgba(74,222,128,0.6)", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.metricLabel}</span>
            </div>
          </div>

          <p style={{
            fontSize: "14px", color: "rgba(255,255,255,0.7)", lineHeight: 1.7,
            fontFamily: "'DM Sans', sans-serif", marginBottom: "22px",
            fontStyle: "italic",
          }}>
            "{t.quote}"
          </p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                width: "34px", height: "34px", borderRadius: "50%",
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.6)",
                fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.02em",
              }}>{t.avatar}</div>
              <div>
                <div style={{ fontSize: "12.5px", fontWeight: 600, color: "rgba(255,255,255,0.8)", fontFamily: "'DM Sans', sans-serif" }}>{t.name}</div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif", marginTop: "1px" }}>{t.role} · {t.company}</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px", marginTop: "16px", paddingLeft: "2px" }}>
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => { setVisible(false); setTimeout(() => { setActive(i); setVisible(true); }, 350); }}
              style={{
                width: i === active ? "20px" : "6px", height: "6px",
                borderRadius: "3px",
                background: i === active ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.15)",
                border: "none", cursor: "pointer", padding: 0,
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ paddingTop: "32px", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "32px" }}>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>Integrates with</div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          {["Zoom", "Google Meet", "Salesforce", "HubSpot", "Slack"].map((name) => (
            <span key={name} style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.22)", fontFamily: "'DM Sans', sans-serif" }}>{name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // ── FIX: Redirect already-authenticated users to dashboard ──────────────
  useEffect(() => {
    // Check existing session immediately on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        navigate("/dashboard", { replace: true });
      }
    });

    // Also listen for auth state changes (e.g. token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        navigate("/dashboard", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);
  // ────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "signup" && !agreeToTerms) {
      setTermsError(true);
      return;
    }
    setTermsError(false);

    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast({ title: "Check your email", description: "We've sent you a password reset link." });
        setMode("login");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (data.session) { navigate("/dashboard"); } else { toast({ title: "Check your email", description: "We've sent you a confirmation link." }); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (mode === "signup" && !agreeToTerms) {
      setTermsError(true);
      return;
    }
    setTermsError(false);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/dashboard` } });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
  };

  const switchToSignup = () => {
    setMode("signup");
    setTermsError(false);
  };

  const switchToLogin = () => {
    setMode("login");
    setAgreeToTerms(false);
    setTermsError(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg-left: #0c0f1a;
          --bg-right: #080b13;
          --ink: #0f172a;
          --border-subtle: rgba(255,255,255,0.07);
          --border-form: rgba(15,23,42,0.12);
          --text-label: #64748b;
          --text-placeholder: #94a3b8;
          --blue: #1d4ed8;
          --blue-hover: #1e40af;
          --blue-ring: rgba(29,78,216,0.18);
          --green: #4ade80;
          --font-body: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          --font-serif: 'Instrument Serif', Georgia, serif;
          --font-mono: 'Geist Mono', 'JetBrains Mono', monospace;
        }

        .lp-root {
          display: flex;
          min-height: 100vh;
          font-family: var(--font-body);
          -webkit-font-smoothing: antialiased;
        }

        .lp-left {
          flex: 0 0 480px;
          background: var(--bg-left);
          padding: 52px 52px 44px;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }
        .lp-left::after {
          content: '';
          position: absolute;
          top: 0; right: 0; bottom: 0;
          width: 1px;
          background: linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.07) 20%, rgba(255,255,255,0.07) 80%, transparent 100%);
        }
        .lp-left::before {
          content: '';
          position: absolute; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
          pointer-events: none;
          opacity: 0.4;
        }

        .lp-right {
          flex: 1;
          background: #f8fafc;
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
          background-image:
            linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
        }

        .auth-box {
          position: relative; z-index: 1;
          width: 100%; max-width: 400px;
          animation: fadeUp 0.5s ease forwards;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .auth-brand {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 36px; text-decoration: none;
        }
        .auth-brand-wordmark {
          font-size: 17px; font-weight: 700; color: var(--ink);
          letter-spacing: -0.03em;
          font-family: var(--font-body);
        }

        .auth-tabs {
          display: flex;
          border-bottom: 1.5px solid #e2e8f0;
          margin-bottom: 28px;
          gap: 0;
        }
        .auth-tab {
          flex: 1; padding: 10px 0; background: none; border: none;
          font-size: 13.5px; font-weight: 600; color: #94a3b8;
          font-family: var(--font-body); cursor: pointer;
          position: relative; transition: color 0.2s;
          letter-spacing: -0.01em;
        }
        .auth-tab::after {
          content: '';
          position: absolute; bottom: -1.5px; left: 0; right: 0; height: 1.5px;
          background: var(--ink); transform: scaleX(0);
          transition: transform 0.25s cubic-bezier(0.4,0,0.2,1);
        }
        .auth-tab--active { color: var(--ink); }
        .auth-tab--active::after { transform: scaleX(1); }

        .auth-page-title {
          font-size: 21px; font-weight: 700; color: var(--ink);
          letter-spacing: -0.04em; margin-bottom: 6px;
          font-family: var(--font-body);
        }
        .auth-page-sub {
          font-size: 13px; color: var(--text-label); line-height: 1.55; margin-bottom: 24px;
        }

        .google-btn {
          width: 100%; padding: 11px 16px;
          background: #fff; color: #1e293b;
          border: 1.5px solid #e2e8f0; border-radius: 8px;
          font-size: 14px; font-weight: 500; font-family: var(--font-body);
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-shadow: 0 1px 2px rgba(15,23,42,0.04);
        }
        .google-btn:hover {
          border-color: #cbd5e1;
          box-shadow: 0 2px 8px rgba(15,23,42,0.08);
        }

        .auth-divider {
          display: flex; align-items: center; gap: 12px; margin: 18px 0;
        }
        .auth-divider-line { flex: 1; height: 1px; background: #e2e8f0; }
        .auth-divider-text { font-size: 11px; color: #94a3b8; font-family: var(--font-mono); letter-spacing: 0.06em; }

        .form-field { margin-bottom: 14px; }
        .form-label {
          display: block; font-size: 12px; font-weight: 600; color: #475569;
          margin-bottom: 6px; letter-spacing: 0.01em;
          font-family: var(--font-body);
        }
        .input-wrap { position: relative; }
        .input-icon {
          position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
          color: #94a3b8; pointer-events: none; display: flex; align-items: center;
        }
        .auth-input {
          width: 100%; padding: 10px 12px 10px 38px;
          background: #fff; border: 1.5px solid #e2e8f0;
          border-radius: 8px; color: var(--ink); font-size: 14px;
          font-family: var(--font-body); outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-shadow: 0 1px 2px rgba(15,23,42,0.04);
        }
        .auth-input::placeholder { color: var(--text-placeholder); }
        .auth-input:focus {
          border-color: var(--blue);
          box-shadow: 0 0 0 3px var(--blue-ring);
        }
        .eye-btn {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #94a3b8;
          display: flex; align-items: center; padding: 0; transition: color 0.15s;
        }
        .eye-btn:hover { color: #64748b; }

        .forgot-link {
          background: none; border: none; cursor: pointer; padding: 0;
          font-size: 12px; color: #64748b; font-family: var(--font-body);
          transition: color 0.15s;
        }
        .forgot-link:hover { color: var(--ink); }

        .terms-wrap {
          display: flex; align-items: flex-start; gap: 11px;
          padding: 12px 14px;
          background: #f8fafc;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          user-select: none;
          margin-bottom: 4px;
        }
        .terms-wrap:hover {
          border-color: #cbd5e1;
          background: #f1f5f9;
        }
        .terms-wrap--error {
          border-color: #fca5a5 !important;
          background: #fff5f5 !important;
          animation: shake 0.35s ease;
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
        .terms-checkbox {
          width: 18px; height: 18px; min-width: 18px;
          border-radius: 5px;
          border: 1.5px solid #cbd5e1;
          background: #fff;
          display: flex; align-items: center; justify-content: center;
          margin-top: 1px;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .terms-checkbox--checked {
          background: #1d4ed8;
          border-color: #1d4ed8;
        }
        .terms-checkbox--error {
          border-color: #f87171;
        }
        .terms-text {
          font-size: 12px;
          color: #64748b;
          line-height: 1.6;
          font-family: var(--font-body);
        }
        .terms-text a {
          color: #1d4ed8;
          text-decoration: none;
          font-weight: 600;
        }
        .terms-text a:hover { text-decoration: underline; }
        .terms-error-msg {
          font-size: 11px;
          color: #ef4444;
          display: flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 10px;
          font-family: var(--font-body);
          padding-left: 2px;
        }

        .submit-btn {
          width: 100%; padding: 11px 20px;
          background: var(--ink); color: #fff;
          border: none; border-radius: 8px;
          font-size: 14px; font-weight: 600; font-family: var(--font-body);
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
          letter-spacing: -0.01em;
          box-shadow: 0 1px 2px rgba(15,23,42,0.12);
          margin-top: 6px;
        }
        .submit-btn:hover:not(:disabled) {
          background: #1e293b;
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(15,23,42,0.2);
        }
        .submit-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .auth-footer-text {
          text-align: center; margin-top: 22px;
          font-size: 13px; color: #64748b;
        }
        .mode-link {
          background: none; border: none; color: var(--ink); font-size: 13px;
          font-weight: 600; font-family: var(--font-body); cursor: pointer;
          padding: 0; text-decoration: underline; text-underline-offset: 3px;
          transition: opacity 0.15s;
        }
        .mode-link:hover { opacity: 0.65; }

        .auth-perks {
          margin-top: 20px; padding-top: 18px;
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
          display: flex; align-items: center; gap: 6px;
          justify-content: center; margin-top: 14px;
          font-size: 11px; color: #94a3b8; font-family: var(--font-mono);
          letter-spacing: 0.04em;
        }

        .lp-mobile {
          display: none;
          min-height: 100dvh;
          background: #f8fafc;
          flex-direction: column;
          font-family: var(--font-body);
        }

        .mobile-top-bar {
          background: var(--bg-left);
          padding: 24px 20px 28px;
          position: relative; overflow: hidden;
        }
        .mobile-top-bar::before {
          content: '';
          position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
        }

        .mobile-brand {
          display: flex; align-items: center; gap: 8px; margin-bottom: 20px;
          text-decoration: none;
        }
        .mobile-brand-name {
          font-size: 16px; font-weight: 700; color: #fff;
          letter-spacing: -0.03em;
        }

        .mobile-hero-text h1 {
          font-size: 22px; font-weight: 700; color: #fff;
          font-family: var(--font-body); letter-spacing: -0.04em;
          line-height: 1.25; margin-bottom: 6px;
        }
        .mobile-hero-text p {
          font-size: 13px; color: rgba(255,255,255,0.38); line-height: 1.5;
        }

        .mobile-stat-row {
          display: flex; gap: 0;
          margin-top: 20px;
        }
        .mobile-stat-item {
          flex: 1; padding: 12px 0;
          border-right: 1px solid rgba(255,255,255,0.07);
        }
        .mobile-stat-item:last-child { border-right: none; }
        .mobile-stat-val { font-size: 17px; font-weight: 700; color: #fff; letter-spacing: -0.04em; }
        .mobile-stat-lbl { font-size: 9.5px; color: rgba(255,255,255,0.28); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.07em; }

        .mobile-form-area {
          flex: 1; padding: 28px 20px 32px;
          position: relative; z-index: 1;
          overflow-y: auto;
        }
        .mobile-form-area::before {
          content: '';
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px);
          background-size: 36px 36px;
          pointer-events: none;
        }

        .mobile-mode-tabs {
          display: flex; gap: 0;
          background: #fff; border: 1.5px solid #e2e8f0;
          border-radius: 8px; padding: 3px; margin-bottom: 22px;
        }
        .mobile-mode-tab {
          flex: 1; padding: 8px 0;
          background: none; border: none; border-radius: 6px;
          font-size: 13px; font-weight: 600; color: #94a3b8;
          font-family: var(--font-body); cursor: pointer; transition: all 0.2s;
        }
        .mobile-mode-tab--active {
          background: var(--ink); color: #fff;
        }

        @media (max-width: 767px) {
          .lp-root { display: none !important; }
          .lp-mobile { display: flex !important; }
        }
        @media (min-width: 768px) {
          .lp-root { display: flex !important; }
          .lp-mobile { display: none !important; }
        }
      `}</style>

      {/* ══════════════════════════
          DESKTOP (768px+)
      ══════════════════════════ */}
      <div className="lp-root">
        <div className="lp-left">
          <div style={{ position: "relative", zIndex: 1, height: "100%" }}>
            <TestimonialPanel />
          </div>
        </div>

        <div className="lp-right">
          <div className="auth-box">
            <a href="/" className="auth-brand">
              <FixsenseLogo size={30} borderRadius={8} />
              <span className="auth-brand-wordmark">Fixsense</span>
            </a>

            {mode === "forgot" ? (
              <>
                <div className="auth-page-title">Reset your password</div>
                <p className="auth-page-sub">Enter the email address on your account and we'll send a reset link.</p>
              </>
            ) : (
              <div className="auth-tabs">
                <button className={`auth-tab ${mode === "login" ? "auth-tab--active" : ""}`} onClick={switchToLogin}>Sign in</button>
                <button className={`auth-tab ${mode === "signup" ? "auth-tab--active" : ""}`} onClick={switchToSignup}>Create account</button>
              </div>
            )}

            {mode !== "forgot" && (
              <>
                <button className="google-btn" onClick={handleGoogleSignIn} type="button">
                  <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                  Continue with Google
                </button>
                <div className="auth-divider">
                  <div className="auth-divider-line" />
                  <span className="auth-divider-text">or</span>
                  <div className="auth-divider-line" />
                </div>
              </>
            )}

            <form onSubmit={handleEmailAuth}>
              {mode === "signup" && (
                <div className="form-field">
                  <label className="form-label">Full name</label>
                  <div className="input-wrap">
                    <span className="input-icon"><User style={{ width: "14px", height: "14px" }} /></span>
                    <input type="text" placeholder="Alex Johnson" value={fullName} onChange={(e) => setFullName(e.target.value)} className="auth-input" required />
                  </div>
                </div>
              )}

              <div className="form-field">
                <label className="form-label">Work email</label>
                <div className="input-wrap">
                  <span className="input-icon"><Mail style={{ width: "14px", height: "14px" }} /></span>
                  <input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" required />
                </div>
              </div>

              {mode !== "forgot" && (
                <div className="form-field">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label className="form-label" style={{ margin: 0 }}>Password</label>
                    {mode === "login" && (
                      <button type="button" className="forgot-link" onClick={() => setMode("forgot")}>Forgot password?</button>
                    )}
                  </div>
                  <div className="input-wrap">
                    <span className="input-icon"><Lock style={{ width: "14px", height: "14px" }} /></span>
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder={mode === "signup" ? "Min. 8 characters" : "Enter your password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="auth-input"
                      style={{ paddingRight: "40px" }}
                      required minLength={6}
                    />
                    <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                      {showPassword ? <EyeOff style={{ width: "14px", height: "14px" }} /> : <Eye style={{ width: "14px", height: "14px" }} />}
                    </button>
                  </div>
                </div>
              )}

              {mode === "signup" && (
                <div style={{ marginBottom: "6px" }}>
                  <div
                    className={`terms-wrap${termsError ? " terms-wrap--error" : ""}${agreeToTerms ? " terms-wrap--checked" : ""}`}
                    onClick={() => { setAgreeToTerms(p => !p); setTermsError(false); }}
                    role="checkbox"
                    aria-checked={agreeToTerms}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === " " && (e.preventDefault(), setAgreeToTerms(p => !p), setTermsError(false))}
                  >
                    <div className={`terms-checkbox${agreeToTerms ? " terms-checkbox--checked" : ""}${termsError && !agreeToTerms ? " terms-checkbox--error" : ""}`}>
                      {agreeToTerms && (
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M2 5.5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="terms-text">
                      I agree to Fixsense's{" "}
                      <a href="/terms" onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">Terms of Service</a>
                      ,{" "}
                      <a href="/privacy" onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                      , and{" "}
                      <a href="/privacy#cookies" onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">Cookie Policy</a>
                      . I understand my data will be processed to deliver the Fixsense service.
                    </span>
                  </div>
                  {termsError && (
                    <p className="terms-error-msg">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5" stroke="#ef4444" strokeWidth="1.2" />
                        <path d="M6 3.5v3" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round" />
                        <circle cx="6" cy="8.5" r="0.6" fill="#ef4444" />
                      </svg>
                      Please agree to the terms before creating your account.
                    </p>
                  )}
                </div>
              )}

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? (
                  <>
                    <div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.25)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    Processing...
                  </>
                ) : mode === "forgot" ? (
                  "Send reset link"
                ) : mode === "signup" ? (
                  <>Start free trial <ArrowRight style={{ width: "14px", height: "14px" }} /></>
                ) : (
                  <>Sign in <ArrowRight style={{ width: "14px", height: "14px" }} /></>
                )}
              </button>
            </form>

            <div className="auth-footer-text">
              {mode === "forgot" ? (
                <><button className="mode-link" onClick={switchToLogin}>← Back to sign in</button></>
              ) : mode === "signup" ? (
                <>Already have an account?{" "}<button className="mode-link" onClick={switchToLogin}>Sign in</button></>
              ) : (
                <>No account yet?{" "}<button className="mode-link" onClick={switchToSignup}>Start free trial</button></>
              )}
            </div>

            {mode === "signup" && (
              <div className="auth-perks">
                {["5 meetings/month free, no credit card", "AI transcription and summaries included", "Up and running in under 5 minutes"].map((p) => (
                  <div key={p} className="auth-perk">
                    <div className="perk-icon">
                      <Check style={{ width: "9px", height: "9px", color: "#16a34a" }} />
                    </div>
                    {p}
                  </div>
                ))}
              </div>
            )}

            <div className="auth-security">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L1.5 3v3c0 2.485 1.958 4.814 4.5 5.5C8.542 10.814 10.5 8.485 10.5 6V3L6 1z" stroke="#94a3b8" strokeWidth="1" strokeLinejoin="round" />
              </svg>
              SOC 2 Type II · TLS 1.3 encrypted · GDPR compliant
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════
          MOBILE (< 768px)
      ══════════════════════════ */}
      <div className="lp-mobile">
        <div className="mobile-top-bar">
          <a href="/" className="mobile-brand">
            <FixsenseLogo size={28} borderRadius={8} />
            <span className="mobile-brand-name">Fixsense</span>
          </a>
          <div className="mobile-hero-text">
            <h1>
              {mode === "login" ? "Welcome back" : mode === "signup" ? "Start for free" : "Reset password"}
            </h1>
            <p>
              {mode === "login" ? "Sign in to your dashboard" : mode === "signup" ? "No credit card required." : "We'll send you a reset link."}
            </p>
          </div>
          <div className="mobile-stat-row">
            {[{ val: "10k+", lbl: "Calls analyzed" }, { val: "30%", lbl: "Close rate lift" }, { val: "99%", lbl: "Accuracy" }].map((s, i) => (
              <div key={i} className="mobile-stat-item" style={{ paddingLeft: i > 0 ? "16px" : "0" }}>
                <div className="mobile-stat-val">{s.val}</div>
                <div className="mobile-stat-lbl">{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mobile-form-area">
          <div style={{ position: "relative", zIndex: 1 }}>
            {mode !== "forgot" ? (
              <div className="mobile-mode-tabs">
                <button className={`mobile-mode-tab ${mode === "login" ? "mobile-mode-tab--active" : ""}`} onClick={switchToLogin}>Sign in</button>
                <button className={`mobile-mode-tab ${mode === "signup" ? "mobile-mode-tab--active" : ""}`} onClick={switchToSignup}>Create account</button>
              </div>
            ) : (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", letterSpacing: "-0.03em", marginBottom: "5px" }}>Reset your password</div>
                <div style={{ fontSize: "13px", color: "#64748b" }}>Enter your email to receive a reset link.</div>
              </div>
            )}

            {mode !== "forgot" && (
              <>
                <button className="google-btn" onClick={handleGoogleSignIn} type="button" style={{ marginBottom: "4px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                  Continue with Google
                </button>
                <div className="auth-divider"><div className="auth-divider-line" /><span className="auth-divider-text">or</span><div className="auth-divider-line" /></div>
              </>
            )}

            <form onSubmit={handleEmailAuth}>
              {mode === "signup" && (
                <div className="form-field">
                  <label className="form-label">Full name</label>
                  <div className="input-wrap">
                    <span className="input-icon"><User style={{ width: "14px", height: "14px" }} /></span>
                    <input type="text" placeholder="Alex Johnson" value={fullName} onChange={(e) => setFullName(e.target.value)} className="auth-input" required />
                  </div>
                </div>
              )}
              <div className="form-field">
                <label className="form-label">Work email</label>
                <div className="input-wrap">
                  <span className="input-icon"><Mail style={{ width: "14px", height: "14px" }} /></span>
                  <input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" autoCapitalize="off" autoCorrect="off" required />
                </div>
              </div>
              {mode !== "forgot" && (
                <div className="form-field">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label className="form-label" style={{ margin: 0 }}>Password</label>
                    {mode === "login" && <button type="button" className="forgot-link" onClick={() => setMode("forgot")}>Forgot?</button>}
                  </div>
                  <div className="input-wrap">
                    <span className="input-icon"><Lock style={{ width: "14px", height: "14px" }} /></span>
                    <input type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input" style={{ paddingRight: "40px" }} required minLength={6} />
                    <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                      {showPassword ? <EyeOff style={{ width: "14px", height: "14px" }} /> : <Eye style={{ width: "14px", height: "14px" }} />}
                    </button>
                  </div>
                </div>
              )}

              {mode === "signup" && (
                <div style={{ marginBottom: "12px" }}>
                  <div
                    className={`terms-wrap${termsError ? " terms-wrap--error" : ""}${agreeToTerms ? " terms-wrap--checked" : ""}`}
                    onClick={() => { setAgreeToTerms(p => !p); setTermsError(false); }}
                    role="checkbox"
                    aria-checked={agreeToTerms}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === " " && (e.preventDefault(), setAgreeToTerms(p => !p), setTermsError(false))}
                  >
                    <div className={`terms-checkbox${agreeToTerms ? " terms-checkbox--checked" : ""}${termsError && !agreeToTerms ? " terms-checkbox--error" : ""}`}>
                      {agreeToTerms && (
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M2 5.5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="terms-text">
                      I agree to Fixsense's{" "}
                      <a href="/terms" onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">Terms of Service</a>
                      ,{" "}
                      <a href="/privacy" onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                      , and{" "}
                      <a href="/privacy#cookies" onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer">Cookie Policy</a>
                      .
                    </span>
                  </div>
                  {termsError && (
                    <p className="terms-error-msg">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5" stroke="#ef4444" strokeWidth="1.2" />
                        <path d="M6 3.5v3" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round" />
                        <circle cx="6" cy="8.5" r="0.6" fill="#ef4444" />
                      </svg>
                      Please agree to the terms to continue.
                    </p>
                  )}
                </div>
              )}

              <button type="submit" className="submit-btn" disabled={loading} style={{ borderRadius: "10px", padding: "13px 20px" }}>
                {loading ? (
                  <><div style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.25)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Processing...</>
                ) : mode === "forgot" ? "Send reset link"
                  : mode === "signup" ? <><span>Create free account</span><ArrowRight style={{ width: "14px", height: "14px" }} /></>
                  : <><span>Sign in</span><ArrowRight style={{ width: "14px", height: "14px" }} /></>}
              </button>
            </form>

            <div className="auth-footer-text" style={{ marginTop: "18px" }}>
              {mode === "forgot" ? (
                <button className="mode-link" onClick={switchToLogin}>← Back to sign in</button>
              ) : mode === "signup" ? (
                <>Already have an account? <button className="mode-link" onClick={switchToLogin}>Sign in</button></>
              ) : (
                <>No account? <button className="mode-link" onClick={switchToSignup}>Start free trial</button></>
              )}
            </div>

            <div className="auth-security" style={{ marginTop: "20px" }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L1.5 3v3c0 2.485 1.958 4.814 4.5 5.5C8.542 10.814 10.5 8.485 10.5 6V3L6 1z" stroke="#94a3b8" strokeWidth="1" strokeLinejoin="round" />
              </svg>
              SOC 2 · TLS 1.3 · GDPR compliant
            </div>
          </div>
        </div>
      </div>
    </>
  );
}