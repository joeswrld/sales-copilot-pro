// ─────────────────────────────────────────────────────────────────────────
// "See how Fixsense works" — interactive product walkthrough
// Drop-in replacement for the existing #how-it-works section in LandingPage.tsx.
// Reuses the file's existing Icon component, CSS variables, and .mock/.showcase-frame
// visual language — add the CSS block below into the `css` template string,
// and place <HowItWorksInteractive /> where the old <section id="how-it-works"> was.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";

type Stage = {
  label: string;
  eyebrow: string;
  title: string;
  desc: string;
  frameLabel: string;
};

const STAGES: Stage[] = [
  {
    label: "Start meeting",
    eyebrow: "Step 1 · Start your meeting",
    title: "Start your meeting.",
    desc: "Fixsense captures the conversation without interrupting your workflow — join from your existing calendar link, no separate app to open.",
    frameLabel: "live meeting · fixsense.app",
  },
  {
    label: "Capture",
    eyebrow: "Step 2 · Fixsense captures the conversation",
    title: "Speakers are identified automatically.",
    desc: "While the conversation happens, Fixsense transcribes it in real time and attributes every line to the right speaker — no manual tagging.",
    frameLabel: "transcript · fixsense.app",
  },
  {
    label: "AI understands",
    eyebrow: "Step 3 · AI understands what happened",
    title: "The conversation becomes structure.",
    desc: "Fixsense processes what was said into a summary, decisions, action items with owners and deadlines, and the key moments worth revisiting.",
    frameLabel: "analysis · fixsense.app",
  },
  {
    label: "Meeting record",
    eyebrow: "Step 4 · Your meeting becomes a record",
    title: "Every call, permanently searchable.",
    desc: "The finished Call Details page holds the summary, action items, decisions, and full transcript — nothing lives only in someone's memory.",
    frameLabel: "call details · fixsense.app",
  },
  {
    label: "Keep it moving",
    eyebrow: "Step 5 · Keep the conversation moving",
    title: "Your meeting doesn't end when the call does.",
    desc: "Decisions, commitments, and follow-ups flow straight into Messages and Deals — connected to the people and work they belong to.",
    frameLabel: "messages · fixsense.app",
  },
];

const AUTOPLAY_MS = 4200;

function TypingCaption() {
  const text = "So the main blocker right now is getting sign-off from legal on the new terms.";
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const id = setInterval(() => {
      setShown((n) => {
        if (n >= text.length) { clearInterval(id); return n; }
        return n + 1;
      });
    }, 32);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="s1-caption-text">
      {text.slice(0, shown)}
      <span className="s1-caret" />
    </div>
  );
}

function StageOne() {
  return (
    <div className="panel show">
      <div className="s1-callbar">
        <div className="s1-rec"><span className="s1-rec-dot" />REC</div>
        <div className="s1-timer">00:00:14</div>
      </div>
      <div className="s1-tiles">
        <div className="s1-tile speaking">
          <div className="s1-avatar">MC</div>
          <div className="s1-name-tag">Maria Chen</div>
          <div className="s1-wave"><span /><span /><span /><span /></div>
        </div>
        <div className="s1-tile">
          <div className="s1-avatar">DO</div>
          <div className="s1-name-tag">Daniel Osei</div>
        </div>
      </div>
      <div className="s1-controls">
        <div className="s1-ctl"><svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /></svg></div>
        <div className="s1-ctl"><svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg></div>
        <div className="s1-ctl"><svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg></div>
      </div>
      <div className="s1-caption-row">
        <div className="s1-caption-label">Live caption</div>
        <TypingCaption />
      </div>
    </div>
  );
}

function StageTwo() {
  const lines = [
    { n: "Maria Chen", i: "MC", t: "00:12:04", x: "So the main blocker right now is getting sign-off from legal on the new terms." },
    { n: "Daniel Osei", i: "DO", t: "00:12:19", x: "I can follow up with them this afternoon and get a timeline." },
    { n: "Priya Nair", i: "PN", t: "00:12:31", x: "Great, let's revisit this in Thursday's sync once you hear back." },
  ];
  return (
    <div className="panel show">
      <div className="s2-head">Live transcript</div>
      <div className="s2-list">
        {lines.map((l, i) => (
          <div key={i} className="s2-line in" style={{ animationDelay: `${i * 260}ms` }}>
            <div className="s2-avatar">{l.i}</div>
            <div className="s2-body">
              <div className="s2-meta"><span className="s2-name">{l.n}</span><span className="s2-time">{l.t}</span></div>
              <div className="s2-text">{l.x}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageThree() {
  const cards = [
    { icon: "file-text", label: "Summary", val: "Legal sign-off is the sole blocker to close.", big: false },
    { icon: "check-square", label: "Decisions", val: "2", big: true },
    { icon: "trending", label: "Action items", val: "4", big: true },
    { icon: "clock", label: "Deadlines", val: "Thu sync", big: false },
  ];
  return (
    <div className="panel show">
      <div className="s3-head"><span className="s3-spinner" /> Fixsense is analyzing</div>
      <div className="s3-grid">
        {cards.map((c, i) => (
          <div key={i} className="s3-card in" style={{ animationDelay: `${i * 220}ms` }}>
            <div className="s3-card-label"><Icon name={c.icon} size={12} strokeWidth={1.8} />{c.label}</div>
            <div className={c.big ? "s3-card-val num" : "s3-card-val"}>{c.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageFour() {
  const stats: [string, string][] = [["4", "Action items"], ["2", "Decisions"], ["3", "Participants"], ["34m", "Transcript"]];
  const items: [string, string][] = [
    ["Daniel to follow up with legal on contract terms", "Owner: Daniel Osei · Due Thu"],
    ["Priya to prep renewal numbers for next sync", "Owner: Priya Nair · Due Thu"],
    ["Send updated MSA redline to Acme legal team", "Owner: Maria Chen · Due Fri"],
  ];
  return (
    <div className="panel show">
      <div className="s4-top">
        <div>
          <div className="s4-title">Pipeline review — Acme Corp</div>
          <div className="s4-meta">Aug 12, 2026 · 34 min · 3 participants</div>
        </div>
        <div className="s4-badge">Complete</div>
      </div>
      <div className="s4-stats">
        {stats.map(([v, l], i) => (
          <div key={i} className="s4-stat">
            <div className="s4-stat-val" style={{ animationDelay: `${i * 90}ms` }}>{v}</div>
            <div className="s4-stat-label">{l}</div>
          </div>
        ))}
      </div>
      <div className="s4-rows">
        {items.map(([t, m], i) => (
          <div key={i} className="s4-row in" style={{ animationDelay: `${i * 200}ms` }}>
            <div className="s4-check"><Icon name="check" size={8} strokeWidth={2.6} /></div>
            <div><div className="s4-row-text">{t}</div><div className="s4-row-meta">{m}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageFive() {
  const nodes: [string, string][] = [["file-text", "Meeting"], ["trending", "Summary"], ["check-square", "Action items"], ["message", "Team chat"]];
  return (
    <div className="panel show">
      <div className="s5-flow">
        {nodes.map((n, i) => (
          <div key={i} style={{ display: "contents" }}>
            <div className="s5-node in" style={{ animationDelay: `${i * 200}ms` }}>
              <div className="s5-node-icon"><Icon name={n[0]} size={16} strokeWidth={1.7} /></div>
              <div className="s5-node-label">{n[1]}</div>
            </div>
            {i < nodes.length - 1 && <div className="s5-arrow" />}
          </div>
        ))}
      </div>
      <div className="s5-thread in" style={{ animationDelay: "900ms" }}>
        <div className="s5-msg">
          <div className="s5-msg-avatar">FX</div>
          <div><div className="s5-msg-name">Fixsense</div><div className="s5-msg-text">4 action items posted from "Pipeline review — Acme Corp." Daniel is owner on 2.</div></div>
        </div>
        <div className="s5-msg">
          <div className="s5-msg-avatar">DO</div>
          <div><div className="s5-msg-name">Daniel Osei</div><div className="s5-msg-text">On it — following up with legal now.</div></div>
        </div>
      </div>
    </div>
  );
}

const STAGE_COMPONENTS = [StageOne, StageTwo, StageThree, StageFour, StageFive];

export function HowItWorksInteractive() {
  // Autoplay is the default, continuous experience — it loops forever (stage 5 → stage 1)
  // until the visitor explicitly pauses it or clicks a stage/nav control themselves.
  const [current, setCurrent] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>();
  const startRef = useRef<number>(0);

  // Pause autoplay only while the section is actually on screen isn't required here —
  // IntersectionObserver could be added later, but requestAnimationFrame already stays
  // cheap (a single style write per tick) so it's safe to run continuously.
  const goTo = useCallback((i: number) => {
    setCurrent(i);
    setProgress(0);
  }, []);

  const stopAutoplay = useCallback(() => {
    setAutoplay(false);
    setProgress(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const startAutoplay = useCallback(() => {
    setAutoplay(true);
  }, []);

  useEffect(() => {
    if (!autoplay) return;
    startRef.current = performance.now();
    function frame(now: number) {
      const elapsed = now - startRef.current;
      const pct = Math.min(100, (elapsed / AUTOPLAY_MS) * 100);
      setProgress(pct);
      if (elapsed >= AUTOPLAY_MS) {
        setCurrent((c) => (c === STAGES.length - 1 ? 0 : c + 1));
        startRef.current = now;
        setProgress(0);
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [autoplay]);

  const StageVisual = STAGE_COMPONENTS[current];
  const s = STAGES[current];

  return (
    <section className="section" id="how-it-works">
      <div className="section-inner">
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div className="kicker" style={{ justifyContent: "center" }}>See how Fixsense works</div>
            <h2 className="section-h" style={{ textAlign: "center", maxWidth: 620, margin: "0 auto" }}>
              From conversation to useful follow-up, automatically.
            </h2>
            <p className="section-sub" style={{ textAlign: "center", margin: "0 auto" }}>
              Click through each stage below, or let it play. This is the actual product experience — start to finish, in under 30 seconds.
            </p>
          </div>
        </Reveal>

        <div className="stage-rail">
          {STAGES.map((st, i) => (
            <div key={i} style={{ display: "contents" }}>
              <button
                className={`stage-btn${current === i ? " active" : ""}${current > i ? " done" : ""}`}
                onClick={() => { stopAutoplay(); goTo(i); }}
              >
                <span className="stage-num">{i + 1}</span>
                <span className="stage-label">{st.label}</span>
              </button>
              {i < STAGES.length - 1 && <div className="stage-connector" />}
            </div>
          ))}
        </div>

        <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
        <div className="autoplay-row">
          <button className="autoplay-btn" onClick={() => (autoplay ? stopAutoplay() : startAutoplay())}>
            {autoplay ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <Icon name="play" size={12} />
            )}
            {autoplay ? "Pause" : "Play walkthrough"}
          </button>
        </div>

        <div className="stage-panel">
          <div className="stage-copy">
            <div className="stage-eyebrow">{s.eyebrow}</div>
            <h3 className="stage-title">{s.title}</h3>
            <p className="stage-desc">{s.desc}</p>
          </div>
          <div className="stage-visual">
            <div className="frame">
              <div className="frame-bar">
                <div className="frame-dots"><span /><span /><span /></div>
                <span className="frame-label">{s.frameLabel}</span>
              </div>
              <div className="frame-body" key={current}>
                <StageVisual />
              </div>
            </div>
          </div>
        </div>

        <div className="stage-nav">
          <button className="nav-btn" disabled={current === 0} onClick={() => { stopAutoplay(); goTo(Math.max(0, current - 1)); }}>Back</button>
          <button className="nav-btn" onClick={() => { stopAutoplay(); goTo(current === STAGES.length - 1 ? 0 : current + 1); }}>
            {current === STAGES.length - 1 ? "Restart" : "Next stage"}
          </button>
        </div>

        <div className="hiw-cta">
          <div className="hiw-cta-h">Your first meeting can look like this.</div>
          <a href="/signup" className="btn-hero">Start your free trial</a>
          <div className="hiw-cta-note">No credit card required.</div>
        </div>
      </div>
    </section>
  );
}