import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Zap, Mail, Lock, User, Eye, EyeOff, ArrowRight, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Testimonials Data ────────────────────────────────────────────────────────
const testimonials = [
  {
    quote:
      "Fixsense helped us increase close rates by 30%. Our team now knows exactly what works in every call — no more guessing.",
    name: "Marcus Reid",
    role: "Head of Sales, Vantex SaaS",
    avatar: "MR",
    metric: "30% increase in close rate",
  },
  {
    quote:
      "We stopped guessing after sales calls. The insights are instant and actionable. Our ramp time for new reps dropped by half.",
    name: "Sophia Chen",
    role: "Founder, Launchflow",
    avatar: "SC",
    metric: "50% faster ramp time",
  },
  {
    quote:
      "The objection detection alone paid for itself in week one. Real-time suggestions during live calls is a complete game-changer.",
    name: "Daniel Osei",
    role: "VP Sales, Cloudpath",
    avatar: "DO",
    metric: "ROI in week one",
  },
];

// ─── AnimatedTestimonials ─────────────────────────────────────────────────────
function AnimatedTestimonials() {
  const [active, setActive] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setAnimating(true);
      setTimeout(() => {
        setActive((prev) => (prev + 1) % testimonials.length);
        setAnimating(false);
      }, 400);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const t = testimonials[active];

  return (
    <div className="flex flex-col h-full justify-between">
      {/* Header */}
      <div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(45,212,191,0.12)",
            border: "1px solid rgba(45,212,191,0.25)",
            borderRadius: "100px",
            padding: "5px 14px",
            marginBottom: "32px",
          }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "#2dd4bf",
              display: "inline-block",
              animation: "pulse 2s ease-in-out infinite",
            }}
          />
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#2dd4bf",
              letterSpacing: "0.04em",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Trusted by high-performing sales teams
          </span>
        </div>

        <h2
          style={{
            fontSize: "clamp(28px, 3.5vw, 42px)",
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.1,
            marginBottom: "16px",
            fontFamily: "'Bricolage Grotesque', sans-serif",
          }}
        >
          Close more deals
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #2dd4bf 0%, #818cf8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            with AI intelligence.
          </span>
        </h2>

        <p
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: "14px",
            lineHeight: 1.6,
            marginBottom: "48px",
            fontFamily: "'DM Sans', sans-serif",
            maxWidth: "360px",
          }}
        >
          Join hundreds of sales teams using Fixsense to record, analyze, and improve every customer conversation.
        </p>
      </div>

      {/* Testimonial Card */}
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "20px",
          padding: "28px",
          transition: "opacity 0.4s ease, transform 0.4s ease",
          opacity: animating ? 0 : 1,
          transform: animating ? "translateY(8px)" : "translateY(0)",
          marginBottom: "28px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Quote accent */}
        <div
          style={{
            position: "absolute",
            top: "20px",
            right: "24px",
            fontSize: "60px",
            color: "rgba(45,212,191,0.1)",
            fontFamily: "serif",
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          "
        </div>

        {/* Metric badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(45,212,191,0.1)",
            border: "1px solid rgba(45,212,191,0.2)",
            borderRadius: "8px",
            padding: "4px 10px",
            marginBottom: "16px",
          }}
        >
          <span style={{ fontSize: "11px", color: "#2dd4bf", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
            ↑ {t.metric}
          </span>
        </div>

        <p
          style={{
            color: "rgba(255,255,255,0.8)",
            fontSize: "15px",
            lineHeight: 1.65,
            marginBottom: "20px",
            fontFamily: "'DM Sans', sans-serif",
            fontStyle: "italic",
          }}
        >
          "{t.quote}"
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #2dd4bf, #818cf8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              fontWeight: 700,
              color: "#030712",
              flexShrink: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {t.avatar}
          </div>
          <div>
            <p
              style={{
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {t.name}
            </p>
            <p
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: "11px",
                fontFamily: "'DM Sans', sans-serif",
                marginTop: "1px",
              }}
            >
              {t.role}
            </p>
          </div>
        </div>
      </div>

      {/* Dots */}
      <div style={{ display: "flex", gap: "8px" }}>
        {testimonials.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            style={{
              width: i === active ? "24px" : "8px",
              height: "8px",
              borderRadius: "4px",
              background: i === active ? "#2dd4bf" : "rgba(255,255,255,0.15)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.3s ease",
              padding: 0,
            }}
          />
        ))}
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px",
          marginTop: "32px",
          paddingTop: "24px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {[
          { value: "10k+", label: "Meetings analyzed" },
          { value: "30%", label: "Avg close rate lift" },
          { value: "99%", label: "Transcription accuracy" },
        ].map((stat) => (
          <div key={stat.label} style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: "#2dd4bf",
                fontFamily: "'Bricolage Grotesque', sans-serif",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontSize: "10px",
                color: "rgba(255,255,255,0.35)",
                fontFamily: "'DM Sans', sans-serif",
                marginTop: "2px",
                lineHeight: 1.3,
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main LoginPage Component ─────────────────────────────────────────────────
export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Inject fonts
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Bricolage+Grotesque:wght@400;600;700;800&display=swap";
    document.head.appendChild(link);

    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({ title: "Check your email", description: "We've sent you a password reset link." });
        setMode("login");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (data.session) {
          navigate("/dashboard");
        } else {
          toast({ title: "Check your email", description: "We've sent you a confirmation link." });
        }
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
  };

  const switchMode = (newMode: "login" | "signup" | "forgot") => {
    setMode(newMode);
  };

  const titles = {
    login: "Welcome back",
    signup: "Create your account",
    forgot: "Reset your password",
  };

  const subtitles = {
    login: "Sign in to your Fixsense dashboard",
    signup: "Start closing more deals with AI intelligence",
    forgot: "Enter your email to receive a reset link",
  };

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .auth-input {
          width: 100%;
          padding: 11px 14px 11px 40px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #f1f5f9;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        .auth-input::placeholder { color: rgba(255,255,255,0.3); }
        .auth-input:focus {
          border-color: rgba(45, 212, 191, 0.5);
          background: rgba(45, 212, 191, 0.04);
          box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.08);
        }
        .auth-input:hover:not(:focus) {
          border-color: rgba(255, 255, 255, 0.18);
        }

        .primary-btn {
          width: 100%;
          padding: 12px 20px;
          background: linear-gradient(135deg, #2dd4bf, #0d9488);
          color: #030712;
          font-weight: 700;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s ease;
          letter-spacing: 0.01em;
        }
        .primary-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(45, 212, 191, 0.35);
        }
        .primary-btn:active:not(:disabled) { transform: translateY(0); }
        .primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .google-btn {
          width: 100%;
          padding: 11px 20px;
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.85);
          font-weight: 500;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.2s ease;
        }
        .google-btn:hover {
          background: rgba(255,255,255,0.09);
          border-color: rgba(255,255,255,0.18);
        }

        .mode-link {
          background: none;
          border: none;
          color: #2dd4bf;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          text-decoration: none;
          transition: opacity 0.2s;
        }
        .mode-link:hover { opacity: 0.75; }

        .forgot-link {
          background: none;
          border: none;
          color: rgba(255,255,255,0.4);
          font-size: 12px;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          padding: 0;
          transition: color 0.2s;
        }
        .forgot-link:hover { color: rgba(255,255,255,0.7); }

        .input-group { position: relative; }
        .input-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255,255,255,0.3);
          pointer-events: none;
          display: flex;
          align-items: center;
        }
        .eye-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.3);
          display: flex;
          align-items: center;
          padding: 0;
          transition: color 0.2s;
        }
        .eye-btn:hover { color: rgba(255,255,255,0.6); }

        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 16px 0;
        }
        .divider-line {
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.08);
        }
        .divider-text {
          font-size: 11px;
          color: rgba(255,255,255,0.25);
          font-family: 'DM Sans', sans-serif;
          white-space: nowrap;
        }

        @media (max-width: 768px) {
          .right-panel { display: none !important; }
          .left-panel { 
            padding: 32px 24px !important;
            min-height: 100vh;
          }
        }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          background: "#080c14",
          fontFamily: "'DM Sans', sans-serif",
          overflow: "hidden",
        }}
      >
        {/* ── LEFT PANEL — Auth Form ────────────────────────────────────── */}
        <div
          className="left-panel"
          style={{
            flex: "0 0 480px",
            maxWidth: "480px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "48px 52px",
            background: "#0b1120",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            position: "relative",
            animation: mounted ? "slideInLeft 0.6s ease forwards" : "none",
            opacity: mounted ? 1 : 0,
            zIndex: 10,
          }}
        >
          {/* Subtle top glow */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.4), transparent)",
            }}
          />

          {/* Logo */}
          <div style={{ marginBottom: "40px" }}>
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #2dd4bf, #0d9488)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Zap style={{ width: "16px", height: "16px", color: "#030712" }} />
              </div>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 800,
                  color: "#ffffff",
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  letterSpacing: "-0.02em",
                }}
              >
                Fixsense
              </span>
            </a>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: "28px" }}>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 800,
                color: "#ffffff",
                fontFamily: "'Bricolage Grotesque', sans-serif",
                marginBottom: "6px",
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
              }}
            >
              {titles[mode]}
            </h1>
            <p
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.4)",
                lineHeight: 1.5,
              }}
            >
              {subtitles[mode]}
            </p>
          </div>

          {/* Google OAuth — not shown on forgot */}
          {mode !== "forgot" && (
            <>
              <button className="google-btn" onClick={handleGoogleSignIn} type="button">
                <svg width="16" hei
