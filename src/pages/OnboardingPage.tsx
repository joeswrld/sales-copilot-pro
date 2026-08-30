/**
 * OnboardingPage.tsx
 *
 * First-run activation flow for new Fixsense users.
 * Triggered automatically when profile.onboarding_complete is false/null
 * (see LoginPage.tsx / AuthPanel.tsx / DashboardHome.tsx — onboarding_complete
 * is the single source of truth for routing here).
 *
 * A minimal 5-field form (agency name, recruiter name, recruitment
 * speciality, country/region, company website) that writes straight to the
 * existing public.teams row via useTeam()'s createTeam RPC (create_team_with_owner)
 * when the user has no team yet, then a direct update to that team row —
 * both already-established primitives, no new table or RPC. No feature
 * tour: the old 5-step walkthrough is gone in favor of getting the
 * recruiter to a real action (first job / first candidates) as fast as
 * possible.
 *
 * Visual system matches LandingPage.tsx: warm paper background, deep-navy
 * accent, Inter/IBM Plex Mono type — kept on purpose, since this is the
 * first authenticated screen after the marketing site.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "sonner";
import {
  Building2, User, Sparkles, Globe2, Link as LinkIcon,
  Loader2, ArrowRight, Briefcase, Users, LayoutDashboard,
} from "lucide-react";

// ─── Field config ────────────────────────────────────────────────────────

interface FormState {
  agency_name: string;
  recruiter_name: string;
  recruitment_speciality: string;
  country: string;
  company_website: string;
}

const EMPTY_FORM: FormState = {
  agency_name: "",
  recruiter_name: "",
  recruitment_speciality: "",
  country: "",
  company_website: "",
};

const FIELDS: {
  key: keyof FormState;
  label: string;
  placeholder: string;
  icon: typeof Building2;
  required: boolean;
  autoComplete?: string;
}[] = [
  { key: "agency_name", label: "Agency / company name", placeholder: "e.g. Northbridge Talent", icon: Building2, required: true, autoComplete: "organization" },
  { key: "recruiter_name", label: "Your name", placeholder: "e.g. Ada Okafor", icon: User, required: true, autoComplete: "name" },
  { key: "recruitment_speciality", label: "Recruitment speciality", placeholder: "e.g. Engineering, Sales, Executive Search", icon: Sparkles, required: true },
  { key: "country", label: "Country / region", placeholder: "e.g. Nigeria", icon: Globe2, required: true, autoComplete: "country-name" },
  { key: "company_website", label: "Company website", placeholder: "e.g. northbridgetalent.com", icon: LinkIcon, required: false, autoComplete: "url" },
];

// ─── Main component ────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { teamId, createTeam } = useTeam();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const requiredFilled =
    form.agency_name.trim() && form.recruiter_name.trim() &&
    form.recruitment_speciality.trim() && form.country.trim();

  const setField = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !requiredFilled || saving) return;
    setSaving(true);

    try {
      // Every user gets a team on signup in the happy path, but some rows
      // predate that (or the insert silently failed) — createTeam reuses
      // the existing create_team_with_owner RPC, which is idempotent about
      // membership (ON CONFLICT DO UPDATE), so this is safe to call even if
      // a team already exists under a different id than what useTeam() has
      // cached; we always prefer the id already on hand.
      let resolvedTeamId = teamId;
      if (!resolvedTeamId) {
        const created = await createTeam.mutateAsync(form.agency_name.trim());
        resolvedTeamId = (created as any)?.id ?? null;
      }

      if (!resolvedTeamId) throw new Error("Could not set up your team. Please try again.");

      const { error: teamErr } = await supabase
        .from("teams")
        .update({
          name: form.agency_name.trim(),
          agency_name: form.agency_name.trim(),
          recruiter_name: form.recruiter_name.trim(),
          recruitment_speciality: form.recruitment_speciality.trim(),
          country: form.country.trim(),
          company_website: form.company_website.trim() || null,
        } as any)
        .eq("id", resolvedTeamId);

      if (teamErr) throw teamErr;

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          full_name: form.recruiter_name.trim(),
          onboarding_complete: true,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", user.id);

      if (profileErr) throw profileErr;

      setDone(true);
    } catch (err: any) {
      console.error("Onboarding save error:", err);
      toast.error(err?.message ?? "Something went wrong saving your details.");
    } finally {
      setSaving(false);
    }
  };

  // ── CSS — same tokens as LandingPage.tsx (.lp): warm paper background,
  // deep-navy accent, Inter + IBM Plex Mono.
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&family=IBM+Plex+Mono:wght@500&display=swap');

    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --paper:#FAFAF8;--paper2:#F3F2ED;
      --ink:#17170F;--ink2:rgba(23,23,15,0.66);--muted:rgba(23,23,15,0.42);--faint:rgba(23,23,15,0.28);
      --border:rgba(23,23,15,0.11);--border-strong:rgba(23,23,15,0.18);
      --accent:#22315C;--accent-ink:#FAFAF8;--accent-soft:rgba(34,49,92,0.07);--accent-border:rgba(34,49,92,0.22);
      --good:#2F6B4F;--good-soft:rgba(47,107,79,0.09);
      --fd:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      --fb:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      --fm:'IBM Plex Mono',ui-monospace,monospace;
      --radius-s:8px;--radius-m:12px;--radius-l:18px;
    }
    .ob2{background:var(--paper);color:var(--ink);font-family:var(--fb);min-height:100vh;-webkit-font-smoothing:antialiased;}
    .ob2-wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;}
    .ob2-logo{display:flex;align-items:center;gap:8px;margin-bottom:36px;}
    .ob2-logo-img{width:26px;height:26px;border-radius:7px;}
    .ob2-logo-name{font-size:15.5px;font-weight:700;color:var(--ink);letter-spacing:-.01em;}

    .ob2-card{width:100%;max-width:460px;background:#fff;border:1px solid var(--border);border-radius:var(--radius-l);padding:36px 32px;box-shadow:0 1px 2px rgba(23,23,15,0.04),0 24px 64px -24px rgba(23,23,15,0.16);}
    .ob2-kicker{font-family:var(--fm);font-size:10.5px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;}
    .ob2-title{font-size:21px;font-weight:800;letter-spacing:-.01em;margin-bottom:6px;}
    .ob2-subtitle{font-size:13.5px;color:var(--ink2);line-height:1.5;margin-bottom:26px;}

    .ob2-field{margin-bottom:16px;}
    .ob2-field-label{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--ink2);margin-bottom:7px;}
    .ob2-field-label svg{width:13px;height:13px;color:var(--muted);}
    .ob2-field-optional{font-weight:500;color:var(--faint);font-size:11px;}
    .ob2-input{width:100%;padding:11px 13px;background:var(--paper2);border:1px solid var(--border);border-radius:var(--radius-s);font-size:14px;color:var(--ink);font-family:var(--fb);outline:none;transition:border-color .15s,background .15s;}
    .ob2-input::placeholder{color:var(--faint);}
    .ob2-input:focus{border-color:var(--accent-border);background:#fff;}

    .ob2-submit{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;margin-top:6px;background:linear-gradient(135deg,#22315C,#2A3F73);border:none;border-radius:var(--radius-s);color:var(--accent-ink);font-size:14px;font-weight:700;cursor:pointer;transition:opacity .15s;}
    .ob2-submit:disabled{opacity:.5;cursor:default;}

    .ob2-done-icon{width:44px;height:44px;border-radius:12px;background:var(--good-soft);display:flex;align-items:center;justify-content:center;margin-bottom:18px;}
    .ob2-done-title{font-size:20px;font-weight:800;letter-spacing:-.01em;margin-bottom:8px;}
    .ob2-done-subtitle{font-size:13.5px;color:var(--ink2);line-height:1.55;margin-bottom:26px;}

    .ob2-choice{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;background:var(--paper2);border:1px solid var(--border);border-radius:var(--radius-m);cursor:pointer;text-align:left;margin-bottom:10px;transition:background .15s,border-color .15s;}
    .ob2-choice:hover{background:#fff;border-color:var(--border-strong);}
    .ob2-choice--primary{background:var(--accent-soft);border-color:var(--accent-border);}
    .ob2-choice-icon{width:34px;height:34px;flex-shrink:0;border-radius:9px;background:#fff;display:flex;align-items:center;justify-content:center;}
    .ob2-choice--primary .ob2-choice-icon{background:var(--accent);color:var(--accent-ink);}
    .ob2-choice-icon svg{width:16px;height:16px;color:var(--accent);}
    .ob2-choice--primary .ob2-choice-icon svg{color:var(--accent-ink);}
    .ob2-choice-text{flex:1;min-width:0;}
    .ob2-choice-title{font-size:13.5px;font-weight:700;color:var(--ink);}
    .ob2-choice-badge{display:inline-block;margin-left:7px;font-family:var(--fm);font-size:9.5px;font-weight:600;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-border);border-radius:5px;padding:1.5px 5px;text-transform:uppercase;letter-spacing:.04em;vertical-align:middle;}
    .ob2-choice-desc{font-size:12px;color:var(--muted);margin-top:2px;}
    .ob2-choice-arrow{width:15px;height:15px;color:var(--faint);flex-shrink:0;}

    @media(max-width:520px){
      .ob2-card{padding:28px 22px;}
      .ob2-title,.ob2-done-title{font-size:19px;}
    }
  `;

  return (
    <div className="ob2">
      <style>{css}</style>
      <div className="ob2-wrap">
        <div className="ob2-logo">
          <img src="/fixsense_icon_logo (2).png" alt="Fixsense" className="ob2-logo-img" />
          <span className="ob2-logo-name">Fixsense</span>
        </div>

        <AnimatePresence mode="wait">
          {!done ? (
            <motion.div
              key="form"
              className="ob2-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", damping: 1, stiffness: 210, mass: 0.7 }}
            >
              <div className="ob2-kicker">Set up your desk</div>
              <h1 className="ob2-title">Tell us about your agency</h1>
              <p className="ob2-subtitle">A few quick details so Fixsense is set up for how you recruit.</p>

              <form onSubmit={handleSubmit}>
                {FIELDS.map((f, i) => (
                  <motion.div
                    key={f.key}
                    className="ob2-field"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 * i, type: "spring", damping: 1, stiffness: 240, mass: 0.6 }}
                  >
                    <label className="ob2-field-label" htmlFor={f.key}>
                      <f.icon />
                      {f.label}
                      {!f.required && <span className="ob2-field-optional">— optional</span>}
                    </label>
                    <input
                      id={f.key}
                      className="ob2-input"
                      value={form[f.key]}
                      onChange={setField(f.key)}
                      placeholder={f.placeholder}
                      autoComplete={f.autoComplete}
                      required={f.required}
                    />
                  </motion.div>
                ))}

                <motion.button
                  type="submit"
                  className="ob2-submit"
                  disabled={!requiredFilled || saving}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", damping: 1, stiffness: 300 }}
                >
                  {saving ? (
                    <><Loader2 size={15} className="ob2-spin" style={{ animation: "obspin 0.8s linear infinite" }} /> Setting up your desk…</>
                  ) : (
                    <>Continue <ArrowRight size={15} /></>
                  )}
                </motion.button>
                <style>{`@keyframes obspin{to{transform:rotate(360deg)}}`}</style>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="done"
              className="ob2-card"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", damping: 0.85, stiffness: 220, mass: 0.7 }}
            >
              <div className="ob2-done-icon">
                <Sparkles size={20} color="#2F6B4F" strokeWidth={1.8} />
              </div>
              <h1 className="ob2-done-title">Welcome to Fixsense.</h1>
              <p className="ob2-done-subtitle">Let's get your recruitment desk running.</p>

              <button className="ob2-choice ob2-choice--primary" onClick={() => navigate("/jobs?create=1", { replace: true })}>
                <div className="ob2-choice-icon"><Briefcase /></div>
                <div className="ob2-choice-text">
                  <span className="ob2-choice-title">Create your first job<span className="ob2-choice-badge">Recommended</span></span>
                  <div className="ob2-choice-desc">Post a role and start building a pipeline.</div>
                </div>
                <ArrowRight className="ob2-choice-arrow" />
              </button>

              <button className="ob2-choice" onClick={() => navigate("/candidates?create=1", { replace: true })}>
                <div className="ob2-choice-icon"><Users /></div>
                <div className="ob2-choice-text">
                  <span className="ob2-choice-title">Add / import candidates</span>
                  <div className="ob2-choice-desc">Bring in candidates you're already working with.</div>
                </div>
                <ArrowRight className="ob2-choice-arrow" />
              </button>

              <button className="ob2-choice" onClick={() => navigate("/dashboard", { replace: true })} style={{ marginBottom: 0 }}>
                <div className="ob2-choice-icon"><LayoutDashboard /></div>
                <div className="ob2-choice-text">
                  <span className="ob2-choice-title">Explore Fixsense</span>
                  <div className="ob2-choice-desc">Take a look around first.</div>
                </div>
                <ArrowRight className="ob2-choice-arrow" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}