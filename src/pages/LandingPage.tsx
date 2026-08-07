import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { openCookiePreferences } from "@/components/CookieConsent";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────
type ScenarioKey = "client_call" | "interview" | "team_meeting";

interface AnalysisResult {
  sentiment: number;
  sentimentLabel: string;
  followThrough: number;
  keyMoments: { timestamp: string; text: string; response: string }[];
  highlights: string[];
  actionItemCount: string;
  coachingTips: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Scroll animation hook
// ─────────────────────────────────────────────────────────────────────────
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

function FadeIn({ children, delay = 0, y = 24 }: { children: React.ReactNode; delay?: number; y?: number }) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? "translateY(0)" : `translateY(${y}px)`,
      transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Logo
// ─────────────────────────────────────────────────────────────────────────
function Logo({ size = 30 }: { size?: number }) {
  return (
    <img src="/fixsense_icon_logo (2).png" alt="Fixsense" width={size} height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), objectFit: "cover", display: "block", flexShrink: 0 }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Animated counter
// ─────────────────────────────────────────────────────────────────────────
function AnimCounter({ target, prefix = "", suffix = "", duration = 1600 }: {
  target: number; prefix?: string; suffix?: string; duration?: number;
}) {
  const [val, setVal] = useState(0);
  const { ref, inView } = useInView(0.3);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(eased * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, target, duration]);
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

// ─────────────────────────────────────────────────────────────────────────
// Live demo data: three everyday meeting types, not just sales
// ─────────────────────────────────────────────────────────────────────────
const SCENARIOS: Record<ScenarioKey, { label: string; icon: string; transcript: string }> = {
  client_call: {
    label: "Client Call",
    icon: "briefcase",
    transcript: `Alex: Thanks for hopping on. Quick recap before we dive in: last time we agreed on the new homepage layout and a mid-March launch.
Jordan: Right, and we've since had some pushback internally on the color direction. Marketing wants something warmer.
Alex: Got it. Can you send over their reference examples so our designer can adjust the palette this week?
Jordan: Yes, I will email those today. Also, is the March 15 date still realistic given the change?
Alex: Should be fine as long as we lock the palette by Friday. I will also loop in our dev lead so nothing slips on the build side.
Jordan: Perfect. Let us regroup next Tuesday to review the updated mockups.`
  },
  interview: {
    label: "Job Interview",
    icon: "user",
    transcript: `Interviewer: Tell me about a project where you had to work with a tight deadline and shifting requirements.
Candidate: Sure. At my last role, we had a client change scope two weeks before launch. I restructured the sprint, cut non-essential features, and we still shipped on time.
Interviewer: How did you communicate that to the client?
Candidate: I sent a short written summary of tradeoffs the same day, with three options ranked by risk. They picked the middle option within an hour.
Interviewer: That's a great example of clear communication under pressure. What about a time something did not go well?
Candidate: Early in my career I underestimated a database migration. We had two hours of downtime. I now always build a rollback plan before any migration, no exceptions.
Interviewer: Good. Let's talk about how you approach code reviews.`
  },
  team_meeting: {
    label: "Team Standup",
    icon: "users",
    transcript: `Priya: Yesterday I finished the onboarding flow redesign and started on the billing page. Today I will keep working on billing.
Sam: I am blocked on the API keys for the payments integration. Can someone from platform help today?
Priya: I can pair with you after lunch.
Devon: No blockers here. Wrapped up the mobile bug fixes, moving to the notification settings work next.
Sam: One more thing, we should decide on the release date this week. Current plan is still next Thursday.
Priya: Agreed, Thursday works. Let us confirm in writing by end of day so support can prep the changelog.`
  }
};

const SCENARIO_ANALYSIS: Record<ScenarioKey, AnalysisResult> = {
  client_call: {
    sentiment: 81, sentimentLabel: "Positive",
    followThrough: 92,
    keyMoments: [
      { timestamp: "0:14", text: "Internal pushback on color direction flagged", response: "Suggested action: request reference examples before the design pass continues." },
      { timestamp: "0:41", text: "Timeline dependency raised on palette approval", response: "Risk flagged: March 15 date depends on Friday sign-off. Added as a tracked deadline." },
    ],
    highlights: ["Client confirmed the overall layout is approved", "Clear next step assigned to both sides with owners", "Follow-up meeting already scheduled for next Tuesday"],
    actionItemCount: "4 action items",
    coachingTips: ["Send a written recap within the hour while details are fresh", "Confirm the Friday deadline in writing with both stakeholders", "Add the color reference request to your task tracker now"],
  },
  interview: {
    sentiment: 88, sentimentLabel: "Strong",
    followThrough: 74,
    keyMoments: [
      { timestamp: "0:22", text: "Strong example of stakeholder communication under pressure", response: "Candidate signal: structured decision-making, quantifiable outcome, fast turnaround." },
      { timestamp: "0:58", text: "Honest account of a past mistake with a concrete fix", response: "Candidate signal: accountability and process improvement, not just a good outcome story." },
    ],
    highlights: ["Two strong behavioral examples with measurable results", "Candidate proactively explained how they changed their process", "Consistent, specific answers rather than vague generalities"],
    actionItemCount: "3 follow-up questions",
    coachingTips: ["Ask a follow-up on how the rollback plan is tested today", "Note the communication example for the hiring panel summary", "Confirm timeline expectations before the next round"],
  },
  team_meeting: {
    sentiment: 76, sentimentLabel: "On track",
    followThrough: 85,
    keyMoments: [
      { timestamp: "0:19", text: "Blocker identified on payments API keys", response: "Owner assigned same call. Pairing session scheduled for this afternoon." },
      { timestamp: "0:47", text: "Release date needs written confirmation", response: "Action item created: confirm Thursday release date in writing by end of day." },
    ],
    highlights: ["All three updates delivered with no open questions", "Blocker resolved within the meeting, not left hanging", "Release date reconfirmed with a clear owner for the changelog"],
    actionItemCount: "3 action items",
    coachingTips: ["Send the written release confirmation before end of day", "Track the pairing session outcome in tomorrow's standup", "Flag the changelog prep task to support ahead of Thursday"],
  }
};


function ScenarioIcon({ name }: { name: string }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "briefcase") return <svg {...common}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><path d="M2 13h20" /></svg>;
  if (name === "user") return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>;
  if (name === "users") return <svg {...common}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 21c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" /><circle cx="17.5" cy="8.5" r="2.5" /><path d="M15.5 14.5c2.9.3 5.2 2.7 5.2 5.7" /></svg>;
  if (name === "edit") return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
  return null;
}

function LiveDemo() {
  const [activeScenario, setActiveScenario] = useState<ScenarioKey>("client_call");
  const [customTranscript, setCustomTranscript] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [streamedLines, setStreamedLines] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"analysis" | "coaching">("analysis");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runAnalysis = useCallback(() => {
    setRunning(true);
    setResult(null);
    setStreamedLines([]);
    setProgress(0);

    const lines = (useCustom ? customTranscript : SCENARIOS[activeScenario].transcript)
      .split("\n").filter(l => l.trim());
    let li = 0;
    let prog = 0;

    intervalRef.current = setInterval(() => {
      prog += Math.random() * 8 + 4;
      setProgress(Math.min(prog, 95));
      if (li < lines.length) {
        setStreamedLines(p => [...p, lines[li]]);
        li++;
      }
    }, 190);

    setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);
      setRunning(false);
      setResult(useCustom ? {
        sentiment: 74, sentimentLabel: "Balanced",
        followThrough: 70,
        keyMoments: [{ timestamp: "custom", text: "Detected from your transcript", response: "Fixsense highlights the moment and suggests a next step automatically." }],
        highlights: ["Custom transcript analyzed", "Review the timestamps for key discussion points"],
        actionItemCount: "Calculating",
        coachingTips: ["Review the detected key moments", "Confirm ownership for any open items", "Send a recap before the next meeting"],
      } : SCENARIO_ANALYSIS[activeScenario]);
      setActiveTab("analysis");
    }, 3000);
  }, [activeScenario, customTranscript, useCustom]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const sentColor = result ? (result.sentiment >= 75 ? "#22c55e" : result.sentiment >= 55 ? "#f59e0b" : "#ef4444") : "#60a5fa";
  const ftColor = result ? (result.followThrough >= 75 ? "#22c55e" : result.followThrough >= 50 ? "#f59e0b" : "#ef4444") : "#60a5fa";

  return (
    <div className="demo-shell">
      <div className="demo-header">
        <div className="demo-header-left">
          <div className="demo-live-dot" />
          <span className="demo-title">Try Fixsense live</span>
          <span className="demo-subtitle">Real transcript, real AI output</span>
        </div>
        {result && (
          <button className="demo-reset" onClick={() => { setResult(null); setStreamedLines([]); setProgress(0); }}>
            Reset
          </button>
        )}
      </div>

      <div className="demo-scenarios">
        {(Object.keys(SCENARIOS) as ScenarioKey[]).map(k => (
          <button key={k} onClick={() => { setActiveScenario(k); setUseCustom(false); setResult(null); setStreamedLines([]); }}
            className={`demo-scenario-btn ${activeScenario === k && !useCustom ? "active" : ""}`}>
            <ScenarioIcon name={SCENARIOS[k].icon} />
            <span>{SCENARIOS[k].label}</span>
          </button>
        ))}
        <button onClick={() => { setUseCustom(true); setResult(null); setStreamedLines([]); }}
          className={`demo-scenario-btn ${useCustom ? "active" : ""}`}>
          <ScenarioIcon name="edit" /><span>Paste your own</span>
        </button>
      </div>

      <div className="demo-content">
        <div className="demo-input-panel">
          <div className="demo-panel-label">
            {useCustom ? "Your transcript" : `${SCENARIOS[activeScenario].label} transcript`}
          </div>
          {useCustom ? (
            <textarea
              className="demo-textarea"
              placeholder="Paste any meeting transcript here"
              value={customTranscript}
              onChange={e => setCustomTranscript(e.target.value)}
              rows={8}
            />
          ) : (
            <div className="demo-transcript-preview">
              {SCENARIOS[activeScenario].transcript.split("\n").filter(l => l.trim()).map((line, i) => {
                const speakerMatch = line.match(/^([^:]+):/);
                const speaker = speakerMatch ? speakerMatch[1] : "Speaker";
                const speakerIdx = i % 2 === 0 ? 0 : 1;
                const isActive = running && streamedLines.length > i;
                return (
                  <div key={i} className={`demo-transcript-line ${speakerIdx === 0 ? "rep" : "prospect"} ${isActive ? "active" : ""}`}>
                    <span className="demo-speaker">{speaker}</span>
                    <span className="demo-line-text">{line.replace(/^[^:]+:/, "").trim()}</span>
                  </div>
                );
              })}
            </div>
          )}

          {running && (
            <div className="demo-progress-wrap">
              <div className="demo-progress-bar-track"><div className="demo-progress-bar" style={{ width: `${progress}%` }} /></div>
              <span className="demo-progress-label">Analyzing, {Math.round(progress)}%</span>
            </div>
          )}

          <button
            className={`demo-run-btn ${running ? "running" : ""}`}
            onClick={runAnalysis}
            disabled={running || (useCustom && !customTranscript.trim())}
          >
            {running ? (
              <><span className="demo-spinner" />Analyzing in real time</>
            ) : (
              <>Run analysis</>
            )}
          </button>
        </div>

        <div className="demo-output-panel">
          {!result && !running ? (
            <div className="demo-empty">
              <div className="demo-empty-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /><circle cx="12" cy="12" r="3" /></svg>
              </div>
              <p className="demo-empty-title">Select a meeting type and run analysis</p>
              <p className="demo-empty-sub">See live speaker identification, sentiment tracking, and AI action items in seconds</p>
            </div>
          ) : running ? (
            <div className="demo-loading">
              {["Identifying speakers", "Transcribing conversation", "Scoring sentiment", "Extracting action items", "Generating summary"].map((step, i) => (
                <div key={i} className={`demo-loading-step ${progress > i * 20 ? "done" : progress > (i - 1) * 20 ? "current" : ""}`}>
                  <span className="demo-loading-dot" />
                  {step}
                </div>
              ))}
            </div>
          ) : result ? (
            <div className="demo-result">
              <div className="demo-kpi-row">
                <div className="demo-kpi">
                  <div className="demo-kpi-value" style={{ color: sentColor }}>{result.sentiment}%</div>
                  <div className="demo-kpi-label">Sentiment</div>
                  <div className="demo-kpi-badge" style={{ background: `${sentColor}18`, color: sentColor, border: `1px solid ${sentColor}30` }}>
                    {result.sentimentLabel}
                  </div>
                </div>
                <div className="demo-kpi-divider" />
                <div className="demo-kpi">
                  <div className="demo-kpi-value" style={{ color: ftColor }}>{result.followThrough}%</div>
                  <div className="demo-kpi-label">Clarity Score</div>
                  <div className="demo-kpi-badge" style={{ background: `${ftColor}18`, color: ftColor, border: `1px solid ${ftColor}30` }}>
                    {result.followThrough >= 75 ? "High" : result.followThrough >= 50 ? "Medium" : "Low"}
                  </div>
                </div>
                <div className="demo-kpi-divider" />
                <div className="demo-kpi">
                  <div className="demo-kpi-value" style={{ color: "#a78bfa", fontSize: 13, marginTop: 4 }}>{result.actionItemCount}</div>
                  <div className="demo-kpi-label">Extracted</div>
                  <div className="demo-kpi-badge" style={{ background: "rgba(167,139,250,.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,.25)" }}>
                    Tracked
                  </div>
                </div>
              </div>

              <div className="demo-result-tabs">
                <button className={`demo-result-tab ${activeTab === "analysis" ? "active" : ""}`} onClick={() => setActiveTab("analysis")}>
                  AI summary
                </button>
                <button className={`demo-result-tab ${activeTab === "coaching" ? "active" : ""}`} onClick={() => setActiveTab("coaching")}>
                  Suggested next steps
                </button>
              </div>

              {activeTab === "analysis" ? (
                <div className="demo-analysis">
                  <div className="demo-section-label">Key moments ({result.keyMoments.length})</div>
                  {result.keyMoments.map((obj, i) => (
                    <div key={i} className="demo-objection">
                      <div className="demo-obj-header">
                        <span className="demo-obj-timestamp">{obj.timestamp}</span>
                        <span className="demo-obj-text">{obj.text}</span>
                      </div>
                      <div className="demo-obj-response">
                        {obj.response}
                      </div>
                    </div>
                  ))}
                  <div className="demo-section-label" style={{ marginTop: 8 }}>Highlights</div>
                  {result.highlights.map((opp, i) => (
                    <div key={i} className="demo-opportunity">
                      <span style={{ color: "#22c55e", flexShrink: 0 }}>+</span>
                      <span>{opp}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="demo-analysis">
                  <div className="demo-section-label">Suggested next steps</div>
                  {result.coachingTips.map((tip, i) => (
                    <div key={i} className="demo-coaching-tip">
                      <span className="demo-tip-num">{i + 1}</span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const NAV_LINKS = [
  { label: "Why Fixsense", href: "#problem" },
  { label: "Live demo", href: "#demo" },
  { label: "Pricing", href: "/pricing" },
  { label: "Testimonials", href: "/testimonials" },
];

// ─────────────────────────────────────────────────────────────────────────
// Small inline icon set (keeps the page dependency-free and on-brand)
// ─────────────────────────────────────────────────────────────────────────
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "mic": return <svg {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 19v3M8 22h8" /></svg>;
    case "type": return <svg {...p}><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>;
    case "users": return <svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 21c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" /><circle cx="17.5" cy="8.5" r="2.5" /><path d="M15.5 14.5c2.9.3 5.2 2.7 5.2 5.7" /></svg>;
    case "check-square": return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12l3 3 5-6" /></svg>;
    case "trending": return <svg {...p}><polyline points="3 17 9 11 13 15 21 6" /><polyline points="15 6 21 6 21 12" /></svg>;
    case "briefcase": return <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><path d="M2 13h20" /></svg>;
    case "user-check": return <svg {...p}><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3.1-7 7-7s7 3 7 7" /><path d="M17 11l2 2 4-4" /></svg>;
    case "book": return <svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
    case "phone": return <svg {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.5 2.9.6a2 2 0 0 1 1.8 2.1z" /></svg>;
    case "coffee": return <svg {...p}><path d="M17 8h1a4 4 0 0 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" /><line x1="6" y1="2" x2="6" y2="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="14" y1="2" x2="14" y2="4" /></svg>;
    case "shield": return <svg {...p}><path d="M12 2l8 3.5v6c0 5-3.4 8.8-8 10.5-4.6-1.7-8-5.5-8-10.5v-6L12 2z" /><path d="M9 12l2 2 4-4" /></svg>;
    case "lock": return <svg {...p}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case "globe": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></svg>;
    case "eye-off": return <svg {...p}><path d="M17.9 17.9A9.6 9.6 0 0 1 12 20c-5 0-9-4-10-8a11.6 11.6 0 0 1 3.1-4.9M9.9 5.1A9.6 9.6 0 0 1 12 4c5 0 9 4 10 8a11.6 11.6 0 0 1-1.6 3" /><line x1="2" y1="2" x2="22" y2="22" /></svg>;
    case "arrow-right": return <svg {...p}><path d="M5 12h14M13 5l7 7-7 7" /></svg>;
    case "check": return <svg {...p} strokeWidth={2.2}><polyline points="20 6 9 17 4 12" /></svg>;
    case "clock": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
    case "message": return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "search": return <svg {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
    case "download": return <svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
    case "play": return <svg {...p} fill="currentColor" stroke="none"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z" /></svg>;
    case "sparkles": return <svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>;
    case "star": return <svg {...p} fill="currentColor" stroke="none"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17.6l-6.1 3.4 1.5-6.8-5.2-4.7 6.9-.7z" /></svg>;
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN LANDING PAGE
// ─────────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');

    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#03050d;--bg2:#060912;--bg3:#0b0e1a;
      --ink:#edf0f8;--ink2:rgba(237,240,248,0.65);--muted:rgba(237,240,248,0.35);
      --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.04);
      --cyan:#0ef5d4;--cyan2:rgba(14,245,212,0.1);--cyan3:rgba(14,245,212,0.05);
      --blue:#3b82f6;--purple:#8b5cf6;--red:#ef4444;--green:#22c55e;--amber:#f59e0b;
      --fd:'Syne',system-ui,sans-serif;
      --fb:'DM Sans',system-ui,sans-serif;
      --touch-target: 44px;
    }

    html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;}
    @media (prefers-reduced-motion: reduce){
      html{scroll-behavior:auto;}
      .lp *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;}
    }
    .lp{background:var(--bg);color:var(--ink);font-family:var(--fb);-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh;}
    .lp :focus-visible{outline:2px solid var(--cyan);outline-offset:2px;border-radius:4px;}

    /* ══════════════════════════════════════════
       NAV
    ══════════════════════════════════════════ */
    .nav{position:fixed;top:0;left:0;right:0;z-index:200;height:64px;display:flex;align-items:center;padding:0 20px;transition:all .3s;}
    .nav.scrolled{background:rgba(3,5,13,0.97);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--border);}
    .nav-inner{max-width:1180px;width:100%;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;}
    .nav-brand{display:flex;align-items:center;gap:9px;text-decoration:none;min-height:var(--touch-target);align-self:center;}
    .nav-brandname{font-family:var(--fd);font-size:17px;font-weight:700;color:var(--ink);letter-spacing:-.02em;}
    .nav-links{display:flex;align-items:center;gap:24px;}
    .nav-link{font-size:13.5px;font-weight:500;color:var(--muted);text-decoration:none;transition:color .18s;padding:4px 0;min-height:var(--touch-target);display:inline-flex;align-items:center;}
    .nav-link:hover{color:var(--ink);}
    .nav-actions{display:flex;align-items:center;gap:8px;}
    .btn-ghost{font-size:13.5px;font-weight:500;color:var(--muted);background:none;border:none;padding:10px 14px;border-radius:8px;cursor:pointer;text-decoration:none;transition:color .15s;font-family:var(--fb);min-height:var(--touch-target);display:inline-flex;align-items:center;}
    .btn-ghost:hover{color:var(--ink);}
    .btn-primary{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:700;color:#03050d;background:var(--cyan);border:none;padding:10px 20px;border-radius:9px;cursor:pointer;text-decoration:none;font-family:var(--fb);transition:all .15s;white-space:nowrap;min-height:var(--touch-target);}
    .btn-primary:hover{opacity:.88;transform:translateY(-1px);}
    .btn-outline{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:var(--ink2);background:rgba(255,255,255,.05);border:1px solid var(--border);padding:10px 20px;border-radius:9px;cursor:pointer;text-decoration:none;font-family:var(--fb);transition:all .15s;min-height:var(--touch-target);}
    .btn-outline:hover{border-color:rgba(255,255,255,.18);color:var(--ink);}

    /* Hamburger */
    .hamburger{display:none;flex-direction:column;gap:5px;width:44px;height:44px;align-items:center;justify-content:center;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:9px;cursor:pointer;-webkit-tap-highlight-color:transparent;flex-shrink:0;}
    .hamburger span{display:block;width:18px;height:1.5px;background:var(--ink);border-radius:2px;transition:all .22s;}
    .hamburger.open span:nth-child(1){transform:translateY(6.5px) rotate(45deg);}
    .hamburger.open span:nth-child(2){opacity:0;transform:scaleX(0);}
    .hamburger.open span:nth-child(3){transform:translateY(-6.5px) rotate(-45deg);}

    .mobile-menu{display:none;position:fixed;inset:0;top:64px;z-index:199;background:rgba(3,5,13,.99);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);flex-direction:column;padding:24px 20px 40px;border-top:1px solid var(--border);overflow-y:auto;-webkit-overflow-scrolling:touch;}
    .mobile-menu.open{display:flex;animation:mobilein .22s ease;}
    @keyframes mobilein{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
    .mobile-link{font-family:var(--fd);font-size:20px;font-weight:700;color:var(--muted);text-decoration:none;padding:16px 0;border-bottom:1px solid var(--border2);display:flex;align-items:center;transition:color .15s;min-height:56px;}
    .mobile-link:active,.mobile-link:hover{color:var(--ink);}
    .mobile-ctas{margin-top:24px;display:flex;flex-direction:column;gap:10px;}

    @media(min-width:821px){
      .hamburger{display:none!important;}
      .mobile-menu{display:none!important;}
      .nav-links{display:flex;}
    }
    @media(max-width:820px){
      .nav-links,.nav-actions .btn-ghost{display:none;}
      .hamburger{display:flex;}
    }

    /* ══════════════════════════════════════════
       HERO
    ══════════════════════════════════════════ */
    .hero{min-height:100vh;display:flex;align-items:center;padding:112px 20px 60px;position:relative;overflow:hidden;}
    .hero-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(14,245,212,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(14,245,212,.025) 1px,transparent 1px);background-size:72px 72px;mask-image:radial-gradient(ellipse 100% 80% at 50% 0,black 0,transparent 100%);-webkit-mask-image:radial-gradient(ellipse 100% 80% at 50% 0,black 0,transparent 100%);}
    .hero-glow{position:absolute;top:-200px;left:50%;transform:translateX(-50%);width:min(900px,130vw);height:700px;background:radial-gradient(ellipse,rgba(14,245,212,.055) 0,transparent 65%);pointer-events:none;}
    .hero-inner{max-width:1180px;margin:0 auto;width:100%;position:relative;z-index:1;}
    @keyframes hpulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}
    @keyframes cpulse{0%,100%{box-shadow:0 0 0 0 rgba(14,245,212,.5)}50%{box-shadow:0 0 0 6px rgba(14,245,212,0)}}
    @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
    .hero-eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:12.5px;font-weight:600;color:rgba(255,120,120,.85);background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.18);border-radius:100px;padding:7px 14px 7px 11px;margin-bottom:20px;}
    .hero-eyebrow-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;flex-shrink:0;animation:hpulse 1.8s ease infinite;}
    .hero-h{font-family:var(--fd);font-size:clamp(34px,6.6vw,76px);font-weight:800;line-height:1.05;letter-spacing:-.04em;color:var(--ink);max-width:920px;margin-bottom:22px;word-break:break-word;}
    .hero-h .accent{color:var(--cyan);}
    .hero-sub{font-size:clamp(15px,2vw,18.5px);color:var(--ink2);line-height:1.72;max-width:580px;margin-bottom:32px;}
    .hero-ctas{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:30px;}
    .btn-hero{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:700;color:#03050d;background:var(--cyan);border:none;padding:14px 28px;border-radius:10px;cursor:pointer;text-decoration:none;font-family:var(--fb);transition:all .2s;box-shadow:0 0 40px rgba(14,245,212,.2);min-height:50px;}
    .btn-hero:hover{opacity:.88;transform:translateY(-2px);box-shadow:0 4px 40px rgba(14,245,212,.35);}
    .btn-hero-outline{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:600;color:var(--ink2);background:transparent;border:1px solid var(--border);padding:14px 26px;border-radius:10px;cursor:pointer;text-decoration:none;font-family:var(--fb);transition:all .2s;min-height:50px;}
    .btn-hero-outline:hover{border-color:rgba(255,255,255,.2);color:var(--ink);}
    .hero-trust{display:flex;align-items:center;gap:14px;flex-wrap:wrap;row-gap:9px;}
    .trust-pill{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);font-weight:500;}
    .trust-check{width:17px;height:17px;border-radius:50%;background:rgba(14,245,212,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--cyan);}

    /* Audience strip sits quietly under the subheadline as a scannable
       line rather than a badge or announcement. */
    .hero-audience{margin-bottom:30px;}
    .hero-audience-label{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:11px;}
    .hero-audience-list{display:flex;flex-wrap:wrap;gap:8px;}
    .hero-audience-pill{font-size:12.5px;font-weight:600;color:var(--ink2);background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:100px;padding:6px 13px;white-space:nowrap;}

    .hero-caption-cursor{display:inline-block;width:2px;height:11px;background:var(--cyan);margin-left:2px;vertical-align:-1px;animation:blink 1s step-end infinite;}
    .hero-caption-badge{display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:.06em;margin-top:4px;}

    .hero-signal-row{padding:0 16px 14px;display:flex;flex-wrap:wrap;gap:6px;}
    .hero-signal-tag{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;border-radius:5px;padding:4px 9px;border:1px solid;white-space:nowrap;}

    /* Screenshot-style hero mockup */
    .hero-dashboard{margin-top:52px;}
    .hero-dashboard-frame{background:linear-gradient(145deg,rgba(11,14,26,0.98),rgba(6,9,18,0.98));border:1px solid rgba(255,255,255,.09);border-radius:16px;overflow:hidden;box-shadow:0 40px 120px rgba(0,0,0,.7),0 0 0 1px rgba(14,245,212,.04);}
    .hero-db-bar{padding:11px 16px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border2);display:flex;align-items:center;gap:8px;flex-wrap:wrap;row-gap:6px;}
    .db-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
    .hero-db-bar-label{margin-left:4px;font-size:11.5px;color:rgba(255,255,255,.3);font-family:monospace;flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .hero-db-bar-live{display:flex;align-items:center;gap:5px;font-size:10.5px;color:#ef4444;font-weight:700;flex-shrink:0;}
    .hero-db-bar-live-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;animation:hpulse 1.4s ease infinite;}
    .hero-db-content{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--border2);}
    .hero-db-kpi{padding:15px 16px;border-right:1px solid var(--border2);}
    .hero-db-kpi:last-child{border-right:none;}
    .hero-kpi-val{font-family:var(--fd);font-size:clamp(18px,3vw,26px);font-weight:800;line-height:1;margin-bottom:4px;}
    .hero-kpi-label{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;}
    .hero-db-transcript{padding:13px 16px;display:flex;flex-direction:column;gap:9px;}
    .hero-tline{display:flex;gap:8px;align-items:flex-start;}
    .hero-tspeaker{font-size:10.5px;font-weight:700;min-width:68px;padding-top:1px;flex-shrink:0;}
    .hero-ttext{font-size:12.5px;color:rgba(255,255,255,.6);line-height:1.55;}
    .hero-objection-tag{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:#0ef5d4;background:rgba(14,245,212,.08);border:1px solid rgba(14,245,212,.2);border-radius:4px;padding:1px 7px;margin-top:5px;}
    .hero-insight-bar{padding:11px 16px;background:rgba(14,245,212,.04);border-top:1px solid rgba(14,245,212,.1);display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;}
    .hero-insight-label{font-size:10.5px;font-weight:700;color:rgba(14,245,212,.7);text-transform:uppercase;letter-spacing:.08em;flex-shrink:0;padding-top:1px;}
    .hero-insight-text{font-size:12.5px;color:rgba(255,255,255,.6);flex:1;min-width:120px;line-height:1.55;}
    .hero-insight-badge{font-size:10.5px;font-weight:700;color:#22c55e;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);border-radius:4px;padding:2px 8px;flex-shrink:0;}

    @media(max-width:640px){
      .hero{padding:100px 16px 48px;min-height:auto;}
      .hero-ctas{flex-direction:column;align-items:stretch;}
      .hero-db-content{grid-template-columns:repeat(2,1fr);}
      .hero-db-kpi{padding:11px 12px;}
    }
    @media(max-width:380px){
      .hero-h{font-size:29px;letter-spacing:-.03em;}
      .hero-trust{gap:9px;}
      .trust-pill{font-size:11.5px;}
      .hero-audience-list{gap:6px;}
      .hero-audience-pill{font-size:11.5px;padding:5px 11px;}
    }

    /* ══════════════════════════════════════════
       LOGO STRIP (trust)
    ══════════════════════════════════════════ */
    .logostrip{padding:28px 20px;border-top:1px solid var(--border2);border-bottom:1px solid var(--border2);background:var(--bg2);}
    .logostrip-inner{max-width:1180px;margin:0 auto;display:flex;align-items:center;gap:28px;flex-wrap:wrap;justify-content:space-between;}
    .logostrip-label{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;white-space:nowrap;}
    .logostrip-marks{display:flex;align-items:center;gap:34px;flex-wrap:wrap;opacity:.6;}
    .logostrip-mark{font-family:var(--fd);font-size:16px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:-.02em;white-space:nowrap;}
    @media(max-width:700px){.logostrip-inner{justify-content:center;text-align:center;}.logostrip-marks{justify-content:center;gap:22px;}}
    .logostrip-stats{max-width:1180px;margin:18px auto 0;padding-top:18px;border-top:1px solid var(--border2);display:flex;align-items:center;justify-content:center;gap:44px;flex-wrap:wrap;}
    .logostrip-stat{display:flex;align-items:baseline;gap:7px;}
    .logostrip-stat-val{font-family:var(--fd);font-size:16px;font-weight:800;color:var(--cyan);letter-spacing:-.02em;}
    .logostrip-stat-label{font-size:12px;color:var(--muted);}
    @media(max-width:700px){.logostrip-stats{gap:24px;}}

    /* ══════════════════════════════════════════
       SHARED SECTION STYLES
    ══════════════════════════════════════════ */
    .section{padding:80px 20px;}
    .section-inner{max-width:1180px;margin:0 auto;}
    .kicker{font-family:monospace;font-size:10.5px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:.16em;margin-bottom:14px;display:flex;align-items:center;gap:8px;}
    .kicker::before{content:'';display:inline-block;width:20px;height:1px;background:var(--cyan);}
    .section-h{font-family:var(--fd);font-size:clamp(27px,4.6vw,50px);font-weight:800;color:var(--ink);letter-spacing:-.035em;line-height:1.1;margin-bottom:14px;}
    .section-sub{font-size:clamp(14.5px,2vw,16.5px);color:var(--ink2);line-height:1.72;max-width:540px;}
    @media(max-width:640px){.section{padding:60px 16px;}}

    /* ══════════════════════════════════════════
       KPI CARDS (why it matters)
    ══════════════════════════════════════════ */
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:44px;}
    .kpi-card{background:rgba(255,255,255,.025);border:1px solid var(--border);border-radius:14px;padding:22px;transition:border-color .18s,transform .18s;}
    .kpi-card:hover{border-color:rgba(14,245,212,.2);transform:translateY(-2px);}
    .kpi-icon{width:34px;height:34px;border-radius:9px;background:rgba(14,245,212,.08);border:1px solid rgba(14,245,212,.18);display:flex;align-items:center;justify-content:center;color:var(--cyan);margin-bottom:14px;}
    .kpi-num{font-family:var(--fd);font-size:clamp(22px,3.5vw,36px);font-weight:800;color:var(--ink);letter-spacing:-.04em;line-height:1;margin-bottom:8px;}
    .kpi-desc{font-size:12.5px;color:var(--muted);line-height:1.6;}
    @media(max-width:860px){.kpi-grid{grid-template-columns:repeat(2,1fr);}}
    @media(max-width:440px){.kpi-grid{gap:8px;}.kpi-card{padding:16px;}}

    /* ══════════════════════════════════════════
       USE CASES
    ══════════════════════════════════════════ */
    .usecase-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:44px;}
    .usecase-card{border-radius:16px;padding:24px;border:1px solid var(--border);background:rgba(255,255,255,.02);transition:border-color .18s,transform .18s;}
    .usecase-card:hover{border-color:rgba(255,255,255,.16);transform:translateY(-2px);}
    .usecase-icon{width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;}
    .usecase-title{font-family:var(--fd);font-size:16px;font-weight:700;color:var(--ink);margin-bottom:8px;}
    .usecase-desc{font-size:13px;color:var(--ink2);line-height:1.65;}
    @media(max-width:900px){.usecase-grid{grid-template-columns:1fr 1fr;}}
    @media(max-width:560px){.usecase-grid{grid-template-columns:1fr;gap:10px;}}

    /* ══════════════════════════════════════════
       DEMO SECTION
    ══════════════════════════════════════════ */
    .demo-section{padding:80px 20px;background:var(--bg2);}
    .demo-shell{background:rgba(11,14,26,.98);border:1px solid rgba(255,255,255,.09);border-radius:16px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.5);}
    .demo-header{padding:12px 16px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;gap:8px;}
    .demo-header-left{display:flex;align-items:center;gap:8px;min-width:0;}
    .demo-live-dot{width:7px;height:7px;border-radius:50%;background:#0ef5d4;animation:livepulse 1.4s ease-out infinite;flex-shrink:0;}
    @keyframes livepulse{0%{box-shadow:0 0 0 0 rgba(14,245,212,.6)}70%{box-shadow:0 0 0 6px rgba(14,245,212,0)}100%{box-shadow:0 0 0 0 rgba(14,245,212,0)}}
    .demo-title{font-family:var(--fd);font-size:14px;font-weight:700;color:var(--ink);white-space:nowrap;}
    .demo-subtitle{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .demo-reset{font-size:12px;color:var(--muted);background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:7px;padding:6px 12px;cursor:pointer;font-family:var(--fb);transition:.13s;white-space:nowrap;flex-shrink:0;min-height:32px;}
    .demo-reset:hover{color:var(--ink);}

    .demo-scenarios{display:flex;gap:6px;padding:10px 12px;border-bottom:1px solid var(--border2);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
    .demo-scenarios::-webkit-scrollbar{display:none;}
    .demo-scenario-btn{display:flex;align-items:center;gap:7px;padding:8px 14px;border-radius:9px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12.5px;font-weight:600;cursor:pointer;font-family:var(--fb);transition:all .13s;white-space:nowrap;flex-shrink:0;-webkit-tap-highlight-color:transparent;min-height:38px;}
    .demo-scenario-btn:hover{border-color:rgba(14,245,212,.3);color:var(--ink2);}
    .demo-scenario-btn.active{border-color:rgba(14,245,212,.4);background:rgba(14,245,212,.07);color:var(--cyan);}

    .demo-content{display:grid;grid-template-columns:1fr 1fr;min-height:420px;}
    .demo-input-panel{border-right:1px solid var(--border2);padding:14px;display:flex;flex-direction:column;gap:10px;}
    .demo-output-panel{padding:14px;display:flex;flex-direction:column;overflow:hidden;}
    .demo-panel-label{font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.09em;flex-shrink:0;}

    .demo-transcript-preview{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:5px;max-height:280px;-webkit-overflow-scrolling:touch;}
    .demo-transcript-line{display:flex;gap:8px;padding:5px 7px;border-radius:7px;border-left:2px solid transparent;transition:all .15s;}
    .demo-transcript-line.rep{border-left-color:rgba(96,165,250,.35);}
    .demo-transcript-line.prospect{border-left-color:rgba(45,212,191,.25);}
    .demo-transcript-line.active{background:rgba(14,245,212,.05);}
    .demo-speaker{font-size:9.5px;font-weight:700;min-width:64px;padding-top:2px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.05em;flex-shrink:0;}
    .demo-transcript-line.rep .demo-speaker{color:#818cf8;}
    .demo-transcript-line.prospect .demo-speaker{color:#2dd4bf;}
    .demo-line-text{font-size:11.5px;color:rgba(255,255,255,.55);line-height:1.5;}

    .demo-textarea{flex:1;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:10px;padding:12px;color:var(--ink);font-size:13px;font-family:var(--fb);resize:none;outline:none;min-height:200px;transition:border-color .13s;}
    .demo-textarea:focus{border-color:rgba(14,245,212,.3);}
    .demo-textarea::placeholder{color:var(--muted);}

    .demo-progress-wrap{position:relative;}
    .demo-progress-bar-track{height:3px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;}
    .demo-progress-bar{height:100%;background:linear-gradient(90deg,var(--cyan),#3b82f6);border-radius:2px;transition:width .3s ease;}
    .demo-progress-label{font-size:10.5px;color:var(--muted);margin-top:4px;display:block;}

    .demo-run-btn{padding:13px 20px;border-radius:10px;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--fd);display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;min-height:46px;flex-shrink:0;}
    .demo-run-btn:not(.running){background:linear-gradient(135deg,var(--cyan),#0891b2);color:#03050d;}
    .demo-run-btn:not(.running):hover{opacity:.88;transform:translateY(-1px);}
    .demo-run-btn.running{background:rgba(255,255,255,.06);color:var(--muted);cursor:not-allowed;}
    .demo-run-btn:disabled{opacity:.5;cursor:not-allowed;transform:none!important;}
    .demo-spinner{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.2);border-top-color:var(--cyan);animation:spin .8s linear infinite;flex-shrink:0;}
    @keyframes spin{to{transform:rotate(360deg)}}

    .demo-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px 16px;}
    .demo-empty-icon{color:var(--cyan);opacity:.5;margin-bottom:12px;}
    .demo-empty-title{font-size:13px;font-weight:700;color:rgba(255,255,255,.4);margin-bottom:6px;}
    .demo-empty-sub{font-size:11.5px;color:var(--muted);line-height:1.6;max-width:240px;}

    .demo-loading{flex:1;display:flex;flex-direction:column;gap:7px;padding:8px 0;}
    .demo-loading-step{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted);padding:7px 10px;border-radius:8px;transition:all .2s;}
    .demo-loading-step.current{color:var(--cyan);background:rgba(14,245,212,.06);}
    .demo-loading-step.done{color:rgba(34,197,94,.7);}
    .demo-loading-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0;}

    .demo-result{display:flex;flex-direction:column;gap:10px;height:100%;}
    .demo-kpi-row{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;border:1px solid var(--border);border-radius:10px;overflow:hidden;}
    .demo-kpi{padding:10px 8px;text-align:center;}
    .demo-kpi-divider{width:1px;background:var(--border2);align-self:stretch;}
    .demo-kpi-value{font-family:var(--fd);font-size:20px;font-weight:800;line-height:1;margin-bottom:2px;}
    .demo-kpi-label{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;}
    .demo-kpi-badge{display:inline-block;font-size:9px;font-weight:700;border-radius:20px;padding:2px 7px;}

    .demo-result-tabs{display:flex;border-bottom:1px solid var(--border2);flex-shrink:0;}
    .demo-result-tab{flex:1;padding:9px 8px;font-size:11px;font-weight:700;color:var(--muted);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:var(--fb);transition:all .13s;text-transform:uppercase;letter-spacing:.06em;min-height:40px;}
    .demo-result-tab.active{color:var(--cyan);border-bottom-color:var(--cyan);}

    .demo-analysis{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;-webkit-overflow-scrolling:touch;}
    .demo-section-label{font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.09em;flex-shrink:0;}
    .demo-objection{padding:8px 10px;background:rgba(14,245,212,.04);border:1px solid rgba(14,245,212,.14);border-radius:9px;}
    .demo-obj-header{display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;}
    .demo-obj-timestamp{font-size:9px;font-weight:700;color:#0ef5d4;background:rgba(14,245,212,.12);border-radius:4px;padding:1px 6px;flex-shrink:0;}
    .demo-obj-text{font-size:11px;color:rgba(255,255,255,.7);line-height:1.4;}
    .demo-obj-response{font-size:10.5px;color:rgba(255,255,255,.45);line-height:1.5;padding-left:2px;}
    .demo-opportunity{display:flex;gap:7px;font-size:11px;color:rgba(255,255,255,.6);line-height:1.45;padding:3px 0;}
    .demo-coaching-tip{display:flex;align-items:flex-start;gap:9px;padding:7px 9px;background:rgba(255,255,255,.03);border:1px solid var(--border2);border-radius:9px;font-size:11px;color:rgba(255,255,255,.65);line-height:1.5;}
    .demo-tip-num{width:18px;height:18px;border-radius:50%;background:rgba(14,245,212,.1);border:1px solid rgba(14,245,212,.2);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:var(--cyan);flex-shrink:0;margin-top:1px;}

    @media(max-width:768px){
      .demo-section{padding:56px 16px;}
      .demo-content{grid-template-columns:1fr;min-height:auto;}
      .demo-input-panel{border-right:none;border-bottom:1px solid var(--border2);}
      .demo-transcript-preview{max-height:200px;}
      .demo-output-panel{min-height:340px;}
      .demo-subtitle{display:none;}
    }
    @media(max-width:440px){
      .demo-header{padding:10px 12px;}
      .demo-scenarios{padding:8px 10px;}
      .demo-scenario-btn{padding:7px 10px;font-size:11px;}
      .demo-input-panel,.demo-output-panel{padding:10px;}
    }

    /* ══════════════════════════════════════════
       OUTPUTS / FEATURES
    ══════════════════════════════════════════ */
    .outputs-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:44px;}
    .output-card{border-radius:16px;padding:24px;border:1px solid var(--border);background:rgba(255,255,255,.025);position:relative;overflow:hidden;transition:border-color .18s,transform .18s;}
    .output-card:hover{border-color:rgba(255,255,255,.14);transform:translateY(-2px);}
    .output-card-accent{position:absolute;top:0;left:0;right:0;height:2px;}
    .output-card-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;}
    .output-card-title{font-family:var(--fd);font-size:16px;font-weight:700;color:var(--ink);margin-bottom:8px;}
    .output-card-desc{font-size:13px;color:var(--ink2);line-height:1.65;margin-bottom:16px;}
    .output-feature-list{display:flex;flex-direction:column;gap:8px;}
    .output-feature{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted);}
    .output-feature-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
    @media(max-width:900px){.outputs-grid{grid-template-columns:1fr 1fr;}}
    @media(max-width:540px){.outputs-grid{grid-template-columns:1fr;gap:10px;}.output-card{padding:20px;}}

    /* ══════════════════════════════════════════
       PRODUCT SHOWCASE (screenshots)
    ══════════════════════════════════════════ */
    .showcase-wrap{display:flex;flex-direction:column;gap:64px;margin-top:48px;}
    .showcase-row{display:grid;grid-template-columns:1fr 1fr;gap:52px;align-items:center;}
    .showcase-row.reverse .showcase-copy{order:2;}
    .showcase-row.reverse .showcase-visual{order:1;}
    .showcase-tag{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;}
    .showcase-title{font-family:var(--fd);font-size:clamp(20px,2.6vw,28px);font-weight:700;color:var(--ink);letter-spacing:-.02em;margin-bottom:12px;line-height:1.2;}
    .showcase-desc{font-size:14px;color:var(--ink2);line-height:1.75;margin-bottom:18px;}
    .showcase-list{display:flex;flex-direction:column;gap:10px;}
    .showcase-list-item{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:var(--ink2);line-height:1.5;}
    .showcase-check{width:18px;height:18px;border-radius:50%;background:rgba(14,245,212,.1);border:1px solid rgba(14,245,212,.25);display:flex;align-items:center;justify-content:center;color:var(--cyan);flex-shrink:0;margin-top:1px;}
    .showcase-frame{background:linear-gradient(150deg,rgba(11,14,26,0.98),rgba(6,9,18,0.98));border:1px solid rgba(255,255,255,.09);border-radius:14px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.55);}
    .showcase-frame-bar{padding:9px 14px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border2);display:flex;align-items:center;gap:7px;}
    .showcase-frame-dot{width:8px;height:8px;border-radius:50%;}
    .showcase-frame-label{margin-left:6px;font-size:10.5px;color:rgba(255,255,255,.3);font-family:monospace;}
    .showcase-frame-body{padding:16px;}
    @media(max-width:900px){
      .showcase-row,.showcase-row.reverse{grid-template-columns:1fr;gap:26px;}
      .showcase-row.reverse .showcase-copy,.showcase-row.reverse .showcase-visual{order:initial;}
    }

    /* Transcript screenshot mock */
    .mock-transcript-line{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border2);}
    .mock-transcript-line:last-child{border-bottom:none;}
    .mock-avatar{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;font-family:var(--fd);flex-shrink:0;}
    .mock-transcript-body{flex:1;min-width:0;}
    .mock-transcript-meta{display:flex;align-items:baseline;gap:8px;margin-bottom:2px;}
    .mock-transcript-name{font-size:12px;font-weight:700;color:var(--ink);}
    .mock-transcript-time{font-size:10px;color:var(--muted);font-family:monospace;}
    .mock-transcript-text{font-size:12.5px;color:var(--ink2);line-height:1.55;}

    /* Summary card mock */
    .mock-summary-section{margin-bottom:16px;}
    .mock-summary-section:last-child{margin-bottom:0;}
    .mock-summary-label{font-size:10px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:.09em;margin-bottom:8px;}
    .mock-summary-text{font-size:12.5px;color:var(--ink2);line-height:1.65;}
    .mock-action-item{display:flex;align-items:flex-start;gap:9px;padding:8px 0;}
    .mock-action-check{width:16px;height:16px;border-radius:5px;border:1.5px solid rgba(14,245,212,.4);flex-shrink:0;margin-top:1px;}
    .mock-action-text{font-size:12.5px;color:var(--ink2);line-height:1.5;}
    .mock-action-owner{font-size:10.5px;color:var(--muted);margin-top:2px;}

    /* Speaker id mock */
    .mock-speaker-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border2);}
    .mock-speaker-row:last-child{border-bottom:none;}
    .mock-speaker-bar-track{flex:1;height:6px;border-radius:4px;background:rgba(255,255,255,.05);overflow:hidden;}
    .mock-speaker-bar{height:100%;border-radius:4px;}
    .mock-speaker-pct{font-size:11px;font-weight:700;color:var(--ink2);width:34px;text-align:right;flex-shrink:0;}

    /* ══════════════════════════════════════════
       BEFORE / AFTER
    ══════════════════════════════════════════ */
    .ba-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:44px;}
    .ba-card{border-radius:16px;padding:26px;border:1px solid var(--border);}
    .ba-card.before{background:rgba(255,255,255,.02);border-color:var(--border);}
    .ba-card.after{background:rgba(14,245,212,.03);border-color:rgba(14,245,212,.15);}
    .ba-header{display:flex;align-items:center;gap:10px;margin-bottom:20px;}
    .ba-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .ba-title{font-family:var(--fd);font-size:16px;font-weight:700;}
    .ba-items{display:flex;flex-direction:column;gap:14px;}
    .ba-item{display:flex;gap:12px;align-items:flex-start;}
    .ba-item-icon{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;}
    .ba-item-text{font-size:13px;color:var(--ink2);line-height:1.55;}
    .ba-item-title{font-size:13px;font-weight:700;color:rgba(255,255,255,.75);margin-bottom:3px;}
    @media(max-width:700px){.ba-grid{grid-template-columns:1fr;}.ba-card{padding:20px;}}

    /* ══════════════════════════════════════════
       PROOF / TESTIMONIALS
    ══════════════════════════════════════════ */
    .proof-section{padding:80px 20px;background:var(--bg2);}
    .testi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:40px;}
    .testi-card{background:rgba(255,255,255,.025);border:1px solid var(--border);border-radius:16px;padding:22px;display:flex;flex-direction:column;transition:border-color .18s,transform .18s;}
    .testi-card:hover{border-color:rgba(14,245,212,.18);transform:translateY(-2px);}
    .testi-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
    .testi-metric{display:inline-block;background:var(--cyan2);color:var(--cyan);border:1px solid rgba(14,245,212,.2);border-radius:6px;padding:3px 11px;font-size:10px;font-weight:700;font-family:monospace;letter-spacing:.04em;}
    .testi-stars{display:flex;gap:2px;color:#f59e0b;}
    .testi-quote{font-size:13.5px;color:var(--ink2);line-height:1.72;flex:1;margin-bottom:18px;}
    .testi-author{display:flex;align-items:center;gap:10px;border-top:1px solid var(--border2);padding-top:14px;}
    .testi-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,rgba(14,245,212,.1),rgba(59,130,246,.1));border:1px solid rgba(14,245,212,.2);display:flex;align-items:center;justify-content:center;font-family:var(--fd);font-size:12px;font-weight:700;color:var(--cyan);flex-shrink:0;}
    .testi-name{font-family:var(--fd);font-size:13px;font-weight:700;color:var(--ink);}
    .testi-role{font-size:11px;color:var(--muted);}

    @media(max-width:900px){
      .testi-grid{grid-template-columns:1fr 1fr;}
      .proof-section{padding:60px 16px;}
    }
    @media(max-width:640px){
      .testi-grid{grid-template-columns:1fr;}
    }

    /* ══════════════════════════════════════════
       SECURITY / TRUST
    ══════════════════════════════════════════ */
    .trust-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:44px;}
    .trust-card{border:1px solid var(--border);border-radius:14px;padding:20px;background:rgba(255,255,255,.02);text-align:center;}
    .trust-card-icon{width:40px;height:40px;border-radius:11px;background:rgba(14,245,212,.08);border:1px solid rgba(14,245,212,.18);display:flex;align-items:center;justify-content:center;color:var(--cyan);margin:0 auto 12px;}
    .trust-card-title{font-family:var(--fd);font-size:13.5px;font-weight:700;color:var(--ink);margin-bottom:6px;}
    .trust-card-desc{font-size:11.5px;color:var(--muted);line-height:1.55;}
    @media(max-width:860px){.trust-grid{grid-template-columns:1fr 1fr;}}
    @media(max-width:480px){.trust-grid{grid-template-columns:1fr;}}
    .security-footline{text-align:center;margin-top:28px;}
    .security-footlink{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted);text-decoration:none;transition:color .15s;}
    .security-footlink:hover{color:var(--cyan);}

    /* ══════════════════════════════════════════
       FIRST 2 MINUTES
    ══════════════════════════════════════════ */
    .firstmin-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:40px;position:relative;}
    .firstmin-card{position:relative;border:1px solid var(--border);border-radius:16px;padding:22px 18px;background:rgba(255,255,255,.02);transition:border-color .18s,transform .18s;}
    .firstmin-card:hover{border-color:rgba(14,245,212,.2);transform:translateY(-2px);}
    .firstmin-num{position:absolute;top:16px;right:18px;font-family:var(--fd);font-size:12px;font-weight:800;color:var(--muted);}
    .firstmin-icon{width:38px;height:38px;border-radius:11px;background:rgba(14,245,212,.08);border:1px solid rgba(14,245,212,.18);display:flex;align-items:center;justify-content:center;color:var(--cyan);margin-bottom:16px;}
    .firstmin-title{font-family:var(--fd);font-size:14.5px;font-weight:700;color:var(--ink);margin-bottom:8px;letter-spacing:-.01em;}
    .firstmin-desc{font-size:12.5px;color:var(--muted);line-height:1.6;}
    .firstmin-footnote{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:28px;font-size:12.5px;color:var(--ink2);}
    @media(max-width:900px){.firstmin-grid{grid-template-columns:1fr 1fr;}}
    @media(max-width:520px){.firstmin-grid{grid-template-columns:1fr;}}

    /* ══════════════════════════════════════════
       HOW IT WORKS
    ══════════════════════════════════════════ */
    .how-steps{display:flex;gap:0;margin-top:44px;position:relative;}
    .how-steps::before{content:'';position:absolute;top:20px;left:20px;right:20px;height:1px;background:linear-gradient(90deg,transparent,rgba(14,245,212,.3),transparent);}
    .how-step{flex:1;text-align:center;padding:0 16px;position:relative;}
    .how-step-num{width:40px;height:40px;border-radius:12px;background:rgba(14,245,212,.07);border:1px solid rgba(14,245,212,.2);display:flex;align-items:center;justify-content:center;font-family:var(--fd);font-size:16px;font-weight:800;color:var(--cyan);margin:0 auto 14px;position:relative;z-index:1;}
    .how-step-title{font-family:var(--fd);font-size:14.5px;font-weight:700;color:var(--ink);margin-bottom:8px;}
    .how-step-desc{font-size:12.5px;color:var(--muted);line-height:1.6;}
    @media(max-width:640px){
      .how-steps{flex-direction:column;gap:22px;}
      .how-steps::before{display:none;}
      .how-step{text-align:left;padding:0;display:flex;gap:16px;align-items:flex-start;}
      .how-step-num{margin:0;flex-shrink:0;}
      .how-step-body{text-align:left;}
    }

    /* ══════════════════════════════════════════
       FAQ
    ══════════════════════════════════════════ */
    .faq-items{max-width:720px;margin:44px auto 0;}
    .faq-item{border:1px solid var(--border);border-radius:12px;margin-bottom:8px;overflow:hidden;}
    .faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;padding:18px 20px;background:transparent;border:none;cursor:pointer;text-align:left;font-size:13.5px;font-weight:600;color:var(--ink);font-family:var(--fb);gap:12px;min-height:56px;transition:background .13s;-webkit-tap-highlight-color:transparent;}
    .faq-q:hover{background:rgba(255,255,255,.02);}
    .faq-chev{color:var(--muted);transition:transform .22s;flex-shrink:0;display:flex;}
    .faq-chev.open{transform:rotate(180deg);}
    .faq-a{max-height:0;overflow:hidden;transition:max-height .32s ease,padding .28s ease;padding:0 20px;}
    .faq-a.open{max-height:400px;padding:0 20px 20px;}
    .faq-a p{font-size:13px;color:var(--ink2);line-height:1.75;}
    @media(max-width:640px){
      .faq-q{font-size:13px;padding:16px;}
      .faq-a,.faq-a.open{padding-left:16px;padding-right:16px;}
    }

    /* ══════════════════════════════════════════
       FINAL CTA
    ══════════════════════════════════════════ */
    .final{padding:110px 20px;text-align:center;position:relative;overflow:hidden;}
    .final-orb{position:absolute;inset:0;background:radial-gradient(ellipse 65% 65% at 50% 50%,rgba(14,245,212,.04) 0,transparent 65%);pointer-events:none;}
    .final-inner{position:relative;z-index:1;max-width:640px;margin:0 auto;}
    .final-h{font-family:var(--fd);font-size:clamp(28px,5.6vw,58px);font-weight:800;color:var(--ink);letter-spacing:-.045em;line-height:1.08;margin-bottom:16px;}
    .final-sub{font-size:clamp(15px,2vw,17px);color:var(--ink2);line-height:1.7;margin-bottom:32px;}
    .final-ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:18px;}
    .final-footnote{font-size:12px;color:var(--muted);}
    @media(max-width:500px){
      .final{padding:76px 16px;}
      .final-ctas{flex-direction:column;align-items:stretch;}
      .final-ctas a,.final-ctas button{justify-content:center;width:100%;}
    }

    /* ══════════════════════════════════════════
       FOOTER
    ══════════════════════════════════════════ */
    .footer{background:var(--bg2);padding:48px 20px 24px;border-top:1px solid var(--border);}
    .footer-inner{max-width:1180px;margin:0 auto;}
    .footer-top{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:32px;padding-bottom:32px;border-bottom:1px solid var(--border2);}
    .footer-brand-name{font-family:var(--fd);font-size:15px;font-weight:700;color:var(--ink);letter-spacing:-.02em;margin-bottom:8px;display:flex;align-items:center;gap:8px;}
    .footer-brand-desc{font-size:13px;color:var(--muted);line-height:1.65;max-width:230px;}
    .footer-col-title{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;font-family:monospace;}
    .footer-link{display:block;font-size:13px;color:var(--muted);text-decoration:none;margin-bottom:10px;transition:color .18s;min-height:var(--touch-target);display:flex;align-items:center;background:none;border:none;padding:0;cursor:pointer;font-family:var(--fb);text-align:left;}
    .footer-link:hover{color:var(--ink);}
    .footer-bottom{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;}
    .footer-copy{font-size:12px;color:rgba(255,255,255,.2);}
    .footer-legal-links{display:flex;gap:16px;flex-wrap:wrap;}
    .footer-legal-link{font-size:12px;color:rgba(255,255,255,.2);text-decoration:none;transition:color .18s;min-height:36px;display:inline-flex;align-items:center;background:none;border:none;padding:0;cursor:pointer;font-family:var(--fb);}
    .footer-legal-link:hover{color:var(--muted);}
    @media(max-width:960px){
      .footer{padding:40px 16px 20px;}
      .footer-top{grid-template-columns:1fr 1fr;gap:28px;}
    }
    @media(max-width:480px){
      .footer-top{grid-template-columns:1fr 1fr;gap:20px;}
      .footer-brand-desc{display:none;}
    }
    @media(max-width:360px){
      .footer-top{grid-template-columns:1fr;}
    }

    /* ══════════════════════════════════════════
       ANIMATIONS
    ══════════════════════════════════════════ */
    @keyframes slidein{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
  `;


  const FAQS = [
    { q: "Do I need to invite a bot to my meeting?", a: "No. Fixsense works natively inside the meeting room instead of sending a visible bot to join on your behalf. There is nothing extra for other participants to notice or approve before you can start recording and transcribing." },
    { q: "Who is Fixsense actually built for?", a: "Anyone who spends time in meetings. Sales and customer success teams use it for client calls, but so do founders running investor updates, recruiters conducting interviews, teachers recording lectures, consultants documenting client work, and teams that simply want a reliable record of what was said and agreed." },
    { q: "How accurate is the transcription and speaker identification?", a: "Fixsense uses automatic speech recognition tuned for real conversations, including overlapping speech and accents, and separates each speaker automatically so you always know who said what without manual tagging." },
    { q: "What happens to my recordings and transcripts?", a: "Your recordings and transcripts are encrypted, stored under your account, and never used to train shared AI models without your explicit consent. You can export or delete your data at any time from your account settings." },
    { q: "How quickly can my team get started?", a: "Most people are recording their first meeting within minutes of signing up. There is no hardware to install and no IT approval required. You join your normal meeting link and Fixsense handles the rest." },
    { q: "Do I need a credit card to try it?", a: "No. The free trial starts with just an email address. You will only be asked for billing details if you choose to upgrade to a paid plan once your trial minutes run out." },
    { q: "Can I cancel anytime?", a: "Yes. There is no contract and no lock-in. You can cancel from your account settings at any time, and you will keep access until the end of your current billing period." },
    { q: "What if the other person on the call does not want to be recorded?", a: "Fixsense supports consent prompts you can enable for any meeting, and you stay in control of what gets recorded, stored, or deleted at all times." },
  ];

  return (
    <div className="lp">
      <style>{css}</style>

      {/* NAV */}
      <nav className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-inner">
          <Link to="/" className="nav-brand" onClick={closeMobile}>
            <Logo size={26} />
            <span className="nav-brandname">Fixsense</span>
          </Link>
          <div className="nav-links">
            {NAV_LINKS.map(l => l.href.startsWith("#")
              ? <a key={l.label} href={l.href} className="nav-link">{l.label}</a>
              : <Link key={l.label} to={l.href} className="nav-link">{l.label}</Link>
            )}
          </div>
          <div className="nav-actions">
            {user ? (
              <Link to="/dashboard" className="btn-primary">
                Dashboard
                <Icon name="arrow-right" size={13} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">Sign in</Link>
                <Link to="/login" className="btn-primary">
                  Start free
                  <Icon name="arrow-right" size={13} />
                </Link>
              </>
            )}
            <button
              className={`hamburger ${mobileOpen ? "open" : ""}`}
              onClick={() => setMobileOpen(o => !o)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
      </nav>

      {/* MOBILE MENU */}
      <div className={`mobile-menu ${mobileOpen ? "open" : ""}`} role="navigation" aria-label="Mobile navigation">
        {NAV_LINKS.map(l => l.href.startsWith("#")
          ? <a key={l.label} href={l.href} className="mobile-link" onClick={closeMobile}>{l.label}</a>
          : <Link key={l.label} to={l.href} className="mobile-link" onClick={closeMobile}>{l.label}</Link>
        )}
        <div className="mobile-ctas">
          {user ? (
            <Link to="/dashboard" className="btn-hero" onClick={closeMobile}>Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn-hero-outline" onClick={closeMobile}>Sign in</Link>
              <Link to="/login" className="btn-hero" onClick={closeMobile}>Start free, no card needed</Link>
            </>
          )}
        </div>
      </div>

      {/* HERO */}
      <section className="hero">
        <div className="hero-grid" />
        <div className="hero-glow" />
        <div className="hero-inner">
          <div style={{ opacity: 0, animation: "slidein .7s ease .1s forwards" }}>
            <div className="hero-eyebrow">
              <span className="hero-eyebrow-dot" />
              You forgot what was agreed on. Again.
            </div>
            <h1 className="hero-h">
              Stop losing deals and decisions<br />
              <span className="accent">to a meeting nobody wrote down.</span>
            </h1>
          </div>

          <div style={{ opacity: 0, animation: "slidein .7s ease .2s forwards" }}>
            <p className="hero-sub">
              Fixsense joins, records, and transcribes every meeting automatically, then turns it into a clear summary and action list before you have even closed your laptop. No bot to explain, no notes to rebuild from memory, no promise you made and forgot.
            </p>
          </div>

          <div style={{ opacity: 0, animation: "slidein .7s ease .3s forwards" }}>
            <div className="hero-audience">
              <div className="hero-audience-label">Built for anyone who sits in meetings</div>
              <div className="hero-audience-list">
                {["Business meetings", "Client calls", "Interviews", "Online classes", "Team standups", "One-on-ones"].map((t, i) => (
                  <span key={i} className="hero-audience-pill">{t}</span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ opacity: 0, animation: "slidein .7s ease .4s forwards" }}>
            <div className="hero-ctas">
              <Link to={user ? "/dashboard" : "/login"} className="btn-hero">
                Start your free trial
                <Icon name="arrow-right" size={14} />
              </Link>
              <a href="#demo" className="btn-hero-outline">See it in action</a>
            </div>
            <div className="hero-trust">
              {["No credit card required", "No visible bot joins your call", "Live in minutes", "Cancel anytime"].map((t, i) => (
                <div key={i} className="trust-pill">
                  <div className="trust-check"><Icon name="check" size={10} /></div>
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* Hero product mockup: a realistic in-meeting view showing live
              captions, speaker identification, sentiment, and AI-detected
              highlights, so a first-time visitor understands the product
              within seconds of landing. */}
          <div style={{ opacity: 0, animation: "slidein .8s ease .5s forwards" }}>
            <div className="hero-dashboard">
              <div className="hero-dashboard-frame">
                <div className="hero-db-bar">
                  <div className="db-dot" style={{ background: "#ef4444" }} />
                  <div className="db-dot" style={{ background: "#f59e0b" }} />
                  <div className="db-dot" style={{ background: "#22c55e" }} />
                  <span className="hero-db-bar-label">Weekly Product Sync, Recording in progress</span>
                  <div className="hero-db-bar-live">
                    <span className="hero-db-bar-live-dot" />
                    LIVE 00:18:04
                  </div>
                </div>
                <div className="hero-db-content">
                  {[
                    { val: "4", label: "Speakers detected", color: "#0ef5d4" },
                    { val: "38 / 62", label: "Talk ratio", color: "#3b82f6" },
                    { val: "82%", label: "Sentiment", color: "#22c55e" },
                    { val: "5", label: "Action items", color: "#a78bfa" },
                  ].map((k, i) => (
                    <div key={i} className="hero-db-kpi">
                      <div className="hero-kpi-val" style={{ color: k.color }}>{k.val}</div>
                      <div className="hero-kpi-label">{k.label}</div>
                    </div>
                  ))}
                </div>
                <div className="hero-db-transcript">
                  {[
                    { speaker: "Maria Chen", text: "Let's confirm the launch date before we wrap up. Are we still good for the 14th?", color: "#2dd4bf" },
                    { speaker: "AI Summary", text: "Deadline confirmation requested. Flagging as an open action item for follow-up.", color: "#0ef5d4", isCoach: true },
                    { speaker: "Daniel Osei", text: "Yes, the 14th still works on our end. I will send the final assets by Friday", color: "#818cf8", live: true },
                  ].map((line, i) => (
                    <div key={i} className="hero-tline">
                      <span className="hero-tspeaker" style={{ color: line.color }}>{line.speaker}</span>
                      <div>
                        <span className="hero-ttext" style={line.isCoach ? { color: "rgba(14,245,212,.85)", fontStyle: "italic" } : undefined}>
                          {line.text}
                          {line.live && <span className="hero-caption-cursor" />}
                        </span>
                        {line.live && <div className="hero-caption-badge">Live caption</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hero-signal-row">
                  <span className="hero-signal-tag" style={{ color: "#4ade80", background: "rgba(34,197,94,.08)", borderColor: "rgba(34,197,94,.25)" }}>
                    Decision made, launch date confirmed
                  </span>
                  <span className="hero-signal-tag" style={{ color: "#a5b4fc", background: "rgba(129,140,248,.08)", borderColor: "rgba(129,140,248,.25)" }}>
                    Action item, send final assets by Friday
                  </span>
                </div>
                <div className="hero-insight-bar">
                  <span className="hero-insight-label">AI summary</span>
                  <span className="hero-insight-text">Team confirmed the March 14 launch date. Daniel to deliver final assets by Friday. No open blockers reported.</span>
                  <span className="hero-insight-badge">Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <div className="logostrip">
        <div className="logostrip-inner">
          <span className="logostrip-label">Trusted by teams who cannot afford to forget</span>
          <div className="logostrip-marks">
            {["Founders", "Consultants", "Recruiters", "Educators", "Agencies", "Support teams"].map((m, i) => (
              <span key={i} className="logostrip-mark">{m}</span>
            ))}
          </div>
        </div>
        <div className="logostrip-stats">
          {[
            { val: "12,000+", label: "meetings analyzed" },
            { val: "4.8/5", label: "average rating" },
            { val: "5 min", label: "to your first summary" },
          ].map((s, i) => (
            <div key={i} className="logostrip-stat">
              <span className="logostrip-stat-val">{s.val}</span>
              <span className="logostrip-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* FIRST 2 MINUTES */}
      <section className="section" style={{ background: "var(--bg)" }}>
        <div className="section-inner">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>What happens after you sign up</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 620, margin: "0 auto" }}>Your first summary is two minutes away.</h2>
              <p className="section-sub" style={{ textAlign: "center", maxWidth: 520, margin: "10px auto 0" }}>No setup calls, no onboarding specialist, no waiting on IT. Here is exactly what happens the moment you create an account.</p>
            </div>
          </FadeIn>
          <div className="firstmin-grid">
            {[
              { icon: "phone", title: "Connect a meeting", desc: "Paste your normal Zoom, Meet, or Teams link, or start a Fixsense room directly. No plugin, nothing for guests to install." },
              { icon: "mic", title: "Start your first recording", desc: "Hit record and talk. Fixsense listens in the background and identifies each speaker automatically." },
              { icon: "play", title: "Watch a sample meeting", desc: "Not ready to record yet? Load a real sample meeting and see exactly what your dashboard will look like." },
              { icon: "sparkles", title: "Generate your first AI summary", desc: "One click turns the transcript into a summary, action items, and key moments. This is what you will get after every meeting." },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 90}>
                <div className="firstmin-card">
                  <div className="firstmin-num">{i + 1}</div>
                  <div className="firstmin-icon"><Icon name={s.icon} size={17} /></div>
                  <div className="firstmin-title">{s.title}</div>
                  <div className="firstmin-desc">{s.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
          <FadeIn delay={360}>
            <div className="firstmin-footnote">
              <Icon name="clock" size={13} />
              Most people see their first AI summary within 5 minutes of signing up, no credit card required.
            </div>
          </FadeIn>
        </div>
      </section>

      {/* PROBLEM / KPIs */}
      <section className="section" id="problem" style={{ background: "var(--bg2)" }}>
        <div className="section-inner">
          <FadeIn>
            <div className="kicker">The problem</div>
            <h2 className="section-h">Good meetings still get<br />lost the moment they end.</h2>
            <p className="section-sub">Most of what is said in a meeting is forgotten within a day. Notes are incomplete, action items live in someone's memory, and nobody has time to write a proper recap.</p>
          </FadeIn>
          <div className="kpi-grid">
            {[
              { num: 60, prefix: "", suffix: "%", label: "Of meeting details are forgotten within 24 hours without a written record", icon: "clock" },
              { num: 23, prefix: "", suffix: " hrs/wk", label: "Spent in meetings by the average knowledge worker, much of it unrecorded", icon: "users" },
              { num: 5, prefix: "", suffix: " min", label: "It takes Fixsense to turn a one-hour meeting into a shareable summary", icon: "trending" },
              { num: 100, prefix: "", suffix: "%", label: "Of speakers automatically identified and labeled in your transcript", icon: "user-check" },
            ].map((k, i) => (
              <FadeIn key={i} delay={i * 80}>
                <div className="kpi-card">
                  <div className="kpi-icon"><Icon name={k.icon} size={17} /></div>
                  <div className="kpi-num">
                    <AnimCounter target={k.num} prefix={k.prefix} suffix={k.suffix} />
                  </div>
                  <div className="kpi-desc">{k.label}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section className="section" style={{ background: "var(--bg)" }}>
        <div className="section-inner">
          <FadeIn>
            <div className="kicker">Where Fixsense fits</div>
            <h2 className="section-h">One AI meeting assistant.<br />Every kind of conversation.</h2>
            <p className="section-sub">Fixsense was built for the meetings that make up a normal week, not just sales calls.</p>
          </FadeIn>
          <div className="usecase-grid">
            {[
              { icon: "briefcase", color: "#0ef5d4", title: "Business meetings", desc: "Capture decisions, owners, and deadlines automatically so nothing gets lost between the meeting and the follow-up email." },
              { icon: "user-check", color: "#3b82f6", title: "Interviews", desc: "Focus on the candidate instead of typing notes. Get a clean transcript and summary to share with your hiring panel." },
              { icon: "book", color: "#a78bfa", title: "Online classes", desc: "Turn every lecture or training session into a searchable transcript students and teammates can revisit anytime." },
              { icon: "phone", color: "#22c55e", title: "Client calls", desc: "Know exactly what was promised, asked, and agreed on every call, with a summary ready to send before you even hang up." },
              { icon: "users", color: "#f59e0b", title: "Team meetings", desc: "Standups, planning sessions, and retros documented automatically, with action items assigned to the right person." },
              { icon: "coffee", color: "#ec4899", title: "Everyday conversations", desc: "One-on-ones, brainstorms, and casual check-ins captured just as reliably as your most important calls." },
            ].map((c, i) => (
              <FadeIn key={i} delay={(i % 3) * 90}>
                <div className="usecase-card">
                  <div className="usecase-icon" style={{ background: `${c.color}14`, border: `1px solid ${c.color}30`, color: c.color }}>
                    <Icon name={c.icon} size={19} />
                  </div>
                  <div className="usecase-title">{c.title}</div>
                  <div className="usecase-desc">{c.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* LIVE DEMO */}
      <section className="demo-section" id="demo">
        <div className="section-inner">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Interactive demo</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 14px" }}>
                Pick a meeting type. Run the analysis.<br />See exactly what Fixsense produces.
              </h2>
              <p style={{ fontSize: "clamp(13.5px,2vw,15px)", color: "var(--ink2)", textAlign: "center", maxWidth: 520, margin: "0 auto" }}>
                This is a real simulation of the Fixsense AI engine: speaker identification, sentiment, and action item extraction, running on real example transcripts.
              </p>
            </div>
          </FadeIn>
          <FadeIn delay={80}>
            <LiveDemo />
          </FadeIn>
        </div>
      </section>

      {/* PRODUCT SHOWCASE, realistic screenshots of core outputs */}
      <section className="section" style={{ background: "var(--bg)" }}>
        <div className="section-inner">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Inside the product</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }}>What you actually get after every meeting.</h2>
            </div>
          </FadeIn>

          <div className="showcase-wrap">
            {/* Row 1: transcript with speaker ID */}
            <div className="showcase-row">
              <FadeIn>
                <div className="showcase-copy">
                  <div className="showcase-tag">
                    <Icon name="mic" size={13} />
                    Transcription
                  </div>
                  <h3 className="showcase-title">A transcript that knows who said what.</h3>
                  <p className="showcase-desc">Fixsense separates each voice automatically, so your transcript reads like a real conversation instead of a wall of unattributed text.</p>
                  <div className="showcase-list">
                    {["Speaker labels applied automatically, no manual tagging", "Accurate timestamps down to the second", "Searchable across every past meeting"].map((t, i) => (
                      <div key={i} className="showcase-list-item">
                        <span className="showcase-check"><Icon name="check" size={10} /></span>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </FadeIn>
              <FadeIn delay={80}>
                <div className="showcase-visual">
                  <div className="showcase-frame">
                    <div className="showcase-frame-bar">
                      <div className="showcase-frame-dot" style={{ background: "#ef4444" }} />
                      <div className="showcase-frame-dot" style={{ background: "#f59e0b" }} />
                      <div className="showcase-frame-dot" style={{ background: "#22c55e" }} />
                      <span className="showcase-frame-label">transcript.fixsense.app</span>
                    </div>
                    <div className="showcase-frame-body">
                      {[
                        { name: "Maria Chen", time: "00:12:04", text: "So the main blocker right now is getting sign-off from legal on the new terms.", color: "#0ef5d4" },
                        { name: "Daniel Osei", time: "00:12:19", text: "I can follow up with them this afternoon and get a timeline.", color: "#818cf8" },
                        { name: "Priya Nair", time: "00:12:31", text: "Great, let's revisit this in Thursday's sync once you hear back.", color: "#f59e0b" },
                      ].map((l, i) => (
                        <div key={i} className="mock-transcript-line">
                          <div className="mock-avatar" style={{ background: `${l.color}20`, color: l.color, border: `1px solid ${l.color}40` }}>
                            {l.name.split(" ").map(n => n[0]).join("")}
                          </div>
                          <div className="mock-transcript-body">
                            <div className="mock-transcript-meta">
                              <span className="mock-transcript-name">{l.name}</span>
                              <span className="mock-transcript-time">{l.time}</span>
                            </div>
                            <div className="mock-transcript-text">{l.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </FadeIn>
            </div>

            {/* Row 2: AI summary + action items */}
            <div className="showcase-row reverse">
              <FadeIn>
                <div className="showcase-copy">
                  <div className="showcase-tag">
                    <Icon name="check-square" size={13} />
                    AI summary and action items
                  </div>
                  <h3 className="showcase-title">A summary you would actually want to read.</h3>
                  <p className="showcase-desc">No generic bullet points. Fixsense writes a clear recap of what was discussed and pulls out concrete action items with an owner attached whenever one is mentioned.</p>
                  <div className="showcase-list">
                    {["Plain-language summary of the whole meeting", "Action items extracted with owners and deadlines", "One click to copy, export, or share with your team"].map((t, i) => (
                      <div key={i} className="showcase-list-item">
                        <span className="showcase-check"><Icon name="check" size={10} /></span>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </FadeIn>
              <FadeIn delay={80}>
                <div className="showcase-visual">
                  <div className="showcase-frame">
                    <div className="showcase-frame-bar">
                      <div className="showcase-frame-dot" style={{ background: "#ef4444" }} />
                      <div className="showcase-frame-dot" style={{ background: "#f59e0b" }} />
                      <div className="showcase-frame-dot" style={{ background: "#22c55e" }} />
                      <span className="showcase-frame-label">summary.fixsense.app</span>
                    </div>
                    <div className="showcase-frame-body">
                      <div className="mock-summary-section">
                        <div className="mock-summary-label">Summary</div>
                        <div className="mock-summary-text">The team reviewed the legal sign-off blocker on the new contract terms and agreed on next steps. Daniel will follow up with legal today. The topic will be revisited in Thursday's sync.</div>
                      </div>
                      <div className="mock-summary-section">
                        <div className="mock-summary-label">Action items</div>
                        {[
                          ["Follow up with legal for a sign-off timeline", "Daniel Osei · Due today"],
                          ["Revisit contract status in Thursday's sync", "Priya Nair · Due Thursday"],
                          ["Share updated terms with the client once approved", "Maria Chen · No date set"],
                        ].map(([text, owner], i) => (
                          <div key={i} className="mock-action-item">
                            <span className="mock-action-check" />
                            <div>
                              <div className="mock-action-text">{text}</div>
                              <div className="mock-action-owner">{owner}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            </div>

            {/* Row 3: speaker breakdown / insights */}
            <div className="showcase-row">
              <FadeIn>
                <div className="showcase-copy">
                  <div className="showcase-tag">
                    <Icon name="trending" size={13} />
                    Meeting insights
                  </div>
                  <h3 className="showcase-title">See how the conversation actually went.</h3>
                  <p className="showcase-desc">Talk-time balance, sentiment over time, and key moments are all calculated automatically, giving you a clear picture of the meeting without rewatching the recording.</p>
                  <div className="showcase-list">
                    {["Talk-time breakdown for every participant", "Sentiment tracked across the full conversation", "Key moments flagged with timestamps for quick review"].map((t, i) => (
                      <div key={i} className="showcase-list-item">
                        <span className="showcase-check"><Icon name="check" size={10} /></span>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </FadeIn>
              <FadeIn delay={80}>
                <div className="showcase-visual">
                  <div className="showcase-frame">
                    <div className="showcase-frame-bar">
                      <div className="showcase-frame-dot" style={{ background: "#ef4444" }} />
                      <div className="showcase-frame-dot" style={{ background: "#f59e0b" }} />
                      <div className="showcase-frame-dot" style={{ background: "#22c55e" }} />
                      <span className="showcase-frame-label">insights.fixsense.app</span>
                    </div>
                    <div className="showcase-frame-body">
                      <div className="mock-summary-label" style={{ marginBottom: 12 }}>Talk-time balance</div>
                      {[
                        { name: "Maria Chen", pct: 42, color: "#0ef5d4" },
                        { name: "Daniel Osei", pct: 33, color: "#818cf8" },
                        { name: "Priya Nair", pct: 25, color: "#f59e0b" },
                      ].map((s, i) => (
                        <div key={i} className="mock-speaker-row">
                          <div className="mock-avatar" style={{ background: `${s.color}20`, color: s.color, border: `1px solid ${s.color}40`, width: 22, height: 22, fontSize: 9 }}>
                            {s.name.split(" ").map(n => n[0]).join("")}
                          </div>
                          <div className="mock-speaker-bar-track">
                            <div className="mock-speaker-bar" style={{ width: `${s.pct}%`, background: s.color }} />
                          </div>
                          <span className="mock-speaker-pct">{s.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCT OUTPUTS */}
      <section className="section" style={{ background: "var(--bg2)" }}>
        <div className="section-inner">
          <FadeIn>
            <div className="kicker">What Fixsense produces</div>
            <h2 className="section-h">Three outputs.<br />One reliable record.</h2>
          </FadeIn>
          <div className="outputs-grid">
            {[
              {
                icon: "type", color: "#0ef5d4", title: "Accurate transcripts",
                desc: "Every word captured and attributed to the right speaker, ready to search, quote, or export the moment your meeting ends.",
                features: ["Automatic speaker identification", "Searchable across every meeting", "Timestamped for quick navigation", "Export to text, PDF, or your notes app"],
              },
              {
                icon: "check-square", color: "#3b82f6", title: "Summaries and action items",
                desc: "A clear recap of what was discussed and decided, plus action items extracted automatically with an owner attached whenever one is mentioned.",
                features: ["Plain-language meeting summary", "Action items with owners and dates", "One-click share with your team", "Consistent format, every time"],
              },
              {
                icon: "trending", color: "#a78bfa", title: "AI-powered insights",
                desc: "Sentiment, talk-time balance, and key moments calculated automatically, so you understand how the meeting actually went, not just what was said.",
                features: ["Sentiment tracked through the meeting", "Talk-time breakdown per participant", "Key moments flagged automatically", "Trends across meetings over time"],
              },
            ].map((card, i) => (
              <FadeIn key={i} delay={i * 100}>
                <div className="output-card">
                  <div className="output-card-accent" style={{ background: `linear-gradient(90deg, ${card.color}, transparent)` }} />
                  <div className="output-card-icon" style={{ background: `${card.color}14`, border: `1px solid ${card.color}30`, color: card.color }}>
                    <Icon name={card.icon} size={19} />
                  </div>
                  <div className="output-card-title">{card.title}</div>
                  <div className="output-card-desc">{card.desc}</div>
                  <div className="output-feature-list">
                    {card.features.map((f, j) => (
                      <div key={j} className="output-feature">
                        <div className="output-feature-dot" style={{ background: card.color }} />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* BEFORE / AFTER */}
      <section className="section" style={{ background: "var(--bg)" }}>
        <div className="section-inner">
          <FadeIn>
            <div className="kicker">Before and after</div>
            <h2 className="section-h">The difference a reliable<br />record makes.</h2>
          </FadeIn>
          <div className="ba-grid">
            <FadeIn delay={60}>
              <div className="ba-card before">
                <div className="ba-header">
                  <div className="ba-icon" style={{ background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.5)" }}><Icon name="eye-off" size={17} /></div>
                  <div className="ba-title" style={{ color: "rgba(255,255,255,.6)" }}>Without Fixsense</div>
                </div>
                <div className="ba-items">
                  {[
                    ["message", "Half-remembered conversations", "You leave the meeting relying on memory and scattered notes for what was actually agreed."],
                    ["search", "Details you can never find again", "Something important was said twenty minutes in, but there is no way to search for it later."],
                    ["users", "Unclear ownership", "Action items live in someone's head instead of being written down with a clear owner."],
                    ["clock", "Time lost to manual notes", "You spend the meeting typing instead of actually listening and contributing."],
                  ].map(([icon, title, desc], i) => (
                    <div key={i} className="ba-item">
                      <div className="ba-item-icon" style={{ background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.4)" }}><Icon name={icon as string} size={14} /></div>
                      <div>
                        <div className="ba-item-title">{title}</div>
                        <div className="ba-item-text">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
            <FadeIn delay={120}>
              <div className="ba-card after">
                <div className="ba-header">
                  <div className="ba-icon" style={{ background: "rgba(14,245,212,.1)", color: "#0ef5d4" }}><Icon name="check-square" size={17} /></div>
                  <div className="ba-title" style={{ color: "#0ef5d4" }}>With Fixsense</div>
                </div>
                <div className="ba-items">
                  {[
                    ["type", "A complete, accurate record", "Every word transcribed and attributed to the right speaker, automatically."],
                    ["search", "Everything searchable", "Find any detail from any past meeting in seconds, not by scrolling through notes."],
                    ["check-square", "Clear ownership", "Action items extracted automatically with an owner and a deadline attached."],
                    ["trending", "Full presence, every time", "You focus on the conversation while Fixsense handles the documentation."],
                  ].map(([icon, title, desc], i) => (
                    <div key={i} className="ba-item">
                      <div className="ba-item-icon" style={{ background: "rgba(14,245,212,.08)", color: "#0ef5d4" }}><Icon name={icon as string} size={14} /></div>
                      <div>
                        <div className="ba-item-title" style={{ color: "rgba(255,255,255,.85)" }}>{title}</div>
                        <div className="ba-item-text">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* PROOF */}
      <section className="proof-section">
        <div className="section-inner">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>What people say</div>
              <h2 className="section-h" style={{ textAlign: "center" }}>Real feedback from real meetings.</h2>
            </div>
          </FadeIn>
          <div className="testi-grid">
            {[
              { metric: "Saves 3 hrs a week", name: "Sarah Mitchell", role: "Operations Lead, small agency", initials: "SM", quote: "I used to spend Friday afternoons rebuilding notes from memory. Now the summary is ready before I have even closed my laptop." },
              { metric: "Zero missed action items", name: "Priya Nair", role: "Program Manager", initials: "PN", quote: "Nothing falls through the cracks anymore. Every action item has an owner and a date, and I can search any past meeting in seconds." },
              { metric: "Better interview notes", name: "James Ortiz", role: "Talent Recruiter", initials: "JO", quote: "I can actually focus on the candidate instead of typing. The transcript and summary are ready for the hiring panel right after the call." },
              { metric: "Onboarded in one call", name: "Tunde Balogun", role: "Founder, consulting studio", initials: "TB", quote: "Set it up during a call with my own team and it just worked. No IT ticket, no separate app for clients to download." },
              { metric: "No more re-listening", name: "Chidinma Okafor", role: "Customer Success Lead", initials: "CO", quote: "I used to replay recordings to catch what a customer actually asked for. Now it is all in the summary, already organized." },
              { metric: "Cleaner client handoffs", name: "Marcus Webb", role: "Account Manager", initials: "MW", quote: "When I hand a client off to a teammate, they can read the last three calls in five minutes instead of asking me to catch them up." },
            ].map((t, i) => (
              <FadeIn key={i} delay={(i % 3) * 80}>
                <div className="testi-card">
                  <div className="testi-card-top">
                    <div className="testi-metric">{t.metric}</div>
                    <div className="testi-stars" aria-label="5 out of 5 stars">
                      {Array.from({ length: 5 }).map((_, s) => <Icon key={s} name="star" size={11} />)}
                    </div>
                  </div>
                  <p className="testi-quote">{t.quote}</p>
                  <div className="testi-author">
                    <div className="testi-av">{t.initials}</div>
                    <div>
                      <div className="testi-name">{t.name}</div>
                      <div className="testi-role">{t.role}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* SECURITY / TRUST */}
      <section className="section" style={{ background: "var(--bg)" }}>
        <div className="section-inner">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Built to be trusted</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 600, margin: "0 auto" }}>Your meetings and data, protected by default.</h2>
              <p className="section-sub" style={{ textAlign: "center", maxWidth: 480, margin: "10px auto 0" }}>Every recording carries confidential conversations. We built Fixsense around that responsibility from day one.</p>
            </div>
          </FadeIn>
          <div className="trust-grid">
            {[
              { icon: "lock", title: "Encrypted end to end", desc: "Recordings and transcripts are encrypted in transit and at rest." },
              { icon: "shield", title: "GDPR compliant", desc: "Built around data minimization, consent, and your right to be forgotten." },
              { icon: "eye-off", title: "No visible bot", desc: "Fixsense works natively in your meeting room instead of joining as a bot." },
              { icon: "download", title: "Full data control", desc: "Export or permanently delete your recordings and transcripts anytime." },
            ].map((c, i) => (
              <FadeIn key={i} delay={i * 80}>
                <div className="trust-card">
                  <div className="trust-card-icon"><Icon name={c.icon} size={18} /></div>
                  <div className="trust-card-title">{c.title}</div>
                  <div className="trust-card-desc">{c.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
          <FadeIn delay={340}>
            <div className="security-footline">
              <Link to="/security" className="security-footlink">
                Read our full security overview
                <Icon name="arrow-right" size={12} />
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" style={{ background: "var(--bg2)" }}>
        <div className="section-inner">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>How it works</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 560, margin: "0 auto" }}>Live in minutes. Useful from your first meeting.</h2>
            </div>
          </FadeIn>
          <FadeIn delay={60}>
            <div className="how-steps">
              {[
                { num: "1", title: "Join or start a meeting", desc: "Use your normal meeting link. Fixsense works natively, with no separate bot for anyone to notice or approve." },
                { num: "2", title: "AI listens and analyzes", desc: "Speakers are identified automatically while sentiment, key moments, and action items are captured as the conversation happens." },
                { num: "3", title: "Your summary lands instantly", desc: "A clear transcript, summary, and action item list are ready within minutes of the meeting ending, ready to share." },
              ].map((step, i) => (
                <div key={i} className="how-step">
                  <div className="how-step-num">{step.num}</div>
                  <div className="how-step-body">
                    <div className="how-step-title">{step.title}</div>
                    <div className="how-step-desc">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" style={{ background: "var(--bg)" }}>
        <div className="section-inner">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Questions</div>
              <h2 className="section-h" style={{ textAlign: "center", fontSize: "clamp(22px,4vw,42px)" }}>The ones we get every day.</h2>
            </div>
          </FadeIn>
          <div className="faq-items">
            {FAQS.map((f, i) => (
              <FadeIn key={i} delay={i * 60}>
                <div className="faq-item">
                  <button className="faq-q" onClick={() => setActiveFaq(activeFaq === i ? null : i)} aria-expanded={activeFaq === i}>
                    {f.q}
                    <span className={`faq-chev ${activeFaq === i ? "open" : ""}`}><Icon name="arrow-right" size={13} /></span>
                  </button>
                  <div className={`faq-a ${activeFaq === i ? "open" : ""}`} aria-hidden={activeFaq !== i}>
                    <p>{f.a}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final">
        <div className="final-orb" />
        <div className="final-inner">
          <FadeIn>
            <h2 className="final-h">Stop taking notes.<br />Start having the meeting.</h2>
            <p className="final-sub">Try Fixsense free on your next meeting. No credit card required, no bot for anyone to notice, and your first summary ready in minutes.</p>
            <div className="final-ctas">
              <Link to={user ? "/dashboard" : "/login"} className="btn-hero">
                Start free trial
                <Icon name="arrow-right" size={14} />
              </Link>
              <a href="#demo" className="btn-hero-outline">Try the live demo</a>
            </div>
            <p className="final-footnote">Free trial · No credit card required · No bot joins your call</p>
          </FadeIn>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <div className="footer-brand-name"><Logo size={20} />Fixsense</div>
              <p className="footer-brand-desc">The AI meeting assistant that remembers everything, so you don't have to.</p>
            </div>
            <div>
              <div className="footer-col-title">Product</div>
              {[["#demo", "Live demo"], ["#problem", "Why Fixsense"], ["/pricing", "Pricing"], ["/changelog", "Changelog"]].map(([h, l]) => (
                h.startsWith("#")
                  ? <a key={h} href={h} className="footer-link">{l}</a>
                  : <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
            </div>

            <div>
              <div className="footer-col-title">Legal</div>
              {[["/privacy", "Privacy"], ["/terms", "Terms"], ["/security", "Security"], ["/contact", "Contact"]].map(([h, l]) => (
                <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
              <button className="footer-link" onClick={() => openCookiePreferences()}>
                Cookie preferences
              </button>
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-copy">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</span>
            <div className="footer-legal-links">
              <Link to="/privacy" className="footer-legal-link">Privacy</Link>
              <Link to="/terms" className="footer-legal-link">Terms</Link>
              <Link to="/security" className="footer-legal-link">Security</Link>
              <button className="footer-legal-link" onClick={() => openCookiePreferences()}>Cookie preferences</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}