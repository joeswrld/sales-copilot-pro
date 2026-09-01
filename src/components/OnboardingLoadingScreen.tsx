/**
 * OnboardingLoadingScreen.tsx
 *
 * Shown in place of a blank white screen while the /onboarding route's
 * chunk loads (and, if ever needed, while any first-run account setup is
 * in flight). Rotates through a short sequence of setup messages so the
 * wait reads as "your account is being prepared" rather than a stall.
 *
 * Visual system matches OnboardingPage.tsx / LandingPage.tsx: warm paper
 * background, deep-navy accent, Inter type.
 */

import { useEffect, useState } from "react";
import { Building2, Sparkles, ShieldCheck, LayoutDashboard } from "lucide-react";

const STEPS: { label: string; icon: typeof Building2 }[] = [
  { label: "Setting up your account", icon: Building2 },
  { label: "Preparing your workspace", icon: LayoutDashboard },
  { label: "Securing your data", icon: ShieldCheck },
  { label: "Almost ready", icon: Sparkles },
];

export default function OnboardingLoadingScreen() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => (s + 1) % STEPS.length);
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&display=swap');

    .obl{background:#FAFAF8;color:#17170F;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;-webkit-font-smoothing:antialiased;}
    .obl-logo{display:flex;align-items:center;gap:8px;margin-bottom:40px;}
    .obl-logo-img{width:26px;height:26px;border-radius:7px;}
    .obl-logo-name{font-size:15.5px;font-weight:700;color:#17170F;letter-spacing:-.01em;}

    .obl-ring-wrap{position:relative;width:64px;height:64px;margin-bottom:28px;display:flex;align-items:center;justify-content:center;}
    .obl-ring{position:absolute;inset:0;border-radius:50%;border:2.5px solid rgba(34,49,92,0.12);border-top-color:#22315C;animation:obl-spin 0.9s linear infinite;}
    .obl-ring-icon{color:#22315C;display:flex;align-items:center;justify-content:center;}
    .obl-ring-icon svg{width:22px;height:22px;}

    .obl-label{font-size:14.5px;font-weight:700;color:#17170F;margin-bottom:6px;min-height:20px;transition:opacity .25s ease;}
    .obl-sublabel{font-size:12.5px;color:rgba(23,23,15,0.42);}

    .obl-dots{display:flex;gap:6px;margin-top:22px;}
    .obl-dot{width:5px;height:5px;border-radius:50%;background:rgba(34,49,92,0.18);transition:background .2s,transform .2s;}
    .obl-dot--active{background:#22315C;transform:scale(1.3);}

    @keyframes obl-spin{to{transform:rotate(360deg)}}
    @keyframes obl-fade{0%{opacity:0;transform:translateY(4px)}100%{opacity:1;transform:translateY(0)}}
    .obl-label{animation:obl-fade .35s ease;}
  `;

  const Icon = STEPS[step].icon;

  return (
    <div className="obl" aria-busy="true" aria-live="polite">
      <style>{css}</style>

      <div className="obl-logo">
        <img src="/fixsense_icon_logo (2).png" alt="Fixsense" className="obl-logo-img" />
        <span className="obl-logo-name">Fixsense</span>
      </div>

      <div className="obl-ring-wrap">
        <div className="obl-ring" />
        <div className="obl-ring-icon">
          <Icon strokeWidth={1.8} />
        </div>
      </div>

      <div key={step} className="obl-label">{STEPS[step].label}…</div>
      <div className="obl-sublabel">This only takes a moment</div>

      <div className="obl-dots">
        {STEPS.map((s, i) => (
          <div key={s.label} className={`obl-dot${i === step ? " obl-dot--active" : ""}`} />
        ))}
      </div>
    </div>
  );
}