import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Menu, X, Check, Star, Play,
  Mic, Brain, BarChart3, Users, TrendingUp, FileText,
  ChevronRight, Shield, Clock, Target, LayoutDashboard,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── Animation Hook ────────────────────────────────────────────────────────
function useInView(threshold = 0.1) {
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

// ─── Counter ───────────────────────────────────────────────────────────────
function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const { ref, inView } = useInView(0.4);
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1800;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setCount(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, target]);
  return <span ref={ref}>{count}{suffix}</span>;
}

// ─── FadeIn ────────────────────────────────────────────────────────────────
function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className={className} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? "translateY(0)" : "translateY(24px)",
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

// ─── Logo Component ────────────────────────────────────────────────────────
function FixsenseLogo({ size = 32, borderRadius = 8 }: { size?: number; borderRadius?: number }) {
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

export default function LandingPage() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || null;
  const emailInitial = displayName?.[0]?.toUpperCase() || "U";

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const fn = () => { if (window.innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

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
    { num: "01", icon: <BarChart3 className="w-6 h-6" />, title: "Connect your meetings", desc: "Connect Zoom or Google Meet and start calls directly from Fixsense in seconds.", color: "#2dd4bf" },
    { num: "02", icon: <Brain className="w-6 h-6" />, title: "AI analyzes every conversation", desc: "Transcription, objection detection, talk ratio, and sentiment analysis happen automatically.", color: "#818cf8" },
    { num: "03", icon: <TrendingUp className="w-6 h-6" />, title: "Improve and close more deals", desc: "Get coaching insights, AI summaries, and action steps after every meeting.", color: "#34d399" },
  ];

  const features = [
    { icon: <Mic className="w-5 h-5" />, title: "Real-time Transcription", desc: "Every word captured instantly with speaker identification. Never miss a key moment.", color: "#2dd4bf" },
    { icon: <Brain className="w-5 h-5" />, title: "AI Meeting Summaries", desc: "Auto-generated summaries with decisions, action items, and next steps delivered instantly.", color: "#818cf8" },
    { icon: <Target className="w-5 h-5" />, title: "Objection Detection", desc: "AI spots objections in real time and suggests battle-tested responses to keep deals alive.", color: "#f59e0b" },
    { icon: <TrendingUp className="w-5 h-5" />, title: "Engagement Scoring", desc: "Track buyer sentiment and engagement throughout the call to predict deal outcomes.", color: "#34d399" },
    { icon: <BarChart3 className="w-5 h-5" />, title: "Team Analytics", desc: "Dashboards showing win rates, talk ratio trends, and performance comparisons.", color: "#60a5fa" },
    { icon: <Users className="w-5 h-5" />, title: "Sales Coaching", desc: "Managers can leave feedback on specific call moments. Turn every rep into a top performer.", color: "#f472b6" },
  ];

  const testimonials = [
    { quote: "Fixsense helped our team increase close rates by 30%. We finally understand what's happening in our sales calls and can coach proactively.", name: "Marcus Reid", role: "Head of Sales, Vantex SaaS", avatar: "MR", stars: 5 },
    { quote: "Before Fixsense, we guessed at what was working. Now we have data on every call, and our ramp time for new reps is half what it used to be.", name: "Sophia Chen", role: "Founder, Launchflow", avatar: "SC", stars: 5 },
    { quote: "The objection detection alone is worth it. Our reps get real-time suggestions during live calls. Game-changer for a remote team.", name: "Daniel Osei", role: "VP Sales, Cloudpath", avatar: "DO", stars: 5 },
  ];

  const plans = [
    { name: "Free", price: "$0", period: "/mo", desc: "Get started, no card needed", features: ["5 meetings/month", "AI transcription", "Basic analytics", "1 user"], cta: user ? "Go to Dashboard" : "Start Free", popular: false, href: user ? "/dashboard" : "/login" },
    { name: "Starter", price: "$19", period: "/mo", desc: "For individual sales reps", features: ["50 meetings/month", "AI summaries", "Zoom + Google Meet", "Email support", "3 team members"], cta: user ? "Go to Dashboard" : "Start Free Trial", popular: false, href: user ? "/dashboard/billing" : "/login" },
    { name: "Growth", price: "$49", period: "/mo", desc: "For growing sales teams", features: ["300 meetings/month", "Team analytics dashboard", "Coaching insights", "10 team members", "Priority support"], cta: user ? "Upgrade Now" : "Start Free Trial", popular: true, href: user ? "/dashboard/billing" : "/login" },
    { name: "Scale", price: "$99", period: "/mo", desc: "For high-volume teams", features: ["Unlimited meetings", "Advanced analytics", "API access", "Unlimited members", "Dedicated support"], cta: user ? "Upgrade Now" : "Contact Sales", popular: false, href: user ? "/dashboard/billing" : "/login" },
  ];

  const whyPoints = [
    { icon: <FileText className="w-5 h-5 text-teal-400" />, title: "No manual note-taking", desc: "Transcription and summaries are automatic. Your reps stay focused on the conversation." },
    { icon: <BarChart3 className="w-5 h-5 text-violet-400" />, title: "Real-time insights during calls", desc: "Objection alerts and engagement scores surface instantly — not in a post-mortem." },
    { icon: <Users className="w-5 h-5 text-emerald-400" />, title: "Coaching built into your workflow", desc: "Managers leave timestamped feedback on recordings. No more guesswork in 1:1s." },
    { icon: <Shield className="w-5 h-5 text-blue-400" />, title: "Works with tools you already use", desc: "Native Zoom, Google Meet, Slack, Salesforce, and HubSpot integrations." },
  ];

  return (
    <div className="lp-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Bricolage+Grotesque:wght@400;500;600;700;800&display=swap');

        .lp-root {
          min-height: 100svh;
          background: #080c14;
          color: #fff;
          overflow-x: hidden;
          font-family: 'DM Sans', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .lp-root *, .lp-root *::before, .lp-root *::after { box-sizing: border-box; }

        .df { font-family: 'Bricolage Grotesque', system-ui, sans-serif; }

        /* ── Logged-in banner ── */
        .lp-banner {
          position: sticky; top: 0; z-index: 60;
          background: rgba(45,212,191,0.07);
          border-bottom: 1px solid rgba(45,212,191,0.14);
          padding: 8px 16px;
          display: flex; align-items: center; justify-content: center;
          gap: 8px; flex-wrap: wrap;
          font-size: 13px; color: rgba(255,255,255,0.65);
          min-height: 38px;
        }
        .lp-banner strong { color: #2dd4bf; font-weight: 600; }
        .lp-banner-link {
          display: inline-flex; align-items: center; gap: 4px;
          color: #2dd4bf; font-weight: 600; font-size: 12px;
          background: rgba(45,212,191,0.12); border: 1px solid rgba(45,212,191,0.25);
          padding: 3px 10px; border-radius: 20px; text-decoration: none;
          white-space: nowrap; transition: background 0.2s;
        }
        .lp-banner-link:hover { background: rgba(45,212,191,0.2); }

        /* ── Nav ── */
        .lp-nav {
          position: sticky; top: 0; z-index: 50;
          height: 60px;
          display: flex; align-items: center;
          transition: background 0.3s, border-color 0.3s;
          padding: 0 20px;
        }
        .lp-nav.scrolled {
          background: rgba(8,12,20,0.92);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .lp-nav-inner {
          max-width: 1200px; width: 100%; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
        }
        .lp-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; flex-shrink: 0; }
        .lp-logo-text { font-size: 17px; font-weight: 700; color: #fff; font-family: 'Bricolage Grotesque', sans-serif; }
        .lp-nav-links { display: flex; align-items: center; gap: 28px; }
        .lp-nav-link { font-size: 14px; color: rgba(255,255,255,0.5); text-decoration: none; transition: color 0.2s; white-space: nowrap; }
        .lp-nav-link:hover { color: #fff; }
        .lp-nav-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .lp-hamburger {
          display: none; background: none; border: none; cursor: pointer;
          color: rgba(255,255,255,0.6); padding: 4px; border-radius: 6px;
          transition: color 0.2s;
        }
        .lp-hamburger:hover { color: #fff; }

        /* Desktop user pill */
        .lp-user-pill {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(45,212,191,0.08); border: 1px solid rgba(45,212,191,0.18);
          color: #2dd4bf; font-size: 12px; font-weight: 500;
          padding: 4px 10px 4px 4px; border-radius: 100px;
          text-decoration: none; transition: background 0.2s; white-space: nowrap;
        }
        .lp-user-pill:hover { background: rgba(45,212,191,0.15); }
        .lp-user-av {
          width: 24px; height: 24px; border-radius: 50%;
          background: linear-gradient(135deg, #2dd4bf, #0d9488);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: #030712; flex-shrink: 0;
        }

        /* ── Mobile Drawer ── */
        .lp-drawer-overlay {
          display: none; position: fixed; inset: 0; z-index: 49;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
        }
        .lp-drawer {
          position: fixed; top: 0; right: 0; bottom: 0; z-index: 55;
          width: min(320px, 85vw);
          background: #0d1120;
          border-left: 1px solid rgba(255,255,255,0.08);
          display: flex; flex-direction: column;
          padding: 0;
          transform: translateX(100%);
          transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
          overflow-y: auto;
        }
        .lp-drawer.open { transform: translateX(0); }
        .lp-drawer-overlay.open { display: block; }
        .lp-drawer-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .lp-drawer-close {
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; width: 34px; height: 34px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: rgba(255,255,255,0.6); transition: color 0.2s, background 0.2s;
        }
        .lp-drawer-close:hover { color: #fff; background: rgba(255,255,255,0.1); }
        .lp-drawer-nav { padding: 12px 0; flex: 1; }
        .lp-drawer-link {
          display: block; padding: 13px 20px;
          font-size: 15px; font-weight: 500; color: rgba(255,255,255,0.65);
          text-decoration: none; transition: color 0.2s, background 0.2s;
          border-left: 2px solid transparent;
        }
        .lp-drawer-link:hover { color: #fff; background: rgba(255,255,255,0.04); border-left-color: rgba(45,212,191,0.4); }
        .lp-drawer-footer {
          padding: 16px 20px;
          border-top: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
          display: flex; flex-direction: column; gap: 10px;
        }
        .lp-drawer-user-row {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 0 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          margin-bottom: 2px;
        }
        .lp-drawer-user-av {
          width: 36px; height: 36px; border-radius: 50%;
          background: linear-gradient(135deg, #2dd4bf, #0d9488);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 700; color: #030712; flex-shrink: 0;
        }

        /* ── Buttons ── */
        .btn-primary {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          background: linear-gradient(135deg, #2dd4bf, #0d9488);
          color: #030712; font-weight: 600; font-size: 15px;
          padding: 13px 24px; border-radius: 10px; border: none;
          cursor: pointer; text-decoration: none; white-space: nowrap;
          transition: transform 0.2s, box-shadow 0.2s;
          font-family: 'DM Sans', sans-serif;
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(45,212,191,0.35); }
        .btn-primary:active { transform: translateY(0); }
        .btn-primary.sm { font-size: 13px; padding: 9px 18px; border-radius: 8px; }
        .btn-primary.full { width: 100%; }

        .btn-ghost {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          color: #e2e8f0; font-weight: 500; font-size: 15px;
          padding: 13px 24px; border-radius: 10px;
          cursor: pointer; text-decoration: none; white-space: nowrap;
          transition: background 0.2s, border-color 0.2s;
          font-family: 'DM Sans', sans-serif;
        }
        .btn-ghost:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
        .btn-ghost.sm { font-size: 13px; padding: 9px 18px; border-radius: 8px; }
        .btn-ghost.full { width: 100%; }

        /* ── Tag pill ── */
        .tag-pill {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(45,212,191,0.1); border: 1px solid rgba(45,212,191,0.2);
          color: #2dd4bf; font-size: 12px; font-weight: 500;
          padding: 5px 13px; border-radius: 100px; letter-spacing: 0.02em;
        }
        .tag-pill .live-dot {
          position: relative; display: inline-block;
          width: 8px; height: 8px; border-radius: 50%; background: #2dd4bf; flex-shrink: 0;
        }
        .tag-pill .live-dot::after {
          content: ''; position: absolute; inset: -4px;
          border-radius: 50%; background: rgba(45,212,191,0.4);
          animation: pulse-ring 1.5s ease-out infinite;
        }

        /* ── Cards ── */
        .card-glass {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          backdrop-filter: blur(12px);
          border-radius: 18px;
        }
        .card-glass:hover { background: rgba(255,255,255,0.05); border-color: rgba(45,212,191,0.2); }

        /* ── Section utilities ── */
        .section { padding: 80px 20px; }
        .section-sm { padding: 56px 20px; }
        .container { max-width: 1100px; margin: 0 auto; }
        .container-sm { max-width: 900px; margin: 0 auto; }
        .divider-line { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent); }

        /* ── Hero ── */
        .hero {
          background:
            radial-gradient(ellipse 100% 60% at 50% -10%, rgba(45,212,191,0.14) 0%, transparent 65%),
            radial-gradient(ellipse 70% 50% at 80% 60%, rgba(129,140,248,0.08) 0%, transparent 55%),
            #080c14;
          background-image:
            radial-gradient(ellipse 100% 60% at 50% -10%, rgba(45,212,191,0.14) 0%, transparent 65%),
            radial-gradient(ellipse 70% 50% at 80% 60%, rgba(129,140,248,0.08) 0%, transparent 55%),
            linear-gradient(rgba(45,212,191,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(45,212,191,0.03) 1px, transparent 1px);
          background-size: auto, auto, 50px 50px, 50px 50px;
          position: relative; overflow: hidden;
          padding: 100px 20px 80px;
          text-align: center;
        }
        .hero-title {
          font-family: 'Bricolage Grotesque', sans-serif;
          font-weight: 800;
          font-size: clamp(32px, 6vw, 68px);
          line-height: 1.07;
          color: #fff;
          margin: 0 0 20px;
        }
        .hero-gradient-text {
          background: linear-gradient(135deg, #2dd4bf 0%, #818cf8 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-sub {
          font-size: clamp(15px, 2.2vw, 18px);
          color: rgba(255,255,255,0.5);
          max-width: 560px; margin: 0 auto 36px;
          line-height: 1.65;
        }
        .hero-ctas {
          display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;
          margin-bottom: 40px;
        }
        .hero-badges {
          display: flex; flex-wrap: wrap; justify-content: center; gap: 16px 24px;
          margin-bottom: 56px;
        }
        .hero-badge {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; color: rgba(255,255,255,0.4);
        }

        /* ── Dashboard Mock ── */
        .mock-wrap {
          max-width: 820px; width: 100%; margin: 0 auto;
          background: #0d1525;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; overflow: hidden;
          animation: float 6s ease-in-out infinite;
          box-shadow: 0 0 60px rgba(45,212,191,0.12);
        }
        .mock-bar {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .mock-dots { display: flex; gap: 5px; }
        .mock-dot { width: 10px; height: 10px; border-radius: 50%; }
        .mock-url {
          flex: 1; text-align: center;
          background: rgba(255,255,255,0.04);
          border-radius: 5px; padding: 4px 12px;
          font-size: 11px; color: rgba(255,255,255,0.3);
          max-width: 220px; margin: 0 auto;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .mock-body { background: #0a1120; padding: 16px; }
        .mock-live-row {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 14px;
        }
        .mock-live-badge {
          display: flex; align-items: center; gap: 6px;
          background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
          border-radius: 20px; padding: 4px 10px;
          font-size: 11px; font-weight: 600; color: #f87171;
        }
        .mock-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 14px; }
        .mock-stat {
          background: rgba(45,212,191,0.06);
          border: 1px solid rgba(45,212,191,0.12);
          border-radius: 8px; padding: 10px 12px;
        }
        .mock-stat-label { font-size: 9px; color: rgba(255,255,255,0.35); margin-bottom: 3px; }
        .mock-stat-val { font-size: 12px; font-weight: 700; }
        .mock-stat-bar { height: 2px; background: rgba(255,255,255,0.05); border-radius: 2px; margin-top: 6px; overflow: hidden; }
        .mock-stat-fill { height: 100%; border-radius: 2px; }
        .mock-content { display: grid; grid-template-columns: 1fr; gap: 8px; }
        .mock-transcript, .mock-insights { display: flex; flex-direction: column; gap: 6px; }
        .mock-section-label { font-size: 9px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 2px; }
        .mock-line { display: flex; gap: 6px; background: rgba(255,255,255,0.02); border-radius: 6px; padding: 6px 8px; }
        .mock-speaker { font-size: 9px; font-weight: 700; width: 40px; flex-shrink: 0; margin-top: 1px; }
        .mock-text { font-size: 10px; color: rgba(255,255,255,0.45); line-height: 1.4; }
        .mock-insight { border-radius: 6px; padding: 8px 10px; font-size: 10px; }

        /* ── Stats section ── */
        .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px 16px; }
        .stat-item { text-align: center; }
        .stat-num { font-family: 'Bricolage Grotesque', sans-serif; font-size: 36px; font-weight: 800; color: #2dd4bf; line-height: 1; margin-bottom: 6px; }
        .stat-label { font-size: 13px; color: rgba(255,255,255,0.4); line-height: 1.4; }

        /* ── Problem / Solution ── */
        .ps-grid { display: grid; grid-template-columns: 1fr; gap: 48px; }
        .problem-card {
          background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.12);
          border-left: 3px solid rgba(239,68,68,0.5);
          border-radius: 12px; padding: 16px 18px;
        }
        .solution-highlight {
          background: rgba(45,212,191,0.04); border: 1px solid rgba(45,212,191,0.14);
          border-left: 3px solid #2dd4bf;
          border-radius: 12px; padding: 20px 22px; margin-bottom: 20px;
        }
        .check-row { display: flex; align-items: flex-start; gap: 10px; }
        .check-icon {
          width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
          background: rgba(45,212,191,0.12); border: 1px solid rgba(45,212,191,0.3);
          display: flex; align-items: center; justify-content: center; margin-top: 1px;
        }

        /* ── How it works ── */
        .steps-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .step-card { position: relative; padding: 28px; border-radius: 18px; }
        .step-num-bg {
          font-family: 'Bricolage Grotesque', sans-serif;
          font-size: 72px; font-weight: 900;
          position: absolute; top: -8px; right: 8px;
          color: rgba(255,255,255,0.03); pointer-events: none; user-select: none;
          line-height: 1;
        }
        .step-icon { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
        .step-num-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }

        /* ── Features grid ── */
        .features-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        .feature-card { padding: 22px; border-radius: 18px; }
        .feature-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }

        /* ── Integrations ── */
        .integrations-strip {
          background: rgba(255,255,255,0.01);
          border-top: 1px solid rgba(255,255,255,0.04);
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .integrations-inner { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px 28px; }
        .integration-name { font-family: 'Bricolage Grotesque', sans-serif; font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.22); transition: color 0.2s; cursor: default; }
        .integration-name:hover { color: rgba(255,255,255,0.5); }

        /* ── Testimonials ── */
        .testimonials-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .testimonial-card {
          background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px; padding: 24px;
          transition: border-color 0.3s, transform 0.3s;
          display: flex; flex-direction: column;
        }
        .testimonial-card:hover { border-color: rgba(45,212,191,0.2); transform: translateY(-2px); }
        .testimonial-quote { font-size: 14px; color: rgba(255,255,255,0.65); line-height: 1.7; flex: 1; margin-bottom: 20px; }
        .testimonial-av {
          width: 40px; height: 40px; border-radius: 50%;
          background: linear-gradient(135deg, #2dd4bf, #818cf8);
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 13px; color: #030712; flex-shrink: 0;
        }
        .stars { display: flex; gap: 2px; margin-bottom: 14px; }

        /* ── Pricing ── */
        .pricing-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .pricing-card {
          padding: 24px; border-radius: 18px;
          display: flex; flex-direction: column;
          position: relative;
        }
        .pricing-card-default { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); }
        .pricing-card-popular {
          background: linear-gradient(135deg, rgba(45,212,191,0.08), rgba(129,140,248,0.05));
          border: 1px solid rgba(45,212,191,0.3);
          box-shadow: 0 0 40px rgba(45,212,191,0.08);
        }
        .popular-badge {
          position: absolute; top: -13px; left: 50%; transform: translateX(-50%);
          background: linear-gradient(135deg, #2dd4bf, #0d9488);
          color: #030712; font-size: 11px; font-weight: 700;
          padding: 4px 14px; border-radius: 100px; white-space: nowrap;
        }
        .pricing-name { font-family: 'Bricolage Grotesque', sans-serif; font-size: 17px; font-weight: 700; color: #fff; margin-bottom: 2px; }
        .pricing-desc { font-size: 12px; color: rgba(255,255,255,0.35); margin-bottom: 16px; }
        .pricing-price { display: flex; align-items: baseline; gap: 3px; margin-bottom: 20px; }
        .pricing-amount { font-family: 'Bricolage Grotesque', sans-serif; font-size: 34px; font-weight: 800; color: #fff; }
        .pricing-period { font-size: 13px; color: rgba(255,255,255,0.35); }
        .pricing-features { list-style: none; padding: 0; margin: 0 0 24px; flex: 1; display: flex; flex-direction: column; gap: 10px; }
        .pricing-feature { display: flex; align-items: center; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.6); }

        /* ── Why section ── */
        .why-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        .why-card { display: flex; gap: 16px; padding: 18px 20px; border-radius: 14px; }
        .why-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: rgba(255,255,255,0.04); }

        /* ── Final CTA ── */
        .final-cta {
          position: relative; overflow: hidden;
          text-align: center; padding: 96px 20px;
        }
        .final-cta::before {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse 80% 70% at 50% 50%, rgba(45,212,191,0.07) 0%, transparent 70%);
        }
        .final-cta-inner { position: relative; z-index: 1; max-width: 600px; margin: 0 auto; }
        .final-cta-title {
          font-family: 'Bricolage Grotesque', sans-serif;
          font-size: clamp(30px, 5vw, 50px);
          font-weight: 800; color: #fff; line-height: 1.1; margin: 16px 0 16px;
        }
        .final-cta-sub { font-size: 15px; color: rgba(255,255,255,0.45); margin-bottom: 36px; line-height: 1.6; }
        .final-cta-btns { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }

        /* ── Footer ── */
        .lp-footer { background: rgba(255,255,255,0.01); border-top: 1px solid rgba(255,255,255,0.05); padding: 56px 20px 32px; }
        .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px 20px; margin-bottom: 40px; }
        .footer-brand { grid-column: 1 / -1; }
        .footer-col-title { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 14px; }
        .footer-link { display: block; font-size: 13px; color: rgba(255,255,255,0.35); text-decoration: none; margin-bottom: 10px; transition: color 0.2s; }
        .footer-link:hover { color: rgba(255,255,255,0.7); }
        .footer-link.accent { color: #2dd4bf; }
        .footer-link.accent:hover { color: #5ee8d8; }
        .footer-bottom { display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center; padding-top: 28px; border-top: 1px solid rgba(255,255,255,0.05); }
        .footer-copy { font-size: 13px; color: rgba(255,255,255,0.25); }
        .footer-signed-in { display: inline-flex; align-items: center; gap: 6px; background: rgba(45,212,191,0.07); border: 1px solid rgba(45,212,191,0.15); border-radius: 20px; padding: 5px 12px 5px 5px; font-size: 12px; color: rgba(45,212,191,0.8); }
        .footer-signed-in-av { width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(135deg, #2dd4bf, #0d9488); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: #030712; }

        /* ── Social icons ── */
        .social-row { display: flex; gap: 10px; }
        .social-icon {
          width: 34px; height: 34px; border-radius: 8px;
          background: rgba(255,255,255,0.05);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; color: rgba(255,255,255,0.4);
          text-decoration: none; transition: background 0.2s, color 0.2s;
        }
        .social-icon:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); }

        /* ── Animations ── */
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes pulse-ring {
          0% { transform: scale(0.9); opacity: 0.8; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .pulse-dot {
          position: relative; display: inline-block;
          width: 7px; height: 7px; border-radius: 50%; background: #f87171; flex-shrink: 0;
        }
        .pulse-dot::after {
          content: ''; position: absolute; inset: -3px;
          border-radius: 50%; background: rgba(248,113,113,0.4);
          animation: pulse-ring 1.4s ease-out infinite;
        }

        /* ════ RESPONSIVE ════ */
        @media (min-width: 640px) {
          .stats-grid { grid-template-columns: repeat(4, 1fr); }
          .features-grid { grid-template-columns: repeat(2, 1fr); }
          .testimonials-grid { grid-template-columns: repeat(2, 1fr); }
          .pricing-grid { grid-template-columns: repeat(2, 1fr); }
          .steps-grid { grid-template-columns: repeat(3, 1fr); }
          .mock-content { grid-template-columns: 2fr 1fr; }
          .footer-grid { grid-template-columns: repeat(3, 1fr); }
          .footer-brand { grid-column: 1 / -1; }
          .footer-bottom { flex-direction: row; justify-content: space-between; text-align: left; }
        }
        @media (min-width: 768px) {
          .lp-hamburger { display: none; }
          .lp-nav-links { display: flex; }
          .lp-nav-actions { display: flex; }
          .ps-grid { grid-template-columns: repeat(2, 1fr); gap: 64px; align-items: start; }
          .why-grid { grid-template-columns: 1fr; }
          .features-grid { grid-template-columns: repeat(3, 1fr); }
          .hero { padding: 120px 20px 90px; }
          .section { padding: 96px 20px; }
          .integrations-inner { gap: 14px 40px; }
          .footer-grid { grid-template-columns: 2fr repeat(3, 1fr); gap: 32px; }
          .footer-brand { grid-column: auto; }
        }
        @media (min-width: 1024px) {
          .why-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
          .pricing-grid { grid-template-columns: repeat(4, 1fr); }
          .testimonials-grid { grid-template-columns: repeat(3, 1fr); }
          .stat-num { font-size: 42px; }
        }
        @media (max-width: 639px) {
          .lp-hamburger { display: flex; }
          .lp-nav-links { display: none; }
          .lp-nav-actions { display: none; }
          .hero { padding: 80px 16px 64px; }
          .section { padding: 60px 16px; }
          .section-sm { padding: 44px 16px; }
          .hero-ctas { flex-direction: column; align-items: center; }
          .hero-ctas .btn-primary, .hero-ctas .btn-ghost { width: 100%; max-width: 320px; }
          .mock-stats { grid-template-columns: repeat(2, 1fr); }
          .final-cta { padding: 72px 16px; }
          .final-cta-btns { flex-direction: column; align-items: center; }
          .final-cta-btns .btn-primary, .final-cta-btns .btn-ghost { width: 100%; max-width: 320px; }
          .footer-grid { grid-template-columns: 1fr 1fr; }
          .footer-brand { grid-column: 1 / -1; }
        }
      `}</style>

      {/* ── Logged-in banner ── */}
      {user && (
        <div className="lp-banner">
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#2dd4bf", flexShrink: 0 }} />
          <span>Welcome back, <strong>{displayName}</strong> — you're signed in</span>
          <a href="/dashboard" className="lp-banner-link">
            <LayoutDashboard style={{ width: 12, height: 12 }} />
            Go to Dashboard
          </a>
        </div>
      )}

      {/* ── Nav ── */}
      <nav className={`lp-nav${scrolled ? " scrolled" : ""}`}>
        <div className="lp-nav-inner">
          {/* LOGO in nav header */}
          <Link to="/" className="lp-logo">
            <FixsenseLogo size={32} borderRadius={8} />
            <span className="lp-logo-text">Fixsense</span>
          </Link>

          <div className="lp-nav-links">
            {navLinks.map(l => <a key={l.label} href={l.href} className="lp-nav-link">{l.label}</a>)}
          </div>

          <div className="lp-nav-actions">
            {user ? (
              <>
                <Link to="/dashboard/profile" className="lp-user-pill">
                  <div className="lp-user-av">{emailInitial}</div>
                  <span>{displayName}</span>
                </Link>
                <Link to="/dashboard" className="btn-primary sm">
                  <LayoutDashboard style={{ width: 15, height: 15 }} /> Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost sm">Sign in</Link>
                <Link to="/login" className="btn-primary sm">Start Free Trial</Link>
              </>
            )}
          </div>

          <button className="lp-hamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu style={{ width: 22, height: 22 }} />
          </button>
        </div>
      </nav>

      {/* ── Mobile Drawer ── */}
      <div className={`lp-drawer-overlay${mobileOpen ? " open" : ""}`} onClick={() => setMobileOpen(false)} />
      <div className={`lp-drawer${mobileOpen ? " open" : ""}`} role="dialog" aria-modal="true">
        <div className="lp-drawer-header">
          {/* LOGO in mobile drawer */}
          <Link to="/" className="lp-logo" onClick={() => setMobileOpen(false)}>
            <FixsenseLogo size={28} borderRadius={7} />
            <span className="lp-logo-text">Fixsense</span>
          </Link>
          <button className="lp-drawer-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <nav className="lp-drawer-nav">
          {navLinks.map(l => (
            <a key={l.label} href={l.href} className="lp-drawer-link" onClick={() => setMobileOpen(false)}>{l.label}</a>
          ))}
        </nav>

        <div className="lp-drawer-footer">
          {user ? (
            <>
              <div className="lp-drawer-user-row">
                <div className="lp-drawer-user-av">{emailInitial}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{displayName}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{user.email}</div>
                </div>
              </div>
              <Link to="/dashboard" className="btn-primary full" onClick={() => setMobileOpen(false)}>
                <LayoutDashboard style={{ width: 16, height: 16 }} /> Go to Dashboard
              </Link>
              <Link to="/dashboard/live" className="btn-ghost full" onClick={() => setMobileOpen(false)}>
                Start a Live Call <ArrowRight style={{ width: 15, height: 15 }} />
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-primary full" onClick={() => setMobileOpen(false)}>
                Start Free Trial <ArrowRight style={{ width: 15, height: 15 }} />
              </Link>
              <Link to="/login" className="btn-ghost full" onClick={() => setMobileOpen(false)}>Sign in</Link>
            </>
          )}
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="hero">
        <div style={{ position: "absolute", top: 60, left: "15%", width: 300, height: 300, borderRadius: "50%", background: "rgba(45,212,191,0.05)", filter: "blur(80px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 100, right: "10%", width: 250, height: 250, borderRadius: "50%", background: "rgba(129,140,248,0.05)", filter: "blur(70px)", pointerEvents: "none" }} />

        <div className="container" style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
            <div className="tag-pill">
              
            </div>
          </div>

          <h1 className="hero-title">
            {user ? (
              <>Your AI Sales Coach<br /><span className="hero-gradient-text">Is Waiting for You</span></>
            ) : (
              <>Close More Deals With<br /><span className="hero-gradient-text">AI-Powered Sales Intelligence</span></>
            )}
          </h1>

          <p className="hero-sub">
            {user
              ? "Pick up where you left off — view calls, check analytics, or start a new live meeting with real-time AI coaching."
              : "Fixsense records, analyzes, and improves your sales meetings in real time — so your team closes more deals without guessing what works."}
          </p>

          <div className="hero-ctas">
            {user ? (
              <>
                <Link to="/dashboard" className="btn-primary" style={{ fontSize: 15, padding: "14px 28px" }}>
                  <LayoutDashboard style={{ width: 18, height: 18 }} /> Go to Dashboard
                </Link>
                <Link to="/dashboard/live" className="btn-ghost" style={{ fontSize: 15, padding: "14px 28px" }}>
                  Start a Live Call <ArrowRight style={{ width: 18, height: 18 }} />
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-primary" style={{ fontSize: 15, padding: "14px 28px" }}>
                  Start Free Trial <ArrowRight style={{ width: 18, height: 18 }} />
                </Link>
                <button className="btn-ghost" style={{ fontSize: 15, padding: "14px 28px" }}>
                  <Play style={{ width: 15, height: 15 }} /> Watch Demo
                </button>
              </>
            )}
          </div>

          <div className="hero-badges">
            {(user
              ? ["Your data is safe and secure", "AI insights ready on every call", "Team analytics available now"]
              : ["No credit card required", "5 free meetings/month", "AI-powered insights in seconds"]
            ).map(badge => (
              <span key={badge} className="hero-badge">
                <Check style={{ width: 14, height: 14, color: "#2dd4bf", flexShrink: 0 }} />{badge}
              </span>
            ))}
          </div>

          {/* Dashboard mockup */}
          <div className="mock-wrap">
            <div className="mock-bar">
              <div className="mock-dots">
                <div className="mock-dot" style={{ background: "rgba(239,68,68,0.5)" }} />
                <div className="mock-dot" style={{ background: "rgba(234,179,8,0.5)" }} />
                <div className="mock-dot" style={{ background: "rgba(34,197,94,0.5)" }} />
              </div>
              <div className="mock-url">fixsense.io/dashboard/live</div>
            </div>
            <div className="mock-body">
              <div className="mock-live-row">
                <div className="mock-live-badge">
                  <span className="pulse-dot" style={{ background: "#f87171" }} />
                  LIVE — Q4 Discovery Call
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>12:34</span>
              </div>
              <div className="mock-stats">
                {[
                  { label: "Engagement", value: "87%", color: "#2dd4bf", pct: 87 },
                  { label: "Talk Ratio", value: "42:58", color: "#818cf8", pct: 42 },
                  { label: "Sentiment", value: "Positive", color: "#34d399", pct: 78 },
                  { label: "Objections", value: "2 handled", color: "#f59e0b", pct: 100 },
                ].map(s => (
                  <div key={s.label} className="mock-stat">
                    <div className="mock-stat-label">{s.label}</div>
                    <div className="mock-stat-val" style={{ color: s.color }}>{s.value}</div>
                    <div className="mock-stat-bar">
                      <div className="mock-stat-fill" style={{ width: `${s.pct}%`, background: s.color, opacity: 0.6 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mock-content">
                <div className="mock-transcript">
                  <div className="mock-section-label">Live Transcript</div>
                  {[
                    { speaker: "Rep", text: "What's your biggest challenge with your current sales process?", color: "#2dd4bf" },
                    { speaker: "Prospect", text: "Honestly, we lose track of follow-ups and our CRM data is always outdated.", color: "#94a3b8" },
                    { speaker: "Rep", text: "That's exactly the problem Fixsense was built to solve...", color: "#2dd4bf" },
                  ].map((l, i) => (
                    <div key={i} className="mock-line">
                      <span className="mock-speaker" style={{ color: l.color }}>{l.speaker}</span>
                      <span className="mock-text">{l.text}</span>
                    </div>
                  ))}
                </div>
                <div className="mock-insights">
                  <div className="mock-section-label">AI Insights</div>
                  <div className="mock-insight" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#fbbf24", marginBottom: 3 }}>⚡ Objection Detected</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Suggest ROI data to address CRM concerns</div>
                  </div>
                  <div className="mock-insight" style={{ background: "rgba(45,212,191,0.06)", border: "1px solid rgba(45,212,191,0.2)" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#2dd4bf", marginBottom: 3 }}>💡 Buying Signal</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Mentioned "current process" — explore pain</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <div style={{ padding: "56px 20px", background: "rgba(255,255,255,0.01)", borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="container-sm">
          <div className="stats-grid">
            {[
              { value: 30, suffix: "%", label: "Average increase in close rate" },
              { value: 10, suffix: "k+", label: "Sales meetings analyzed" },
              { value: 50, suffix: "%", label: "Faster rep onboarding" },
              { value: 99, suffix: "%", label: "Transcription accuracy" },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 80} className="stat-item">
                <div className="stat-num"><AnimatedCounter target={s.value} suffix={s.suffix} /></div>
                <div className="stat-label">{s.label}</div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>

      {/* ── Problem / Solution ── */}
      <section className="section">
        <div className="container">
          <div className="ps-grid">
            <FadeIn>
              <div className="tag-pill" style={{ marginBottom: 20 }}>The Problem</div>
              <h2 className="df" style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: "#fff", marginBottom: 24, lineHeight: 1.2 }}>
                Sales teams are flying blind on their calls
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {problems.map((p, i) => (
                  <div key={i} className="problem-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 22, flexShrink: 0 }}>{p.icon}</span>
                      <span style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>{p.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>

            <FadeIn delay={150}>
              <div className="tag-pill" style={{ marginBottom: 20 }}>The Solution</div>
              <h2 className="df" style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: "#fff", marginBottom: 20, lineHeight: 1.2 }}>
                Complete visibility into every conversation
              </h2>
              <div className="solution-highlight">
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.65, margin: 0 }}>
                  Fixsense automatically records and analyzes every sales call, giving you <strong style={{ color: "#fff" }}>clear insights on what works</strong> — so you can coach smarter, sell better, and close more.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {["Every call automatically transcribed", "AI detects objections in real time", "Post-call coaching insights delivered instantly", "Team performance trends at a glance"].map((item, i) => (
                  <div key={i} className="check-row">
                    <div className="check-icon"><Check style={{ width: 11, height: 11, color: "#2dd4bf" }} /></div>
                    <span style={{ fontSize: 14, color: "rgba(255,255,255,0.65)" }}>{item}</span>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      <div className="divider-line" />

      {/* ── How It Works ── */}
      <section className="section" id="how-it-works">
        <div className="container">
          <FadeIn className="df" style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="tag-pill" style={{ marginBottom: 16, display: "inline-flex" }}>How It Works</div>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: "#fff", margin: 0 }}>
              Three steps to better sales performance
            </h2>
          </FadeIn>
          <div className="steps-grid">
            {steps.map((step, i) => (
              <FadeIn key={i} delay={i * 100}>
                <div className="step-card card-glass">
                  <div className="step-num-bg">{step.num}</div>
                  <div className="step-icon" style={{ background: `${step.color}18`, border: `1px solid ${step.color}30`, color: step.color }}>
                    {step.icon}
                  </div>
                  <div className="step-num-label" style={{ color: step.color }}>{step.num}</div>
                  <h3 className="df" style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 8, lineHeight: 1.3 }}>{step.title}</h3>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <div className="divider-line" />

      {/* ── Features ── */}
      <section className="section" id="features">
        <div className="container">
          <FadeIn style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="tag-pill" style={{ marginBottom: 16, display: "inline-flex" }}>Features</div>
            <h2 className="df" style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: "#fff", marginBottom: 12 }}>
              Everything your team needs to win
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", maxWidth: 500, margin: "0 auto" }}>
              From live call intelligence to post-call analysis — Fixsense covers the entire sales conversation lifecycle.
            </p>
          </FadeIn>
          <div className="features-grid">
            {features.map((f, i) => (
              <FadeIn key={i} delay={i * 60}>
                <div className="feature-card card-glass" style={{ height: "100%" }}>
                  <div className="feature-icon" style={{ background: `${f.color}18`, color: f.color }}>{f.icon}</div>
                  <h3 className="df" style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integrations strip ── */}
      <div className="integrations-strip section-sm">
        <div className="container" style={{ textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 20 }}>
            Integrates with your entire sales stack
          </p>
          <div className="integrations-inner">
            {["Zoom", "Google Meet", "Microsoft Teams", "Salesforce", "HubSpot", "Slack"].map(n => (
              <span key={n} className="integration-name">{n}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Testimonials ── */}
      <section className="section" id="testimonials">
        <div className="container">
          <FadeIn style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="tag-pill" style={{ marginBottom: 16, display: "inline-flex" }}>Testimonials</div>
            <h2 className="df" style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: "#fff" }}>
              Teams that chose data over guesswork
            </h2>
          </FadeIn>
          <div className="testimonials-grid">
            {testimonials.map((t, i) => (
              <FadeIn key={i} delay={i * 100}>
                <div className="testimonial-card">
                  <div className="stars">
                    {Array.from({ length: t.stars }).map((_, j) => (
                      <Star key={j} style={{ width: 14, height: 14, fill: "#fbbf24", color: "#fbbf24" }} />
                    ))}
                  </div>
                  <p className="testimonial-quote">"{t.quote}"</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="testimonial-av">{t.avatar}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{t.role}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <div className="divider-line" />

      {/* ── Pricing ── */}
      <section className="section" id="pricing">
        <div className="container">
          <FadeIn style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="tag-pill" style={{ marginBottom: 16, display: "inline-flex" }}>Pricing</div>
            <h2 className="df" style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: "#fff", marginBottom: 10 }}>
              Simple, transparent pricing
            </h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)" }}>
              {user ? "You're already on board — upgrade anytime." : "Start free. Upgrade as your team grows. No surprises."}
            </p>
          </FadeIn>
          <div className="pricing-grid">
            {plans.map((plan, i) => (
              <FadeIn key={i} delay={i * 70}>
                <div className={`pricing-card ${plan.popular ? "pricing-card-popular" : "pricing-card-default"}`}>
                  {plan.popular && <div className="popular-badge">Most Popular</div>}
                  <div className="pricing-name">{plan.name}</div>
                  <div className="pricing-desc">{plan.desc}</div>
                  <div className="pricing-price">
                    <span className="pricing-amount">{plan.price}</span>
                    <span className="pricing-period">{plan.period}</span>
                  </div>
                  <ul className="pricing-features">
                    {plan.features.map((feat, j) => (
                      <li key={j} className="pricing-feature">
                        <Check style={{ width: 14, height: 14, color: plan.popular ? "#2dd4bf" : "rgba(255,255,255,0.3)", flexShrink: 0 }} />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <Link to={plan.href} className={plan.popular ? "btn-primary full" : "btn-ghost full"} style={{ fontSize: 14, padding: "12px 20px" }}>
                    {plan.cta}
                  </Link>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <div className="divider-line" />

      {/* ── Why Fixsense ── */}
      <section className="section" style={{ background: "rgba(255,255,255,0.01)" }}>
        <div className="container">
          <div className="why-layout">
            <FadeIn>
              <div className="tag-pill" style={{ marginBottom: 20, display: "inline-flex" }}>Why Fixsense</div>
              <h2 className="df" style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: "#fff", lineHeight: 1.15, marginBottom: 18 }}>
                A sales performance engine — not just a recorder
              </h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65, marginBottom: 28, maxWidth: 440 }}>
                Most tools just record calls. Fixsense turns every conversation into actionable intelligence that improves rep performance over time.
              </p>
              <Link to={user ? "/dashboard" : "/login"} className="btn-primary">
                {user ? "Go to Dashboard" : "Start Free Trial"} <ArrowRight style={{ width: 16, height: 16 }} />
              </Link>
            </FadeIn>
            <FadeIn delay={150}>
              <div className="why-grid">
                {whyPoints.map((p, i) => (
                  <div key={i} className="why-card card-glass">
                    <div className="why-icon">{p.icon}</div>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 5 }}>{p.title}</h4>
                      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.55, margin: 0 }}>{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      <div className="divider-line" />

      {/* ── Final CTA ── */}
      <div className="final-cta">
        <div className="final-cta-inner">
          <FadeIn>
            <div className="tag-pill" style={{ display: "inline-flex", marginBottom: 16 }}>
              {user ? "You're already here" : "Get started today"}
            </div>
            <h2 className="final-cta-title">
              {user ? <>Your dashboard<br />is ready</> : <>Start closing more<br />deals today</>}
            </h2>
            <p className="final-cta-sub">
              {user
                ? "Head to your dashboard to view calls, check analytics, or start a new live meeting right now."
                : "Join sales teams that have replaced guesswork with data. 5 free meetings per month — no credit card required."}
            </p>
            <div className="final-cta-btns">
              <Link to={user ? "/dashboard" : "/login"} className="btn-primary" style={{ fontSize: 15, padding: "14px 30px" }}>
                {user ? <><LayoutDashboard style={{ width: 18, height: 18 }} /> Open Dashboard</> : <>Start Free Trial <ArrowRight style={{ width: 18, height: 18 }} /></>}
              </Link>
              {user ? (
                <Link to="/dashboard/live" className="btn-ghost" style={{ fontSize: 15, padding: "14px 30px" }}>
                  Start a Live Call <ArrowRight style={{ width: 18, height: 18 }} />
                </Link>
              ) : (
                <a href="#how-it-works" className="btn-ghost" style={{ fontSize: 15, padding: "14px 30px" }}>
                  See How It Works
                </a>
              )}
            </div>
          </FadeIn>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="container">
          <div className="footer-grid">
            {/* Brand with LOGO */}
            <div className="footer-brand">
              <Link to="/" className="lp-logo" style={{ marginBottom: 14, display: "inline-flex" }}>
                <FixsenseLogo size={28} borderRadius={7} />
                <span className="lp-logo-text">Fixsense</span>
              </Link>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", lineHeight: 1.6, maxWidth: 220, marginBottom: 16 }}>
                AI-powered sales call intelligence for modern sales teams.
              </p>
              <div className="social-row">
                {[{ icon: "𝕏", label: "X / Twitter" }, { icon: "in", label: "LinkedIn" }, { icon: "✉", label: "Email" }].map((s, i) => (
                  <a key={i} href="#" className="social-icon" aria-label={s.label}>{s.icon}</a>
                ))}
              </div>
            </div>

            {/* Product */}
            <div>
              <div className="footer-col-title">Product</div>
              {["Features", "Pricing", "How It Works", "Integrations"].map(l => (
                <a key={l} href="#" className="footer-link">{l}</a>
              ))}
            </div>

            {/* Company */}
            <div>
              <div className="footer-col-title">Company</div>
              {["About", "Blog", "Careers", "Contact"].map(l => (
                <a key={l} href="#" className="footer-link">{l}</a>
              ))}
            </div>

            {/* Account / Legal */}
            <div>
              <div className="footer-col-title">{user ? "Account" : "Legal"}</div>
              {user ? (
                <>
                  <Link to="/dashboard" className="footer-link accent">Dashboard</Link>
                  <Link to="/dashboard/billing" className="footer-link">Billing</Link>
                  <Link to="/dashboard/profile" className="footer-link">Profile</Link>
                  <Link to="/dashboard/settings" className="footer-link">Settings</Link>
                </>
              ) : (
                ["Privacy Policy", "Terms of Service", "Security", "GDPR"].map(l => (
                  <a key={l} href="#" className="footer-link">{l}</a>
                ))
              )}
            </div>
          </div>

          <div className="footer-bottom">
            <p className="footer-copy">© {new Date().getFullYear()} Fixsense. All rights reserved.</p>
            {user ? (
              <div className="footer-signed-in">
                <div className="footer-signed-in-av">{emailInitial}</div>
                <span>Signed in as {displayName}</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Clock style={{ width: 13, height: 13, color: "rgba(255,255,255,0.2)" }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>Response time under 10 seconds</span>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
