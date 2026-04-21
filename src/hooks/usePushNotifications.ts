/**
 * usePushNotifications.ts — Web Push Notification Manager
 *
 * Handles:
 *  - Service worker registration (public/sw.js)
 *  - VAPID-based push subscription via browser PushManager API
 *  - Saving/removing subscriptions in Supabase via edge function
 *  - Auto-resubscription when subscription changes
 *  - Cross-device: works on desktop Chrome/Edge/Firefox and mobile Chrome/Android
 *
 * Usage:
 *   const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe, permissionState } = usePushNotifications();
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

export interface PushNotificationState {
  /** Whether Web Push is supported in this browser */
  isSupported: boolean;
  /** Whether the user has an active push subscription */
  isSubscribed: boolean;
  /** True while registering SW or subscribing */
  isLoading: boolean;
  /** Current Notification.permission state */
  permissionState: PermissionState;
  /** SW registration (available after mount) */
  swRegistration: ServiceWorkerRegistration | null;
  /** Request permission and subscribe to push */
  subscribe: () => Promise<boolean>;
  /** Unsubscribe from push */
  unsubscribe: () => Promise<void>;
}

// ── VAPID key decoder ─────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

// ── Check browser support ─────────────────────────────────────────────────────

function checkSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// ── Save subscription to Supabase ─────────────────────────────────────────────

async function saveSubscriptionToSupabase(
  subscription: PushSubscription,
  accessToken: string
): Promise<boolean> {
  const subJson = subscription.toJSON();
  const keys = subJson.keys ?? {};

  try {
    const { error } = await supabase.functions.invoke("save-push-subscription", {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh ?? "",
        auth: keys.auth ?? "",
        browser_name: detectBrowserName(),
        user_agent: navigator.userAgent.slice(0, 200),
      },
    });

    if (error) {
      console.error("[Push] Save subscription error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Push] Save subscription threw:", err);
    return false;
  }
}

// ── Remove subscription from Supabase ─────────────────────────────────────────

async function removeSubscriptionFromSupabase(endpoint: string): Promise<void> {
  try {
    await supabase
      .from("push_subscriptions" as any)
      .update({ is_active: false } as any)
      .eq("endpoint", endpoint);
  } catch (err) {
    console.error("[Push] Remove subscription error:", err);
  }
}

// ── Detect browser name ───────────────────────────────────────────────────────

function detectBrowserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Unknown";
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePushNotifications(): PushNotificationState {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>("default");
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const swRegisteredRef = useRef(false);

  const isSupported = checkSupport();

  // ── Register service worker ──────────────────────────────────────────────
  useEffect(() => {
    if (!isSupported || swRegisteredRef.current) return;
    swRegisteredRef.current = true;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (reg) => {
        console.log("[Push] Service worker registered:", reg.scope);
        setSwRegistration(reg);

        // Check existing subscription
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setIsSubscribed(true);
        }
      })
      .catch((err) => {
        console.warn("[Push] Service worker registration failed:", err);
      });

    // Sync permission state
    if ("Notification" in window) {
      setPermissionState(Notification.permission as PermissionState);
    }
  }, [isSupported]);

  // ── Listen for subscription change from SW ───────────────────────────────
  useEffect(() => {
    if (!isSupported) return;

    const handler = async (event: MessageEvent) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED" && event.data.subscription && user) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          // Re-save new subscription
          const newSub = event.data.subscription as PushSubscriptionJSON;
          if (newSub.endpoint && newSub.keys) {
            await supabase.functions.invoke("save-push-subscription", {
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: {
                endpoint: newSub.endpoint,
                p256dh: newSub.keys.p256dh ?? "",
                auth: newSub.keys.auth ?? "",
                browser_name: detectBrowserName(),
              },
            });
          }
        }
      }
    };

    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [isSupported, user]);

  // ── Subscribe ────────────────────────────────────────────────────────────
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user) return false;

    setIsLoading(true);
    try {
      // 1. Get VAPID public key from env
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!vapidPublicKey) {
        toast.error(
          "Push notifications are not configured. Add VITE_VAPID_PUBLIC_KEY to your project settings.",
          { duration: 8000 }
        );
        return false;
      }

      // 2. Request notification permission
      const permission = await Notification.requestPermission();
      setPermissionState(permission as PermissionState);

      if (permission !== "granted") {
        if (permission === "denied") {
          toast.error(
            "Notifications are blocked. Please enable them in your browser settings.",
            { duration: 6000 }
          );
        }
        return false;
      }

      // 3. Ensure SW is registered
      let reg = swRegistration;
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        setSwRegistration(reg);
        // Wait for SW to be ready
        await navigator.serviceWorker.ready;
      }

      // 4. Subscribe to push
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const pushSubscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // 5. Save to Supabase
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Please sign in to enable notifications.");
        return false;
      }

      const saved = await saveSubscriptionToSupabase(pushSubscription, session.access_token);
      if (!saved) {
        toast.error("Failed to save notification subscription. Please try again.");
        await pushSubscription.unsubscribe();
        return false;
      }

      setIsSubscribed(true);
      toast.success("🔔 Meeting notifications enabled! You'll be reminded 60 min and 10 min before each meeting.", {
        duration: 6000,
      });
      return true;
    } catch (err: any) {
      console.error("[Push] Subscribe error:", err);
      if (err.name === "NotAllowedError") {
        toast.error("Notification permission was denied.");
      } else {
        toast.error("Failed to enable notifications: " + err.message);
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user, swRegistration]);

  // ── Unsubscribe ──────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!swRegistration) return;

    setIsLoading(true);
    try {
      const sub = await swRegistration.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await removeSubscriptionFromSupabase(endpoint);
      }
      setIsSubscribed(false);
      toast.success("Notifications disabled.");
    } catch (err: any) {
      console.error("[Push] Unsubscribe error:", err);
      toast.error("Failed to disable notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [swRegistration]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permissionState,
    swRegistration,
    subscribe,
    unsubscribe,
  };
}