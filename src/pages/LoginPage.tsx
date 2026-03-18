import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Shared Logo Component ─────────────────────────────────────────────────
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
  { quote: "Fixsense helped us increase close rates by 30%. Our team now knows exactly what works in every call — no more guessing.", name: "Marcus Reid", role: "Head of Sales, Vantex SaaS", avatar: "MR", metric: "30% increase in close rate" },
  { quote: "We stopped guessing after sales calls. The insights are instant and actionable. Our ramp time for new reps dropped by half.", name: "Sophia Chen", role: "Founder, Launchflow", avatar: "SC", metric: "50% faster ramp time" },
  { quote: "The objection detection alone paid for itself in week one. Real-time suggestions during live calls is a complete game-changer.", name: "Daniel Osei", role: "VP Sales, Cloudpath", avatar: "DO", metric: "ROI in week one" },
];

function AnimatedTestimonials() {
  const [active, setActive] = useState(0);
  const [animating, setAnimating] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => {
      setAnimating(true);
      setTimeout(() => { setActive((prev) => (prev + 1) % testimonials.length); setAnimating(false); }, 400);
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  const t = testimonials[active];
  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(45,212,191,0.12)", border: "1px solid rgba(45,212,191,0.25)", borderRadius: "100px", padding: "5px 14px", marginBottom: "32px" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#2dd4bf", display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#2dd4bf", letterSpacing: "0.04em", fontFamily: "'DM Sans', sans-serif" }}>Trusted by high-performing sales teams</span>
        </div>
        <h2 style={{ fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 800, color: "#ffffff", lineHeight: 1.1, marginBottom: "16px", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
          Close more deals<br />
          <span style={{ background: "linear-gradient(135deg, #2dd4bf 0%, #818cf8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>with AI intelligence.</span>
        </h2>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "14px", lineHeight: 1.6, marginBottom: "48px", fontFamily: "'DM Sans', sans-serif", maxWidth: "360px" }}>
          Join hundreds of sales teams using Fixsense to record, analyze, and improve every customer conversation.
        </p>
      </div>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px", padding: "28px", transition: "opacity 0.4s ease, transform 0.4s ease", opacity: animating ? 0 : 1, transform: animating ? "translateY(8px)" : "translateY(0)", marginBottom: "28px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "20px", right: "24px", fontSize: "60px", color: "rgba(45,212,191,0.1)", fontFamily: "serif", lineHeight: 1, userSelect: "none" }}>"</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.2)", borderRadius: "8px", padding: "4px 10px", marginBottom: "16px" }}>
          <span style={{ fontSize: "11px", color: "#2dd4bf", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>↑ {t.metric}</span>
        </div>
        <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "15px", lineHeight: 1.65, marginBottom: "20px", fontFamily: "'DM Sans', sans-serif", fontStyle: "italic" }}>"{t.quote}"</p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg, #2dd4bf, #818cf8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "#030712", flexShrink: 0, fontFamily: "'DM Sans', sans-serif" }}>{t.avatar}</div>
          <div>
            <p style={{ color: "#ffffff", fontSize: "13px", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{t.name}</p>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", fontFamily: "'DM Sans', sans-serif", marginTop: "1px" }}>{t.role}</p>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        {testimonials.map((_, i) => (
          <button key={i} onClick={() => setActive(i)} style={{ width: i === active ? "24px" : "8px", height: "8px", borderRadius: "4px", background: i === active ? "#2dd4bf" : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", transition: "all 0.3s ease", padding: 0 }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "32px", paddingTop: "24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {[{ value: "10k+", label: "Meetings analyzed" }, { value: "30%", label: "Avg close rate lift" }, { value: "99%", label: "Transcription accuracy" }].map((stat) => (
          <div key={stat.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#2dd4bf", fontFamily: "'Bricolage Grotesque', sans-serif" }}>{stat.value}</div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", fontFamily: "'DM Sans', sans-serif", marginTop: "2px", lineHeight: 1.3 }}>{stat.label}</div>
          </div>
        ))}
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
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Bricolage+Grotesque:wght@400;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
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
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/dashboard` } });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
  };

  const titles = { login: "Welcome back", signup: "Create your account", forgot: "Reset password" };

  return (
    <>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInLeft { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes mobileSlideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }

        .auth-input {
          width: 100%; padding: 12px 14px 12px 42px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px; color: #f1f5f9;
          font-size: 15px; font-family: 'DM Sans', sans-serif;
          outline: none; transition: all 0.2s ease; box-sizing: border-box;
        }
        .auth-input::placeholder { color: rgba(255,255,255,0.28); }
        .auth-input:focus { border-color: rgba(45,212,191,0.5); background: rgba(45,212,191,0.04); box-shadow: 0 0 0 3px rgba(45,212,191,0.08); }
        .auth-input:hover:not(:focus) { border-color: rgba(255,255,255,0.18); }

        .primary-btn {
          width: 100%; padding: 13px 20px;
          background: linear-gradient(135deg, #2dd4bf, #0d9488);
          color: #030712; font-weight: 700; font-size: 15px;
          font-family: 'DM Sans', sans-serif;
          border: none; border-radius: 12px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: all 0.2s ease;
        }
        .primary-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(45,212,191,0.4); }
        .primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .google-btn {
          width: 100%; padding: 12px 20px;
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.85); font-weight: 500; font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: all 0.2s ease;
        }
        .google-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.18); }

        .mode-link { background: none; border: none; color: #2dd4bf; font-size: 14px; font-family: 'DM Sans', sans-serif; font-weight: 600; cursor: pointer; padding: 0; transition: opacity 0.2s; }
        .mode-link:hover { opacity: 0.75; }
        .forgot-link { background: none; border: none; color: rgba(255,255,255,0.35); font-size: 12px; font-family: 'DM Sans', sans-serif; cursor: pointer; padding: 0; transition: color 0.2s; }
        .forgot-link:hover { color: rgba(255,255,255,0.65); }
        .input-group { position: relative; }
        .input-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.3); pointer-events: none; display: flex; align-items: center; }
        .eye-btn { position: absolute; right: 13px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.3); display: flex; align-items: center; padding: 0; transition: color 0.2s; }
        .eye-btn:hover { color: rgba(255,255,255,0.65); }
        .divider { display: flex; align-items: center; gap: 12px; margin: 14px 0; }
        .divider-line { flex: 1; height: 1px; background: rgba(255,255,255,0.08); }
        .divider-text { font-size: 11px; color: rgba(255,255,255,0.25); font-family: 'DM Sans', sans-serif; white-space: nowrap; }

        /* ── DESKTOP layout ── */
        .login-desktop { display: flex; min-height: 100vh; background: #080c14; }

        .left-panel {
          flex: 0 0 460px; max-width: 460px;
          display: flex; flex-direction: column; justify-content: center;
          padding: 48px 52px;
          background: #0b1120;
          border-right: 1px solid rgba(255,255,255,0.06);
          position: relative;
          animation: slideInLeft 0.6s ease forwards;
        }
        .right-panel {
          flex: 1; display: flex; flex-direction: column; justify-content: center;
          padding: 60px 56px; position: relative; overflow: hidden;
          animation: slideInRight 0.6s ease 0.1s both;
        }

        /* ── MOBILE layout ── */
        .login-mobile {
          display: none;
          min-height: 100dvh;
          background: #080c14;
          flex-direction: column;
          font-family: 'DM Sans', sans-serif;
          overflow-x: hidden;
        }

        .mobile-hero {
          position: relative;
          padding: 52px 20px 32px;
          text-align: center;
          overflow: hidden;
        }
        .mobile-hero::before {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(ellipse 120% 80% at 50% 0%, rgba(45,212,191,0.13) 0%, transparent 70%);
          pointer-events: none;
        }
        .mobile-hero-logo {
          display: inline-flex; align-items: center; gap: 10px;
          margin-bottom: 28px;
          animation: mobileSlideUp 0.5s ease forwards;
        }
        .mobile-hero-wordmark {
          font-size: 20px; font-weight: 800; color: #fff;
          font-family: 'Bricolage Grotesque', sans-serif;
          letter-spacing: -0.02em;
        }
        .mobile-hero-tagline {
          animation: mobileSlideUp 0.5s ease 0.1s both;
          margin-bottom: 6px;
        }
        .mobile-hero-tagline h1 {
          font-size: 28px; font-weight: 800;
          font-family: 'Bricolage Grotesque', sans-serif;
          color: #fff; line-height: 1.15; margin: 0 0 8px;
        }
        .mobile-hero-tagline p {
          font-size: 13px; color: rgba(255,255,255,0.42);
          line-height: 1.5; margin: 0;
        }

        .mobile-card {
          margin: 0 12px;
          background: rgba(11,17,32,0.95);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 24px 20px;
          animation: mobileSlideUp 0.55s ease 0.15s both;
          position: relative; z-index: 2;
        }

        .mobile-mode-tabs {
          display: flex; gap: 4px;
          background: rgba(255,255,255,0.04);
          border-radius: 10px; padding: 3px;
          margin-bottom: 20px;
        }
        .mobile-mode-tab {
          flex: 1; padding: 8px 0;
          background: transparent; border: none;
          border-radius: 8px;
          color: rgba(255,255,255,0.4);
          font-size: 13px; font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer; transition: all 0.2s;
        }
        .mobile-mode-tab--active {
          background: rgba(45,212,191,0.15);
          color: #2dd4bf;
        }

        .mobile-social {
          margin: 20px 12px 8px;
          padding: 16px 20px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          animation: mobileSlideUp 0.6s ease 0.2s both;
        }
        .mobile-social-quote {
          font-size: 12px; color: rgba(255,255,255,0.5);
          font-style: italic; line-height: 1.5; margin: 0 0 10px;
          font-family: 'DM Sans', sans-serif;
        }
        .mobile-social-person { display: flex; align-items: center; gap: 8px; }
        .mobile-social-av {
          width: 28px; height: 28px; border-radius: 50%;
          background: linear-gradient(135deg, #2dd4bf, #818cf8);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 700; color: #030712; flex-shrink: 0;
        }
        .mobile-social-name { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.6); }
        .mobile-social-role { font-size: 10px; color: rgba(255,255,255,0.3); }

        .mobile-stats {
          display: flex;
          margin: 0 12px 24px;
          animation: mobileSlideUp 0.65s ease 0.25s both;
        }
        .mobile-stat {
          flex: 1; text-align: center;
          padding: 14px 8px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
        }
        .mobile-stat:first-child { border-radius: 12px 0 0 12px; }
        .mobile-stat:last-child { border-radius: 0 12px 12px 0; border-left: none; }
        .mobile-stat:not(:first-child):not(:last-child) { border-left: none; }
        .mobile-stat-val { font-size: 18px; font-weight: 800; color: #2dd4bf; font-family: 'Bricolage Grotesque', sans-serif; }
        .mobile-stat-lbl { font-size: 9px; color: rgba(255,255,255,0.3); margin-top: 1px; letter-spacing: 0.04em; text-transform: uppercase; }

        .mobile-footer {
          padding: 16px 20px 32px;
          text-align: center;
          animation: mobileSlideUp 0.7s ease 0.3s both;
        }
        .mobile-footer p {
          font-size: 11px; color: rgba(255,255,255,0.2);
          font-family: 'DM Sans', sans-serif; margin: 0; line-height: 1.5;
        }

        @media (max-width: 767px) {
          .login-desktop { display: none !important; }
          .login-mobile { display: flex !important; }
        }
        @media (min-width: 768px) {
          .login-desktop { display: flex !important; }
          .login-mobile { display: none !important; }
        }
      `}</style>

      {/* ═══════════════════════════════════
          DESKTOP LAYOUT (768px+)
      ═══════════════════════════════════ */}
      <div className="login-desktop">
        {/* Left panel – auth form */}
        <div className="left-panel">
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.4), transparent)" }} />

          {/* ── LOGO – Desktop left panel ── */}
          <div style={{ marginBottom: "40px" }}>
            <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
              <FixsenseLogo size={36} borderRadius={10} />
              <span style={{ fontSize: "20px", fontWeight: 800, color: "#ffffff", fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: "-0.02em" }}>Fixsense</span>
            </a>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: "28px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#ffffff", fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: "6px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>{titles[mode]}</h1>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
              {mode === "login" ? "Sign in to your Fixsense dashboard" : mode === "signup" ? "Start closing more deals with AI intelligence" : "Enter your email to receive a reset link"}
            </p>
          </div>

          {/* Google OAuth */}
          {mode !== "forgot" && (
            <>
              <button className="google-btn" onClick={handleGoogleSignIn} type="button">
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                Continue with Google
              </button>
              <div className="divider"><div className="divider-line" /><span className="divider-text">or continue with email</span><div className="divider-line" /></div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {mode === "signup" && (
              <div className="input-group">
                <span className="input-icon"><User style={{ width: "15px", height: "15px" }} /></span>
                <input type="text" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="auth-input" required />
              </div>
            )}
            <div className="input-group">
              <span className="input-icon"><Mail style={{ width: "15px", height: "15px" }} /></span>
              <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" required />
            </div>
            {mode !== "forgot" && (
              <div className="input-group">
                <span className="input-icon"><Lock style={{ width: "15px", height: "15px" }} /></span>
                <input type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input" style={{ paddingRight: "40px" }} required minLength={6} />
                <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>{showPassword ? <EyeOff style={{ width: "14px", height: "14px" }} /> : <Eye style={{ width: "14px", height: "14px" }} />}</button>
              </div>
            )}
            {mode === "login" && (
              <div style={{ textAlign: "right", marginTop: "-4px" }}>
                <button type="button" className="forgot-link" onClick={() => setMode("forgot")}>Forgot password?</button>
              </div>
            )}
            <button type="submit" className="primary-btn" disabled={loading} style={{ marginTop: "4px" }}>
              {loading
                ? <><div style={{ width: "14px", height: "14px", border: "2px solid rgba(3,7,18,0.3)", borderTopColor: "#030712", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Processing...</>
                : mode === "forgot" ? "Send Reset Link"
                : mode === "signup" ? <><span>Start Free Trial</span><ArrowRight style={{ width: "15px", height: "15px" }} /></>
                : <><span>Sign In</span><ArrowRight style={{ width: "15px", height: "15px" }} /></>}
            </button>
          </form>

          {mode === "signup" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "10px" }}>
              <Check style={{ width: "13px", height: "13px", color: "#2dd4bf", flexShrink: 0 }} />
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>No credit card required for free trial</span>
            </div>
          )}

          <div style={{ marginTop: "24px", textAlign: "center", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {mode === "forgot" ? (
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>Remember your password? <button className="mode-link" onClick={() => setMode("login")}>Sign in</button></p>
            ) : mode === "signup" ? (
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>Already have an account? <button className="mode-link" onClick={() => setMode("login")}>Sign in</button></p>
            ) : (
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>Don't have an account? <button className="mode-link" onClick={() => setMode("signup")}>Start free trial</button></p>
            )}
          </div>

          {mode === "signup" && (
            <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {["5 free meetings per month", "AI transcription & summaries", "No setup required"].map((feat) => (
                <div key={feat} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "rgba(45,212,191,0.12)", border: "1px solid rgba(45,212,191,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Check style={{ width: "10px", height: "10px", color: "#2dd4bf" }} />
                  </div>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>{feat}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel – testimonials */}
        <div className="right-panel">
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 60% at 60% 30%, rgba(45,212,191,0.07) 0%, transparent 65%), radial-gradient(ellipse 50% 50% at 80% 70%, rgba(129,140,248,0.06) 0%, transparent 60%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(45,212,191,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.025) 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1, maxWidth: "480px" }}>
            <AnimatedTestimonials />
          </div>
          <div style={{ position: "absolute", bottom: "32px", left: "56px", right: "56px", display: "flex", alignItems: "center", gap: "0" }}>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)", fontFamily: "'DM Sans', sans-serif", marginRight: "16px", whiteSpace: "nowrap", letterSpacing: "0.06em", textTransform: "uppercase" }}>Works with</span>
            <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
              {["Zoom", "Google Meet", "Slack", "Salesforce"].map((name) => (
                <span key={name} style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.2)", fontFamily: "'DM Sans', sans-serif" }}>{name}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════
          MOBILE LAYOUT (< 768px)
      ═══════════════════════════════════ */}
      <div className="login-mobile">

        {/* Mobile hero strip with LOGO */}
        <div className="mobile-hero">
          <div className="mobile-hero-logo">
            {/* ── LOGO – Mobile hero ── */}
            <FixsenseLogo size={38} borderRadius={11} />
            <span className="mobile-hero-wordmark">Fixsense</span>
          </div>
          <div className="mobile-hero-tagline">
            <h1>
              {mode === "login" ? "Welcome back"
                : mode === "signup" ? <>Start closing <span style={{ background: "linear-gradient(135deg, #2dd4bf, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>more deals</span></>
                : "Reset your password"}
            </h1>
            <p>{mode === "login" ? "Sign in to your dashboard" : mode === "signup" ? "Free forever. No credit card." : "Enter your email below"}</p>
          </div>
        </div>

        {/* Auth card */}
        <div className="mobile-card">
          {mode !== "forgot" && (
            <div className="mobile-mode-tabs">
              <button className={`mobile-mode-tab ${mode === "login" ? "mobile-mode-tab--active" : ""}`} onClick={() => setMode("login")}>Sign In</button>
              <button className={`mobile-mode-tab ${mode === "signup" ? "mobile-mode-tab--active" : ""}`} onClick={() => setMode("signup")}>Sign Up</button>
            </div>
          )}

          {mode !== "forgot" && (
            <>
              <button className="google-btn" onClick={handleGoogleSignIn} type="button" style={{ marginBottom: "4px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                Continue with Google
              </button>
              <div className="divider"><div className="divider-line" /><span className="divider-text">or email</span><div className="divider-line" /></div>
            </>
          )}

          <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {mode === "signup" && (
              <div className="input-group">
                <span className="input-icon"><User style={{ width: "15px", height: "15px" }} /></span>
                <input type="text" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="auth-input" required />
              </div>
            )}
            <div className="input-group">
              <span className="input-icon"><Mail style={{ width: "15px", height: "15px" }} /></span>
              <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" autoCapitalize="off" autoCorrect="off" required />
            </div>
            {mode !== "forgot" && (
              <div className="input-group">
                <span className="input-icon"><Lock style={{ width: "15px", height: "15px" }} /></span>
                <input type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input" style={{ paddingRight: "42px" }} required minLength={6} />
                <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>{showPassword ? <EyeOff style={{ width: "15px", height: "15px" }} /> : <Eye style={{ width: "15px", height: "15px" }} />}</button>
              </div>
            )}
            {mode === "login" && (
              <div style={{ textAlign: "right" }}>
                <button type="button" className="forgot-link" onClick={() => setMode("forgot")}>Forgot password?</button>
              </div>
            )}
            <button type="submit" className="primary-btn" disabled={loading} style={{ marginTop: "6px", padding: "14px 20px", fontSize: "15px", borderRadius: "13px" }}>
              {loading
                ? <><div style={{ width: "16px", height: "16px", border: "2px solid rgba(3,7,18,0.3)", borderTopColor: "#030712", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Processing...</>
                : mode === "forgot" ? "Send Reset Link"
                : mode === "signup" ? <><span>Create Free Account</span><ArrowRight style={{ width: "16px", height: "16px" }} /></>
                : <><span>Sign In</span><ArrowRight style={{ width: "16px", height: "16px" }} /></>}
            </button>
          </form>

          {mode === "forgot" && (
            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <button className="mode-link" onClick={() => setMode("login")} style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>← Back to sign in</button>
            </div>
          )}
        </div>

        {mode === "signup" && (
          <div style={{ display: "flex", justifyContent: "center", gap: "16px", margin: "12px 20px 0", flexWrap: "wrap" }}>
            {["5 free meetings", "No card needed", "Setup in seconds"].map((feat) => (
              <div key={feat} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <Check style={{ width: "11px", height: "11px", color: "#2dd4bf", flexShrink: 0 }} />
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontFamily: "'DM Sans', sans-serif" }}>{feat}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mobile-stats" style={{ marginTop: "20px" }}>
          {[{ value: "10k+", label: "MEETINGS" }, { value: "30%", label: "CLOSE LIFT" }, { value: "99%", label: "ACCURACY" }].map((s, i) => (
            <div key={i} className="mobile-stat">
              <div className="mobile-stat-val">{s.value}</div>
              <div className="mobile-stat-lbl">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mobile-social">
          <p className="mobile-social-quote">"Fixsense helped us increase close rates by 30%. We finally understand what's happening in our sales calls."</p>
          <div className="mobile-social-person">
            <div className="mobile-social-av">MR</div>
            <div>
              <div className="mobile-social-name">Marcus Reid</div>
              <div className="mobile-social-role">Head of Sales, Vantex SaaS</div>
            </div>
          </div>
        </div>

        <div className="mobile-footer">
          <p>Works with Zoom · Google Meet · Slack · Salesforce</p>
          <p style={{ marginTop: "6px" }}>© {new Date().getFullYear()} Fixsense · Secure payments by Paystack</p>
        </div>
      </div>
    </>
  );
}
