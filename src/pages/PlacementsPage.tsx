/**
 * PlacementsPage.tsx — Placement Financials
 *
 * Team-scoped workspace over public.candidate_jobs (rows where
 * pipeline_stage = 'placed') and public.placement_invoices, RLS via
 * recruiting_is_team_member — both tables already have simple team-member
 * read/write policies, so list/detail reads are direct table selects
 * (same pattern as JobsPage/CandidatesPage), matching the rest of the
 * recruiting UI.
 *
 * All financial *writes* go through the existing Phase-6 RPCs — nothing
 * here bypasses RLS or hand-rolls invoice/guarantee math:
 *   - advance_candidate_pipeline_stage(..., p_new_stage: 'placed', ...)
 *     is reused to backfill commission_pct / guarantee_days on a placement
 *     that was recorded from PipelinePage without them (the RPC's own
 *     `case when p_new_stage = 'placed'` branch fires on every call with
 *     that target stage, not just the first one, so this is safe).
 *   - create_placement_invoice / record_invoice_payment /
 *     void_placement_invoice manage the invoice lifecycle.
 *   - mark_placement_fell_through voids a placement within its guarantee
 *     window (reopens the job's headcount, sets guarantee_status voided).
 *
 * Currency: every placement carries its own placement_fee_currency, set by
 * the recruiter at the moment they marked the candidate placed (Pipeline
 * page). There is no single team-wide currency. This page never hardcodes
 * a currency default — invoice amounts, summary totals, and every $/£/€/₦
 * label default to and are grouped by *that specific placement's*
 * placement_fee_currency, falling back to the candidate_jobs default
 * ('NGN') only in the one spot (ad-hoc invoice with no linked fee) where
 * no placement currency exists to inherit.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  Loader2, X, ChevronRight, ChevronDown, User, Briefcase, Building2,
  HandCoins, ShieldCheck, ShieldAlert, ShieldOff, FileText, Plus,
  CheckCircle2, AlertTriangle, Ban, Search, Mail, FileDown,
} from "lucide-react";
import { downloadPlacementInvoicePdf } from "@/lib/placementInvoicePdf";

// ─── Types ───────────────────────────────────────────────────────────────────

const CURRENCIES = ["NGN", "USD", "GBP", "EUR"];

interface Placement {
  id: string;
  candidate_id: string;
  job_id: string;
  placed_at: string | null;
  placement_salary: number | null;
  placement_salary_currency: string | null;
  placement_fee: number | null;
  placement_fee_currency: string | null;
  placement_notes: string | null;
  commission_pct: number | null;
  guarantee_days: number | null;
  guarantee_end_date: string | null;
  guarantee_status: string | null;
  candidate: { id: string; full_name: string } | null;
  job: { id: string; title: string; client_id: string | null } | null;
  client: { id: string; name: string } | null;
}

interface Invoice {
  id: string;
  candidate_job_id: string;
  invoice_number: string | null;
  amount: number;
  currency: string;
  status: string;
  issued_date: string | null;
  due_date: string | null;
  paid_date: string | null;
  paid_amount: number | null;
  notes: string | null;
  created_at: string;
}

interface InvoiceClientContact {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  is_primary_contact: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fmtMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return "—";
  const cur = currency || "";
  return `${cur} ${Number(amount).toLocaleString()}`.trim();
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Mirrors SubmissionsPage's buildSubjectAndBody — same "no third-party
// email provider" mailto: pattern, just built around an invoice instead of
// a candidate submission.
function buildInvoiceSubjectAndBody(params: {
  invoiceNumber: string | null;
  amount: number;
  currency: string;
  dueDate: string | null;
  notes: string | null;
  candidateName: string;
  jobTitle: string;
  clientName: string | null;
  teamName: string;
  recruiterName: string;
}) {
  const { invoiceNumber, amount, currency, dueDate, notes, candidateName, jobTitle, clientName, teamName, recruiterName } = params;
  const label = invoiceNumber ? `Invoice ${invoiceNumber}` : "Invoice";
  const subject = `${label} — Placement fee for ${candidateName} (${jobTitle})${clientName ? " — " + clientName : ""}`;

  const lines: string[] = [];
  lines.push(`Dear ${clientName || "Hiring Team"},`);
  lines.push("");
  lines.push(`Please find the placement invoice details below for ${candidateName}, placed in the ${jobTitle} role.`);
  lines.push("");
  lines.push("INVOICE DETAILS");
  if (invoiceNumber) lines.push(`Invoice number: ${invoiceNumber}`);
  lines.push(`Amount due: ${fmtMoney(amount, currency)}`);
  if (dueDate) lines.push(`Due date: ${fmtDate(dueDate)}`);
  if (notes) {
    lines.push("");
    lines.push(notes);
  }
  lines.push("");
  lines.push("Please let us know if you have any questions or need a formal PDF copy for your records.");
  lines.push("");
  lines.push("Thank you,");
  lines.push(recruiterName);
  if (teamName) lines.push(teamName);

  return { subject, body: lines.join("\n") };
}

const INVOICE_STATUS_CFG: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "#94a3b8" },
  sent: { label: "Sent", color: "#60a5fa" },
  paid: { label: "Paid", color: "#22c55e" },
  partial: { label: "Partially Paid", color: "#f59e0b" },
  overdue: { label: "Overdue", color: "#ef4444" },
  void: { label: "Void", color: "#78716c" },
};

const GUARANTEE_CFG: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  active: { label: "Guarantee active", color: "#2F6B4F", icon: ShieldCheck },
  expired: { label: "Guarantee expired", color: "#94a3b8", icon: ShieldOff },
  voided: { label: "Fell through", color: "#ef4444", icon: ShieldAlert },
};

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 7, background: color + "18", color, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

// ─── Summary header ──────────────────────────────────────────────────────────

function SummaryBar({ placements, invoices }: { placements: Placement[]; invoices: Invoice[] }) {
  // Grouped by currency — a team can (and here, does) place candidates in
  // more than one currency, so a single blended total would be meaningless.
  const byCurrency = useMemo(() => {
    const map = new Map<string, { feeValue: number; invoiced: number; collected: number; outstanding: number }>();
    const get = (cur: string) => {
      if (!map.has(cur)) map.set(cur, { feeValue: 0, invoiced: 0, collected: 0, outstanding: 0 });
      return map.get(cur)!;
    };
    for (const p of placements) {
      if (p.placement_fee != null) {
        get(p.placement_fee_currency || "NGN").feeValue += Number(p.placement_fee);
      }
    }
    for (const inv of invoices) {
      const bucket = get(inv.currency || "NGN");
      if (inv.status !== "void") bucket.invoiced += Number(inv.amount);
      if (inv.status === "paid" || inv.status === "partial") bucket.collected += Number(inv.paid_amount || 0);
      if (["sent", "partial", "overdue"].includes(inv.status)) bucket.outstanding += Number(inv.amount) - Number(inv.paid_amount || 0);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].feeValue - a[1].feeValue);
  }, [placements, invoices]);

  const activeGuarantees = placements.filter(p => p.guarantee_status === "active").length;
  const expiringSoon = placements.filter(p => {
    if (p.guarantee_status !== "active" || !p.guarantee_end_date) return false;
    const days = (new Date(p.guarantee_end_date).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 7;
  }).length;
  const overdueCount = invoices.filter(i => i.status === "sent" || i.status === "partial")
    .filter(i => i.due_date && new Date(i.due_date) < new Date()).length;

  if (placements.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {byCurrency.map(([currency, t]) => (
          <div key={currency} style={{ flex: "1 1 220px", background: "#fff", border: "1px solid rgba(23,23,15,0.08)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              {currency} placements
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 6, columnGap: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#17170F" }}>{fmtMoney(t.feeValue, currency)}</div>
                <div style={{ fontSize: 10, color: "rgba(23,23,15,0.4)" }}>Total fee value</div>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#2F6B4F" }}>{fmtMoney(t.collected, currency)}</div>
                <div style={{ fontSize: 10, color: "rgba(23,23,15,0.4)" }}>Collected</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#17170F" }}>{fmtMoney(t.invoiced, currency)}</div>
                <div style={{ fontSize: 10, color: "rgba(23,23,15,0.4)" }}>Invoiced</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.outstanding > 0 ? "#b45309" : "#17170F" }}>{fmtMoney(t.outstanding, currency)}</div>
                <div style={{ fontSize: 10, color: "rgba(23,23,15,0.4)" }}>Outstanding</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {(activeGuarantees > 0 || overdueCount > 0) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {activeGuarantees > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#2F6B4F", background: "rgba(47,107,79,0.09)", padding: "5px 10px", borderRadius: 8 }}>
              <ShieldCheck style={{ width: 12, height: 12 }} />
              {activeGuarantees} guarantee{activeGuarantees === 1 ? "" : "s"} active
              {expiringSoon > 0 && <span style={{ color: "#b45309" }}>· {expiringSoon} expiring within 7 days</span>}
            </div>
          )}
          {overdueCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#ef4444", background: "rgba(239,68,68,0.08)", padding: "5px 10px", borderRadius: 8 }}>
              <AlertTriangle style={{ width: 12, height: 12 }} />
              {overdueCount} invoice{overdueCount === 1 ? "" : "s"} overdue
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Terms editor (commission % / guarantee days) ────────────────────────────

function TermsDrawer({ placement, onClose, onSaved }: {
  placement: Placement; onClose: () => void; onSaved: () => void;
}) {
  const [commission, setCommission] = useState(placement.commission_pct != null ? String(placement.commission_pct) : "");
  const [guaranteeDays, setGuaranteeDays] = useState(placement.guarantee_days != null ? String(placement.guarantee_days) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("advance_candidate_pipeline_stage", {
        p_candidate_job_id: placement.id,
        p_new_stage: "placed",
        p_commission_pct: commission ? Number(commission) : null,
        p_guarantee_days: guaranteeDays ? Number(guaranteeDays) : null,
      });
      if (error) throw error;
      toast.success("Placement terms updated");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update terms");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FAFAF8", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#17170F", margin: 0 }}>Placement terms</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.4)" }}><X style={{ width: 18, height: 18 }} /></button>
        </div>
        <p style={{ fontSize: 12, color: "rgba(23,23,15,0.5)", margin: "0 0 16px" }}>
          {placement.candidate?.full_name} · {placement.job?.title}
        </p>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Commission %</label>
          <input type="number" step="0.1" value={commission} onChange={e => setCommission(e.target.value)} style={inputStyle} placeholder="e.g. 20" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Guarantee period (days)</label>
          <input type="number" value={guaranteeDays} onChange={e => setGuaranteeDays(e.target.value)} style={inputStyle} placeholder="e.g. 90" />
          <p style={{ fontSize: 11, color: "rgba(23,23,15,0.4)", margin: "5px 0 0" }}>
            Sets the guarantee end date to {guaranteeDays ? `${guaranteeDays} days from today` : "today plus this many days"} and marks the guarantee active.
          </p>
        </div>

        <button onClick={save} disabled={saving} style={{ width: "100%", padding: "12px 16px", background: "#22315C", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
          Save terms
        </button>
      </div>
    </div>
  );
}

// ─── Create invoice drawer ───────────────────────────────────────────────────
// Two steps: (1) enter invoice terms and create it via create_placement_invoice,
// (2) optionally email it to the client — same "no third-party provider"
// mailto: handoff SubmissionsPage already uses for candidate submissions,
// so this needs no new edge function and stays within the project's
// current edge function usage.

function CreateInvoiceDrawer({ placement, onClose, onCreated }: {
  placement: Placement; onClose: () => void; onCreated: () => void;
}) {
  const { team } = useTeam();
  const { user } = useAuth();

  // Currency always defaults to *this placement's* fee currency — the one
  // the recruiter chose when the candidate was marked placed — never a
  // hardcoded USD/NGN. Only falls back to NGN (the table default) on the
  // rare placement that has no fee currency recorded at all.
  const defaultCurrency = placement.placement_fee_currency || "NGN";
  const [amount, setAmount] = useState(placement.placement_fee != null ? String(placement.placement_fee) : "");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Step 2 — populated once the invoice is actually created.
  const [createdInvoice, setCreatedInvoice] = useState<{ invoiceNumber: string | null; amount: number; currency: string; dueDate: string | null; notes: string | null } | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contacts, setContacts] = useState<InvoiceClientContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const submit = async () => {
    if (!amount || Number(amount) <= 0) {
      toast.error("Enter an invoice amount");
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("create_placement_invoice", {
        p_candidate_job_id: placement.id,
        p_amount: Number(amount),
        p_currency: currency,
        p_invoice_number: invoiceNumber || null,
        p_due_date: dueDate || null,
        p_notes: notes || null,
      });
      if (error) throw error;
      toast.success("Invoice created and marked sent");
      onCreated();

      // Read back the row we just created rather than trust the RPC
      // response's shape (composite-returning RPCs aren't guaranteed to
      // come back in the same object shape as a plain select) — this is
      // the only place we need the *actual* stored invoice_number,
      // since it may have just been auto-generated server-side.
      let invNumber: string | null = invoiceNumber || null;
      try {
        const { data: freshInvoice } = await (supabase as any)
          .from("placement_invoices")
          .select("invoice_number")
          .eq("candidate_job_id", placement.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (freshInvoice?.invoice_number) invNumber = freshInvoice.invoice_number;
      } catch {
        // Non-fatal — falls back to whatever the recruiter typed (or null),
        // the email step below still works either way.
      }

      setCreatedInvoice({ invoiceNumber: invNumber, amount: Number(amount), currency, dueDate: dueDate || null, notes: notes || null });

      const { subject: s, body: b } = buildInvoiceSubjectAndBody({
        invoiceNumber: invNumber,
        amount: Number(amount),
        currency,
        dueDate: dueDate || null,
        notes: notes || null,
        candidateName: placement.candidate?.full_name ?? "the candidate",
        jobTitle: placement.job?.title ?? "the role",
        clientName: placement.client?.name ?? null,
        teamName: team?.name || "",
        recruiterName: (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Recruiter",
      });
      setSubject(s);
      setBody(b);

      // Load the client's contacts so the recruiter can pick a recipient
      // the same way SubmissionsPage's client-submission email does,
      // instead of having to remember/type the address from scratch.
      const clientId = placement.job?.client_id;
      if (clientId) {
        setContactsLoading(true);
        try {
          const { data: contactRows, error: contactErr } = await (supabase as any)
            .from("client_contacts")
            .select("id, full_name, email, job_title, is_primary_contact")
            .eq("client_id", clientId);
          if (!contactErr) {
            const list = (contactRows ?? []) as InvoiceClientContact[];
            setContacts(list);
            const primary = list.find(c => c.is_primary_contact && c.email) ?? list.find(c => c.email);
            if (primary?.email) {
              setSelectedContactId(primary.id);
              setRecipientEmail(primary.email);
            }
          }
        } finally {
          setContactsLoading(false);
        }
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  const emailValid = EMAIL_RE.test(recipientEmail.trim());
  const showEmailError = emailTouched && recipientEmail.trim().length > 0 && !emailValid;
  const showEmailRequired = emailTouched && recipientEmail.trim().length === 0;

  const handleSendEmail = async () => {
    setEmailTouched(true);
    const trimmedEmail = recipientEmail.trim();
    if (!trimmedEmail) { toast.error("Enter the client's email address"); return; }
    if (!EMAIL_RE.test(trimmedEmail)) { toast.error("That doesn't look like a valid email address"); return; }
    if (!subject.trim()) { toast.error("Subject can't be empty"); return; }
    if (!body.trim()) { toast.error("Message can't be empty"); return; }
    if (!createdInvoice) return;

    // Download the PDF first — mailto: links can't carry attachments (no
    // browser/OS supports that), so the honest flow is: the PDF lands in
    // the recruiter's Downloads, and the pre-filled email opens right
    // after, ready for them to drag it in.
    downloadPlacementInvoicePdf({
      invoiceNumber: createdInvoice.invoiceNumber,
      amount: createdInvoice.amount,
      currency: createdInvoice.currency,
      issuedDate: new Date().toISOString().slice(0, 10),
      dueDate: createdInvoice.dueDate,
      status: "sent",
      notes: createdInvoice.notes,
      candidateName: placement.candidate?.full_name ?? "the candidate",
      jobTitle: placement.job?.title ?? "the role",
      clientName: placement.client?.name ?? null,
      teamName: team?.name || "",
      recruiterName: (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Recruiter",
      recruiterEmail: user?.email ?? null,
    });

    // Open the recruiter's own email client via mailto: — no third-party
    // email provider, nothing sent server-side, no connected account
    // required, same approach as SubmissionsPage's client-submission email.
    const mailto = `mailto:${encodeURIComponent(trimmedEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, "_self");
    toast.success("Invoice PDF downloaded — attach it to the email that just opened");

    // Team-visible log entry — this is "opened the email," not a confirmed
    // send (mailto: can't tell us whether the recruiter actually hit
    // send), so it's worded that way. Surfaces on this client's timeline
    // via get_recruiting_client_with_pipeline, same table
    // mark_placement_fell_through already logs to.
    if (team?.id) {
      try {
        await (supabase as any).from("recruiting_timeline_events").insert({
          team_id: team?.id,
          entity_type: "candidate_job",
          entity_id: placement.id,
          event_type: "invoice_email_opened",
          title: `Invoice ${createdInvoice.invoiceNumber ?? ""} email opened for ${placement.candidate?.full_name ?? "candidate"}`.trim(),
          actor_id: user?.id,
          metadata: { recipient_email: trimmedEmail, amount: createdInvoice.amount, currency: createdInvoice.currency },
        });
      } catch {
        // Best-effort activity log only — never block the actual email/PDF flow on this.
      }
    }

    onClose();
  };

  if (createdInvoice) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{ background: "#FAFAF8", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#17170F", margin: 0 }}>Email this invoice</h2>
              <p style={{ fontSize: 11.5, color: "rgba(23,23,15,0.45)", margin: "2px 0 0" }}>
                {createdInvoice.invoiceNumber ?? "Invoice"} · {fmtMoney(createdInvoice.amount, createdInvoice.currency)} · {placement.candidate?.full_name}
              </p>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.4)" }}><X style={{ width: 18, height: 18 }} /></button>
          </div>
          <p style={{ fontSize: 12, color: "rgba(23,23,15,0.5)", margin: "10px 0 16px" }}>
            Invoice created. Send it to the client now, or close this and send it later.
          </p>

          {contactsLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
              <Loader2 style={{ width: 18, height: 18, color: "rgba(23,23,15,0.3)", animation: "spin 1s linear infinite" }} />
            </div>
          ) : (
            <>
              <label style={labelStyle}>Client email</label>
              {contacts.length > 0 && (
                <select
                  value={selectedContactId}
                  onChange={e => {
                    setSelectedContactId(e.target.value);
                    const c = contacts.find(c => c.id === e.target.value);
                    if (c?.email) setRecipientEmail(c.email);
                  }}
                  style={{ ...inputStyle, marginBottom: 8 }}
                >
                  <option value="">Choose a client contact…</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id} disabled={!c.email}>
                      {c.full_name}{c.job_title ? ` (${c.job_title})` : ""}{!c.email ? " — no email on file" : ""}
                    </option>
                  ))}
                </select>
              )}
              <input
                value={recipientEmail}
                onChange={e => { setRecipientEmail(e.target.value); setSelectedContactId(""); }}
                onBlur={() => setEmailTouched(true)}
                placeholder="client@company.com"
                style={{ ...inputStyle, marginBottom: showEmailError || showEmailRequired ? 4 : 10, borderColor: (showEmailError || showEmailRequired) ? "#ef4444" : undefined }}
              />
              {showEmailError && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 10 }}>Enter a valid email address.</div>}
              {showEmailRequired && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 10 }}>Client email is required to send.</div>}
              {contacts.length === 0 && (
                <div style={{ fontSize: 11, color: "rgba(23,23,15,0.4)", marginTop: -4, marginBottom: 10 }}>
                  No contacts on file for this client yet — enter their email directly.
                </div>
              )}

              <label style={labelStyle}>Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />

              <label style={labelStyle}>Email preview (edit before sending)</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                style={{ ...inputStyle, minHeight: 220, resize: "vertical", marginBottom: 12, fontFamily: "monospace", fontSize: 12 }}
              />

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={onClose}
                  style={{ flex: 1, padding: "12px 16px", background: "rgba(23,23,15,0.05)", border: "none", borderRadius: 10, color: "rgba(23,23,15,0.6)", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
                >
                  Skip for now
                </button>
                <button
                  onClick={handleSendEmail}
                  style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 16px", background: "#22315C", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
                >
                  <Mail style={{ width: 14, height: 14 }} /> Email invoice
                </button>
              </div>
              <p style={{ fontSize: 10.5, color: "rgba(23,23,15,0.4)", margin: "8px 0 0", textAlign: "center" }}>
                Downloads a PDF copy of this invoice and opens your default email app with this message pre-filled — attach the PDF before sending.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FAFAF8", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#17170F", margin: 0 }}>New invoice</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.4)" }}><X style={{ width: 18, height: 18 }} /></button>
        </div>
        <p style={{ fontSize: 12, color: "rgba(23,23,15,0.5)", margin: "0 0 16px" }}>
          {placement.candidate?.full_name} · {placement.job?.title}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Amount</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} placeholder={placement.placement_fee != null ? String(placement.placement_fee) : "0"} />
          </div>
          <div>
            <label style={labelStyle}>Currency</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={inputStyle}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {placement.placement_fee != null && currency === defaultCurrency && (
          <p style={{ fontSize: 10.5, color: "rgba(23,23,15,0.4)", margin: "-4px 0 10px" }}>
            Defaulted to the {defaultCurrency} fee agreed at placement.
          </p>
        )}

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Invoice number</label>
          <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} style={inputStyle} placeholder="Auto-generated (e.g. INV-0001)" />
          <p style={{ fontSize: 10.5, color: "rgba(23,23,15,0.4)", margin: "4px 0 0" }}>
            Leave blank to auto-number sequentially for your team. Enter your own to override.
          </p>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Due date (optional)</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} />
        </div>

        <button onClick={submit} disabled={saving} style={{ width: "100%", padding: "12px 16px", background: "#22315C", border: "none", borderRadius: 10, color: "#FAFAF8", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
          Create invoice
        </button>
      </div>
    </div>
  );
}

// ─── Record payment drawer ────────────────────────────────────────────────────

function RecordPaymentDrawer({ invoice, onClose, onSaved }: {
  invoice: Invoice; onClose: () => void; onSaved: () => void;
}) {
  const remaining = Number(invoice.amount) - Number(invoice.paid_amount || 0);
  const [paidAmount, setPaidAmount] = useState(String(remaining > 0 ? remaining : invoice.amount));
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!paidAmount || Number(paidAmount) <= 0) {
      toast.error("Enter a payment amount");
      return;
    }
    setSaving(true);
    try {
      // Payment is cumulative against the invoice total, so combine with
      // whatever's already recorded rather than overwriting it.
      const total = Number(invoice.paid_amount || 0) + Number(paidAmount);
      const { error } = await (supabase as any).rpc("record_invoice_payment", {
        p_invoice_id: invoice.id,
        p_paid_amount: total,
        p_paid_date: paidDate,
      });
      if (error) throw error;
      toast.success(total >= Number(invoice.amount) ? "Invoice marked paid" : "Partial payment recorded");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FAFAF8", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#17170F", margin: 0 }}>Record payment</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.4)" }}><X style={{ width: 18, height: 18 }} /></button>
        </div>
        <p style={{ fontSize: 12, color: "rgba(23,23,15,0.5)", margin: "0 0 16px" }}>
          {invoice.invoice_number || "Invoice"} · {fmtMoney(remaining, invoice.currency)} outstanding of {fmtMoney(invoice.amount, invoice.currency)}
        </p>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Payment amount ({invoice.currency})</label>
          <input type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Payment date</label>
          <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} style={inputStyle} />
        </div>

        <button onClick={submit} disabled={saving} style={{ width: "100%", padding: "12px 16px", background: "#22c55e", border: "none", borderRadius: 10, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
          Record payment
        </button>
      </div>
    </div>
  );
}

// ─── Fell-through confirm ────────────────────────────────────────────────────

function FellThroughDrawer({ placement, onClose, onSaved }: {
  placement: Placement; onClose: () => void; onSaved: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("mark_placement_fell_through", {
        p_candidate_job_id: placement.id,
        p_notes: notes || null,
      });
      if (error) throw error;
      toast.success("Placement marked as fallen through");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update placement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FAFAF8", borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 480, fontFamily: "'Inter', sans-serif", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#17170F", margin: 0 }}>Mark placement fell through</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,0.4)" }}><X style={{ width: 18, height: 18 }} /></button>
        </div>
        <p style={{ fontSize: 12, color: "rgba(23,23,15,0.5)", margin: "0 0 16px" }}>
          {placement.candidate?.full_name} · {placement.job?.title}. This voids the guarantee, reopens the role's headcount, and moves the candidate back to rejected. This can't be undone from here.
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} placeholder="What happened?" />
        </div>
        <button onClick={submit} disabled={saving} style={{ width: "100%", padding: "12px 16px", background: "#ef4444", border: "none", borderRadius: 10, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
          Confirm — placement fell through
        </button>
      </div>
    </div>
  );
}

// ─── Placement row ────────────────────────────────────────────────────────────

function PlacementRow({ placement, invoices, onEditTerms, onNewInvoice, onPayInvoice, onFellThrough, onVoidInvoice }: {
  placement: Placement;
  invoices: Invoice[];
  onEditTerms: () => void;
  onNewInvoice: () => void;
  onPayInvoice: (inv: Invoice) => void;
  onFellThrough: () => void;
  onVoidInvoice: (inv: Invoice) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { team } = useTeam();
  const { user } = useAuth();
  const guarantee = placement.guarantee_status ? GUARANTEE_CFG[placement.guarantee_status] : null;
  const GuaranteeIcon = guarantee?.icon;
  const fellThrough = placement.guarantee_status === "voided";

  const handleDownloadInvoicePdf = (inv: Invoice) => {
    downloadPlacementInvoicePdf({
      invoiceNumber: inv.invoice_number,
      amount: inv.amount,
      currency: inv.currency,
      issuedDate: inv.issued_date,
      dueDate: inv.due_date,
      status: inv.status,
      notes: inv.notes,
      candidateName: placement.candidate?.full_name ?? "the candidate",
      jobTitle: placement.job?.title ?? "the role",
      clientName: placement.client?.name ?? null,
      teamName: team?.name || "",
      recruiterName: (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Recruiter",
      recruiterEmail: user?.email ?? null,
    });
  };

  return (
    <div style={{ background: "#fff", border: "1px solid rgba(23,23,15,0.08)", borderRadius: 12, overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ padding: 14, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <User style={{ width: 13, height: 13, color: "#22315C", flexShrink: 0 }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#17170F" }}>{placement.candidate?.full_name ?? "Unknown"}</span>
            <ChevronRight style={{ width: 12, height: 12, color: "rgba(23,23,15,0.3)" }} />
            <Briefcase style={{ width: 12, height: 12, color: "rgba(23,23,15,0.4)" }} />
            <span style={{ fontSize: 12.5, color: "rgba(23,23,15,0.6)" }}>{placement.job?.title ?? "Unknown"}</span>
            {placement.client?.name && (
              <>
                <span style={{ color: "rgba(23,23,15,0.25)" }}>·</span>
                <Building2 style={{ width: 11, height: 11, color: "rgba(23,23,15,0.35)" }} />
                <span style={{ fontSize: 12, color: "rgba(23,23,15,0.5)" }}>{placement.client.name}</span>
              </>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {guarantee && GuaranteeIcon && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: guarantee.color, background: guarantee.color + "14", padding: "3px 8px", borderRadius: 7 }}>
                <GuaranteeIcon style={{ width: 11, height: 11 }} />
                {guarantee.label}
              </span>
            )}
            <ChevronDown style={{ width: 14, height: 14, color: "rgba(23,23,15,0.3)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12 }}>
          <div>
            <span style={{ color: "rgba(23,23,15,0.4)" }}>Fee </span>
            <span style={{ fontWeight: 700, color: "#17170F" }}>{fmtMoney(placement.placement_fee, placement.placement_fee_currency)}</span>
          </div>
          <div>
            <span style={{ color: "rgba(23,23,15,0.4)" }}>Salary </span>
            <span style={{ fontWeight: 600, color: "rgba(23,23,15,0.7)" }}>{fmtMoney(placement.placement_salary, placement.placement_salary_currency)}</span>
          </div>
          <div>
            <span style={{ color: "rgba(23,23,15,0.4)" }}>Commission </span>
            <span style={{ fontWeight: 600, color: "rgba(23,23,15,0.7)" }}>{placement.commission_pct != null ? `${placement.commission_pct}%` : "—"}</span>
          </div>
          <div>
            <span style={{ color: "rgba(23,23,15,0.4)" }}>Placed </span>
            <span style={{ fontWeight: 600, color: "rgba(23,23,15,0.7)" }}>{placement.placed_at ? formatDistanceToNow(new Date(placement.placed_at), { addSuffix: true }) : "—"}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid rgba(23,23,15,0.06)", padding: 14, background: "rgba(23,23,15,0.015)" }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <div style={sectionHeaderStyle}>Guarantee</div>
              <div style={{ fontSize: 12.5, color: "rgba(23,23,15,0.7)" }}>
                {placement.guarantee_days != null ? `${placement.guarantee_days} days` : "Not set"}
                {placement.guarantee_end_date ? ` · ends ${fmtDate(placement.guarantee_end_date)}` : ""}
              </div>
            </div>
            {placement.placement_notes && (
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={sectionHeaderStyle}>Notes</div>
                <div style={{ fontSize: 12.5, color: "rgba(23,23,15,0.7)" }}>{placement.placement_notes}</div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <button onClick={onEditTerms} style={actionBtnStyle("rgba(34,49,92,0.08)", "#22315C")}>
              <HandCoins style={{ width: 12, height: 12 }} /> Edit terms
            </button>
            {!fellThrough && (
              <button onClick={onNewInvoice} style={actionBtnStyle("#22315C", "#FAFAF8")}>
                <FileText style={{ width: 12, height: 12 }} /> New invoice
              </button>
            )}
            {!fellThrough && placement.guarantee_status === "active" && (
              <button onClick={onFellThrough} style={actionBtnStyle("rgba(239,68,68,0.08)", "#ef4444")}>
                <Ban style={{ width: 12, height: 12 }} /> Mark fell through
              </button>
            )}
          </div>

          {invoices.length > 0 && (
            <div>
              <div style={sectionHeaderStyle}>Invoices ({invoices.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {invoices.map(inv => {
                  const cfg = INVOICE_STATUS_CFG[inv.status] ?? { label: inv.status, color: "#94a3b8" };
                  const canPay = inv.status === "sent" || inv.status === "partial" || inv.status === "overdue";
                  return (
                    <div key={inv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", background: "#fff", border: "1px solid rgba(23,23,15,0.07)", borderRadius: 8, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#17170F" }}>{inv.invoice_number || "Unnumbered"}</span>
                        <span style={{ fontSize: 12, color: "rgba(23,23,15,0.6)" }}>{fmtMoney(inv.amount, inv.currency)}</span>
                        {inv.due_date && <span style={{ fontSize: 10.5, color: "rgba(23,23,15,0.4)" }}>due {fmtDate(inv.due_date)}</span>}
                        <StatusPill label={cfg.label} color={cfg.color} />
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => handleDownloadInvoicePdf(inv)} style={actionBtnStyle("rgba(34,49,92,0.08)", "#22315C")}>
                          <FileDown style={{ width: 11, height: 11 }} /> Download PDF
                        </button>
                        {canPay && (
                          <button onClick={() => onPayInvoice(inv)} style={actionBtnStyle("rgba(34,197,94,0.1)", "#22c55e")}>
                            <CheckCircle2 style={{ width: 11, height: 11 }} /> Record payment
                          </button>
                        )}
                        {inv.status !== "void" && inv.status !== "paid" && (
                          <button onClick={() => onVoidInvoice(inv)} style={actionBtnStyle("rgba(23,23,15,0.05)", "rgba(23,23,15,0.5)")}>
                            Void
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function actionBtnStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: bg, border: "none",
    borderRadius: 8, color, fontSize: 11, fontWeight: 700, cursor: "pointer",
  };
}
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,0.35)", textTransform: "uppercase",
  letterSpacing: "0.06em", marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", background: "rgba(23,23,15,0.03)",
  border: "1px solid rgba(23,23,15,0.1)", borderRadius: 8, color: "#17170F",
  fontSize: 13, fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,0.4)", marginBottom: 5, display: "block",
  textTransform: "uppercase", letterSpacing: "0.05em",
};

// ─── Main ────────────────────────────────────────────────────────────────────

type FilterKey = "all" | "active_guarantee" | "outstanding_invoices" | "fell_through";

function PlacementsPageInner() {
  const { teamId } = useTeam();
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const [termsFor, setTermsFor] = useState<Placement | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<Placement | null>(null);
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [fellThroughFor, setFellThroughFor] = useState<Placement | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [placementsRes, invoicesRes] = await Promise.all([
        (supabase as any)
          .from("candidate_jobs")
          .select(`
            id, candidate_id, job_id, placed_at,
            placement_salary, placement_salary_currency,
            placement_fee, placement_fee_currency, placement_notes,
            commission_pct, guarantee_days, guarantee_end_date, guarantee_status,
            candidate:candidates(id, full_name),
            job:jobs(id, title, client_id)
          `)
          .eq("team_id", teamId)
          .eq("pipeline_stage", "placed")
          .order("placed_at", { ascending: false }),
        (supabase as any)
          .from("placement_invoices")
          .select("id, candidate_job_id, invoice_number, amount, currency, status, issued_date, due_date, paid_date, paid_amount, notes, created_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false }),
      ]);
      if (placementsRes.error) throw placementsRes.error;
      if (invoicesRes.error) throw invoicesRes.error;

      let rows: Placement[] = placementsRes.data ?? [];

      // Resolve client names for the jobs we got back — jobs.client_id has
      // no FK embed configured for this select, so it's a light follow-up
      // query rather than a second round of per-row fetches.
      const clientIds = Array.from(new Set(rows.map(r => r.job?.client_id).filter(Boolean))) as string[];
      if (clientIds.length > 0) {
        const { data: clients } = await (supabase as any)
          .from("recruiting_clients")
          .select("id, name")
          .in("id", clientIds);
        const clientMap = new Map((clients ?? []).map((c: any) => [c.id, c]));
        rows = rows.map(r => ({ ...r, client: r.job?.client_id ? (clientMap.get(r.job.client_id) as any) ?? null : null }));
      }

      setPlacements(rows);
      setInvoices(invoicesRes.data ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load placements");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const invoicesByPlacement = useMemo(() => {
    const map = new Map<string, Invoice[]>();
    for (const inv of invoices) {
      if (!map.has(inv.candidate_job_id)) map.set(inv.candidate_job_id, []);
      map.get(inv.candidate_job_id)!.push(inv);
    }
    return map;
  }, [invoices]);

  const filtered = useMemo(() => {
    let rows = placements;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(p =>
        p.candidate?.full_name?.toLowerCase().includes(q) ||
        p.job?.title?.toLowerCase().includes(q) ||
        p.client?.name?.toLowerCase().includes(q)
      );
    }
    if (filter === "active_guarantee") rows = rows.filter(p => p.guarantee_status === "active");
    if (filter === "fell_through") rows = rows.filter(p => p.guarantee_status === "voided");
    if (filter === "outstanding_invoices") {
      rows = rows.filter(p => (invoicesByPlacement.get(p.id) ?? []).some(i => ["sent", "partial", "overdue"].includes(i.status)));
    }
    return rows;
  }, [placements, search, filter, invoicesByPlacement]);

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active_guarantee", label: "Active guarantee" },
    { key: "outstanding_invoices", label: "Outstanding invoices" },
    { key: "fell_through", label: "Fell through" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, margin: "0 auto", fontFamily: "'Inter', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: "#17170F", margin: 0 }}>Placement Financials</h1>
        <p style={{ fontSize: 12, color: "rgba(23,23,15,0.45)", margin: "2px 0 0" }}>
          Fees, commission, guarantees, and invoicing for every placed candidate.
        </p>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 style={{ width: 22, height: 22, color: "rgba(23,23,15,0.3)", animation: "spin 1s linear infinite" }} />
        </div>
      ) : placements.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: "rgba(23,23,15,0.02)", borderRadius: 14 }}>
          <HandCoins style={{ width: 24, height: 24, color: "rgba(23,23,15,0.25)", margin: "0 auto 10px" }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(23,23,15,0.55)", margin: "0 0 4px" }}>No placements yet.</p>
          <p style={{ fontSize: 12, color: "rgba(23,23,15,0.4)", margin: 0 }}>
            Mark a candidate as Placed from the Pipeline to see their financials here.
          </p>
        </div>
      ) : (
        <>
          <SummaryBar placements={placements} invoices={invoices} />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
              <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "rgba(23,23,15,0.35)" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search candidate, job, or client…"
                style={{ ...inputStyle, paddingLeft: 30 }}
              />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    padding: "7px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                    border: "1px solid " + (filter === f.key ? "#22315C" : "rgba(23,23,15,0.12)"),
                    background: filter === f.key ? "#22315C" : "#fff",
                    color: filter === f.key ? "#FAFAF8" : "rgba(23,23,15,0.6)",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "36px 20px", background: "rgba(23,23,15,0.02)", borderRadius: 14 }}>
              <p style={{ fontSize: 12.5, color: "rgba(23,23,15,0.45)" }}>No placements match this filter.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map(p => (
                <PlacementRow
                  key={p.id}
                  placement={p}
                  invoices={invoicesByPlacement.get(p.id) ?? []}
                  onEditTerms={() => setTermsFor(p)}
                  onNewInvoice={() => setInvoiceFor(p)}
                  onPayInvoice={(inv) => setPayFor(inv)}
                  onFellThrough={() => setFellThroughFor(p)}
                  onVoidInvoice={async (inv) => {
                    try {
                      const { error } = await (supabase as any).rpc("void_placement_invoice", { p_invoice_id: inv.id });
                      if (error) throw error;
                      toast.success("Invoice voided");
                      load();
                    } catch (e: any) {
                      toast.error(e.message ?? "Failed to void invoice");
                    }
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {termsFor && <TermsDrawer placement={termsFor} onClose={() => setTermsFor(null)} onSaved={load} />}
      {invoiceFor && <CreateInvoiceDrawer placement={invoiceFor} onClose={() => setInvoiceFor(null)} onCreated={load} />}
      {payFor && <RecordPaymentDrawer invoice={payFor} onClose={() => setPayFor(null)} onSaved={load} />}
      {fellThroughFor && <FellThroughDrawer placement={fellThroughFor} onClose={() => setFellThroughFor(null)} onSaved={load} />}
    </div>
  );
}

export default function PlacementsPage() {
  return (
    <DashboardLayout>
      <ErrorBoundary>
        <PlacementsPageInner />
      </ErrorBoundary>
    </DashboardLayout>
  );
}