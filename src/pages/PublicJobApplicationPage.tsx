/**
 * PublicJobApplicationPage.tsx
 *
 * Public job + application page at /apply/:slug — no auth required.
 * Visually matches LandingPage.tsx's design system (cream/paper background,
 * navy accent, Inter font, bordered cards, pill tags) rather than a
 * standalone dark theme, so a candidate's experience feels continuous with
 * the marketing site they may have arrived from. Step transitions use
 * framer-motion springs (critically damped, no overshoot — per the
 * apple-design house style) instead of hard cuts between job/form/success.
 *
 * Talks only to the public-job-application Edge Function:
 *   - action: "get"    → job/company/form config (blocked states are
 *                        rendered inline: inactive/expired/full/closed)
 *   - action: "submit" → multi-section application, including CV as base64
 *
 * No direct table or RPC access from this page — everything goes through
 * the Edge Function, which is the only thing allowed to write on behalf of
 * an anonymous applicant (see submit_public_application's revoked grants).
 */

import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, AlertCircle, CheckCircle2, Building2, MapPin, Briefcase,
  Clock, DollarSign, Upload, FileText, X, ChevronLeft, ChevronRight,
} from "lucide-react";

// public-job-application has verify_jwt=false and never requires a session —
// supabase.functions.invoke() works fine unauthenticated (it still attaches
// the anon apikey header from src/integrations/supabase/client.ts, which is
// all this function needs). Using the shared client keeps this page in sync
// with whatever project URL/key the rest of the app is built against,
// instead of hardcoding either here.
//
// The Edge Function always returns a JSON body — including on 4xx/5xx
// responses — so rather than reach into the SDK's internal error.context
// (undocumented/version-fragile), we read the response status directly off
// error.context when present and otherwise just surface error.message; the
// function's own { error: "CODE" } body is what callers below actually key
// off of via data?.error.
async function callPublicApplicationFn(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("public-job-application", { body });
  if (error) {
    const ctx: Response | undefined = (error as any)?.context;
    let parsed: any = {};
    if (ctx && typeof ctx.json === "function") {
      parsed = await ctx.json().catch(() => ({}));
    }
    return { ok: false, status: ctx?.status ?? 500, data: parsed?.error ? parsed : { error: error.message } };
  }
  return { ok: true, status: 200, data };
}

interface CustomQuestion {
  id: string;
  question: string;
  required: boolean;
}

interface JobData {
  status: "open" | "inactive" | "expired" | "full" | "closed" | "not_found";
  job?: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    work_arrangement: string | null;
    employment_type: string | null;
    salary_min: number | null;
    salary_max: number | null;
    salary_currency: string | null;
    must_have_requirements: string[];
    nice_to_have_requirements: string[];
    required_skills: string[];
    experience_requirements: string | null;
    expires_at: string | null;
  };
  company?: { name: string; logo_url: string | null; industry: string | null };
  form?: {
    require_cv: boolean;
    require_cover_letter: boolean;
    require_salary_expectation: boolean;
    require_phone: boolean;
    require_location: boolean;
    custom_questions: CustomQuestion[];
  };
}

type Step = "job" | "form" | "success";

const BLOCKED_MESSAGES: Record<string, string> = {
  inactive: "This application is no longer accepting applications.",
  expired: "This application is no longer accepting applications.",
  full: "This application is no longer accepting applications.",
  closed: "This role is no longer accepting applications — it has been filled or closed.",
  not_found: "We couldn't find this application. The link may be invalid.",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PublicJobApplicationPage() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [step, setStep] = useState<Step>("job");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [skillsInput, setSkillsInput] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [currentEmployer, setCurrentEmployer] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [salaryExpectation, setSalaryExpectation] = useState("");
  const [salaryCurrency, setSalaryCurrency] = useState("NGN");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [availability, setAvailability] = useState("");
  const [workAuthorization, setWorkAuthorization] = useState("");
  const [workPreference, setWorkPreference] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [consentGiven, setConsentGiven] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    const { data } = await callPublicApplicationFn({ action: "get", slug });
    setJobData(data);
    if (data?.job?.salary_currency) setSalaryCurrency(data.job.salary_currency);
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const form = jobData?.form;
    if (!firstName.trim()) errs.firstName = "Required";
    if (!lastName.trim()) errs.lastName = "Required";
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = "Enter a valid email";
    if (form?.require_phone && !phone.trim()) errs.phone = "Required";
    if (form?.require_location && !location.trim()) errs.location = "Required";
    if (form?.require_cover_letter && !coverLetter.trim()) errs.coverLetter = "Required";
    if (form?.require_salary_expectation && !salaryExpectation.trim()) errs.salaryExpectation = "Required";
    if (form?.require_cv && !cvFile) errs.cvFile = "Please attach your CV";
    if (form?.custom_questions) {
      for (const q of form.custom_questions) {
        if (q.required && !customAnswers[q.id]?.trim()) errs[`q_${q.id}`] = "Required";
      }
    }
    if (!consentGiven) errs.consent = "Please confirm to continue";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!slug || !validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let cv_file: { name: string; base64: string; type: string } | null = null;
      if (cvFile) {
        const base64 = await fileToBase64(cvFile);
        cv_file = { name: cvFile.name, base64, type: cvFile.type };
      }

      const custom_answers = (jobData?.form?.custom_questions ?? [])
        .filter(q => customAnswers[q.id]?.trim())
        .map(q => ({ question_id: q.id, question: q.question, answer: customAnswers[q.id].trim() }));

      const { ok, data } = await callPublicApplicationFn({
        action: "submit",
        slug,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        location: location.trim() || null,
        candidate_current_role: currentRole.trim() || null,
        years_experience: yearsExperience ? Number(yearsExperience) : null,
        skills: skillsInput.split(",").map(s => s.trim()).filter(Boolean),
        linkedin_url: linkedinUrl.trim() || null,
        portfolio_url: portfolioUrl.trim() || null,
        current_employer: currentEmployer.trim() || null,
        cover_letter: coverLetter.trim() || null,
        salary_expectation: salaryExpectation ? Number(salaryExpectation) : null,
        salary_expectation_currency: salaryCurrency,
        notice_period: noticePeriod.trim() || null,
        availability: availability.trim() || null,
        work_authorization: workAuthorization.trim() || null,
        work_preference: workPreference.trim() || null,
        custom_answers,
        consent_given: consentGiven,
        cv_file,
      });

      if (!ok) {
        const code = data?.error ?? "SUBMISSION_FAILED";
        if (code === "APPLICATION_LINK_EXPIRED" || code === "APPLICATION_LINK_INACTIVE" || code === "APPLICATION_LINK_FULL") {
          await load(); // re-fetch so the blocked-state screen renders
          return;
        }
        setSubmitError(humanizeError(code));
        return;
      }

      setStep("success");
    } catch (e: any) {
      setSubmitError("Something went wrong submitting your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const prefersReducedMotion = useReducedMotion();

  const css = `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --paper:#FAFAF8;--paper2:#F3F2ED;
      --ink:#17170F;--ink2:rgba(23,23,15,0.66);--muted:rgba(23,23,15,0.42);--faint:rgba(23,23,15,0.28);
      --border:rgba(23,23,15,0.11);--border-strong:rgba(23,23,15,0.18);
      --accent:#22315C;--accent-ink:#FAFAF8;--accent-soft:rgba(34,49,92,0.07);--accent-border:rgba(34,49,92,0.22);
      --bad:#b3432f;--bad-soft:rgba(179,67,47,0.08);--bad-border:rgba(179,67,47,0.22);
      --good:#2F6B4F;
      --fb:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      --fm:'IBM Plex Mono',ui-monospace,monospace;
      --radius-s:6px;--radius-m:10px;--radius-l:14px;
    }
    .pj-root{min-height:100vh;background:var(--paper);color:var(--ink);font-family:var(--fb);-webkit-font-smoothing:antialiased;font-feature-settings:"cv02","cv03","cv04";}
    @media (prefers-reduced-motion: reduce){
      .pj-root *{animation-duration:.001ms!important;animation-iteration-count:1!important;}
    }
    .pj-nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;height:60px;padding:0 22px;background:rgba(250,250,248,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--border);}
    .pj-nav-inner{max-width:720px;width:100%;margin:0 auto;display:flex;align-items:center;}
    .pj-nav-brand{display:flex;align-items:center;gap:9px;}
    .pj-logo{width:26px;height:26px;border-radius:7px;background:var(--accent-soft);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;}
    .pj-logo img{width:100%;height:100%;object-fit:cover;}
    .pj-brand-name{font-size:15px;font-weight:700;color:var(--ink);letter-spacing:-.01em;}
    .pj-content{max-width:680px;margin:0 auto;padding:44px 20px 80px;}
    .pj-eyebrow{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.09em;margin-bottom:14px;display:flex;align-items:center;gap:7px;}
    .pj-title{font-size:clamp(24px,4vw,34px);font-weight:700;color:var(--ink);letter-spacing:-.03em;line-height:1.12;margin-bottom:14px;}
    .pj-meta-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:26px;}
    .pj-meta-item{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;color:var(--ink2);background:var(--paper2);border:1px solid var(--border);border-radius:100px;padding:6px 12px 6px 10px;}
    .pj-meta-item svg{color:var(--muted);flex-shrink:0;}
    .pj-card{background:var(--paper);border:1px solid var(--border);border-radius:var(--radius-l);padding:22px;margin-bottom:16px;}
    .pj-card h3{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:.07em;}
    .pj-card p, .pj-card li{font-size:14px;color:var(--ink2);line-height:1.7;}
    .pj-card ul{padding-left:18px;}
    .pj-tag{display:inline-block;font-size:12px;font-weight:500;padding:5px 12px;border-radius:100px;color:var(--ink2);background:var(--paper2);border:1px solid var(--border);margin:0 6px 6px 0;}
    .pj-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:var(--accent);color:var(--accent-ink);border:1px solid var(--accent);border-radius:var(--radius-s);padding:14px 20px;font-size:14.5px;font-weight:600;cursor:pointer;font-family:var(--fb);transition:opacity .15s;min-height:48px;}
    .pj-cta:hover{opacity:.9;}
    .pj-cta:active{transform:scale(.985);}
    .pj-cta:disabled{opacity:.5;cursor:not-allowed;transform:none;}
    .pj-error-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;padding:40px 20px;}
    .pj-form-section{margin-bottom:28px;}
    .pj-form-section h4{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px;}
    .pj-field{margin-bottom:14px;}
    .pj-field label{display:block;font-size:12.5px;font-weight:600;color:var(--ink2);margin-bottom:6px;}
    .pj-field label .req{color:var(--bad);margin-left:3px;}
    .pj-input, .pj-textarea{width:100%;background:var(--paper);border:1px solid var(--border-strong);border-radius:var(--radius-s);padding:11px 13px;color:var(--ink);font-size:14px;font-family:var(--fb);outline:none;transition:border-color .15s,background .15s;}
    .pj-input:focus, .pj-textarea:focus{border-color:var(--accent);background:#fff;}
    .pj-textarea{resize:vertical;min-height:90px;}
    .pj-field-error{font-size:11.5px;color:var(--bad);margin-top:5px;}
    .pj-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    .pj-dropzone{border:1.5px dashed var(--border-strong);border-radius:var(--radius-m);padding:22px;text-align:center;cursor:pointer;transition:border-color .15s, background .15s;}
    .pj-dropzone:hover{border-color:var(--accent);background:var(--accent-soft);}
    .pj-file-chip{display:flex;align-items:center;gap:8px;background:var(--accent-soft);border:1px solid var(--accent-border);border-radius:var(--radius-s);padding:10px 13px;font-size:13px;color:var(--ink);}
    .pj-consent{display:flex;align-items:flex-start;gap:10px;font-size:12.5px;color:var(--ink2);line-height:1.6;margin:20px 0;}
    .pj-consent input{margin-top:2px;flex-shrink:0;}
    .pj-success{display:flex;flex-direction:column;align-items:center;text-align:center;padding:60px 20px;}
    .pj-back{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:var(--muted);background:none;border:none;cursor:pointer;margin-bottom:20px;font-family:var(--fb);padding:6px 0;transition:color .15s;}
    .pj-back:hover{color:var(--ink);}
    @keyframes spin{to{transform:rotate(360deg)}}
  `;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF8", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{css}</style>
        <Loader2 style={{ width: 26, height: 26, color: "#22315C", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  const blocked = !jobData || jobData.status !== "open";
  const companyName = jobData?.company?.name || "Careers";
  const companyLogo = jobData?.company?.logo_url;

  // Critically damped by default (damping 1.0-equivalent bounce:0), per the
  // apple-design house style — motion here is state-driven navigation, not
  // a flick/drag gesture, so no overshoot.
  const stepTransition = prefersReducedMotion
    ? { duration: 0.2 }
    : { type: "spring" as const, bounce: 0, duration: 0.4 };
  const stepMotionProps = prefersReducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 } };

  return (
    <div className="pj-root">
      <style>{css}</style>
      <nav className="pj-nav">
        <div className="pj-nav-inner">
          <div className="pj-nav-brand">
            <div className="pj-logo">
              {companyLogo ? (
                <img src={companyLogo} alt={companyName} />
              ) : (
                <Building2 style={{ width: 13, height: 13, color: "#22315C" }} />
              )}
            </div>
            <span className="pj-brand-name">{companyName}</span>
          </div>
        </div>
      </nav>

      <div className="pj-content">
        <AnimatePresence mode="wait">
          {blocked ? (
            <motion.div key="blocked" {...stepMotionProps} transition={stepTransition} className="pj-error-screen">
              <AlertCircle style={{ width: 38, height: 38, color: "#b3432f", marginBottom: 16 }} />
              <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.02em", marginBottom: 8 }}>
                {jobData?.status === "closed" ? "Role no longer accepting applications" : "Application unavailable"}
              </h2>
              <p style={{ fontSize: 13, color: "rgba(23,23,15,0.45)", maxWidth: 340, lineHeight: 1.6 }}>
                {BLOCKED_MESSAGES[jobData?.status ?? "not_found"]}
              </p>
            </motion.div>
          ) : step === "success" ? (
            <motion.div key="success" {...stepMotionProps} transition={stepTransition} className="pj-success">
              <CheckCircle2 style={{ width: 44, height: 44, color: "#2F6B4F", marginBottom: 18 }} />
              <h2 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.02em", marginBottom: 10 }}>
                Application received
              </h2>
              <p style={{ fontSize: 14, color: "rgba(23,23,15,0.55)", maxWidth: 380, lineHeight: 1.7 }}>
                Thanks for applying to <strong style={{ color: "#17170F" }}>{jobData?.job?.title}</strong> at{" "}
                <strong style={{ color: "#17170F" }}>{jobData?.company?.name}</strong>. The recruiting team
                will review your application and reach out if there's a fit.
              </p>
            </motion.div>
          ) : step === "job" ? (
            <motion.div key="job" {...stepMotionProps} transition={stepTransition}>
            <div className="pj-eyebrow">
              <Building2 style={{ width: 12, height: 12 }} />
              {jobData?.company?.name}
            </div>
            <h1 className="pj-title">{jobData?.job?.title}</h1>
            <div className="pj-meta-row">
              {jobData?.job?.location && (
                <span className="pj-meta-item"><MapPin style={{ width: 13, height: 13 }} /> {jobData.job.location}</span>
              )}
              {jobData?.job?.work_arrangement && (
                <span className="pj-meta-item"><Briefcase style={{ width: 13, height: 13 }} /> {capitalize(jobData.job.work_arrangement)}</span>
              )}
              {jobData?.job?.employment_type && (
                <span className="pj-meta-item"><Clock style={{ width: 13, height: 13 }} /> {capitalize(jobData.job.employment_type)}</span>
              )}
              {(jobData?.job?.salary_min || jobData?.job?.salary_max) && (
                <span className="pj-meta-item">
                  <DollarSign style={{ width: 13, height: 13 }} />
                  {formatSalaryRange(jobData.job.salary_min, jobData.job.salary_max, jobData.job.salary_currency)}
                </span>
              )}
            </div>

            {jobData?.job?.description && (
              <div className="pj-card">
                <h3>About the role</h3>
                <p style={{ whiteSpace: "pre-wrap" }}>{jobData.job.description}</p>
              </div>
            )}

            {!!jobData?.job?.must_have_requirements?.length && (
              <div className="pj-card">
                <h3>Required qualifications</h3>
                <ul>{jobData.job.must_have_requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            )}

            {!!jobData?.job?.nice_to_have_requirements?.length && (
              <div className="pj-card">
                <h3>Preferred qualifications</h3>
                <ul>{jobData.job.nice_to_have_requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            )}

            {jobData?.job?.experience_requirements && (
              <div className="pj-card">
                <h3>Experience</h3>
                <p>{jobData.job.experience_requirements}</p>
              </div>
            )}

            {!!jobData?.job?.required_skills?.length && (
              <div className="pj-card">
                <h3>Skills</h3>
                <div>{jobData.job.required_skills.map((s, i) => <span className="pj-tag" key={i}>{s}</span>)}</div>
              </div>
            )}

            <button className="pj-cta" onClick={() => setStep("form")}>
              Apply for this role <ChevronRight style={{ width: 16, height: 16 }} />
            </button>
          </motion.div>
        ) : (
          <motion.div key="form" {...stepMotionProps} transition={stepTransition}>
            <button className="pj-back" onClick={() => setStep("job")}>
              <ChevronLeft style={{ width: 14, height: 14 }} /> Back to role details
            </button>
            <h1 className="pj-title" style={{ fontSize: 22, marginBottom: 22 }}>
              Apply for {jobData?.job?.title}
            </h1>

            <div className="pj-form-section">
              <h4>Personal information</h4>
              <div className="pj-row2">
                <Field label="First name" required error={fieldErrors.firstName}>
                  <input className="pj-input" value={firstName} onChange={e => setFirstName(e.target.value)} />
                </Field>
                <Field label="Last name" required error={fieldErrors.lastName}>
                  <input className="pj-input" value={lastName} onChange={e => setLastName(e.target.value)} />
                </Field>
              </div>
              <Field label="Email" required error={fieldErrors.email}>
                <input className="pj-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </Field>
              <Field label="Phone" required={jobData?.form?.require_phone} error={fieldErrors.phone}>
                <input className="pj-input" value={phone} onChange={e => setPhone(e.target.value)} />
              </Field>
              <Field label="Location" required={jobData?.form?.require_location} error={fieldErrors.location}>
                <input className="pj-input" placeholder="City, Country" value={location} onChange={e => setLocation(e.target.value)} />
              </Field>
            </div>

            <div className="pj-form-section">
              <h4>Professional information</h4>
              <Field label="Current / most recent role">
                <input className="pj-input" value={currentRole} onChange={e => setCurrentRole(e.target.value)} />
              </Field>
              <div className="pj-row2">
                <Field label="Current employer">
                  <input className="pj-input" value={currentEmployer} onChange={e => setCurrentEmployer(e.target.value)} />
                </Field>
                <Field label="Years of experience">
                  <input className="pj-input" type="number" min="0" value={yearsExperience} onChange={e => setYearsExperience(e.target.value)} />
                </Field>
              </div>
              <Field label="Skills (comma-separated)">
                <input className="pj-input" placeholder="React, TypeScript, AWS" value={skillsInput} onChange={e => setSkillsInput(e.target.value)} />
              </Field>
              <div className="pj-row2">
                <Field label="LinkedIn URL">
                  <input className="pj-input" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} />
                </Field>
                <Field label="Portfolio URL">
                  <input className="pj-input" value={portfolioUrl} onChange={e => setPortfolioUrl(e.target.value)} />
                </Field>
              </div>
            </div>

            <div className="pj-form-section">
              <h4>Application</h4>
              <Field label="CV / Resume" required={jobData?.form?.require_cv} error={fieldErrors.cvFile}>
                {cvFile ? (
                  <div className="pj-file-chip">
                    <FileText style={{ width: 15, height: 15, color: "#22315C" }} />
                    <span style={{ flex: 1 }}>{cvFile.name}</span>
                    <X style={{ width: 14, height: 14, cursor: "pointer" }} onClick={() => setCvFile(null)} />
                  </div>
                ) : (
                  <label className="pj-dropzone">
                    <Upload style={{ width: 18, height: 18, color: "rgba(23,23,15,0.3)", marginBottom: 6 }} />
                    <div style={{ fontSize: 12.5, color: "rgba(23,23,15,0.45)" }}>PDF, DOC or DOCX, up to 10MB</div>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      style={{ display: "none" }}
                      onChange={e => setCvFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
              </Field>
              <Field label="Cover letter" required={jobData?.form?.require_cover_letter} error={fieldErrors.coverLetter}>
                <textarea className="pj-textarea" value={coverLetter} onChange={e => setCoverLetter(e.target.value)} />
              </Field>
              <Field label="Salary expectation" required={jobData?.form?.require_salary_expectation} error={fieldErrors.salaryExpectation}>
                <div className="pj-row2" style={{ gridTemplateColumns: "1fr 100px" }}>
                  <input className="pj-input" type="number" min="0" value={salaryExpectation} onChange={e => setSalaryExpectation(e.target.value)} placeholder="Amount" />
                  <select className="pj-input" value={salaryCurrency} onChange={e => setSalaryCurrency(e.target.value)}>
                    <option value="NGN">NGN</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </Field>
              <div className="pj-row2">
                <Field label="Notice period">
                  <input className="pj-input" placeholder="e.g. 4 weeks" value={noticePeriod} onChange={e => setNoticePeriod(e.target.value)} />
                </Field>
                <Field label="Availability">
                  <input className="pj-input" placeholder="e.g. Immediate" value={availability} onChange={e => setAvailability(e.target.value)} />
                </Field>
              </div>
              <div className="pj-row2">
                <Field label="Work authorization">
                  <input className="pj-input" value={workAuthorization} onChange={e => setWorkAuthorization(e.target.value)} />
                </Field>
                <Field label="Remote / work preference">
                  <input className="pj-input" placeholder="e.g. Hybrid" value={workPreference} onChange={e => setWorkPreference(e.target.value)} />
                </Field>
              </div>
            </div>

            {!!jobData?.form?.custom_questions?.length && (
              <div className="pj-form-section">
                <h4>Additional questions</h4>
                {jobData.form.custom_questions.map(q => (
                  <Field key={q.id} label={q.question} required={q.required} error={fieldErrors[`q_${q.id}`]}>
                    <textarea
                      className="pj-textarea"
                      style={{ minHeight: 70 }}
                      value={customAnswers[q.id] ?? ""}
                      onChange={e => setCustomAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                    />
                  </Field>
                ))}
              </div>
            )}

            <label className="pj-consent">
              <input type="checkbox" checked={consentGiven} onChange={e => setConsentGiven(e.target.checked)} />
              <span>
                I consent to {jobData?.company?.name ?? "the hiring team"} and its recruiting partner processing my
                personal information and CV for the purpose of evaluating this application.
                {fieldErrors.consent && <span style={{ color: "#b3432f", display: "block", marginTop: 4 }}>{fieldErrors.consent}</span>}
              </span>
            </label>

            {submitError && (
              <div style={{ background: "rgba(179,67,47,0.08)", border: "1px solid rgba(179,67,47,0.22)", borderRadius: 9, padding: "10px 13px", fontSize: 13, color: "#b3432f", marginBottom: 16 }}>
                {submitError}
              </div>
            )}

            <button className="pj-cta" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : "Submit application"}
            </button>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="pj-field">
      <label>{label}{required && <span className="req">*</span>}</label>
      {children}
      {error && <div className="pj-field-error">{error}</div>}
    </div>
  );
}

function capitalize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatSalaryRange(min: number | null, max: number | null, currency: string | null): string {
  const cur = currency ?? "NGN";
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString();
  if (min && max) return `${cur} ${fmt(min)} - ${fmt(max)}`;
  if (min) return `${cur} ${fmt(min)}+`;
  if (max) return `Up to ${cur} ${fmt(max)}`;
  return "";
}

function humanizeError(code: string): string {
  const map: Record<string, string> = {
    CV_REQUIRED: "Please attach your CV to continue.",
    COVER_LETTER_REQUIRED: "Please add a cover letter to continue.",
    SALARY_EXPECTATION_REQUIRED: "Please share your salary expectation to continue.",
    PHONE_REQUIRED: "Please add a phone number to continue.",
    LOCATION_REQUIRED: "Please add your location to continue.",
    CONSENT_REQUIRED: "Please confirm the consent checkbox to continue.",
    INVALID_EMAIL: "Please enter a valid email address.",
    APPLICATION_LINK_NOT_FOUND: "This application link could not be found.",
    JOB_NOT_FOUND: "This role could not be found.",
  };
  return map[code] ?? "We couldn't submit your application. Please check your details and try again.";
}