import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

// ─── Intersection Observer Hook ──────────────────────────────────────────────
function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function FadeIn({ children, delay = 0, className = "" }: {
  children: React.ReactNode; delay?: number; className?: string;
}) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className={className} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? "translateY(0)" : "translateY(24px)",
      transition: `opacity 0.65s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.65s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

function Counter({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [n, setN] = useState(0);
  const { ref, inView } = useInView(0.5);
  useEffect(() => {
    if (!inView) return;
    let startTime: number;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const p = Math.min((ts - startTime) / 1800, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.floor(eased * end));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, end]);
  return <span ref={ref}>{n}{suffix}</span>;
}

function Logo({ size = 30 }: { size?: number }) {
  return (
    <img
      src="/fixsense_icon_logo (2).png"
      alt="Fixsense"
      width={size} height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), objectFit: "cover", display: "block", flexShrink: 0 }}
    />
  );
}

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="8" cy="8" r="8" fill="rgba(37,99,235,0.1)" />
    <path d="M5 8l2 2 4-4" stroke="#2563EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── Scenario Data ────────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: "discovery",
    icon: "🔍",
    name: "Discovery Call",
    desc: "Qualify a new prospect",
    prospect: "Acme Corp",
    script: [
      { speaker: "Rep", text: "Hi Sarah, thanks for jumping on. I'd love to understand your current sales process.", color: "#60a5fa" },
      { speaker: "Sarah", text: "Of course. Right now we're mostly doing manual tracking in spreadsheets. It's really painful.", color: "#a78bfa" },
      { speaker: "Rep", text: "How many reps are on your team and how many calls do you run per week?", color: "#60a5fa" },
      { speaker: "Sarah", text: "We have 12 reps, about 80–100 calls a week. We have zero visibility into what happens on those calls.", color: "#a78bfa" },
      { speaker: "Rep", text: "That's a real gap. What does your current coaching process look like?", color: "#60a5fa" },
      { speaker: "Sarah", text: "Honestly? It's gut feel. Managers sit on a few calls and hope they catch something useful.", color: "#a78bfa" },
      { speaker: "Rep", text: "Fixsense gives you analytics on every call automatically. What's your timeline for solving this?", color: "#60a5fa" },
      { speaker: "Sarah", text: "We have Q2 budget for tools like this. Maybe $5–8k range. What does pricing look like?", color: "#a78bfa" },
    ],
    insights: [
      { delay: 3, label: "✓ Buying Signal", body: "Prospect confirmed Q2 budget. High intent — move to pricing conversation.", bg: "rgba(16,185,129,.07)", border: "rgba(16,185,129,.25)", color: "#34d399" },
      { delay: 6, label: "⚡ Pain Confirmed", body: "No visibility into calls = clear need for Fixsense. Strong qualification signal.", bg: "rgba(245,158,11,.08)", border: "rgba(245,158,11,.25)", color: "#fbbf24" },
      { delay: 9, label: "→ Suggested Action", body: "Prospect asked about pricing directly. Present the Growth plan now.", bg: "rgba(99,102,241,.08)", border: "rgba(99,102,241,.25)", color: "#a5b4fc" },
    ],
    stats: [
      { label: "Engagement", vals: ["—", "61%", "74%", "88%"], colors: ["#475569", "#f59e0b", "#10b981", "#10b981"] },
      { label: "Talk ratio", vals: ["—", "70:30", "58:42", "48:52"], colors: ["#475569", "#f87171", "#fbbf24", "#10b981"] },
      { label: "Sentiment", vals: ["—", "Neutral", "Positive", "Positive"], colors: ["#475569", "#94a3b8", "#10b981", "#10b981"] },
      { label: "Objections", vals: ["—", "0 flagged", "1 flagged", "1 handled"], colors: ["#475569", "#475569", "#f87171", "#10b981"] },
    ],
    summary: {
      score: "91", sentiment: "Strong", ratio: "48:52",
      actions: [
        "Send pricing deck — prospect asked about Growth plan",
        "Follow up Friday with Q2 timeline proposal",
        "Add to Salesforce — BANT qualified, decision Q2",
        "Share case study: 12-rep team saw 30% lift in 90 days",
      ],
    },
  },
  {
    id: "objection",
    icon: "🛡",
    name: "Objection Handling",
    desc: "Win back a skeptical buyer",
    prospect: "Meridian SaaS",
    script: [
      { speaker: "Rep", text: "Thanks for making time, James. How are things going with your current recording tool?", color: "#60a5fa" },
      { speaker: "James", text: "Honestly, we already tried one. The team hated it. Too much noise, not enough signal.", color: "#f87171" },
      { speaker: "Rep", text: "I hear that a lot. What specifically felt noisy — the transcripts, the alerts, something else?", color: "#60a5fa" },
      { speaker: "James", text: "Everything. Reps got pinged constantly. It distracted them during calls. We turned it off after 3 weeks.", color: "#f87171" },
      { speaker: "Rep", text: "Fixsense runs silent during calls. Insights surface after, not during — unless you opt in to live mode.", color: "#60a5fa" },
      { speaker: "James", text: "That's... actually interesting. How do your AI summaries compare to what we were getting?", color: "#f87171" },
      { speaker: "Rep", text: "Here's a real example from a team your size — clean, structured, CRM-ready in one click.", color: "#60a5fa" },
      { speaker: "James", text: "That's way cleaner. What's the setup time? Last tool took us two weeks to configure.", color: "#f87171" },
    ],
    insights: [
      { delay: 3, label: "⚡ Objection: Bad past experience", body: "Prospect tried a competitor. Don't defend — probe exactly what failed.", bg: "rgba(239,68,68,.08)", border: "rgba(239,68,68,.25)", color: "#f87171" },
      { delay: 6, label: "✓ Turning Point", body: "Prospect said 'actually interesting' — sentiment shifted. Momentum is yours.", bg: "rgba(16,185,129,.07)", border: "rgba(16,185,129,.25)", color: "#34d399" },
      { delay: 9, label: "→ Suggested Action", body: "Setup time is a closing opportunity. Lead with '5 minutes' and offer a demo.", bg: "rgba(99,102,241,.08)", border: "rgba(99,102,241,.25)", color: "#a5b4fc" },
    ],
    stats: [
      { label: "Engagement", vals: ["—", "45%", "67%", "86%"], colors: ["#475569", "#f87171", "#fbbf24", "#10b981"] },
      { label: "Talk ratio", vals: ["—", "40:60", "48:52", "54:46"], colors: ["#475569", "#f87171", "#10b981", "#10b981"] },
      { label: "Sentiment", vals: ["—", "Negative", "Neutral", "Positive"], colors: ["#475569", "#f87171", "#94a3b8", "#10b981"] },
      { label: "Objections", vals: ["—", "2 flagged", "2 flagged", "2 handled"], colors: ["#475569", "#f87171", "#f87171", "#10b981"] },
    ],
    summary: {
      score: "84", sentiment: "Recovered", ratio: "54:46",
      actions: [
        "Book live demo — prospect asked about setup time",
        "Send '5-minute setup' walkthrough video before demo",
        "Log objection: 'previous tool too noisy' in CRM notes",
        "Highlight silent-mode feature prominently in follow-up",
      ],
    },
  },
  {
    id: "closing",
    icon: "🤝",
    name: "Closing Call",
    desc: "Push a warm deal over the line",
    prospect: "Cloudpath",
    script: [
      { speaker: "Rep", text: "Priya, you've seen the demo and pilot results. Where are you at on moving forward?", color: "#60a5fa" },
      { speaker: "Priya", text: "We love the product. The sticking point is SSO — and our legal team needs a DPA before sign-off.", color: "#f0a500" },
      { speaker: "Rep", text: "SSO is included on Growth and above. The DPA we can turn around in 48 hours. Does that unblock you?", color: "#60a5fa" },
      { speaker: "Priya", text: "Pretty much. What's the best you can do on annual pricing? We're committing to the full team of 22.", color: "#f0a500" },
      { speaker: "Rep", text: "For 22 seats on annual, I can give you 15% off and a dedicated CSM at no extra cost.", color: "#60a5fa" },
      { speaker: "Priya", text: "That's fair. I think we can do that. I'll need it signed before end of quarter — that's Friday.", color: "#f0a500" },
      { speaker: "Rep", text: "I'll have the order form to you within the hour. Do you need legal cc'd on everything?", color: "#60a5fa" },
      { speaker: "Priya", text: "Yes, copy james@cloudpath.io. We're good to go. Let's do this.", color: "#f0a500" },
    ],
    insights: [
      { delay: 3, label: "⚡ Blocker: SSO + DPA", body: "Legal and technical blockers raised. Both are solvable — address each directly.", bg: "rgba(245,158,11,.08)", border: "rgba(245,158,11,.25)", color: "#fbbf24" },
      { delay: 6, label: "✓ Strong Buying Signal", body: "Prospect asked for annual discount — they're committed. This is a closing, not a stall.", bg: "rgba(16,185,129,.07)", border: "rgba(16,185,129,.25)", color: "#34d399" },
      { delay: 9, label: "🏆 Deal Closed", body: "Prospect confirmed. Send order form immediately — hard deadline is Friday EOD.", bg: "rgba(99,102,241,.1)", border: "rgba(99,102,241,.3)", color: "#c4b5fd" },
    ],
    stats: [
      { label: "Engagement", vals: ["—", "80%", "89%", "97%"], colors: ["#475569", "#10b981", "#10b981", "#10b981"] },
      { label: "Talk ratio", vals: ["—", "52:48", "50:50", "48:52"], colors: ["#475569", "#10b981", "#10b981", "#10b981"] },
      { label: "Sentiment", vals: ["—", "Positive", "Positive", "Very pos."], colors: ["#475569", "#10b981", "#10b981", "#34d399"] },
      { label: "Objections", vals: ["—", "2 flagged", "2 handled", "0 open"], colors: ["#475569", "#f87171", "#10b981", "#34d399"] },
    ],
    summary: {
      score: "98", sentiment: "Closed Won", ratio: "48:52",
      actions: [
        "Send order form within the next 60 minutes — deadline Friday",
        "CC james@cloudpath.io on all contract and legal docs",
        "Kick off dedicated CSM onboarding within 48 hours",
        "Generate and send DPA to Priya today",
      ],
    },
  },
  {
    id: "demo",
    icon: "💻",
    name: "Product Demo",
    desc: "Show the product, handle questions",
    prospect: "Launchflow",
    script: [
      { speaker: "Rep", text: "I'll share my screen now. This is the live call view — everything here happens in real time.", color: "#60a5fa" },
      { speaker: "Alex", text: "Oh interesting. So I'd see this dashboard while I'm on a call with a prospect?", color: "#4ade80" },
      { speaker: "Rep", text: "Exactly. The transcript streams live and the AI flags objections and signals as they happen.", color: "#60a5fa" },
      { speaker: "Alex", text: "Does it work with Zoom? We're fully remote and our whole team lives on Zoom.", color: "#4ade80" },
      { speaker: "Rep", text: "Yes — Zoom, Meet, and Teams. It joins as a bot, you approve it once, no plugins needed.", color: "#60a5fa" },
      { speaker: "Alex", text: "What does the CRM sync look like? We use HubSpot for everything.", color: "#4ade80" },
      { speaker: "Rep", text: "After every call, Fixsense creates a HubSpot activity with the summary, action items, and call score.", color: "#60a5fa" },
      { speaker: "Alex", text: "That alone would save my reps an hour a day. How quickly can we actually get started?", color: "#4ade80" },
    ],
    insights: [
      { delay: 3, label: "✓ Buying Signal", body: "Prospect asking integration questions — mental model shifted to implementation.", bg: "rgba(16,185,129,.07)", border: "rgba(16,185,129,.25)", color: "#34d399" },
      { delay: 6, label: "⚡ Watch: Zoom dependency", body: "Prospect is Zoom-only. Confirm bot approval flow is seamless to prevent friction.", bg: "rgba(245,158,11,.08)", border: "rgba(245,158,11,.25)", color: "#fbbf24" },
      { delay: 9, label: "→ Suggested Action", body: "'How quickly can we start?' is a closing question. Offer same-day trial activation.", bg: "rgba(99,102,241,.08)", border: "rgba(99,102,241,.25)", color: "#a5b4fc" },
    ],
    stats: [
      { label: "Engagement", vals: ["—", "70%", "82%", "93%"], colors: ["#475569", "#10b981", "#10b981", "#10b981"] },
      { label: "Talk ratio", vals: ["—", "65:35", "56:44", "50:50"], colors: ["#475569", "#f87171", "#fbbf24", "#10b981"] },
      { label: "Sentiment", vals: ["—", "Neutral", "Positive", "Strong"], colors: ["#475569", "#94a3b8", "#10b981", "#34d399"] },
      { label: "Objections", vals: ["—", "0 flagged", "1 flagged", "1 handled"], colors: ["#475569", "#475569", "#f87171", "#10b981"] },
    ],
    summary: {
      score: "94", sentiment: "High Intent", ratio: "50:50",
      actions: [
        "Offer same-day trial activation — prospect asked how to start",
        "Send HubSpot integration walkthrough video link",
        "Confirm Zoom bot single-approval flow is friction-free",
        "Follow up Monday if trial not activated by end of day",
      ],
    },
  },
];

// ─── Live Call Simulator ──────────────────────────────────────────────────────
type Scenario = typeof SCENARIOS[0];
type CallPhase = "setup" | "live" | "summary";

function LiveCallSimulator() {
  const [phase, setPhase] = useState<CallPhase>("setup");
  const [selected, setSelected] = useState<Scenario | null>(null);
  const [lines, setLines] = useState<Scenario["script"]>([]);
  const [typing, setTyping] = useState<{ speaker: string; color: string } | null>(null);
  const [insights, setInsights] = useState<Scenario["insights"]>([]);
  const [statStep, setStatStep] = useState(0);
  const [secs, setSecs] = useState(0);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const lineIdxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lineToRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insightTosRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const statIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  function clearAll() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (lineToRef.current) clearTimeout(lineToRef.current);
    if (statIntervalRef.current) clearInterval(statIntervalRef.current);
    insightTosRef.current.forEach(clearTimeout);
    insightTosRef.current = [];
  }

  function startCall() {
    if (!selected) return;
    setPhase("live");
    setLines([]);
    setTyping(null);
    setInsights([]);
    setStatStep(0);
    setSecs(0);
    lineIdxRef.current = 0;
  }

  useEffect(() => {
    if (phase !== "live" || !selected) return;
    timerRef.current = setInterval(() => setSecs(s => s + 1), 1000);
    let step = 0;
    statIntervalRef.current = setInterval(() => {
      step++;
      if (step < 4) setStatStep(step);
      else if (statIntervalRef.current) clearInterval(statIntervalRef.current);
    }, 7000);
    selected.insights.forEach(ins => {
      const t = setTimeout(() => setInsights(prev => [...prev, ins]), ins.delay * 1000);
      insightTosRef.current.push(t);
    });
    scheduleNextLine(selected);
    return () => clearAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selected]);

  function scheduleNextLine(sc: Scenario) {
    const idx = lineIdxRef.current;
    if (idx >= sc.script.length) return;
    const line = sc.script[idx];
    lineToRef.current = setTimeout(() => {
      setTyping({ speaker: line.speaker, color: line.color });
      lineToRef.current = setTimeout(() => {
        setTyping(null);
        setLines(prev => [...prev, line]);
        lineIdxRef.current = idx + 1;
        scheduleNextLine(sc);
      }, 1400 + Math.random() * 500);
    }, 1200 + Math.random() * 600);
  }

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [lines, typing]);

  function endCall() {
    clearAll();
    setPhase("summary");
  }

  function reset() {
    clearAll();
    setSelected(null);
    setPhase("setup");
    setLines([]);
    setTyping(null);
    setInsights([]);
    setStatStep(0);
    setSecs(0);
    lineIdxRef.current = 0;
  }

  return (
    <div className="sim-root">
      <div className="sim-bar">
        <div className="sim-dot" style={{ background: "#ff5f57" }} />
        <div className="sim-dot" style={{ background: "#febc2e" }} />
        <div className="sim-dot" style={{ background: "#28c840" }} />
        <div className="sim-addr">fixsense.com.ng/dashboard/live</div>
      </div>
      <div className="sim-app">
        <div className="sim-sidebar">
          <div className="sim-s-logo">
            <div className="sim-s-mark">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5.5" stroke="white" strokeWidth="1.5" />
                <path d="M4 6.5l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="sim-s-name">Fixsense</span>
          </div>
          {(["Dashboard", "Live Call", "All Calls", "AI Coach", "Team"] as const).map(label => (
            <div key={label} className={`sim-nav-item ${label === "Live Call" ? "sim-nav-active" : ""}`}>
              <div className="sim-nav-dot" />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="sim-main">
          {phase === "setup" && (
            <div className="sim-setup">
              <div className="sim-setup-title">Try a live mock call</div>
              <div className="sim-setup-sub">Pick a scenario to see how Fixsense analyzes your sales conversation in real time.</div>
              <div className="sim-scenario-grid">
                {SCENARIOS.map(s => (
                  <button
                    key={s.id}
                    className={`sim-scenario-btn ${selected?.id === s.id ? "sim-scenario-selected" : ""}`}
                    onClick={() => setSelected(s)}
                  >
                    <span className="sim-scenario-icon">{s.icon}</span>
                    <span className="sim-scenario-name">{s.name}</span>
                    <span className="sim-scenario-desc">{s.desc}</span>
                  </button>
                ))}
              </div>
              <button className="sim-start-btn" disabled={!selected} onClick={startCall}>
                {selected ? `Start: ${selected.name} →` : "Choose a scenario above"}
              </button>
            </div>
          )}

          {phase === "live" && selected && (
            <>
              <div className="sim-live-header">
                <div className="sim-live-badge"><div className="sim-pulse" />LIVE</div>
                <span className="sim-call-name">{selected.name} — {selected.prospect}</span>
                <span className="sim-timer">{fmt(secs)}</span>
                <button className="sim-end-btn" onClick={endCall}>End call</button>
              </div>
              <div className="sim-stats">
                {selected.stats.map((s, i) => (
                  <div key={i} className="sim-stat">
                    <div className="sim-stat-label">{s.label}</div>
                    <div className="sim-stat-val" style={{ color: s.colors[statStep] }}>{s.vals[statStep]}</div>
                  </div>
                ))}
              </div>
              <div className="sim-content-row">
                <div className="sim-transcript">
                  <div className="sim-panel-label">Live transcript</div>
                  <div className="sim-lines" ref={transcriptRef}>
                    {lines.map((ln, i) => (
                      <div key={i} className="sim-line sim-line-in">
                        <div className="sim-speaker" style={{ color: ln.color }}>{ln.speaker}</div>
                        <div className="sim-text">{ln.text}</div>
                      </div>
                    ))}
                    {typing && (
                      <div className="sim-line sim-line-in">
                        <div className="sim-speaker" style={{ color: typing.color }}>{typing.speaker}</div>
                        <div className="sim-text">
                          <span className="sim-tdot" />
                          <span className="sim-tdot" style={{ animationDelay: "0.2s" }} />
                          <span className="sim-tdot" style={{ animationDelay: "0.4s" }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="sim-insights">
                  <div className="sim-panel-label">AI insights</div>
                  <div className="sim-insights-list">
                    {insights.length === 0 && (
                      <div className="sim-insights-empty">
                        <div className="sim-insights-empty-dot" />
                        <div className="sim-insights-empty-dot" style={{ animationDelay: "0.3s" }} />
                        <div className="sim-insights-empty-dot" style={{ animationDelay: "0.6s" }} />
                        <span>Listening for signals...</span>
                      </div>
                    )}
                    {insights.map((ins, i) => (
                      <div key={i} className="sim-insight sim-line-in" style={{ background: ins.bg, border: `1px solid ${ins.border}` }}>
                        <div className="sim-insight-tag" style={{ color: ins.color }}>{ins.label}</div>
                        <div className="sim-insight-body">{ins.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {phase === "summary" && selected && (
            <div className="sim-summary sim-line-in">
              <div>
                <div className="sim-summary-title">AI Call Summary</div>
                <div className="sim-summary-meta">{selected.name} · {selected.prospect} · {fmt(secs)}</div>
              </div>
              <div className="sim-summary-stats">
                <div className="sim-sum-card">
                  <div className="sim-sum-label">Call score</div>
                  <div className="sim-sum-val" style={{ color: "#10b981" }}>{selected.summary.score}<span className="sim-sum-suffix">/100</span></div>
                </div>
                <div className="sim-sum-card">
                  <div className="sim-sum-label">Sentiment</div>
                  <div className="sim-sum-val" style={{ color: "#34d399", fontSize: 15 }}>{selected.summary.sentiment}</div>
                </div>
                <div className="sim-sum-card">
                  <div className="sim-sum-label">Talk ratio</div>
                  <div className="sim-sum-val" style={{ color: "#93c5fd", fontSize: 15 }}>{selected.summary.ratio}</div>
                </div>
              </div>
              <div className="sim-sum-section-label">Action items</div>
              <div className="sim-actions">
                {selected.summary.actions.map((a, i) => (
                  <div key={i} className="sim-action">
                    <div className="sim-action-check">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4l1.5 1.5 3.5-3" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    {a}
                  </div>
                ))}
              </div>
              <button className="sim-reset-btn" onClick={reset}>Try another scenario →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function LandingPage() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || null;
  const emailInitial = displayName?.[0]?.toUpperCase() || "U";

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const NAV = [
    { label: "Product", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "/pricing" },
    { label: "Testimonials", href: "#testimonials" },
  ];

  const PROBLEMS = [
    { icon: "📋", text: "Sales reps forget key details after calls" },
    { icon: "👁", text: "Managers can't review every meeting" },
    { icon: "❓", text: "Teams don't know why deals are lost" },
  ];

  const FEATURES = [
    { icon: "🎙", title: "Real-Time Transcription", desc: "Every word captured with 99% accuracy. Auto speaker identification, no setup required." },
    { icon: "🤖", title: "AI Meeting Summaries", desc: "Actionable summaries delivered before your next call. CRM-ready in one click." },
    { icon: "⚡", title: "Objection Detection", desc: "Surface objections and buying signals the moment they happen — not a day later." },
    { icon: "📊", title: "Engagement Scoring", desc: "Know exactly how engaged your prospect is, in real time, during every call." },
    { icon: "👥", title: "Team Analytics Dashboard", desc: "Give managers full visibility across the team without sitting on every call." },
    { icon: "🎯", title: "Sales Coaching Insights", desc: "Track talk ratio, question quality, and objection handling for every rep." },
  ];

  const STEPS = [
    { num: "01", title: "Connect your meetings", desc: "Link Zoom or Google Meet in seconds. Fixsense joins as a silent observer the moment your call begins.", active: true },
    { num: "02", title: "AI analyzes every conversation", desc: "Transcription, objection detection, talk ratio, and sentiment analysis happen automatically while you sell.", active: false },
    { num: "03", title: "Improve and close more deals", desc: "Receive coaching insights, full summaries, and action steps after every meeting.", active: false },
  ];

  const TESTIMONIALS = [
    { quote: "Fixsense helped our team increase close rates by 30%. We finally understand what's happening in our sales calls.", name: "Sarah Mitchell", role: "Head of Sales", company: "Vantex Technologies", initials: "SM", metric: "+30% close rate" },
    { quote: "Before Fixsense, we guessed. Now we have data on every call. The objection detection alone changed how we train reps.", name: "James Okafor", role: "Startup Founder", company: "Launchflow", initials: "JO", metric: "3x faster ramp time" },
    { quote: "We replaced our entire call review process with Fixsense. Every manager has full visibility without listening to recordings.", name: "Priya Nair", role: "Chief Revenue Officer", company: "Cloudpath", initials: "PN", metric: "90→45 day ramp" },
  ];

  const PLANS = [
    { name: "Free", price: "$0", period: "/month", desc: "Try Fixsense risk-free", features: ["5 meetings/month", "Basic analytics", "Zoom integration", "Email support"], highlight: false, cta: "Get Started Free" },
    { name: "Starter", price: "$19", period: "/month", desc: "For individual reps", features: ["50 meetings/month", "AI summaries", "All integrations", "3 team members"], highlight: false, cta: "Start Free Trial" },
    { name: "Growth", price: "$49", period: "/month", desc: "Best for growing teams", features: ["300 meetings/month", "Team analytics", "Coaching insights", "10 team members", "Priority support"], highlight: true, cta: "Start Free Trial" },
    { name: "Scale", price: "$99", period: "/month", desc: "Enterprise sales orgs", features: ["Unlimited meetings", "Advanced analytics", "API access", "Unlimited members", "Dedicated CSM"], highlight: false, cta: "Contact Sales" },
  ];

  const WHY = [
    "No manual note-taking ever again",
    "Real-time insights during live calls",
    "Coaching built into your workflow",
    "Works with Zoom, Meet, Salesforce, HubSpot & Slack",
    "SOC 2 Type II certified",
    "Up and running in under 5 minutes",
  ];

  const METRICS = [
    { value: 30, suffix: "%", label: "Average increase in close rate" },
    { value: 10, suffix: "k+", label: "Sales meetings analyzed" },
    { value: 50, suffix: "%", label: "Reduction in rep ramp time" },
    { value: 99, suffix: "%", label: "Transcription accuracy" },
  ];

  return (
    <div className="lp">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .lp {
          --bg: #ffffff; --bg-2: #f8fafc; --bg-3: #f1f5f9;
          --ink: #0f172a; --ink-2: #1e293b;
          --muted: #64748b; --muted-2: #94a3b8;
          --border: #e2e8f0;
          --blue: #2563eb; --blue-2: #1d4ed8;
          --blue-light: rgba(37,99,235,0.08); --blue-glow: rgba(37,99,235,0.2);
          --green: #10b981;
          --font: 'Plus Jakarta Sans', sans-serif;
          --font-display: 'Bricolage Grotesque', sans-serif;
          background: var(--bg); color: var(--ink); font-family: var(--font);
          -webkit-font-smoothing: antialiased; overflow-x: hidden; line-height: 1.6;
        }
        .nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: 64px; display: flex; align-items: center; padding: 0 24px; transition: all 0.3s ease; border-bottom: 1px solid transparent; }
        .nav.scrolled { background: rgba(255,255,255,0.95); backdrop-filter: blur(20px); border-bottom-color: var(--border); box-shadow: 0 1px 16px rgba(15,23,42,0.06); }
        .nav-inner { max-width: 1160px; width: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
        .nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .nav-logo-text { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); letter-spacing: -0.03em; }
        .nav-links { display: flex; align-items: center; gap: 28px; }
        .nav-link { font-size: 14px; font-weight: 500; color: var(--muted); text-decoration: none; transition: color 0.2s; }
        .nav-link:hover { color: var(--ink); }
        .nav-actions { display: flex; align-items: center; gap: 10px; }
        .btn-ghost { font-size: 13.5px; font-weight: 500; color: var(--ink); background: none; border: none; cursor: pointer; padding: 8px 16px; border-radius: 8px; font-family: var(--font); text-decoration: none; transition: background 0.15s; }
        .btn-ghost:hover { background: var(--bg-3); }
        .btn-nav-primary { font-size: 13.5px; font-weight: 600; color: #fff; background: var(--blue); border: none; cursor: pointer; padding: 8px 20px; border-radius: 8px; font-family: var(--font); text-decoration: none; transition: background 0.15s, transform 0.15s; }
        .btn-nav-primary:hover { background: var(--blue-2); transform: translateY(-1px); }
        .nav-user { display: flex; align-items: center; gap: 8px; background: var(--bg-3); border-radius: 100px; padding: 5px 14px 5px 5px; text-decoration: none; }
        .nav-user-av { width: 28px; height: 28px; border-radius: 50%; background: var(--blue); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; }
        .nav-user-name { font-size: 13px; font-weight: 600; color: var(--ink); }
        .hamburger { display: none; background: none; border: none; cursor: pointer; color: var(--ink); padding: 6px; }
        .drawer-overlay { display: none; position: fixed; inset: 0; z-index: 200; background: rgba(15,23,42,0.5); backdrop-filter: blur(4px); }
        .drawer-overlay.open { display: block; }
        .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(320px,90vw); z-index: 210; background: #fff; display: flex; flex-direction: column; transform: translateX(100%); transition: transform 0.28s cubic-bezier(0.4,0,0.2,1); box-shadow: -20px 0 60px rgba(15,23,42,0.15); }
        .drawer.open { transform: translateX(0); }
        .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--border); }
        .drawer-close { background: var(--bg-3); border: none; cursor: pointer; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--ink); }
        .drawer-nav { padding: 12px 16px; flex: 1; }
        .drawer-link { display: block; padding: 13px 8px; font-size: 15px; font-weight: 500; color: var(--ink); text-decoration: none; border-radius: 8px; transition: background 0.15s; }
        .drawer-link:hover { background: var(--bg-3); }
        .drawer-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
        .btn-full { width: 100%; padding: 13px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: var(--font); text-align: center; text-decoration: none; display: block; }
        .btn-full-primary { background: var(--blue); color: #fff; border: none; }
        .btn-full-secondary { background: var(--bg-3); color: var(--ink); border: none; }
        .hero { padding: 140px 24px 80px; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; overflow: hidden; background: linear-gradient(180deg, #f0f6ff 0%, #ffffff 60%); }
        .hero-pattern { position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(circle, #d1defe 1px, transparent 1px); background-size: 32px 32px; mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 100%); opacity: 0.5; }
        .hero-badge { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--border); border-radius: 100px; padding: 6px 16px 6px 8px; font-size: 12.5px; font-weight: 600; color: var(--muted); margin-bottom: 24px; box-shadow: 0 1px 8px rgba(15,23,42,0.06); }
        .hero-badge-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px rgba(16,185,129,0.2); }
        .hero-title { position: relative; z-index: 1; font-family: var(--font-display); font-size: clamp(34px,6vw,66px); font-weight: 800; line-height: 1.05; letter-spacing: -0.04em; color: var(--ink); max-width: 800px; margin-bottom: 20px; }
        .hero-title .blue { color: var(--blue); }
        .hero-sub { position: relative; z-index: 1; font-size: clamp(15px,2vw,18px); color: var(--muted); line-height: 1.7; max-width: 540px; margin-bottom: 36px; }
        .hero-ctas { position: relative; z-index: 1; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 40px; }
        .btn-hero-primary { display: inline-flex; align-items: center; gap: 8px; background: var(--blue); color: #fff; border: none; border-radius: 10px; padding: 14px 28px; font-size: 15px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; box-shadow: 0 4px 16px var(--blue-glow); }
        .btn-hero-primary:hover { background: var(--blue-2); transform: translateY(-2px); box-shadow: 0 8px 24px var(--blue-glow); }
        .btn-hero-secondary { display: inline-flex; align-items: center; gap: 8px; background: #fff; color: var(--ink); border: 1.5px solid var(--border); border-radius: 10px; padding: 14px 28px; font-size: 15px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; }
        .btn-hero-secondary:hover { border-color: var(--muted-2); transform: translateY(-2px); }
        .hero-trust { position: relative; z-index: 1; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; justify-content: center; margin-bottom: 60px; }
        .hero-trust-item { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--muted); font-weight: 500; }
        .trust-sep { width: 4px; height: 4px; border-radius: 50%; background: var(--border); }
        .sim-wrapper { position: relative; z-index: 1; width: 100%; max-width: 960px; margin: 0 auto; }
        .sim-label { font-size: 11.5px; font-weight: 700; color: var(--blue); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; justify-content: center; }
        .sim-label-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: simpulse 2s ease-in-out infinite; }
        @keyframes simpulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .sim-root { border-radius: 14px; overflow: hidden; border: 1px solid var(--border); box-shadow: 0 32px 80px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.04); }
        .sim-bar { height: 40px; background: #1e293b; display: flex; align-items: center; gap: 7px; padding: 0 16px; }
        .sim-dot { width: 11px; height: 11px; border-radius: 50%; }
        .sim-addr { flex: 1; max-width: 240px; margin: 0 auto; background: rgba(255,255,255,0.06); border-radius: 5px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: rgba(255,255,255,0.3); font-family: monospace; }
        .sim-app { background: #0f172a; display: grid; grid-template-columns: 180px 1fr; min-height: 440px; }
        .sim-sidebar { background: #1e293b; border-right: 1px solid rgba(255,255,255,0.06); padding: 18px 12px; }
        .sim-s-logo { display: flex; align-items: center; gap: 8px; margin-bottom: 22px; }
        .sim-s-mark { width: 26px; height: 26px; border-radius: 7px; background: var(--blue); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .sim-s-name { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.85); }
        .sim-nav-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 7px; margin-bottom: 2px; font-size: 11.5px; color: rgba(255,255,255,0.35); }
        .sim-nav-active { background: rgba(37,99,235,0.15); color: #93c5fd; }
        .sim-nav-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
        .sim-main { padding: 20px; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
        .sim-setup { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 16px 10px; text-align: center; }
        .sim-setup-title { font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.85); }
        .sim-setup-sub { font-size: 12px; color: rgba(255,255,255,0.4); line-height: 1.6; max-width: 340px; }
        .sim-scenario-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; max-width: 400px; }
        .sim-scenario-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px 12px; cursor: pointer; text-align: left; transition: all 0.2s; color: inherit; font-family: var(--font); }
        .sim-scenario-btn:hover { background: rgba(37,99,235,0.1); border-color: rgba(37,99,235,0.3); }
        .sim-scenario-selected { background: rgba(37,99,235,0.15) !important; border-color: #2563eb !important; }
        .sim-scenario-icon { font-size: 18px; display: block; margin-bottom: 6px; }
        .sim-scenario-name { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.8); display: block; }
        .sim-scenario-desc { font-size: 11px; color: rgba(255,255,255,0.4); display: block; margin-top: 3px; }
        .sim-start-btn { background: var(--blue); color: #fff; border: none; border-radius: 8px; padding: 11px 28px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font); transition: background 0.2s; }
        .sim-start-btn:hover:not(:disabled) { background: var(--blue-2); }
        .sim-start-btn:disabled { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.25); cursor: not-allowed; }
        .sim-live-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .sim-live-badge { display: flex; align-items: center; gap: 5px; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.2); border-radius: 20px; padding: 4px 10px; font-size: 10px; font-weight: 700; color: #f87171; font-family: monospace; }
        .sim-pulse { width: 6px; height: 6px; border-radius: 50%; background: #ef4444; animation: livepulse 1.4s ease-out infinite; }
        @keyframes livepulse { 0%{box-shadow:0 0 0 0 rgba(239,68,68,0.6)} 70%{box-shadow:0 0 0 6px rgba(239,68,68,0)} 100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} }
        .sim-call-name { font-size: 12.5px; font-weight: 500; color: rgba(255,255,255,0.8); }
        .sim-timer { font-size: 11px; color: rgba(255,255,255,0.3); margin-left: auto; font-family: monospace; }
        .sim-end-btn { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #f87171; border-radius: 6px; padding: 5px 12px; font-size: 11px; cursor: pointer; font-family: var(--font); transition: background 0.2s; }
        .sim-end-btn:hover { background: rgba(239,68,68,0.2); }
        .sim-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; }
        .sim-stat { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; padding: 10px; }
        .sim-stat-label { font-size: 9px; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
        .sim-stat-val { font-size: 14px; font-weight: 600; transition: color 0.6s; }
        .sim-content-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .sim-transcript { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; }
        .sim-panel-label { font-size: 9px; font-weight: 600; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; flex-shrink: 0; }
        .sim-lines { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; max-height: 185px; scrollbar-width: none; }
        .sim-lines::-webkit-scrollbar { display: none; }
        .sim-line { display: flex; gap: 7px; }
        .sim-line-in { animation: linefade 0.35s ease; }
        @keyframes linefade { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:none} }
        .sim-speaker { font-size: 9px; font-weight: 700; min-width: 34px; margin-top: 1px; flex-shrink: 0; }
        .sim-text { font-size: 10px; color: rgba(255,255,255,0.45); line-height: 1.55; }
        .sim-tdot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,0.3); animation: tdotblink 1s ease infinite; margin-right: 2px; }
        @keyframes tdotblink { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }
        .sim-insights { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; }
        .sim-insights-list { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; max-height: 200px; scrollbar-width: none; }
        .sim-insights-list::-webkit-scrollbar { display: none; }
        .sim-insight { border-radius: 6px; padding: 8px 10px; }
        .sim-insight-tag { font-size: 9px; font-weight: 700; margin-bottom: 3px; text-transform: uppercase; letter-spacing: .05em; }
        .sim-insight-body { font-size: 10px; color: rgba(255,255,255,0.4); line-height: 1.4; }
        .sim-insights-empty { display: flex; align-items: center; gap: 5px; padding: 8px 0; font-size: 10px; color: rgba(255,255,255,0.25); }
        .sim-insights-empty-dot { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.2); animation: tdotblink 1.2s ease infinite; }
        .sim-summary { display: flex; flex-direction: column; gap: 14px; }
        .sim-summary-title { font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.85); }
        .sim-summary-meta { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 3px; }
        .sim-summary-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
        .sim-sum-card { background: rgba(255,255,255,0.05); border-radius: 8px; padding: 12px; }
        .sim-sum-label { font-size: 9px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px; }
        .sim-sum-val { font-size: 22px; font-weight: 700; }
        .sim-sum-suffix { font-size: 12px; color: rgba(255,255,255,0.3); }
        .sim-sum-section-label { font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: .08em; }
        .sim-actions { display: flex; flex-direction: column; gap: 7px; }
        .sim-action { display: flex; align-items: flex-start; gap: 8px; font-size: 11px; color: rgba(255,255,255,0.55); line-height: 1.5; }
        .sim-action-check { width: 15px; height: 15px; border-radius: 50%; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
        .sim-reset-btn { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.55); border-radius: 7px; padding: 9px 18px; font-size: 12px; cursor: pointer; font-family: var(--font); transition: all 0.2s; align-self: flex-start; }
        .sim-reset-btn:hover { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.8); }
        .logo-strip { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 24px; background: var(--bg-2); }
        .logo-strip-inner { max-width: 960px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px; }
        .logo-strip-label { font-size: 11.5px; font-weight: 600; color: var(--muted-2); text-transform: uppercase; letter-spacing: 0.1em; white-space: nowrap; }
        .logo-strip-logos { display: flex; align-items: center; gap: 32px; flex-wrap: wrap; }
        .logo-name { font-family: var(--font-display); font-size: 14px; font-weight: 600; color: var(--muted-2); transition: color 0.2s; cursor: default; }
        .logo-name:hover { color: var(--ink-2); }
        .section-kicker { font-size: 12px; font-weight: 700; color: var(--blue); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; }
        .section-title { font-family: var(--font-display); font-size: clamp(28px,4vw,44px); font-weight: 800; color: var(--ink); letter-spacing: -0.04em; line-height: 1.1; margin-bottom: 16px; }
        .section-sub { font-size: 16px; color: var(--muted); line-height: 1.7; max-width: 520px; }
        .problem { padding: 100px 24px; background: var(--bg); }
        .problem-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
        .problem-list { display: flex; flex-direction: column; gap: 12px; margin-top: 28px; }
        .problem-item { display: flex; align-items: flex-start; gap: 14px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 14px 16px; }
        .problem-icon { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
        .problem-text { font-size: 14px; color: var(--ink-2); font-weight: 500; line-height: 1.5; }
        .solution-box { background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%); border: 1px solid #bfdbfe; border-radius: 16px; padding: 36px; }
        .solution-label { display: inline-block; background: var(--blue); color: #fff; border-radius: 6px; padding: 4px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 18px; }
        .solution-title { font-family: var(--font-display); font-size: 24px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 14px; }
        .solution-desc { font-size: 15px; color: var(--muted); line-height: 1.7; }
        .metrics { padding: 90px 24px; background: var(--ink); }
        .metrics-inner { max-width: 960px; margin: 0 auto; }
        .metrics-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: rgba(255,255,255,0.08); border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
        .metric-card { background: rgba(255,255,255,0.04); padding: 40px 28px; }
        .metric-num { font-family: var(--font-display); font-size: clamp(40px,5vw,56px); font-weight: 800; color: var(--blue); letter-spacing: -0.04em; line-height: 1; margin-bottom: 10px; }
        .metric-label { font-size: 13px; color: rgba(255,255,255,0.45); line-height: 1.5; }
        .how { padding: 100px 24px; background: var(--bg-2); }
        .how-inner { max-width: 1000px; margin: 0 auto; }
        .how-header { text-align: center; margin-bottom: 72px; }
        .how-header .section-sub { margin: 0 auto; }
        .how-steps { display: grid; grid-template-columns: repeat(3,1fr); gap: 40px; position: relative; }
        .how-connector { position: absolute; top: 32px; left: calc(33.3% + 20px); right: calc(33.3% + 20px); height: 1px; background: linear-gradient(90deg, var(--blue), rgba(37,99,235,0.2), var(--blue)); }
        .how-step-num { width: 64px; height: 64px; border-radius: 16px; background: #fff; border: 1.5px solid var(--border); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-size: 16px; font-weight: 800; color: var(--ink); margin-bottom: 24px; position: relative; z-index: 1; box-shadow: 0 4px 12px rgba(15,23,42,0.07); }
        .how-step-num.active { background: var(--blue); color: #fff; border-color: var(--blue); box-shadow: 0 6px 20px var(--blue-glow); }
        .how-step-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 10px; }
        .how-step-desc { font-size: 14px; color: var(--muted); line-height: 1.7; }
        .features { padding: 100px 24px; background: var(--bg); }
        .features-inner { max-width: 1100px; margin: 0 auto; }
        .features-header { margin-bottom: 64px; }
        .features-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .feature-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 14px; padding: 28px; transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s; }
        .feature-card:hover { border-color: #bfdbfe; box-shadow: 0 8px 32px rgba(37,99,235,0.08); transform: translateY(-2px); }
        .feature-icon { font-size: 28px; margin-bottom: 14px; }
        .feature-title { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; margin-bottom: 8px; }
        .feature-desc { font-size: 13.5px; color: var(--muted); line-height: 1.65; }
        .testimonials { padding: 100px 24px; background: var(--bg-2); }
        .testimonials-inner { max-width: 1100px; margin: 0 auto; }
        .testimonials-header { margin-bottom: 56px; }
        .testimonials-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; }
        .testimonial-card { background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 32px; display: flex; flex-direction: column; transition: box-shadow 0.2s, border-color 0.2s; }
        .testimonial-card:hover { border-color: #bfdbfe; box-shadow: 0 12px 40px rgba(37,99,235,0.1); }
        .testimonial-metric { display: inline-block; background: #eff6ff; color: var(--blue); border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; margin-bottom: 18px; }
        .testimonial-quote { font-size: 15px; color: var(--ink-2); line-height: 1.7; flex: 1; margin-bottom: 24px; }
        .testimonial-author { display: flex; align-items: center; gap: 12px; border-top: 1px solid var(--border); padding-top: 18px; }
        .testimonial-av { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--ink-2), var(--blue)); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .testimonial-name { font-size: 13.5px; font-weight: 700; color: var(--ink); }
        .testimonial-role { font-size: 12px; color: var(--muted); margin-top: 1px; }
        .why { padding: 100px 24px; background: var(--bg); }
        .why-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
        .why-list { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 28px; }
        .why-item { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: var(--ink-2); font-weight: 500; line-height: 1.5; }
        .why-visual { background: linear-gradient(135deg, var(--ink) 0%, var(--ink-2) 100%); border-radius: 20px; padding: 40px; position: relative; overflow: hidden; }
        .why-visual-blob { position: absolute; top: -40px; right: -40px; width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle, rgba(37,99,235,0.25) 0%, transparent 70%); pointer-events: none; }
        .why-stat { margin-bottom: 24px; }
        .why-stat-num { font-family: var(--font-display); font-size: 48px; font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1; }
        .why-stat-label { font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 4px; }
        .why-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 20px 0; }
        .why-tags { display: flex; flex-wrap: wrap; gap: 8px; }
        .why-tag { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); border-radius: 100px; padding: 5px 14px; font-size: 12px; color: rgba(255,255,255,0.6); }
        .pricing { padding: 100px 24px; background: var(--bg-2); }
        .pricing-inner { max-width: 1100px; margin: 0 auto; }
        .pricing-header { text-align: center; margin-bottom: 60px; }
        .pricing-header .section-sub { margin: 0 auto; }
        .pricing-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; align-items: start; }
        .pricing-card { background: #fff; border: 1.5px solid var(--border); border-radius: 16px; padding: 28px 24px; transition: box-shadow 0.2s; }
        .pricing-card.highlight { background: var(--ink); border-color: var(--ink); box-shadow: 0 20px 60px rgba(15,23,42,0.2); }
        .pricing-badge { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--blue); background: var(--blue-light); border-radius: 4px; padding: 3px 8px; margin-bottom: 14px; }
        .pricing-badge.dark { color: #93c5fd; background: rgba(37,99,235,0.15); }
        .pricing-name { font-family: var(--font-display); font-size: 20px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; margin-bottom: 4px; }
        .pricing-name.dark { color: #fff; }
        .pricing-desc { font-size: 13px; color: var(--muted); margin-bottom: 20px; }
        .pricing-desc.dark { color: rgba(255,255,255,0.45); }
        .pricing-price-row { display: flex; align-items: baseline; gap: 2px; margin-bottom: 20px; }
        .pricing-price { font-family: var(--font-display); font-size: 38px; font-weight: 800; color: var(--ink); letter-spacing: -0.04em; }
        .pricing-price.dark { color: #fff; }
        .pricing-period { font-size: 13px; color: var(--muted); }
        .pricing-period.dark { color: rgba(255,255,255,0.4); }
        .pricing-divider { height: 1px; background: var(--border); margin-bottom: 20px; }
        .pricing-divider.dark { background: rgba(255,255,255,0.08); }
        .pricing-list { list-style: none; display: flex; flex-direction: column; gap: 9px; margin-bottom: 24px; }
        .pricing-feat { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; color: var(--ink-2); }
        .pricing-feat.dark { color: rgba(255,255,255,0.7); }
        .btn-plan { display: block; width: 100%; text-align: center; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; border: 1.5px solid; }
        .btn-plan-light { background: var(--bg-2); color: var(--ink); border-color: var(--border); }
        .btn-plan-light:hover { background: var(--bg-3); }
        .btn-plan-dark { background: var(--blue); color: #fff; border-color: var(--blue); box-shadow: 0 4px 12px var(--blue-glow); }
        .btn-plan-dark:hover { background: var(--blue-2); transform: translateY(-1px); }
        .final-cta { padding: 120px 24px; background: var(--ink); text-align: center; position: relative; overflow: hidden; }
        .final-cta-glow { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 70% 70% at 50% 50%, rgba(37,99,235,0.12) 0%, transparent 65%); }
        .final-cta-inner { position: relative; z-index: 1; max-width: 600px; margin: 0 auto; }
        .final-cta-title { font-family: var(--font-display); font-size: clamp(34px,5.5vw,58px); font-weight: 800; color: #fff; letter-spacing: -0.04em; line-height: 1.06; margin-bottom: 18px; }
        .final-cta-blue { color: #93c5fd; }
        .final-cta-desc { font-size: 17px; color: rgba(255,255,255,0.45); line-height: 1.7; margin-bottom: 40px; }
        .final-cta-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .btn-final-primary { display: inline-flex; align-items: center; gap: 8px; background: var(--blue); color: #fff; border: none; border-radius: 10px; padding: 15px 30px; font-size: 15px; font-weight: 600; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; box-shadow: 0 4px 16px rgba(37,99,235,0.4); }
        .btn-final-primary:hover { background: var(--blue-2); transform: translateY(-2px); }
        .btn-final-ghost { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 15px 30px; font-size: 15px; font-weight: 500; font-family: var(--font); cursor: pointer; text-decoration: none; transition: all 0.2s; }
        .btn-final-ghost:hover { background: rgba(255,255,255,0.12); color: #fff; }
        .footer { background: #0f172a; padding: 60px 24px 32px; border-top: 1px solid rgba(255,255,255,0.06); }
        .footer-inner { max-width: 1100px; margin: 0 auto; }
        .footer-top { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 48px; padding-bottom: 40px; border-bottom: 1px solid rgba(255,255,255,0.07); }
        .footer-brand-logo { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
        .footer-brand-name { font-family: var(--font-display); font-size: 16px; font-weight: 700; color: #fff; letter-spacing: -0.03em; }
        .footer-brand-desc { font-size: 13px; color: rgba(255,255,255,0.35); line-height: 1.65; max-width: 240px; }
        .footer-col-title { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; }
        .footer-link { display: block; font-size: 13px; color: rgba(255,255,255,0.35); text-decoration: none; margin-bottom: 10px; transition: color 0.2s; }
        .footer-link:hover { color: rgba(255,255,255,0.7); }
        .footer-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .footer-legal { font-size: 12px; color: rgba(255,255,255,0.22); }
        .footer-legal-links { display: flex; gap: 20px; }
        .footer-legal-link { font-size: 12px; color: rgba(255,255,255,0.25); text-decoration: none; transition: color 0.2s; }
        .footer-legal-link:hover { color: rgba(255,255,255,0.5); }
        @media (max-width: 1024px) {
          .pricing-grid { grid-template-columns: repeat(2,1fr); }
          .footer-top { grid-template-columns: 1fr 1fr; }
          .why-list { grid-template-columns: 1fr; }
        }
        @media (max-width: 768px) {
          .hamburger { display: flex; }
          .nav-links, .nav-actions { display: none; }
          .hero { padding: 120px 20px 80px; }
          .sim-app { grid-template-columns: 1fr; }
          .sim-sidebar { display: none; }
          .sim-stats { grid-template-columns: repeat(2,1fr); }
          .sim-content-row { grid-template-columns: 1fr; }
          .problem-inner { grid-template-columns: 1fr; gap: 40px; }
          .metrics-grid { grid-template-columns: repeat(2,1fr); }
          .how-steps { grid-template-columns: 1fr; }
          .how-connector { display: none; }
          .features-grid { grid-template-columns: 1fr 1fr; }
          .testimonials-grid { grid-template-columns: 1fr; }
          .why-inner { grid-template-columns: 1fr; gap: 40px; }
          .pricing-grid { grid-template-columns: 1fr 1fr; }
          .footer-top { grid-template-columns: 1fr 1fr; }
          .footer-bottom { flex-direction: column; align-items: flex-start; }
        }
        @media (max-width: 480px) {
          .features-grid { grid-template-columns: 1fr; }
          .pricing-grid { grid-template-columns: 1fr; }
          .hero-ctas { flex-direction: column; align-items: center; }
          .btn-hero-primary, .btn-hero-secondary { width: 100%; max-width: 320px; justify-content: center; }
          .final-cta-btns { flex-direction: column; align-items: center; }
          .btn-final-primary, .btn-final-ghost { width: 100%; max-width: 320px; justify-content: center; }
          .footer-top { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* NAV */}
      <nav className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-inner">
          <Link to="/" className="nav-logo">
            <Logo size={28} />
            <span className="nav-logo-text">Fixsense</span>
          </Link>
          <div className="nav-links">
            {NAV.map(l => <a key={l.label} href={l.href} className="nav-link">{l.label}</a>)}
          </div>
          <div className="nav-actions">
            {user ? (
              <>
                <Link to="/dashboard/profile" className="nav-user">
                  <div className="nav-user-av">{emailInitial}</div>
                  <span className="nav-user-name">{displayName}</span>
                </Link>
                <Link to="/dashboard" className="btn-nav-primary">Dashboard →</Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">Sign in</Link>
                <Link to="/login" className="btn-nav-primary">Start Free Trial →</Link>
              </>
            )}
          </div>
          <button className="hamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </nav>

      {/* MOBILE DRAWER */}
      <div className={`drawer-overlay ${mobileOpen ? "open" : ""}`} onClick={() => setMobileOpen(false)} />
      <div className={`drawer ${mobileOpen ? "open" : ""}`}>
        <div className="drawer-header">
          <Link to="/" className="nav-logo" onClick={() => setMobileOpen(false)}>
            <Logo size={26} />
            <span className="nav-logo-text">Fixsense</span>
          </Link>
          <button className="drawer-close" onClick={() => setMobileOpen(false)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <nav className="drawer-nav">
          {NAV.map(l => (
            <a key={l.label} href={l.href} className="drawer-link" onClick={() => setMobileOpen(false)}>{l.label}</a>
          ))}
        </nav>
        <div className="drawer-footer">
          {user ? (
            <Link to="/dashboard" className="btn-full btn-full-primary" onClick={() => setMobileOpen(false)}>Go to Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn-full btn-full-primary" onClick={() => setMobileOpen(false)}>Start Free Trial</Link>
              <Link to="/login" className="btn-full btn-full-secondary" onClick={() => setMobileOpen(false)}>Sign in</Link>
            </>
          )}
        </div>
      </div>

      {/* HERO */}
      <section className="hero">
        <div className="hero-pattern" />
        
        <FadeIn delay={60}>
          <h1 className="hero-title">
            Close More Deals With <span className="blue">AI-Powered</span> Sales Call Intelligence
          </h1>
        </FadeIn>
        <FadeIn delay={120}>
          <p className="hero-sub">
            Fixsense records, analyzes, and improves your sales meetings in real time — so your team closes more deals without guessing what works.
          </p>
        </FadeIn>
        <FadeIn delay={180}>
          <div className="hero-ctas">
            {user ? (
              <>
                <Link to="/dashboard" className="btn-hero-primary">
                  Go to Dashboard
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Link>
                <Link to="/dashboard/live" className="btn-hero-secondary">▶ Start a Live Call</Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-hero-primary">
                  Start Free Trial
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Link>
                <Link to="/login" className="btn-hero-secondary">▶ Watch Demo</Link>
              </>
            )}
          </div>
        </FadeIn>
        <FadeIn delay={220}>
          <div className="hero-trust">
            {["No credit card required", "Used by modern sales teams", "AI-powered insights in seconds", "SOC 2 compliant"].map((t, i) => (
              <span key={t} style={{ display: "contents" }}>
                {i > 0 && <div className="trust-sep" />}
                <div className="hero-trust-item"><CheckIcon />{t}</div>
              </span>
            ))}
          </div>
        </FadeIn>
        <FadeIn delay={300}>
          <div className="sim-wrapper">
            <div className="sim-label">
              <div className="sim-label-dot" />
              Interactive demo — try a mock call
            </div>
            <LiveCallSimulator />
          </div>
        </FadeIn>
      </section>

      {/* LOGO STRIP */}
      <div className="logo-strip">
        <div className="logo-strip-inner">
          <span className="logo-strip-label">Integrates with</span>
          <div className="logo-strip-logos">
            {["Zoom", "Google Meet", "Salesforce", "HubSpot", "Slack", "Microsoft Teams"].map(l => (
              <span key={l} className="logo-name">{l}</span>
            ))}
          </div>
        </div>
      </div>

      {/* PROBLEM → SOLUTION */}
      <section className="problem" id="problem">
        <div className="problem-inner">
          <FadeIn>
            <div>
              <div className="section-kicker">The Problem</div>
              <h2 className="section-title">Your team is losing deals they shouldn't</h2>
              <p className="section-sub">Every sales team faces the same invisible leaks — and most never diagnose them.</p>
              <div className="problem-list">
                {PROBLEMS.map((p, i) => (
                  <div key={i} className="problem-item">
                    <div className="problem-icon">{p.icon}</div>
                    <div className="problem-text">{p.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={120}>
            <div className="solution-box">
              <div className="solution-label">The Solution</div>
              <h3 className="solution-title">Full visibility into every sales conversation</h3>
              <p className="solution-desc">
                Fixsense automatically records and analyzes every sales call, giving you clear insights on what works and what doesn't — so you can replicate winning behaviors across your entire team.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* METRICS */}
      <section className="metrics">
        <div className="metrics-inner">
          <FadeIn>
            <div className="metrics-grid">
              {METRICS.map((m, i) => (
                <div key={i} className="metric-card">
                  <div className="metric-num"><Counter end={m.value} suffix={m.suffix} /></div>
                  <div className="metric-label">{m.label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how" id="how-it-works">
        <div className="how-inner">
          <FadeIn>
            <div className="how-header">
              <div className="section-kicker">How It Works</div>
              <h2 className="section-title">Live in minutes, results in days</h2>
              <p className="section-sub">No complex setup. No IT tickets. Just connect and start getting insights.</p>
            </div>
          </FadeIn>
          <div className="how-steps">
            <div className="how-connector" />
            {STEPS.map((s, i) => (
              <FadeIn key={i} delay={i * 100}>
                <div>
                  <div className={`how-step-num ${s.active ? "active" : ""}`}>{s.num}</div>
                  <div className="how-step-title">{s.title}</div>
                  <div className="how-step-desc">{s.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="features-inner">
          <FadeIn>
            <div className="features-header">
              <div className="section-kicker">Capabilities</div>
              <h2 className="section-title">Everything your revenue team needs</h2>
              <p className="section-sub">From the first word spoken to the final follow-up, Fixsense has every moment covered.</p>
            </div>
          </FadeIn>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <FadeIn key={i} delay={i * 60}>
                <div className="feature-card">
                  <div className="feature-icon">{f.icon}</div>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-desc">{f.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="testimonials" id="testimonials">
        <div className="testimonials-inner">
          <FadeIn>
            <div className="testimonials-header">
              <div className="section-kicker">Customer Stories</div>
              <h2 className="section-title">Revenue leaders trust Fixsense</h2>
            </div>
          </FadeIn>
          <div className="testimonials-grid">
            {TESTIMONIALS.map((t, i) => (
              <FadeIn key={i} delay={i * 80}>
                <div className="testimonial-card">
                  <div className="testimonial-metric">{t.metric}</div>
                  <p className="testimonial-quote">{t.quote}</p>
                  <div className="testimonial-author">
                    <div className="testimonial-av">{t.initials}</div>
                    <div>
                      <div className="testimonial-name">{t.name}</div>
                      <div className="testimonial-role">{t.role}, {t.company}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* WHY FIXSENSE */}
      <section className="why">
        <div className="why-inner">
          <FadeIn>
            <div>
              <div className="section-kicker">Why Fixsense</div>
              <h2 className="section-title">A sales performance engine, not just a recorder</h2>
              <p className="section-sub">Fixsense doesn't just capture calls — it turns every conversation into a coaching opportunity.</p>
              <div className="why-list">
                {WHY.map((w, i) => (
                  <div key={i} className="why-item"><CheckIcon />{w}</div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={120}>
            <div className="why-visual">
              <div className="why-visual-blob" />
              <div className="why-stat">
                <div className="why-stat-num">30%</div>
                <div className="why-stat-label">Average increase in close rate within 90 days</div>
              </div>
              <div className="why-divider" />
              <div className="why-stat">
                <div className="why-stat-num">2x</div>
                <div className="why-stat-label">Faster rep onboarding with coaching built in</div>
              </div>
              <div className="why-divider" />
              <div className="why-tags">
                {["Zoom", "Google Meet", "Salesforce", "HubSpot", "Slack"].map(tag => (
                  <span key={tag} className="why-tag">{tag}</span>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing" id="pricing">
        <div className="pricing-inner">
          <FadeIn>
            <div className="pricing-header">
              <div className="section-kicker">Pricing</div>
              <h2 className="section-title">Transparent pricing, no surprises</h2>
              <p className="section-sub">Start free. Upgrade when you're ready. Cancel anytime.</p>
            </div>
          </FadeIn>
          <div className="pricing-grid">
            {PLANS.map((p, i) => (
              <FadeIn key={i} delay={i * 70}>
                <div className={`pricing-card ${p.highlight ? "highlight" : ""}`}>
                  <div className={`pricing-badge ${p.highlight ? "dark" : ""}`}>
                    {p.highlight ? "Most Popular" : p.name}
                  </div>
                  <div className={`pricing-name ${p.highlight ? "dark" : ""}`}>{p.name}</div>
                  <div className={`pricing-desc ${p.highlight ? "dark" : ""}`}>{p.desc}</div>
                  <div className="pricing-price-row">
                    <div className={`pricing-price ${p.highlight ? "dark" : ""}`}>{p.price}</div>
                    <div className={`pricing-period ${p.highlight ? "dark" : ""}`}>{p.period}</div>
                  </div>
                  <div className={`pricing-divider ${p.highlight ? "dark" : ""}`} />
                  <ul className="pricing-list">
                    {p.features.map(f => (
                      <li key={f} className={`pricing-feat ${p.highlight ? "dark" : ""}`}>
                        <CheckIcon />{f}
                      </li>
                    ))}
                  </ul>
                  <Link to={user ? "/dashboard/billing" : "/login"} className={`btn-plan ${p.highlight ? "btn-plan-dark" : "btn-plan-light"}`}>
                    {p.cta}
                  </Link>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final-cta">
        <div className="final-cta-glow" />
        <div className="final-cta-inner">
          <FadeIn>
            <h2 className="final-cta-title">
              {user
                ? "Your pipeline is waiting"
                : <span>Start closing more<br /><span className="final-cta-blue">deals today</span></span>
              }
            </h2>
            <p className="final-cta-desc">
              {user
                ? "Open your dashboard and start your next call with full AI intelligence."
                : "Every call you run without Fixsense is a call you won't fully understand. Join thousands of reps closing more."}
            </p>
            <div className="final-cta-btns">
              <Link to={user ? "/dashboard" : "/login"} className="btn-final-primary">
                {user ? "Open Dashboard" : "Start Free Trial"}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
              {!user && <Link to="/login" className="btn-final-ghost">Book a Demo</Link>}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <div className="footer-brand-logo">
                <Logo size={24} />
                <span className="footer-brand-name">Fixsense</span>
              </div>
              <p className="footer-brand-desc">AI-powered sales call intelligence for modern revenue teams. Capture, analyze, and act on every conversation.</p>
            </div>
            <div>
      <div className="footer-col-title">Product</div>
      {[
        { label: "Features",     href: "#features"       },
      { label: "Pricing",      href: "/pricing"        },
      { label: "Integrations", href: "/Integrations"               },
      { label: "Changelog",    href: "/Changelog"               },
      ].map(l => (
      <a key={l.label} href={l.href} className="footer-link">{l.label}</a>
     ))}
   </div>
   
   
   <div>
     <div className="footer-col-title">Legal</div>
     <Link to="/privacy"  className="footer-link">Privacy Policy</Link>
      <Link to="/terms"    className="footer-link">Terms of Service</Link>
     <Link to="/security" className="footer-link">Security</Link>
     <Link to="/contact"  className="footer-link">Contact</Link>
   </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-legal">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</span>
            <div className="footer-legal-links">
              <a href="/privacy" className="footer-legal-link">Privacy</a>
              <a href="/terms" className="footer-legal-link">Terms</a>
              <a href="/security" className="footer-legal-link">Security</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
