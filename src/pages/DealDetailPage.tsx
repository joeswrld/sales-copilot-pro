/**
 * DealDetailPage.tsx — AI Deal Intelligence Hub
 * Fully responsive: stacked on mobile, 3-col grid on desktop
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft, Loader2, Brain, Activity, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, Minus, Phone, Calendar, DollarSign,
  User, Building2, Target, Zap, MessageSquare, Send, ChevronRight,
  Edit3, Check, X, Clock, BarChart3, Sparkles, ExternalLink,
  Shield, RefreshCw, Plus, Link2, Mic, ChevronDown, ChevronUp
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface DealDetail {
  deal: any;
  calls: any[];
  ai: any;
  comments: any[];
  timeline: any[];
}

// ─── Config ────────────────────────────────────────────────────────────────

const STAGES = [
  { key: "new", label: "New", color: "#94a3b8" },
  { key: "qualified", label: "Qualified", color: "#60a5fa" },
  { key: "demo", label: "Demo", color: "#a78bfa" },
  { key: "negotiation", label: "Negotiation", color: "#fbbf24" },
  { key: "won", label: "Won", color: "#22c55e" },
  { key: "lost", label: "Lost", color: "#ef4444" },
  { key: "discovery", label: "Discovery", color: "#06b6d4" },
  { key: "proposal", label: "Proposal", color: "#34d399" },
  { key: "on_hold", label: "On Hold", color: "#64748b" },
];

function getStageCfg(key: string) {
  return STAGES.find(s => s.key === key) ?? { key, label: key, color: "#94a3b8" };
}

function formatCurrency(v: number | null) {
  if (!v) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

// ─── Health Gauge ───────────────────────────────────────────────────────────

function HealthGauge({ score, compact = false }: { score: number; compact?: boolean }) {
  const color = score >= 70 ? "#22c55e" : score >= 45 ? "#fbbf24" : "#ef4444";
  const label = score >= 70 ? "Healthy" : score >= 45 ? "At Risk" : "Critical";
  const size = compact ? 72 : 100;
  const r = compact ? 26 : 36;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 5 : 8 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={compact ? 6 : 8} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={compact ? 6 : 8}
            strokeDasharray={circumference} strokeDashoffset={dashOffset}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: compact ? 16 : 24, fontWeight: 900, color, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>health</div>
        </div>
      </div>
      <span style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color, background: `${color}15`, border: `1px solid ${color}30`, borderRadius: 20, padding: compact ? "2px 8px" : "3px 10px" }}>{label}</span>
    </div>
  );
}

// ─── Insight Pill ──────────────────────────────────────────────────────────

function InsightPill({ insight }: { insight: any }) {
  const isStr = typeof insight === "string";
  const text = isStr ? insight : (insight.text ?? "");
  const type = isStr ? "info" : (insight.type ?? "info");
  const icon = isStr ? "💡" : (insight.icon ?? "💡");
  const colors: Record<string, { bg: string; border: string }> = {
    positive: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)" },
    warning: { bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.2)" },
    critical: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)" },
    info: { bg: "rgba(96,165,250,0.08)", border: "rgba(96,165,250,0.2)" },
  };
  const c = colors[type] ?? colors.info;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px", borderRadius: 10, background: c.bg, border: `1px solid ${c.border}`, marginBottom: 8 }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif" }}>{text}</span>
    </div>
  );
}

// ─── Risk Flag ─────────────────────────────────────────────────────────────

function RiskFlag({ flag }: { flag: any }) {
  const isStr = typeof flag === "string";
  const text = isStr ? flag : (flag.text ?? "");
  const severity = isStr ? "medium" : (flag.severity ?? "medium");
  const colors: Record<string, string> = { high: "#ef4444", medium: "#f97316", low: "#fbbf24" };
  const color = colors[severity] ?? "#f97316";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: `${color}0D`, border: `1px solid ${color}25`, marginBottom: 6 }}>
      <AlertTriangle style={{ width: 12, height: 12, color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Sans', sans-serif", flex: 1 }}>{text}</span>
      <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase" }}>{severity}</span>
    </div>
  );
}

// ─── Call Item ──────────────────────────────────────────────────────────────

function CallItem({ call }: { call: any }) {
  const [expanded, setExpanded] = useState(false);
  const sentiment = call.sentiment_score;
  const sentColor = sentiment != null ? (sentiment >= 65 ? "#22c55e" : sentiment >= 40 ? "#fbbf24" : "#ef4444") : "rgba(255,255,255,0.3)";

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", background: "rgba(255,255,255,0.02)", WebkitTapHighlightColor: "transparent" }}
      >
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Phone style={{ width: 14, height: 14, color: "#60a5fa" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif" }}>{call.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <span>{format(new Date(call.date), "MMM d, yyyy")}</span>
            {call.duration_minutes && <span>{call.duration_minutes}m</span>}
          </div>
        </div>
        {sentiment != null && (
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: sentColor }}>{sentiment}%</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>sentiment</div>
          </div>
        )}
        <Link to={`/dashboard/calls/${call.id}`} onClick={e => e.stopPropagation()} style={{ color: "rgba(255,255,255,0.2)", textDecoration: "none", padding: 4 }}>
          <ExternalLink style={{ width: 13, height: 13 }} />
        </Link>
      </div>
      {expanded && call.summary && (
        <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.15)" }}>
          {call.summary?.summary && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 8 }}>{call.summary.summary}</p>
          )}
          {call.summary?.next_steps?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Next Steps</div>
              {call.summary.next_steps.map((s: string, i: number) => (
                <div key={i} style={{ fontSize: 12, color: "#60a5fa", display: "flex", alignItems: "flex-start", gap: 5, marginBottom: 3 }}>
                  <ChevronRight style={{ width: 10, height: 10, marginTop: 2, flexShrink: 0 }} />{s}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Link Call Modal ────────────────────────────────────────────────────────

function LinkCallModal({ dealId, onLinked, onClose }: { dealId: string; onLinked: () => void; onClose: () => void }) {
  const { user } = useAuth();
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("calls").select("id, name, date, sentiment_score, duration_minutes, status")
      .eq("user_id", user!.id).neq("status", "live").is("deal_id", null)
      .order("date", { ascending: false }).limit(20)
      .then(({ data }) => { setCalls(data ?? []); setLoading(false); });
  }, [user]);

  const handleLink = async (callId: string) => {
    setLinking(callId);
    try {
      await (supabase as any).rpc("link_call_to_deal_v2", { p_call_id: callId, p_deal_id: dealId });
      toast.success("Call linked!");
      onLinked();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLinking(null);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "100%", maxWidth: 480, background: "linear-gradient(135deg, #0c1018, #111827)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#f0f6fc", fontFamily: "'DM Sans', sans-serif" }}>Link a Call</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 8 }}><X style={{ width: 15, height: 15 }} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 24 }}><Loader2 style={{ width: 20, height: 20, color: "#60a5fa", animation: "spin 1s linear infinite" }} /></div>
          ) : calls.length === 0 ? (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "16px 0" }}>No unlinked calls found.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {calls.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", fontFamily: "'DM Sans', sans-serif" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{format(new Date(c.date), "MMM d")} · {c.duration_minutes ?? "?"}m</div>
                  </div>
                  <button
                    onClick={() => handleLink(c.id)}
                    disabled={!!linking}
                    style={{ padding: "8px 14px", background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 8, color: "#60a5fa", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    {linking === c.id ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : "Link"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible Section (mobile) ──────────────────────────────────────────

function CollapsibleSection({ title, icon: Icon, defaultOpen = true, children, accent }: {
  title: string; icon: React.ElementType; defaultOpen?: boolean; children: React.ReactNode; accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", background: "none", border: "none", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon style={{ width: 14, height: 14, color: accent ?? "rgba(255,255,255,0.4)" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", fontFamily: "'DM Sans', sans-serif" }}>{title}</span>
        </div>
        {open ? <ChevronUp style={{ width: 14, height: 14, color: "rgba(255,255,255,0.3)" }} /> : <ChevronDown style={{ width: 14, height: 14, color: "rgba(255,255,255,0.3)" }} />}
      </button>
      {open && <div style={{ padding: "0 16px 14px" }}>{children}</div>}
    </div>
  );
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [comment, setComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [editStage, setEditStage] = useState(false);
  const [editNextStep, setEditNextStep] = useState(false);
  const [nextStepDraft, setNextStepDraft] = useState("");
  const [linkCallOpen, setLinkCallOpen] = useState(false);
  const commentEndRef = useRef<HTMLDivElement>(null);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 900);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, []);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: result } = await (supabase as any).rpc("get_deal_detail_v2", { p_deal_id: id });
      if (result) setData(result as DealDetail);
      else {
        const { data: deal } = await (supabase as any).from("deals").select("*").eq("id", id).eq("owner_id", user?.id).single();
        const { data: calls } = await supabase.from("calls").select("*, call_summaries(summary, next_steps, objections)").eq("deal_id" as any, id).order("date", { ascending: false });
        const { data: ai } = await (supabase as any).from("deal_ai_analysis").select("*").eq("deal_id", id).order("analyzed_at", { ascending: false }).limit(1).maybeSingle();
        if (deal) setData({ deal, calls: calls ?? [], ai, comments: [], timeline: [] });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id, user?.id]);

  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => { commentEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.comments.length]);

  const handleAnalyze = async () => {
    if (!id) return;
    setAnalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("analyze-deal-health", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { deal_id: id },
      });
      if (res.error) throw res.error;
      toast.success("AI analysis complete!");
      loadDetail();
    } catch (e: any) {
      toast.error("Analysis failed: " + e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleUpdateStage = async (newStage: string) => {
    if (!id || !data) return;
    setEditStage(false);
    await (supabase as any).from("deals").update({ stage: newStage, updated_at: new Date().toISOString() }).eq("id", id);
    setData(prev => prev ? { ...prev, deal: { ...prev.deal, stage: newStage } } : prev);
    toast.success("Stage updated");
  };

  const handleUpdateNextStep = async () => {
    if (!id) return;
    setEditNextStep(false);
    await (supabase as any).from("deals").update({ next_step: nextStepDraft, updated_at: new Date().toISOString() }).eq("id", id);
    setData(prev => prev ? { ...prev, deal: { ...prev.deal, next_step: nextStepDraft } } : prev);
    toast.success("Next step saved");
  };

  const handleComment = async () => {
    if (!comment.trim() || !id) return;
    setSendingComment(true);
    try {
      const { error } = await (supabase as any).from("deal_comments").insert({ deal_id: id, user_id: user?.id, content: comment.trim() });
      if (error) throw error;
      setComment("");
      loadDetail();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingComment(false);
    }
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900&display=swap');
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
  `;

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
          <Loader2 style={{ width: 28, height: 28, color: "#60a5fa", animation: "spin 1s linear infinite" }} />
        </div>
      </DashboardLayout>
    );
  }

  if (!data || !data.deal) {
    return (
      <DashboardLayout>
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>
          <Target style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.3 }} />
          <p>Deal not found.</p>
          <button onClick={() => navigate("/dashboard/deals")} style={{ marginTop: 12, padding: "8px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>Back to Deals</button>
        </div>
      </DashboardLayout>
    );
  }

  const { deal, calls, ai, comments, timeline } = data;
  const health = deal.deal_health_score ?? ai?.health_score ?? 0;
  const insights = deal.ai_insights?.length ? deal.ai_insights : (ai?.insights ?? []);
  const riskFlags = deal.risk_flags?.length ? deal.risk_flags : (ai?.risk_flags ?? []);
  const nextBestAction = deal.next_best_action ?? ai?.next_best_action;
  const buyingSignals = ai?.buying_signals ?? [];
  const stageCfg = getStageCfg(deal.stage);
  const sentimentTrend = deal.sentiment_trend ?? ai?.sentiment_trend;

  // ── Shared panel content blocks ─────────────────────────────────────────

  const DealInfoContent = () => (
    <div>
      {/* Stage */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>Stage</div>
        {editStage ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {STAGES.map(s => (
              <button key={s.key} onClick={() => handleUpdateStage(s.key)}
                style={{ padding: "7px 10px", borderRadius: 7, border: "none", background: deal.stage === s.key ? `${s.color}20` : "rgba(255,255,255,0.04)", color: deal.stage === s.key ? s.color : "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 13, textAlign: "left", fontFamily: "'DM Sans', sans-serif" }}>
                {s.label}
              </button>
            ))}
            <button onClick={() => setEditStage(false)} style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setEditStage(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: stageCfg.color }}>{stageCfg.label}</span>
            <Edit3 style={{ width: 11, height: 11, color: "rgba(255,255,255,0.2)" }} />
          </button>
        )}
      </div>

      {/* Value */}
      {deal.value && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 3 }}>Value</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#22c55e" }}>{formatCurrency(deal.value)}</div>
        </div>
      )}

      {/* Probability */}
      {deal.probability != null && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 5 }}>Close Probability</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ width: `${deal.probability}%`, height: "100%", background: "linear-gradient(90deg, #60a5fa, #a78bfa)" }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{deal.probability}%</span>
          </div>
        </div>
      )}

      {/* Close Date */}
      {deal.close_date && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 3 }}>Close Date</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 5 }}>
            <Calendar style={{ width: 11, height: 11 }} />
            {format(new Date(deal.close_date), "MMM d, yyyy")}
          </div>
        </div>
      )}

      {/* Trend */}
      {sentimentTrend && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 3 }}>Trend</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            {sentimentTrend === "improving" ? <TrendingUp style={{ width: 12, height: 12, color: "#22c55e" }} /> : sentimentTrend === "declining" ? <TrendingDown style={{ width: 12, height: 12, color: "#ef4444" }} /> : <Minus style={{ width: 12, height: 12, color: "rgba(255,255,255,0.3)" }} />}
            <span style={{ color: sentimentTrend === "improving" ? "#22c55e" : sentimentTrend === "declining" ? "#ef4444" : "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "capitalize" }}>{sentimentTrend}</span>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#60a5fa" }}>{calls.length}</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Calls</div>
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#a78bfa" }}>{comments.length}</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Notes</div>
        </div>
      </div>
    </div>
  );

  const NextStepContent = () => (
    <>
      {editNextStep ? (
        <div>
          <textarea
            autoFocus
            value={nextStepDraft}
            onChange={e => setNextStepDraft(e.target.value)}
            rows={3}
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 8, padding: "9px 10px", color: "#f0f6fc", fontSize: 13, fontFamily: "'DM Sans', sans-serif", resize: "none", outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={handleUpdateNextStep} style={{ flex: 1, padding: "8px", background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 7, color: "#60a5fa", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
            <button onClick={() => setEditNextStep(false)} style={{ padding: "8px 12px", background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div onClick={() => { setNextStepDraft(deal.next_step ?? ""); setEditNextStep(true); }} style={{ cursor: "pointer" }}>
          <p style={{ fontSize: 13, color: deal.next_step ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)", lineHeight: 1.5, fontStyle: deal.next_step ? "normal" : "italic", margin: "0 0 8px" }}>
            {deal.next_step ?? "Tap to set next step…"}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(96,165,250,0.5)" }}>
            <Edit3 style={{ width: 9, height: 9 }} />Edit
          </div>
        </div>
      )}
    </>
  );

  const HealthContent = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <HealthGauge score={health} compact={isMobile} />
      {ai?.analyzed_at && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
          Updated {formatDistanceToNow(new Date(ai.analyzed_at), { addSuffix: true })}
        </div>
      )}
      {!ai && (
        <button onClick={handleAnalyze} disabled={analyzing} style={{ padding: "8px 14px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, color: "#a78bfa", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {analyzing ? "Analyzing…" : "Run AI Analysis"}
        </button>
      )}
    </div>
  );

  const CallsContent = () => (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>({calls.length} calls)</span>
        <button
          onClick={() => setLinkCallOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, color: "#60a5fa", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          <Link2 style={{ width: 11, height: 11 }} />Link Call
        </button>
      </div>
      {calls.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "rgba(255,255,255,0.2)" }}>
          <Phone style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.2 }} />
          <p style={{ fontSize: 12 }}>No calls linked yet.</p>
        </div>
      ) : calls.map((c: any) => <CallItem key={c.id} call={c} />)}
    </>
  );

  const NotesContent = () => (
    <>
      <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 12 }}>
        {comments.length === 0 ? (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "16px 0" }}>No notes yet.</p>
        ) : comments.map((c: any) => (
          <div key={c.id} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#a78bfa", flexShrink: 0 }}>
              {(c.author?.full_name ?? c.author?.email ?? "?")[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>{c.author?.full_name ?? c.author?.email ?? "Unknown"}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5, margin: 0 }}>{c.content}</p>
            </div>
          </div>
        ))}
        <div ref={commentEndRef} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleComment(); } }}
          placeholder="Add a note…"
          rows={2}
          style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "9px 12px", color: "#f0f6fc", fontSize: 13, fontFamily: "'DM Sans', sans-serif", resize: "none", outline: "none" }}
        />
        <button
          onClick={handleComment}
          disabled={!comment.trim() || sendingComment}
          style={{ width: 38, height: 38, borderRadius: 10, background: comment.trim() ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${comment.trim() ? "rgba(167,139,250,0.4)" : "rgba(255,255,255,0.06)"}`, color: comment.trim() ? "#a78bfa" : "rgba(255,255,255,0.2)", cursor: comment.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "flex-end", flexShrink: 0 }}
        >
          {sendingComment ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 14, height: 14 }} />}
        </button>
      </div>
    </>
  );

  return (
    <DashboardLayout>
      <style>{css}</style>
      {linkCallOpen && <LinkCallModal dealId={deal.id} onLinked={loadDetail} onClose={() => setLinkCallOpen(false)} />}

      <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20, fontFamily: "'DM Sans', sans-serif", animation: "fadeInUp 0.3s ease" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <button
            onClick={() => navigate("/dashboard/deals")}
            style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.5)", flexShrink: 0, marginTop: 2, WebkitTapHighlightColor: "transparent" }}
          >
            <ArrowLeft style={{ width: 15, height: 15 }} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: isMobile ? 18 : 24, fontWeight: 900, color: "#f0f6fc", margin: 0, letterSpacing: "-0.4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isMobile ? "nowrap" : "normal" }}>{deal.name}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
              {deal.company && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: 4 }}><Building2 style={{ width: 11, height: 11 }} />{deal.company}</span>}
              <span style={{ fontSize: 11, fontWeight: 700, color: stageCfg.color, background: `${stageCfg.color}15`, border: `1px solid ${stageCfg.color}30`, borderRadius: 20, padding: "2px 10px" }}>{stageCfg.label}</span>
              {deal.value && <span style={{ fontSize: 13, fontWeight: 900, color: "#22c55e" }}>{formatCurrency(deal.value)}</span>}
            </div>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            style={{ display: "flex", alignItems: "center", gap: isMobile ? 0 : 7, padding: isMobile ? "0" : "9px 16px", width: isMobile ? 36 : "auto", height: isMobile ? 36 : "auto", justifyContent: "center", background: analyzing ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #7c3aed, #4f46e5)", border: "none", borderRadius: 11, color: "#fff", fontSize: 12, fontWeight: 700, cursor: analyzing ? "not-allowed" : "pointer", boxShadow: analyzing ? "none" : "0 6px 20px rgba(99,102,241,0.35)", flexShrink: 0, WebkitTapHighlightColor: "transparent" }}
          >
            {analyzing ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Brain style={{ width: 15, height: 15 }} />}
            {!isMobile && (analyzing ? "Analyzing…" : "AI Analysis")}
          </button>
        </div>

        {/* ── MOBILE: Stacked collapsible sections ────────────────────────── */}
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Health summary strip */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 16 }}>
              <HealthGauge score={health} compact />
              <div style={{ flex: 1, minWidth: 0 }}>
                {insights.slice(0, 1).map((ins: any, i: number) => <InsightPill key={i} insight={ins} />)}
                {riskFlags.length > 0 && <RiskFlag flag={riskFlags[0]} />}
                {!insights.length && !riskFlags.length && nextBestAction && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>{nextBestAction}</div>
                )}
              </div>
            </div>

            <CollapsibleSection title="Deal Info" icon={Target} defaultOpen={true}>
              <DealInfoContent />
            </CollapsibleSection>

            <CollapsibleSection title="Next Step" icon={Zap} defaultOpen={true} accent="#60a5fa">
              <NextStepContent />
            </CollapsibleSection>

            <CollapsibleSection title={`Call Timeline (${calls.length})`} icon={Phone} defaultOpen={true} accent="#60a5fa">
              <CallsContent />
            </CollapsibleSection>

            <CollapsibleSection title={`Team Notes (${comments.length})`} icon={MessageSquare} defaultOpen={false} accent="#a78bfa">
              <NotesContent />
            </CollapsibleSection>

            {insights.length > 0 && (
              <CollapsibleSection title="AI Insights" icon={Sparkles} defaultOpen={false} accent="#a78bfa">
                {insights.map((ins: any, i: number) => <InsightPill key={i} insight={ins} />)}
              </CollapsibleSection>
            )}

            {riskFlags.length > 0 && (
              <CollapsibleSection title="Risk Flags" icon={Shield} defaultOpen={false} accent="#ef4444">
                {riskFlags.map((f: any, i: number) => <RiskFlag key={i} flag={f} />)}
              </CollapsibleSection>
            )}

            {buyingSignals.length > 0 && (
              <CollapsibleSection title="Buying Signals" icon={CheckCircle2} defaultOpen={false} accent="#22c55e">
                {buyingSignals.map((s: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 6, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
                    <CheckCircle2 style={{ width: 12, height: 12, color: "#22c55e", flexShrink: 0, marginTop: 2 }} />
                    {typeof s === "string" ? s : s.text ?? ""}
                  </div>
                ))}
              </CollapsibleSection>
            )}
          </div>
        ) : (
          /* ── DESKTOP: 3-column grid ──────────────────────────────────────── */
          <div style={{ display: "grid", gridTemplateColumns: "250px 1fr 280px", gap: 16, alignItems: "start" }}>

            {/* LEFT */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Deal Info</div>
                <DealInfoContent />
              </div>

              <div style={{ background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(96,165,250,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                  <Target style={{ width: 10, height: 10 }} />Next Step
                </div>
                <NextStepContent />
              </div>

              {nextBestAction && (
                <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(167,139,250,0.8)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                    <Brain style={{ width: 10, height: 10 }} />AI Recommends
                  </div>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>{nextBestAction}</p>
                </div>
              )}
            </div>

            {/* CENTER */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", gap: 7 }}>
                    <Phone style={{ width: 14, height: 14, color: "#60a5fa" }} />
                    Call Timeline
                  </div>
                  <button onClick={() => setLinkCallOpen(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, color: "#60a5fa", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    <Link2 style={{ width: 11, height: 11 }} />Link Call
                  </button>
                </div>
                {calls.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 0", color: "rgba(255,255,255,0.2)" }}>
                    <Phone style={{ width: 28, height: 28, margin: "0 auto 8px", opacity: 0.2 }} />
                    <p style={{ fontSize: 12 }}>No calls linked yet.</p>
                  </div>
                ) : calls.map((c: any) => <CallItem key={c.id} call={c} />)}
              </div>

              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                  <MessageSquare style={{ width: 14, height: 14, color: "#a78bfa" }} />
                  Team Notes <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontWeight: 400 }}>({comments.length})</span>
                </div>
                <NotesContent />
              </div>
            </div>

            {/* RIGHT */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}>
                  <Activity style={{ width: 11, height: 11 }} />Deal Health
                </div>
                <HealthContent />
              </div>

              {insights.length > 0 && (
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                    <Sparkles style={{ width: 11, height: 11 }} />AI Insights
                  </div>
                  {insights.map((ins: any, i: number) => <InsightPill key={i} insight={ins} />)}
                </div>
              )}

              {riskFlags.length > 0 && (
                <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(239,68,68,0.7)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                    <Shield style={{ width: 11, height: 11 }} />Risk Flags
                  </div>
                  {riskFlags.map((f: any, i: number) => <RiskFlag key={i} flag={f} />)}
                </div>
              )}

              {buyingSignals.length > 0 && (
                <div style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.12)", borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(34,197,94,0.7)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                    <CheckCircle2 style={{ width: 11, height: 11 }} />Buying Signals
                  </div>
                  {buyingSignals.map((s: any, i: number) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                      <CheckCircle2 style={{ width: 11, height: 11, color: "#22c55e", flexShrink: 0, marginTop: 2 }} />
                      {typeof s === "string" ? s : s.text ?? ""}
                    </div>
                  ))}
                </div>
              )}

              {timeline.length > 0 && (
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Activity</div>
                  {timeline.slice(0, 6).map((e: any, i: number) => (
                    <div key={e.id ?? i} style={{ display: "flex", gap: 9, paddingBottom: 10, position: "relative" }}>
                      {i < Math.min(timeline.length - 1, 5) && (
                        <div style={{ position: "absolute", left: 5, top: 16, bottom: 0, width: 1, background: "rgba(255,255,255,0.06)" }} />
                      )}
                      <div style={{ width: 11, height: 11, borderRadius: "50%", background: "rgba(96,165,250,0.3)", border: "1px solid rgba(96,165,250,0.4)", flexShrink: 0, marginTop: 2, zIndex: 1 }} />
                      <div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{e.title}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{formatDistanceToNow(new Date(e.happened_at), { addSuffix: true })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Quick Actions</div>
                {[
                  { label: "Start a Call", icon: Phone, to: "/dashboard/live" },
                  { label: "View All Calls", icon: BarChart3, to: "/dashboard/calls" },
                ].map(({ label, icon: Icon, to }) => (
                  <Link key={to} to={to} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 9, textDecoration: "none", color: "rgba(255,255,255,0.55)", fontSize: 12, marginBottom: 6 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Icon style={{ width: 12, height: 12 }} />{label}</span>
                    <ChevronRight style={{ width: 12, height: 12 }} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}