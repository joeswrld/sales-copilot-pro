/**
 * PWABanner.tsx
 *
 * Shows:
 * - "Add to Home Screen" install prompt for mobile users
 * - Offline indicator banner when network is lost
 * - Push notification opt-in for post-call summaries
 */

import { useState } from 'react';
import { Download, WifiOff, Bell, BellOff, X } from 'lucide-react';
import { usePWA } from '@/hooks/usePWA';

export default function PWABanner() {
  const {
    isInstallable,
    isOnline,
    isPushSupported,
    isPushEnabled,
    promptInstall,
    enablePush,
    disablePush,
  } = usePWA();

  const [dismissed, setDismissed] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  // After first call analysis, auto-prompt for push
  // (call this from CallDetail after summary loads)
  const handlePushToggle = async () => {
    if (isPushEnabled) {
      await disablePush();
    } else {
      await enablePush();
      setShowPushPrompt(false);
    }
  };

  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9998,
          background: '#1e293b',
          borderBottom: '1px solid rgba(239,68,68,.3)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          color: '#f87171',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          <WifiOff style={{ width: 14, height: 14, flexShrink: 0 }} />
          <span>You're offline. Showing cached data.</span>
        </div>
      )}

      {/* Install to Home Screen prompt */}
      {isInstallable && !dismissed && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          left: 16,
          right: 16,
          zIndex: 9997,
          background: 'linear-gradient(135deg, #0d1117, #0f1424)',
          border: '1px solid rgba(124,58,237,.3)',
          borderRadius: 16,
          padding: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          fontFamily: "'DM Sans', sans-serif",
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <button
            onClick={() => setDismissed(true)}
            style={{
              position: 'absolute', top: 10, right: 10,
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 6, width: 24, height: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'rgba(255,255,255,.4)',
            }}
          >
            <X style={{ width: 12, height: 12 }} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'rgba(124,58,237,.15)', border: '1px solid rgba(124,58,237,.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Download style={{ width: 18, height: 18, color: '#a78bfa' }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#f0f6fc', margin: 0 }}>
                Install Fixsense
              </p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', margin: 0 }}>
                Access your calls instantly, even offline
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setDismissed(true)}
              style={{
                flex: 1, padding: '9px', borderRadius: 10,
                background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
                color: 'rgba(255,255,255,.5)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Not now
            </button>
            <button
              onClick={() => { promptInstall(); setDismissed(true); }}
              style={{
                flex: 2, padding: '9px', borderRadius: 10,
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: '0 4px 14px rgba(124,58,237,.4)',
              }}
            >
              <Download style={{ width: 14, height: 14 }} /> Install App
            </button>
          </div>
        </div>
      )}

      {/* Push notification opt-in (shown after first call completes) */}
      {isPushSupported && !isPushEnabled && showPushPrompt && (
        <div style={{
          position: 'fixed',
          bottom: isInstallable && !dismissed ? 200 : 80,
          left: 16,
          right: 16,
          zIndex: 9996,
          background: 'linear-gradient(135deg, #0d1117, #0f1424)',
          border: '1px solid rgba(96,165,250,.3)',
          borderRadius: 16,
          padding: '14px 16px',
          boxShadow: '0 20px 60px rgba(0,0,0,.5)',
          fontFamily: "'DM Sans', sans-serif",
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <Bell style={{ width: 20, height: 20, color: '#60a5fa', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#f0f6fc', margin: 0 }}>
              Get call summary alerts
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', margin: 0 }}>
              We'll notify you when your AI summary is ready
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => setShowPushPrompt(false)} style={{
              background: 'none', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,.4)',
              fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}>
              Skip
            </button>
            <button onClick={handlePushToggle} style={{
              background: 'rgba(96,165,250,.15)', border: '1px solid rgba(96,165,250,.3)',
              borderRadius: 8, padding: '5px 12px', color: '#60a5fa',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}>
              Enable
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Small inline push toggle for Settings page
 */
export function PushNotificationToggle() {
  const { isPushSupported, isPushEnabled, enablePush, disablePush } = usePWA();

  if (!isPushSupported) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div>
        {isPushEnabled
          ? <Bell style={{ width: 16, height: 16, color: '#60a5fa' }} />
          : <BellOff style={{ width: 16, height: 16, color: 'rgba(255,255,255,.3)' }} />}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Push Notifications</p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', margin: 0 }}>
          {isPushEnabled ? 'Enabled — you\'ll be notified when call summaries are ready' : 'Off'}
        </p>
      </div>
      <button
        onClick={isPushEnabled ? disablePush : enablePush}
        style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          background: isPushEnabled ? 'rgba(239,68,68,.1)' : 'rgba(96,165,250,.1)',
          border: `1px solid ${isPushEnabled ? 'rgba(239,68,68,.3)' : 'rgba(96,165,250,.3)'}`,
          color: isPushEnabled ? '#f87171' : '#60a5fa',
        }}
      >
        {isPushEnabled ? 'Disable' : 'Enable'}
      </button>
    </div>
  );
}