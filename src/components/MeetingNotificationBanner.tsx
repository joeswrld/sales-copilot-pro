/**
 * MeetingNotificationBanner.tsx
 *
 * Smart banner that prompts users to enable push notifications
 * for meeting reminders. Shows on the Live Call / Schedule page.
 *
 * Features:
 *  - Auto-hides if already subscribed or permission denied
 *  - One-click subscribe with clear value proposition
 *  - Dismissible (persists dismissal in localStorage)
 *  - Shows notification settings toggle when already enabled
 */

import { useState, useEffect } from "react";
import { Bell, BellOff, X, BellRing, CheckCircle2, Loader2, Settings, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const DISMISS_KEY = "fixsense_push_banner_dismissed";

interface Props {
  /** Compact variant for sidebar/header use */
  compact?: boolean;
  /** Called when user enables notifications */
  onEnabled?: () => void;
}

export function MeetingNotificationBanner({ compact = false, onEnabled }: Props) {
  const { isSupported, isSubscribed, isLoading, permissionState, subscribe, unsubscribe } =
    usePushNotifications();

  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [showSettings, setShowSettings] = useState(false);

  // Don't show if: not supported, already dismissed, or permission explicitly denied
  if (!isSupported || dismissed || permissionState === "unsupported") return null;

  // Already subscribed — show settings toggle instead
  if (isSubscribed) {
    if (compact) return null; // In compact mode, don't show anything when subscribed

    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-green-500/20 bg-green-500/5">
        <div className="w-6 h-6 rounded-lg bg-green-500/15 flex items-center justify-center shrink-0">
          <BellRing className="w-3.5 h-3.5 text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-green-400">Meeting notifications active</p>
          <p className="text-[11px] text-muted-foreground">
            You'll be reminded 60 min &amp; 10 min before meetings
          </p>
        </div>
        <button
          onClick={async () => {
            if (window.confirm("Disable meeting notifications?")) {
              await unsubscribe();
            }
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title="Disable notifications"
        >
          <BellOff className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Permission denied — show info
  if (permissionState === "denied") {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border bg-muted/30">
        <BellOff className="w-4 h-4 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground flex-1">
          Notifications blocked. Enable in browser settings to get meeting reminders.
        </p>
        <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Compact variant — small inline button
  if (compact) {
    return (
      <button
        onClick={async () => {
          const ok = await subscribe();
          if (ok) onEnabled?.();
        }}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-xs font-medium",
          "border-amber-500/30 bg-amber-500/8 text-amber-400 hover:bg-amber-500/15 hover:border-amber-500/50",
          isLoading && "opacity-60 cursor-not-allowed"
        )}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Bell className="w-3.5 h-3.5" />
        )}
        {isLoading ? "Enabling…" : "Enable reminders"}
      </button>
    );
  }

  // Full banner
  return (
    <div
      className={cn(
        "relative rounded-xl border overflow-hidden transition-all",
        "border-indigo-500/25 bg-gradient-to-r from-indigo-500/8 to-purple-500/5"
      )}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500/60 via-purple-500/40 to-transparent" />

      <div className="p-4 flex items-start gap-3.5">
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.12))",
            border: "1px solid rgba(99,102,241,0.3)",
          }}
        >
          <Bell className="w-5 h-5 text-indigo-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Never miss a meeting</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Get notified <strong className="text-foreground/80">60 minutes</strong> and{" "}
            <strong className="text-foreground/80">10 minutes</strong> before scheduled meetings —
            even when you're not on the platform.
          </p>

          {/* Reminder preview */}
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              { icon: "⏰", label: "60 min before", desc: "Time to prepare" },
              { icon: "🔔", label: "10 min before", desc: "Get ready" },
              { icon: "🔴", label: "At start time", desc: "Join now" },
            ].map(({ icon, label, desc }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-white/8 bg-white/4 text-xs"
              >
                <span>{icon}</span>
                <span className="text-foreground/70 font-medium">{label}</span>
                <span className="text-muted-foreground hidden sm:inline">· {desc}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={async () => {
                const ok = await subscribe();
                if (ok) onEnabled?.();
              }}
              disabled={isLoading}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all",
                "hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              )}
              style={{
                background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                boxShadow: "0 4px 16px rgba(99,102,241,0.3)",
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Enabling…
                </>
              ) : (
                <>
                  <Bell className="w-3.5 h-3.5" />
                  Enable Notifications
                </>
              )}
            </button>

            <button
              onClick={() => {
                setDismissed(true);
                try {
                  localStorage.setItem(DISMISS_KEY, "true");
                } catch {}
              }}
              className="px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Not now
            </button>
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISS_KEY, "true");
            } catch {}
          }}
          className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors mt-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Small pill button for use in the schedule modal confirmation
 * and at the top of the meeting timeline.
 */
export function NotificationStatusPill() {
  const { isSupported, isSubscribed, isLoading, subscribe } = usePushNotifications();

  if (!isSupported) return null;

  if (isSubscribed) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-green-500/25 bg-green-500/8 text-[11px] font-medium text-green-400">
        <CheckCircle2 className="w-3 h-3" />
        Reminders on
      </div>
    );
  }

  return (
    <button
      onClick={subscribe}
      disabled={isLoading}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/8 text-[11px] font-medium text-amber-400 hover:bg-amber-500/15 transition-all disabled:opacity-60"
    >
      {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
      Enable reminders
    </button>
  );
}