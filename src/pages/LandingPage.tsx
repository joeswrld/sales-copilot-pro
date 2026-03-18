import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  ArrowRight, Zap, Menu, X, Check, Star, Play,
  Mic, Brain, BarChart3, Users, TrendingUp, FileText,
  ChevronRight, Shield, Clock, Target, LayoutDashboard,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── Animation Hook ────────────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ─── Counter Component ─────────────────────────────────────────────────────
function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const { ref, inView } = useInView(0.5);
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1800;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(ease * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, target]);
  return <span ref={ref}>{count}{suffix}</span>;
}

// ─── Section Wrapper ───────────────────────────────────────────────────────
function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || null;
  const emailInitial = displayName?.[0]?.toUpperCase() || "U";

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "Testimonials", href: "#testimonials" },
  ];

  const problems = [
    { icon: "📝", text: "Sales reps forget key details after calls" },
    { icon: "👁️", text: "Managers can't review every meeting" },
    { icon: "❓", text: "Teams don't know why deals are lost" },
  ];

  const steps = [
    {
      num: "01",
      icon: <Zap className="w-7 h-7" />,
      title: "Connect your meetings",
      desc: "Connect Zoom or Google Meet and start calls directly from Fixsense in seconds.",
      color: "#2dd4bf",
    },
    {
      num: "02",
      icon: <Brain className="w-7 h-7" />,
      title: "AI analyzes every conversation",
      desc: "Transcription, objection detection, talk ratio, and sentiment analysis happen automatically.",
      color: "#818cf8",
    },
    {
      num: "03",
      icon: <TrendingUp className="w-7 h-7" />,
      title: "Improve and close more deals",
      desc: "Get coaching insights, AI summaries, and action steps after every meeting.",
      color: "#34d399",
    },
  ];

  const features = [
    { icon: <Mic className="w-5 h-5" />, title: "Real-time Transcription", desc: "Every word captured instantly with speaker identification. Never miss a key moment.", color: "#2dd4bf" },
    { icon: <Brain className="w-5 h-5" />, title: "AI Meeting Summaries", desc: "Auto-generated summaries with decisions, action items, and next steps delivered instantly.", color: "#818cf8" },
    { icon: <Target className="w-5 h-5" />, title: "Objection Detection", desc: "AI spots objections in real time and suggests battle-tested responses to keep deals alive.", color: "#f59e0b" },
    { icon: <TrendingUp className="w-5 h-5" />, title: "Engagement Scoring", desc: "Track buyer sentiment and engagement throughout the call to predict deal outcomes.", color: "#34d399" },
    { icon: <BarChart3 className="w-5 h-5" />, title: "Team Analytics", desc: "Dashboards showing win rates, talk ratio trends, and performance comparisons across your team.", color: "#60a5fa" },
    { icon: <Users className="w-5 h-5" />, title: "Sales Coaching", desc: "Managers can leave feedback on specific call moments. Turn every rep into a top performer.", color: "#f472b6" },
  ];

  const testimonials = [
    {
      quote: "Fixsense helped our team increase close rates by 30%. We finally understand what's happening in our sales calls and can coach proactively.",
      name: "Marcus Reid",
      role: "Head of Sales, Vantex SaaS",
      avatar: "MR",
      stars: 5,
    },
    {
      quote: "Before Fixsense, we guessed at what was working. Now we have data on every call, and our ramp time for new reps is half what it used to be.",
      name: "Sophia Chen",
      role: "Founder, Launchflow",
      avatar: "SC",
      stars: 5,
    },
    {
      quote: "The objection detection alone is worth it. Our reps get real-time suggestions during live calls. Game-changer for a remote team.",
      name: "Daniel Osei",
      role: "VP Sales, Cloudpath",
      avatar: "DO",
      stars: 5,
    },
  ];

  const plans = [
    {
      name: "Free",
      price: "$0",
      period: "/month",
      desc: "Get started, no card needed",
      features: ["5 meetings/month", "AI transcription", "Basic analytics", "1 user"],
      cta: user ? "Go to Dashboard" : "Start Free",
      popular: false,
      ctaVariant: "outline" as const,
      href: user ? "/dashboard" : "/login",
    },
    {
      name: "Starter",
      price: "$19",
      period: "/month",
      desc: "For individual sales reps",
      features: ["50 meetings/month", "AI summaries", "Zoom + Google Meet", "Email support", "3 team members"],
      cta: user ? "Go to Dashboard" : "Start Free Trial",
      popular: false,
      ctaVariant: "secondary" as const,
      href: user ? "/dashboard/billing" : "/login",
    },
    {
      name: "Growth",
      price: "$49",
      period: "/month",
      desc: "For growing sales teams",
      features: ["300 meetings/month", "Team analytics dashboard", "Coaching insights", "10 team members", "Priority support"],
      cta: user ? "Upgrade Now" : "Start Free Trial",
      popular: true,
      ctaVariant: "default" as const,
      href: user ? "/dashboard/billing" : "/login",
    },
    {
      name: "Scale",
      price: "$99",
      period: "/month",
      desc: "For high-volume teams",
      features: ["Unlimited meetings", "Advanced analytics", "API access", "Unlimited members", "Dedicated support"],
      cta: user ? "Upgrade Now" : "Contact Sales",
      popular: false,
      ctaVariant: "secondary" as const,
      href: user ? "/dashboard/billing" : "/login",
    },
  ];

  const whyPoints = [
    { icon: <FileText className="w-5 h-5 text-teal-400" />, title: "No manual note-taking", desc: "Transcription and summaries are automatic. Your reps stay focused on the conversation." },
    { icon: <Zap className="w-5 h-5 text-violet-400" />, title: "Real-time insights during calls", desc: "Objection alerts and engagement scores surface instantly — not in a post-mortem." },
    { icon: <Users className="w-5 h-5 text-emerald-400" />, title: "Coaching built into your workflow", desc: "Managers leave timestamped feedback on recordings. No more guesswork in 1:1s." },
    { icon: <Shield className="w-5 h-5 text-blue-400" />, title: "Works with tools you already use", desc: "Native Zoom, Google Meet, Slack, Salesforce, and HubSpot integrations." },
  ];

  return (
    <div className="min-h-screen bg-[#080c14] text-white overflow-x-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Bricolage+Grotesque:wght@400;500;600;700;800&display=swap');
        
        * { box-sizing: border-box; }
        
        .display-font { font-family: 'Bricolage Grotesque', system-ui, sans-serif; }
        
        .glow-teal { box-shadow: 0 0 60px rgba(45, 212, 191, 0.15); }
        .glow-teal-sm { box-shadow: 0 0 30px rgba(45, 212, 191, 0.1); }
        
        .hero-gradient {
          background: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(45,212,191,0.12) 0%, transparent 70%),
                      radial-gradient(ellipse 60% 40% at 80% 60%, rgba(129,140,248,0.08) 0%, transparent 60%),
                      #080c14;
        }
        
        .grid-bg {
          background-image: linear-gradient(rgba(45,212,191,0.04) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(45,212,191,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
        }
        
        .noise-overlay::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
          pointer-events: none;
        }
        
        .card-glass {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          backdrop-filter: blur(12px);
        }
        
        .card-glass:hover {
          background: rgba(255,255,255,0.05);
          border-color: rgba(45,212,191,0.2);
          transition: all 0.3s ease;
        }
        
        .popular-card {
          background: linear-gradient(135deg, rgba(45,212,191,0.08), rgba(129,140,248,0.05));
          border: 1px solid rgba(45,212,191,0.3);
        }
        
        .tag-pill {
          background: rgba(45,212,191,0.1);
          border: 1px solid rgba(45,212,191,0.2);
          color: #2dd4bf;
          font-size: 12px;
          font-weight: 500;
          padding: 4px 12px;
          border-radius: 100px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          letter-spacing: 0.02em;
        }

        .user-pill {
          background: rgba(45,212,191,0.08);
          border: 1px solid rgba(45,212,191,0.18);
          color: #2dd4bf;
          font-size: 12px;
          font-weight: 500;
          padding: 4px 10px 4px 4px;
          border-radius: 100px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .user-pill:hover { background: rgba(45,212,191,0.15); }
        .user-pill-av {
          width: 24px; height: 24px; border-radius: 50%;
          background: linear-gradient(135deg, #2dd4bf, #0d9488);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: #030712; flex-shrink: 0;
        }
        
        .cta-primary {
          background: linear-gradient(135deg, #2dd4bf, #0d9488);
          color: #030712;
          font-weight: 600;
          padding: 14px 28px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          transition: all 0.2s ease;
          font-family: 'DM Sans', system-ui, sans-serif;
          text-decoration: none;
        }
        .cta-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 30px rgba(45,212,191,0.35);
        }
        
        .cta-ghost {
          background: rgba(255,255,255,0.06);
          color: #e2e8f0;
          font-weight: 500;
          padding: 14px 28px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.1);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          transition: all 0.2s ease;
          font-family: 'DM Sans', system-ui, sans-serif;
          text-decoration: none;
        }
        .cta-ghost:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.2);
        }

        .logged-in-banner {
          background: rgba(45,212,191,0.06);
          border-bottom: 1px solid rgba(45,212,191,0.12);
          padding: 9px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-size: 13px;
          color: rgba(255,255,255,0.65);
          font-family: 'DM Sans', sans-serif;
        }
        .logged-in-banner strong { color: #2dd4bf; font-weight: 600; }
        .logged-in-banner-link {
          display: inline-flex; align-items: center; gap: 4px;
          color: #2dd4bf; font-weight: 600; font-size: 12px;
          background: rgba(45,212,191,0.12); border: 1px solid rgba(45,212,191,0.25);
          padding: 3px 10px; border-radius: 20px; text-decoration: none;
          transition: background 0.2s;
        }
        .logged-in-banner-link:hover { background: rgba(45,212,191,0.2); }
        
        .step-line {
          position: absolute;
          top: 40px;
          left: calc(50% + 48px);
          width: calc(100% - 96px);
          height: 1px;
          background: linear-gradient(90deg, rgba(45,212,191,0.4), rgba(45,212,191,0.1));
        }
        
        .dashboard-mock {
          background: #0d1525;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          overflow: hidden;
        }
        
        .stat-badge {
          background: rgba(45,212,191,0.08);
          border: 1px solid rgba(45,212,191,0.15);
          border-radius: 10px;
          padding: 12px 16px;
        }
        
        .problem-card {
          background: rgba(239,68,68,0.05);
          border: 1px solid rgba(239,68,68,0.12);
          border-radius: 12px;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }
        .problem-card::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          width: 3px;
          height: 100%;
          background: #ef4444;
          opacity: 0.5;
        }
        
        .solution-highlight {
          background: rgba(45,212,191,0.05);
          border: 1px solid rgba(45,212,191,0.15);
          border-radius: 12px;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .solution-highlight::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          width: 3px;
          height: 100%;
          background: linear-gradient(180deg, #2dd4bf, #818cf8);
        }

        .divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent); }
        
        .testimonial-card {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          padding: 28px;
          transition: all 0.3s ease;
        }
        .testimonial-card:hover {
          border-color: rgba(45,212,191,0.2);
          background: rgba(255,255,255,0.04);
          transform: translateY(-2px);
        }
        
        .avatar-circle {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: linear-gradient(135deg, #2dd4bf, #818cf8);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 14px;
          color: #030712;
          flex-shrink: 0;
        }

        .nav-blur {
          background: rgba(8,12,20,0.85);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 0.7; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        .float { animation: float 6s ease-in-out infinite; }
        .live-dot::after {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          background: rgba(239,68,68,0.4);
          animation: pulse-ring 1.5s ease-out infinite;
        }
      `}</style>

      {/* ── Logged-in banner (top of page) ───────────────────────────────── */}
      {user && (
        <div className="logged-in-banner">
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#2dd4bf", flexShrink: 0 }} />
          <span>Welcome back, <strong>{displayName}</strong> — you're signed in</span>
          <a href="/dashboard" className="logged-in-banner-link">
            <LayoutDashboard style={{ width: 12, height: 12 }} />
            Go to Dashboard
          </a>
        </div>
      )}

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav className={`fixed left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "nav-blur" : ""} ${user ? "top-[37px]" : "top-0"}`}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #2dd4bf, #0d9488)" }}>
              <Zap className="w-4 h-4 text-gray-900" />
            </div>
            <span className="text-[17px] font-bold display-font text-white">Fixsense</span>
          </Link>

          <div className="hidden md:flex items-center gap-7">
            {navLinks.map(l => (
              <a key={l.label} href={l.href} className="text-sm text-gray-400 hover:text-white transition-colors font-medium">
                {l.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                {/* User pill */}
                <Link to="/dashboard/profile">
                  <div className="user-pill">
                    <div className="user-pill-av">{emailInitial}</div>
                    <span>{displayName}</span>
                  </div>
                </Link>
                <Link to="/dashboard">
                  <button className="cta-primary" style={{ padding: "10px 20px", fontSize: "14px" }}>
                    Dashboard <LayoutDashboard className="w-4 h-4" />
                  </button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login">
                  <button className="cta-ghost" style={{ padding: "10px 20px", fontSize: "14px" }}>
                    Sign in
                  </button>
                </Link>
                <Link to="/login">
                  <button className="cta-primary" style={{ padding: "10px 20px", fontSize: "14px" }}>
                    Start Free Trial
                  </button>
                </Link>
              </>
            )}
          </div>

          <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden nav-blur border-t border-white/5 px-5 py-5 space-y-4">
            {navLinks.map(l => (
              <a key={l.label} href={l.href} onClick={() => setMobileOpen(false)} className="block text-gray-300 font-medium py-1">{l.label}</a>
            ))}
            <div className="pt-3 flex flex-col gap-2">
              {user ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="user-pill-av">{emailInitial}</div>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Signed in as <strong style={{ color: "#2dd4bf" }}>{displayName}</strong></span>
                  </div>
                  <Link to="/dashboard" onClick={() => setMobileOpen(false)}>
                    <button className="cta-primary w-full justify-center">
                      <LayoutDashboard className="w-4 h-4" /> Go to Dashboard
                    </button>
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMobileOpen(false)}>
                    <button className="cta-ghost w-full justify-center">Sign in</button>
                  </Link>
                  <Link to="/login" onClick={() => setMobileOpen(false)}>
                    <button className="cta-primary w-full justify-center">Start Free Trial</button>
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="hero-gradient grid-bg noise-overlay relative pb-20 px-5 overflow-hidden" style={{ paddingTop: user ? "120px" : "112px" }}>
        {/* Floating orbs */}
        <div className="absolute top-24 left-1/4 w-72 h-72 rounded-full blur-3xl pointer-events-none" style={{ background: "rgba(45,212,191,0.06)" }} />
        <div className="absolute top-40 right-1/4 w-64 h-64 rounded-full blur-3xl pointer-events-none" style={{ background: "rgba(129,140,248,0.06)" }} />

        <div className="max-w-5xl mx-auto text-center relative z-10">
          {/* Trust / Welcome pill */}
          <div className="flex justify-center mb-8">
            {user ? (
              <div className="tag-pill">
                <span className="relative inline-block w-2 h-2 rounded-full bg-teal-400 live-dot flex-shrink-0" />
                Welcome back, {displayName} — your dashboard is ready
              </div>
            ) : (
              <div className="tag-pill">
                <span className="relative inline-block w-2 h-2 rounded-full bg-teal-400 live-dot flex-shrink-0" />
                Used by modern sales teams worldwide
              </div>
            )}
          </div>

          <h1 className="display-font font-extrabold text-white leading-[1.07] mb-6" style={{ fontSize: "clamp(36px, 5.5vw, 72px)" }}>
            {user ? (
              <>
                Your AI Sales Coach
                <br />
                <span style={{ background: "linear-gradient(135deg, #2dd4bf 0%, #818cf8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Is Waiting for You
                </span>
              </>
            ) : (
              <>
                Close More Deals With
                <br />
                <span style={{ background: "linear-gradient(135deg, #2dd4bf 0%, #818cf8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  AI-Powered Sales Intelligence
                </span>
              </>
            )}
          </h1>

          <p className="text-gray-400 mx-auto mb-10 leading-relaxed" style={{ fontSize: "clamp(16px, 2vw, 19px)", maxWidth: "620px" }}>
            {user
              ? "Pick up where you left off — view your call history, check team analytics, or start a new live meeting with real-time AI coaching."
              : "Fixsense records, analyzes, and improves your sales meetings in real time — so your team closes more deals without guessing what works."}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-14">
            {user ? (
              <>
                <Link to="/dashboard">
                  <button className="cta-primary text-base px-8 py-4">
                    <LayoutDashboard className="w-5 h-5" /> Go to Dashboard
                  </button>
                </Link>
                <Link to="/dashboard/live">
                  <button className="cta-ghost text-base px-8 py-4">
                    Start a Live Call <ArrowRight className="w-5 h-5" />
                  </button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login">
                  <button className="cta-primary text-base px-8 py-4">
                    Start Free Trial <ArrowRight className="w-5 h-5" />
                  </button>
                </Link>
                <button className="cta-ghost text-base px-8 py-4">
                  <Play className="w-4 h-4 fill-current" /> Watch Demo
                </button>
              </>
            )}
          </div>

          {/* Trust badges — different for logged-in */}
          <div className="flex flex-wrap justify-center gap-6 mb-14 text-sm text-gray-500">
            {user ? (
              <>
                <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-teal-400" /> Your data is safe and secure</span>
                <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-teal-400" /> AI insights ready on every call</span>
                <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-teal-400" /> Team analytics available now</span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-teal-400" /> No credit card required</span>
                <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-teal-400" /> 5 free meetings/month</span>
                <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-teal-400" /> AI-powered insights in seconds</span>
              </>
            )}
          </div>

          {/* Dashboard Mock */}
          <div className="dashboard-mock glow-teal mx-auto float" style={{ maxWidth: "820px" }}>
            {/* Mock top bar */}
            <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-white/5 rounded-md px-4 py-1 text-xs text-gray-500 w-48 text-center">fixsense.io/dashboard/live</div>
              </div>
            </div>

            {/* Mock dashboard content */}
            <div className="p-5 grid grid-cols-12 gap-4" style={{ background: "#0a1120" }}>
              {/* Live badge */}
              <div className="col-span-12 flex items-center gap-3 mb-1">
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-full px-3 py-1">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  <span className="text-red-400 text-xs font-semibold">LIVE — Q4 Discovery Call</span>
                </div>
                <span className="text-gray-500 text-xs">12:34</span>
              </div>

              {/* Stats row */}
              <div className="col-span-12 grid grid-cols-4 gap-3">
                {[
                  { label: "Engagement", value: "87%", color: "#2dd4bf", pct: 87 },
                  { label: "Talk Ratio", value: "42:58", color: "#818cf8", pct: 42 },
                  { label: "Sentiment", value: "Positive", color: "#34d399", pct: 78 },
                  { label: "Objections", value: "2 handled", color: "#f59e0b", pct: 100 },
                ].map(s => (
                  <div key={s.label} className="stat-badge text-left">
                    <div className="text-gray-500 text-[10px] mb-1">{s.label}</div>
                    <div className="font-bold text-sm" style={{ color: s.color }}>{s.value}</div>
                    <div className="mt-2 h-1 rounded-full bg-white/5">
                      <div className="h-1 rounded-full" style={{ width: `${s.pct}%`, background: s.color, opacity: 0.7 }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Transcript + objection side by side */}
              <div className="col-span-8 space-y-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Live Transcript</div>
                {[
                  { speaker: "Rep", text: "What's your biggest challenge with your current sales process?", color: "#2dd4bf" },
                  { speaker: "Prospect", text: "Honestly, we lose track of follow-ups and our CRM data is always outdated.", color: "#94a3b8" },
                  { speaker: "Rep", text: "That's exactly the problem Fixsense was built to solve. Let me show you how we handle that...", color: "#2dd4bf" },
                ].map((line, i) => (
                  <div key={i} className="flex gap-2 items-start p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <span className="text-[10px] font-bold shrink-0 mt-0.5 w-14" style={{ color: line.color }}>{line.speaker}</span>
                    <span className="text-[11px] text-gray-400 leading-relaxed">{line.text}</span>
                  </div>
                ))}
              </div>
              <div className="col-span-4 space-y-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">AI Insights</div>
                <div className="p-2.5 rounded-lg border border-amber-500/20 text-[10px]" style={{ background: "rgba(245,158,11,0.06)" }}>
                  <div className="text-amber-400 font-semibold mb-0.5">⚡ Objection Detected</div>
                  <div className="text-gray-400">Suggest ROI data to address CRM concerns</div>
                </div>
                <div className="p-2.5 rounded-lg border border-teal-500/20 text-[10px]" style={{ background: "rgba(45,212,191,0.06)" }}>
                  <div className="text-teal-400 font-semibold mb-0.5">💡 Buying Signal</div>
                  <div className="text-gray-400">Prospect mentioned "current process" — explore pain</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BANNER ─────────────────────────────────────────────────── */}
      <section className="py-14 px-5 border-y" style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.01)" }}>
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: 30, suffix: "%", label: "Average increase in close rate" },
            { value: 10, suffix: "k+", label: "Sales meetings analyzed" },
            { value: 50, suffix: "%", label: "Faster rep onboarding" },
            { value: 99, suffix: "%", label: "Transcription accuracy" },
          ].map((s, i) => (
            <FadeIn key={i} delay={i * 80}>
              <div className="text-4xl font-bold display-font mb-1" style={{ color: "#2dd4bf" }}>
                <AnimatedCounter target={s.value} suffix={s.suffix} />
              </div>
              <div className="text-gray-500 text-sm leading-snug">{s.label}</div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── PROBLEM → SOLUTION ────────────────────────────────────────────── */}
      <section className="py-24 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <FadeIn>
              <div className="tag-pill mb-5">The Problem</div>
              <h2 className="display-font text-3xl md:text-4xl font-bold text-white mb-8 leading-tight">
                Sales teams are flying blind on their calls
              </h2>
              <div className="space-y-4">
                {problems.map((p, i) => (
                  <div key={i} className="problem-card">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{p.icon}</span>
                      <span className="text-gray-300 text-[15px]">{p.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>

            <FadeIn delay={150}>
              <div className="tag-pill mb-5" style={{ background: "rgba(45,212,191,0.1)", borderColor: "rgba(45,212,191,0.2)", color: "#2dd4bf" }}>The Solution</div>
              <h2 className="display-font text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
                Complete visibility into every conversation
              </h2>
              <div className="solution-highlight mb-6">
                <p className="text-gray-300 text-[15px] leading-relaxed">
                  Fixsense automatically records and analyzes every sales call, giving you <strong className="text-white">clear insights on what works</strong> and what doesn't — so you can coach smarter, sell better, and close more.
                </p>
              </div>
              <div className="space-y-3">
                {["Every call automatically transcribed", "AI detects objections in real time", "Post-call coaching insights delivered instantly", "Team performance trends at a glance"].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(45,212,191,0.15)", border: "1px solid rgba(45,212,191,0.3)" }}>
                      <Check className="w-3 h-3 text-teal-400" />
                    </div>
                    {item}
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-5">
        <div className="max-w-5xl mx-auto">
          <FadeIn className="text-center mb-16">
            <div className="tag-pill inline-flex mb-5">How It Works</div>
            <h2 className="display-font text-3xl md:text-4xl font-bold text-white">Three steps to better sales performance</h2>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6 relative">
            {steps.map((step, i) => (
              <FadeIn key={i} delay={i * 120}>
                <div className="card-glass rounded-2xl p-7 relative text-center group cursor-default h-full">
                  <div className="text-7xl font-black display-font absolute -top-4 -right-2 select-none pointer-events-none" style={{ color: "rgba(255,255,255,0.03)" }}>{step.num}</div>
                  <div className="relative z-10">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: `${step.color}18`, border: `1px solid ${step.color}30`, color: step.color }}>
                      {step.icon}
                    </div>
                    <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: step.color }}>{step.num}</div>
                    <h3 className="display-font text-lg font-bold text-white mb-3">{step.title}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
                  </div>
                  {i < 2 && (
                    <div className="hidden md:block absolute top-12 -right-4 z-20">
                      <ChevronRight className="w-6 h-6 text-gray-700" />
                    </div>
                  )}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* ── FEATURES ──────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-5">
        <div className="max-w-5xl mx-auto">
          <FadeIn className="text-center mb-16">
            <div className="tag-pill inline-flex mb-5">Features</div>
            <h2 className="display-font text-3xl md:text-4xl font-bold text-white mb-4">Everything your team needs to win</h2>
            <p className="text-gray-400 max-w-xl mx-auto text-[15px]">From live call intelligence to post-call analysis — Fixsense covers the entire sales conversation lifecycle.</p>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <FadeIn key={i} delay={i * 70}>
                <div className="card-glass rounded-2xl p-6 h-full group cursor-default">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${f.color}18`, color: f.color }}>
                    {f.icon}
                  </div>
                  <h3 className="display-font font-bold text-white text-[15px] mb-2">{f.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS ─────────────────────────────────────────────────── */}
      <section className="py-12 px-5" style={{ background: "rgba(255,255,255,0.01)", borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-7">Integrates with your entire sales stack</p>
          <div className="flex flex-wrap justify-center gap-5 md:gap-10">
            {["Zoom", "Google Meet", "Microsoft Teams", "Salesforce", "HubSpot", "Slack"].map(name => (
              <span key={name} className="display-font text-base font-semibold text-gray-600 hover:text-gray-400 transition-colors cursor-default">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section id="testimonials" className="py-24 px-5">
        <div className="max-w-5xl mx-auto">
          <FadeIn className="text-center mb-14">
            <div className="tag-pill inline-flex mb-5">Testimonials</div>
            <h2 className="display-font text-3xl md:text-4xl font-bold text-white mb-4">Teams that chose data over guesswork</h2>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <FadeIn key={i} delay={i * 100}>
                <div className="testimonial-card h-full flex flex-col">
                  <div className="flex gap-0.5 mb-5">
                    {Array.from({ length: t.stars }).map((_, j) => (
                      <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <blockquote className="text-gray-300 text-sm leading-relaxed flex-1 mb-6">"{t.quote}"</blockquote>
                  <div className="flex items-center gap-3">
                    <div className="avatar-circle text-xs">{t.avatar}</div>
                    <div>
                      <div className="text-white text-sm font-semibold">{t.name}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{t.role}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* ── PRICING ───────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-5">
        <div className="max-w-5xl mx-auto">
          <FadeIn className="text-center mb-14">
            <div className="tag-pill inline-flex mb-5">Pricing</div>
            <h2 className="display-font text-3xl md:text-4xl font-bold text-white mb-4">Simple, transparent pricing</h2>
            <p className="text-gray-400 text-[15px]">
              {user ? "You're already on board — upgrade your plan anytime." : "Start free. Upgrade as your team grows. No surprises."}
            </p>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan, i) => (
              <FadeIn key={i} delay={i * 80}>
                <div className={`relative rounded-2xl p-6 h-full flex flex-col ${plan.popular ? "popular-card glow-teal-sm" : "card-glass"}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="text-xs font-bold px-3 py-1 rounded-full text-gray-900" style={{ background: "linear-gradient(135deg, #2dd4bf, #0d9488)" }}>
                        Most Popular
                      </span>
                    </div>
                  )}
                  <div className="mb-5">
                    <h3 className="display-font font-bold text-white text-base mb-1">{plan.name}</h3>
                    <p className="text-gray-500 text-xs">{plan.desc}</p>
                  </div>
                  <div className="flex items-end gap-1 mb-6">
                    <span className="display-font text-3xl font-extrabold text-white">{plan.price}</span>
                    <span className="text-gray-500 text-sm mb-1">{plan.period}</span>
                  </div>
                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((feat, j) => (
                      <li key={j} className="flex items-center gap-2.5 text-gray-300 text-sm">
                        <Check className="w-4 h-4 flex-shrink-0" style={{ color: plan.popular ? "#2dd4bf" : "#6b7280" }} />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <Link to={plan.href}>
                    <button
                      className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${plan.popular ? "cta-primary justify-center" : "cta-ghost justify-center"}`}
                      style={{ width: "100%", justifyContent: "center" }}
                    >
                      {plan.cta}
                    </button>
                  </Link>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={200} className="text-center mt-7">
            <p className="text-gray-600 text-xs">
              {user
                ? "Manage your subscription anytime from your billing page."
                : "All plans include a 7-day money-back guarantee. Billed in NGN via Paystack."}
            </p>
          </FadeIn>
        </div>
      </section>

      <div className="divider" />

      {/* ── WHY FIXSENSE ─────────────────────────────────────────────────── */}
      <section className="py-24 px-5" style={{ background: "rgba(255,255,255,0.01)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <FadeIn>
              <div className="tag-pill inline-flex mb-5">Why Fixsense</div>
              <h2 className="display-font text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
                A sales performance engine — not just a recorder
              </h2>
              <p className="text-gray-400 text-[15px] leading-relaxed mb-8">
                Most tools just record calls. Fixsense turns every conversation into actionable intelligence that improves rep performance over time.
              </p>
              <Link to={user ? "/dashboard" : "/login"}>
                <button className="cta-primary">
                  {user ? "Go to Dashboard" : "Start Free Trial"} <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
            </FadeIn>

            <FadeIn delay={150}>
              <div className="grid grid-cols-1 gap-4">
                {whyPoints.map((p, i) => (
                  <div key={i} className="card-glass rounded-xl p-5 flex gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)" }}>
                      {p.icon}
                    </div>
                    <div>
                      <h4 className="text-white font-semibold text-sm mb-1">{p.title}</h4>
                      <p className="text-gray-400 text-xs leading-relaxed">{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* ── FINAL CTA ─────────────────────────────────────────────────────── */}
      <section className="py-28 px-5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(45,212,191,0.07) 0%, transparent 70%)" }} />
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <FadeIn>
            <div className="tag-pill inline-flex mb-7">
              {user ? "You're already here" : "Get started today"}
            </div>
            <h2 className="display-font text-4xl md:text-5xl font-extrabold text-white mb-5 leading-tight">
              {user ? (
                <>Your dashboard<br />is ready</>
              ) : (
                <>Start closing more<br />deals today</>
              )}
            </h2>
            <p className="text-gray-400 text-[16px] mb-10 leading-relaxed">
              {user
                ? "Head to your dashboard to view calls, check analytics, or start a new live meeting right now."
                : "Join sales teams that have replaced guesswork with data. 5 free meetings per month — no credit card required."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to={user ? "/dashboard" : "/login"}>
                <button className="cta-primary text-base px-9 py-4">
                  {user ? <><LayoutDashboard className="w-5 h-5" /> Open Dashboard</> : <>Start Free Trial <ArrowRight className="w-5 h-5" /></>}
                </button>
              </Link>
              {!user && (
                <a href="#how-it-works">
                  <button className="cta-ghost text-base px-9 py-4">
                    See How It Works
                  </button>
                </a>
              )}
              {user && (
                <Link to="/dashboard/live">
                  <button className="cta-ghost text-base px-9 py-4">
                    Start a Live Call <ArrowRight className="w-5 h-5" />
                  </button>
                </Link>
              )}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{ background: "rgba(255,255,255,0.01)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-6xl mx-auto px-5 py-14">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            {/* Brand */}
            <div className="col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #2dd4bf, #0d9488)" }}>
                  <Zap className="w-4 h-4 text-gray-900" />
                </div>
                <span className="text-[17px] font-bold display-font text-white">Fixsense</span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed max-w-[220px] mb-5">
                AI-powered sales call intelligence for modern sales teams.
              </p>
              <div className="flex gap-4">
                {["𝕏", "in", "📧"].map((s, i) => (
                  <a key={i} href="#" className="w-8 h-8 rounded-lg flex items-center justify-center text-sm text-gray-500 hover:text-white transition-colors" style={{ background: "rgba(255,255,255,0.05)" }}>
                    {s}
                  </a>
                ))}
              </div>
            </div>

            {/* Product */}
            <div>
              <h5 className="text-white text-xs font-semibold uppercase tracking-wider mb-4">Product</h5>
              <ul className="space-y-3">
                {["Features", "Pricing", "How It Works", "Integrations"].map(l => (
                  <li key={l}><a href="#" className="text-gray-500 text-sm hover:text-gray-300 transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h5 className="text-white text-xs font-semibold uppercase tracking-wider mb-4">Company</h5>
              <ul className="space-y-3">
                {["About", "Blog", "Careers", "Contact"].map(l => (
                  <li key={l}><a href="#" className="text-gray-500 text-sm hover:text-gray-300 transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>

            {/* Account */}
            <div>
              <h5 className="text-white text-xs font-semibold uppercase tracking-wider mb-4">
                {user ? "Account" : "Legal"}
              </h5>
              <ul className="space-y-3">
                {user ? (
                  <>
                    <li><Link to="/dashboard" className="text-teal-400 text-sm hover:text-teal-300 transition-colors">Dashboard</Link></li>
                    <li><Link to="/dashboard/billing" className="text-gray-500 text-sm hover:text-gray-300 transition-colors">Billing</Link></li>
                    <li><Link to="/dashboard/profile" className="text-gray-500 text-sm hover:text-gray-300 transition-colors">Profile</Link></li>
                    <li><Link to="/dashboard/settings" className="text-gray-500 text-sm hover:text-gray-300 transition-colors">Settings</Link></li>
                  </>
                ) : (
                  ["Privacy Policy", "Terms of Service", "Security", "GDPR"].map(l => (
                    <li key={l}><a href="#" className="text-gray-500 text-sm hover:text-gray-300 transition-colors">{l}</a></li>
                  ))
                )}
              </ul>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <p className="text-gray-600 text-sm">© {new Date().getFullYear()} Fixsense. All rights reserved.</p>
            {user ? (
              <div className="flex items-center gap-2 user-pill">
                <div className="user-pill-av" style={{ width: 20, height: 20, fontSize: 9 }}>{emailInitial}</div>
                <span style={{ fontSize: 12 }}>Signed in as {displayName}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-gray-600" />
                <span className="text-gray-600 text-xs">Response time under 10 seconds</span>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
