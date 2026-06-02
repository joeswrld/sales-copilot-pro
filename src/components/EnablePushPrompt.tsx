/**
 * EnablePushPrompt.tsx
 *
 * Lightweight inline banner that prompts the user to enable browser/device push
 * notifications. Shown on pages where notifications are most valuable
 * (Live Call, Messages). Auto-hides once enabled, denied, or dismissed for the
 * session. Works on both desktop browsers and mobile (installed PWA).
 */

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const DISMISS_KEY = "fixsense_push_prompt_dismissed_v1";

interface Props {
  /** Short context shown in the banner, e.g. "for new messages" */
  context?: string;
}

export default function EnablePushPrompt({ context = "" }: Props) {
  const { isSupported, isSubscribed, isLoading, permissionState, subscribe } =
    usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (
    !isSupported ||
    isLoading ||
    isSubscribed ||
    permissionState === "denied" ||
    dismissed
  ) {
    return null;
  }

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Enable push notifications"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        margin: "0 0 12px 0",
        borderRadius: 12,
        background:
          "linear-gradient(135deg, rgba(96,165,250,.10), rgba(124,58,237,.10))",
        border: "1px solid rgba(96,165,250,.25)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <Bell style={{ width: 18, height: 18, color: "#60a5fa", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#f0f6fc" }}>
          Turn on push notifications
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: "rgba(255,255,255,.55)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          Get instant alerts on this device {context} — works on mobile and laptop.
        </p>
      </div>
      <button
        onClick={subscribe}
        style={{
          background: "rgba(96,165,250,.18)",
          border: "1px solid rgba(96,165,250,.35)",
          color: "#bfdbfe",
          fontSize: 12,
          fontWeight: 700,
          padding: "6px 12px",
          borderRadius: 8,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Enable
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,.4)",
          cursor: "pointer",
          padding: 4,
          flexShrink: 0,
        }}
      >
        <X style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}
