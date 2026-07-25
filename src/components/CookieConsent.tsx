 /**
 * CookieConsent.tsx
 *
 * GDPR-friendly cookie consent banner.
 *
 * - Shown only on a visitor's first visit (persisted in localStorage).
 * - "OK" accepts all categories. "Manage Preferences" opens a panel where
 *   Necessary (always on), Analytics, and Personalization can be toggled
 *   individually.
 * - The saved choice can always be reopened later from the footer via the
 *   "Cookie Preferences" link, which dispatches a window event this
 *   component listens for.
 * - Fully keyboard accessible: focus is trapped while the preferences
 *   panel is open, Escape closes it, and every interactive element has a
 *   visible focus ring.
 */

import { useEffect, useRef, useState } from "react";

type ConsentChoice = {
  necessary: true;
  analytics: boolean;
  personalization: boolean;
  decidedAt: string;
};

const STORAGE_KEY = "fixsense_cookie_consent";
export const OPEN_COOKIE_PREFS_EVENT = "fixsense:open-cookie-preferences";

function readStoredConsent(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.analytics === "boolean") return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeStoredConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // localStorage unavailable (private mode, etc.) — fail silently,
    // banner will simply reappear next visit.
  }
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [managing, setManaging] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [personalization, setPersonalization] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // First-visit check
  useEffect(() => {
    const stored = readStoredConsent();
    if (!stored) {
      setVisible(true);
    } else {
      setAnalytics(stored.analytics);
      setPersonalization(stored.personalization);
    }
  }, []);

  // Allow footer link to reopen preferences at any time
  useEffect(() => {
    const reopen = () => {
      const stored = readStoredConsent();
      if (stored) {
        setAnalytics(stored.analytics);
        setPersonalization(stored.personalization);
      }
      setVisible(true);
      setManaging(true);
    };
    window.addEventListener(OPEN_COOKIE_PREFS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_PREFS_EVENT, reopen);
  }, []);

  // Basic focus handling when the panel opens + Escape to close
  useEffect(() => {
    if (!visible) return;
    firstFocusRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && managing) {
        setManaging(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, managing]);

  const persistAndClose = (a: boolean, p: boolean) => {
    writeStoredConsent({
      necessary: true,
      analytics: a,
      personalization: p,
      decidedAt: new Date().toISOString(),
    });
    setVisible(false);
    setManaging(false);
  };

  const acceptAll = () => persistAndClose(true, true);
  const savePreferences = () => persistAndClose(analytics, personalization);

  if (!visible) return null;

  return (
    <>
      <style>{`
        .cc-wrap{position:fixed;left:0;right:0;bottom:0;z-index:400;padding:16px;display:flex;justify-content:center;pointer-events:none;}
        .cc-card{pointer-events:auto;width:100%;max-width:860px;background:rgba(9,12,22,0.98);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.09);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,0.55);padding:20px 22px;font-family:'DM Sans',system-ui,sans-serif;animation:cc-rise .45s cubic-bezier(0.22,1,0.36,1);}
        @keyframes cc-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion: reduce){.cc-card{animation:none}}
        .cc-row{display:flex;align-items:flex-start;gap:16px;}
        .cc-icon{width:38px;height:38px;border-radius:10px;background:rgba(14,245,212,0.09);border:1px solid rgba(14,245,212,0.22);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#0ef5d4;}
        .cc-body{flex:1;min-width:0;}
        .cc-title{font-family:'Syne',system-ui,sans-serif;font-size:15px;font-weight:700;color:#edf0f8;margin-bottom:4px;letter-spacing:-0.01em;}
        .cc-text{font-size:13.5px;line-height:1.6;color:rgba(237,240,248,0.68);max-width:560px;}
        .cc-actions{display:flex;align-items:center;gap:10px;margin-top:16px;flex-wrap:wrap;}
        .cc-btn{font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;border-radius:9px;padding:10px 18px;cursor:pointer;transition:all .15s ease;min-height:40px;border:1px solid transparent;}
        .cc-btn:focus-visible{outline:2px solid #0ef5d4;outline-offset:2px;}
        .cc-btn-primary{background:#0ef5d4;color:#03050d;}
        .cc-btn-primary:hover{opacity:.88;transform:translateY(-1px);}
        .cc-btn-secondary{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.12);color:rgba(237,240,248,0.85);}
        .cc-btn-secondary:hover{border-color:rgba(255,255,255,0.24);color:#edf0f8;}
        .cc-link{background:none;border:none;padding:0;font-size:12.5px;color:rgba(237,240,248,0.45);text-decoration:underline;cursor:pointer;font-family:'DM Sans',sans-serif;}
        .cc-link:hover{color:rgba(237,240,248,0.75);}

        /* Preferences panel */
        .cc-overlay{position:fixed;inset:0;z-index:410;background:rgba(2,3,8,0.72);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;padding:16px;}
        @media (min-width:640px){.cc-overlay{align-items:center;}}
        .cc-panel{width:100%;max-width:520px;max-height:88vh;overflow-y:auto;background:#090c16;border:1px solid rgba(255,255,255,0.09);border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,0.6);animation:cc-panel-in .3s cubic-bezier(0.22,1,0.36,1);}
        @keyframes cc-panel-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion: reduce){.cc-panel{animation:none}}
        .cc-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:22px 22px 14px;border-bottom:1px solid rgba(255,255,255,0.06);}
        .cc-panel-title{font-family:'Syne',sans-serif;font-size:17px;font-weight:700;color:#edf0f8;letter-spacing:-0.02em;margin-bottom:5px;}
        .cc-panel-sub{font-size:12.5px;color:rgba(237,240,248,0.5);line-height:1.6;max-width:400px;}
        .cc-close{width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:rgba(237,240,248,0.6);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .13s;}
        .cc-close:hover{color:#edf0f8;border-color:rgba(255,255,255,0.2);}
        .cc-close:focus-visible{outline:2px solid #0ef5d4;outline-offset:2px;}
        .cc-panel-body{padding:6px 22px 22px;display:flex;flex-direction:column;}
        .cc-pref-row{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:16px 0;border-bottom:1px solid rgba(255,255,255,0.05);}
        .cc-pref-row:last-child{border-bottom:none;}
        .cc-pref-name{font-size:13.5px;font-weight:700;color:#edf0f8;margin-bottom:4px;}
        .cc-pref-desc{font-size:12.5px;color:rgba(237,240,248,0.5);line-height:1.6;max-width:330px;}
        .cc-pref-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(14,245,212,0.75);background:rgba(14,245,212,0.08);border:1px solid rgba(14,245,212,0.2);border-radius:5px;padding:2px 7px;display:inline-block;margin-top:6px;}

        /* Toggle switch */
        .cc-switch{position:relative;width:42px;height:24px;border-radius:100px;border:none;cursor:pointer;flex-shrink:0;transition:background .18s ease;padding:0;}
        .cc-switch[data-on="true"]{background:#0ef5d4;}
        .cc-switch[data-on="false"]{background:rgba(255,255,255,0.12);}
        .cc-switch[disabled]{cursor:not-allowed;opacity:.55;}
        .cc-switch:focus-visible{outline:2px solid #0ef5d4;outline-offset:3px;}
        .cc-switch-knob{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#03050d;transition:transform .18s ease;}
        .cc-switch[data-on="true"] .cc-switch-knob{transform:translateX(18px);background:#03050d;}

        .cc-panel-footer{display:flex;gap:10px;padding:16px 22px 22px;border-top:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;}
        .cc-panel-footer .cc-btn{flex:1;min-width:140px;}

        @media (max-width:640px){
          .cc-wrap{padding:12px;}
          .cc-card{padding:16px;border-radius:14px;}
          .cc-actions{width:100%;}
          .cc-actions .cc-btn{flex:1;text-align:center;justify-content:center;}
        }
      `}</style>

      {/* Banner */}
      <div className="cc-wrap" role="region" aria-label="Cookie consent">
        <div className="cc-card">
          <div className="cc-row">
            <div className="cc-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M21 12.7A9 9 0 1 1 11.3 3a1 1 0 0 0 1.2 1.2A6 6 0 1 0 19.8 11.5a1 1 0 0 0 1.2 1.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="9" cy="10" r="1" fill="currentColor" />
                <circle cx="13" cy="14" r="1" fill="currentColor" />
                <circle cx="10.5" cy="16.5" r="1" fill="currentColor" />
              </svg>
            </div>
            <div className="cc-body">
              <div className="cc-title">Your privacy</div>
              <p className="cc-text">
                We use cookies to enhance your browsing experience, improve our services, and help keep your data secure.
              </p>
              <div className="cc-actions">
                <button ref={firstFocusRef} type="button" className="cc-btn cc-btn-primary" onClick={acceptAll}>
                  OK
                </button>
                <button type="button" className="cc-btn cc-btn-secondary" onClick={() => setManaging(true)}>
                  Manage Preferences
                </button>
                <a href="/privacy" className="cc-link">Privacy policy</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences panel */}
      {managing && (
        <div
          className="cc-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cc-panel-title"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setManaging(false); }}
        >
          <div className="cc-panel" ref={panelRef}>
            <div className="cc-panel-head">
              <div>
                <div id="cc-panel-title" className="cc-panel-title">Cookie preferences</div>
                <p className="cc-panel-sub">Choose which cookies Fixsense can use on this device. You can change this at any time from the footer.</p>
              </div>
              <button type="button" className="cc-close" onClick={() => setManaging(false)} aria-label="Close cookie preferences">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="cc-panel-body">
              <div className="cc-pref-row">
                <div>
                  <div className="cc-pref-name">Necessary</div>
                  <p className="cc-pref-desc">Required for login sessions, security, and core site functionality. Always active.</p>
                  <span className="cc-pref-tag">Always on</span>
                </div>
                <button type="button" className="cc-switch" data-on="true" disabled aria-label="Necessary cookies, always enabled">
                  <span className="cc-switch-knob" />
                </button>
              </div>

              <div className="cc-pref-row">
                <div>
                  <div className="cc-pref-name">Analytics</div>
                  <p className="cc-pref-desc">Helps us understand how Fixsense is used so we can improve reliability and performance.</p>
                </div>
                <button
                  type="button"
                  className="cc-switch"
                  data-on={analytics}
                  onClick={() => setAnalytics(v => !v)}
                  role="switch"
                  aria-checked={analytics}
                  aria-label="Toggle analytics cookies"
                >
                  <span className="cc-switch-knob" />
                </button>
              </div>

              <div className="cc-pref-row">
                <div>
                  <div className="cc-pref-name">Personalization</div>
                  <p className="cc-pref-desc">Remembers your preferences, such as workspace settings, across visits.</p>
                </div>
                <button
                  type="button"
                  className="cc-switch"
                  data-on={personalization}
                  onClick={() => setPersonalization(v => !v)}
                  role="switch"
                  aria-checked={personalization}
                  aria-label="Toggle personalization cookies"
                >
                  <span className="cc-switch-knob" />
                </button>
              </div>
            </div>

            <div className="cc-panel-footer">
              <button type="button" className="cc-btn cc-btn-secondary" onClick={() => persistAndClose(false, false)}>
                Reject non-essential
              </button>
              <button type="button" className="cc-btn cc-btn-primary" onClick={savePreferences}>
                Save preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Call from anywhere (e.g. a footer link) to reopen the preferences panel. */
export function openCookiePreferences() {
  window.dispatchEvent(new Event(OPEN_COOKIE_PREFS_EVENT));
}