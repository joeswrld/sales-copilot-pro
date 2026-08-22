/**
 * PublicJobApplicationPage.tsx
 *
 * Public job + application page at /apply/:slug — no auth required.
 * Mirrors ClipSharePage.tsx's public-page conventions (dark theme, inline
 * CSS string, unauthenticated Supabase Edge Function calls via raw fetch
 * since there is no user session to attach a JWT to).
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
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, AlertCircle, CheckCircle2, Building2, MapPin, Briefcase,
  Clock, DollarSign, Upload, FileText, X, Zap, ChevronLeft, ChevronRight,
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
        salary_expectation_currency: "NGN",
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

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Bricolage+Grotesque:wght@600;700;800&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    .pj-root{min-height:100vh;background:#060912;color:#f0f6fc;font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;}
    .pj-nav{display:flex;align-items:center;padding:14px 24px;border-bottom:1px solid rgba(255,255,255,.06);}
    .pj-nav-brand{display:flex;align-items:center;gap:8px;text-decoration:none;}
    .pj-logo{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#6d28d9);display:flex;align-items:center;justify-content:center;}
    .pj-brand-name{font-family:'Bricolage Grotesque',sans-serif;font-size:16px;font-weight:700;color:#f0f6fc;letter-spacing:-.03em;}
    .pj-content{max-width:680px;margin:0 auto;padding:40px 20px 80px;}
    .pj-eyebrow{font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;display:flex;align-items:center;gap:6px;}
    .pj-title{font-family:'Bricolage Grotesque',sans-serif;font-size:clamp(24px,4vw,34px);font-weight:800;color:#f0f6fc;letter-spacing:-.04em;line-height:1.15;margin-bottom:10px;}
    .pj-meta-row{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:22px;}
    .pj-meta-item{display:flex;align-items:center;gap:6px;font-size:13px;color:rgba(255,255,255,.55);}
    .pj-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:22px;margin-bottom:18px;}
    .pj-card h3{font-size:13px;font-weight:700;color:rgba(255,255,255,.85);margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em;}
    .pj-card p, .pj-card li{font-size:14px;color:rgba(255,255,255,.65);line-height:1.7;}
    .pj-card ul{padding-left:18px;}
    .pj-tag{display:inline-block;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;color:#a78bfa;background:rgba(124,58,237,.12);border:1px solid rgba(124,58,237,.25);margin:0 6px 6px 0;}
    .pj-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:12px;padding:14px 20px;font-size:15px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 4px 18px rgba(124,58,237,.35);transition:transform .12s;}
    .pj-cta:hover{transform:translateY(-1px);}
    .pj-cta:disabled{opacity:.55;cursor:not-allowed;transform:none;}
    .pj-cta-secondary{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);box-shadow:none;}
    .pj-error-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;padding:40px 20px;}
    .pj-form-section{margin-bottom:26px;}
    .pj-form-section h4{font-size:12px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;}
    .pj-field{margin-bottom:14px;}
    .pj-field label{display:block;font-size:12.5px;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:6px;}
    .pj-field label .req{color:#f87171;margin-left:3px;}
    .pj-input, .pj-textarea{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:11px 13px;color:#f0f6fc;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .12s;}
    .pj-input:focus, .pj-textarea:focus{border-color:rgba(124,58,237,.55);}
    .pj-textarea{resize:vertical;min-height:90px;}
    .pj-field-error{font-size:11.5px;color:#f87171;margin-top:5px;}
    .pj-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    .pj-dropzone{border:1.5px dashed rgba(255,255,255,.18);border-radius:10px;padding:22px;text-align:center;cursor:pointer;transition:border-color .12s, background .12s;}
    .pj-dropzone:hover{border-color:rgba(124,58,237,.4);background:rgba(124,58,237,.04);}
    .pj-file-chip{display:flex;align-items:center;gap:8px;background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.25);border-radius:9px;padding:10px 13px;font-size:13px;color:rgba(255,255,255,.85);}
    .pj-consent{display:flex;align-items:flex-start;gap:10px;font-size:12.5px;color:rgba(255,255,255,.6);line-height:1.6;margin:20px 0;}
    .pj-consent input{margin-top:2px;flex-shrink:0;}
    .pj-success{display:flex;flex-direction:column;align-items:center;text-align:center;padding:60px 20px;}
    .pj-back{display:flex;align-items:center;gap:6px;font-size:13px;color:rgba(255,255,255,.5);background:none;border:none;cursor:pointer;margin-bottom:18px;font-family:'DM Sans',sans-serif;}
    .pj-back:hover{color:rgba(255,255,255,.8);}
    @keyframes spin{to{transform:rotate(360deg)}}
  `;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#060912", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{css}</style>
        <Loader2 style={{ width: 28, height: 28, color: "#7c3aed", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  const blocked = !jobData || jobData.status !== "open";

  return (
    <div className="pj-root">
      <style>{css}</style>
      <nav className="pj-nav">
        <Link to="/" className="pj-nav-brand">
          <div className="pj-logo"><Zap style={{ width: 14, height: 14, color: "#fff" }} /></div>
          <span className="pj-brand-name">Fixsense</span>
        </Link>
      </nav>

      <div className="pj-content">
        {blocked ? (
          <div className="pj-error-screen">
            <AlertCircle style={{ width: 40, height: 40, color: "rgba(239,68,68,.6)", marginBottom: 16 }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Bricolage Grotesque',sans-serif", marginBottom: 8 }}>
              {jobData?.status === "closed" ? "Role no longer accepting applications" : "Application unavailable"}
            </h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.45)", maxWidth: 340, lineHeight: 1.6 }}>
              {BLOCKED_MESSAGES[jobData?.status ?? "not_found"]}
            </p>
          </div>
        ) : step === "success" ? (
          <div className="pj-success">
            <CheckCircle2 style={{ width: 46, height: 46, color: "#4ade80", marginBottom: 18 }} />
            <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Bricolage Grotesque',sans-serif", marginBottom: 10 }}>
              Application received
            </h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,.55)", maxWidth: 380, lineHeight: 1.7 }}>
              Thanks for applying to <strong style={{ color: "rgba(255,255,255,.8)" }}>{jobData?.job?.title}</strong> at{" "}
              <strong style={{ color: "rgba(255,255,255,.8)" }}>{jobData?.company?.name}</strong>. The recruiting team
              will review your application and reach out if there's a fit.
            </p>
          </div>
        ) : step === "job" ? (
          <>
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
          </>
        ) : (
          <>
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
                    <FileText style={{ width: 15, height: 15, color: "#a78bfa" }} />
                    <span style={{ flex: 1 }}>{cvFile.name}</span>
                    <X style={{ width: 14, height: 14, cursor: "pointer" }} onClick={() => setCvFile(null)} />
                  </div>
                ) : (
                  <label className="pj-dropzone">
                    <Upload style={{ width: 18, height: 18, color: "rgba(255,255,255,.35)", marginBottom: 6 }} />
                    <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.5)" }}>PDF, DOC or DOCX, up to 10MB</div>
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
              <Field label="Salary expectation (NGN)" required={jobData?.form?.require_salary_expectation} error={fieldErrors.salaryExpectation}>
                <input className="pj-input" type="number" min="0" value={salaryExpectation} onChange={e => setSalaryExpectation(e.target.value)} />
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
                {fieldErrors.consent && <span style={{ color: "#f87171", display: "block", marginTop: 4 }}>{fieldErrors.consent}</span>}
              </span>
            </label>

            {submitError && (
              <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 9, padding: "10px 13px", fontSize: 13, color: "#fca5a5", marginBottom: 16 }}>
                {submitError}
              </div>
            )}

            <button className="pj-cta" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : "Submit application"}
            </button>
          </>
        )}
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