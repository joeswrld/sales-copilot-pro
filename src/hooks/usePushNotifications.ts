/**
 * usePushNotifications.ts — v2 (DB-validated subscription)
 *
 * Key fix: on mount, after SW registration, we validate the browser's
 * existing push subscription against the DB. If the subscription is:
 *   - a legacy FCM endpoint (fcm.googleapis.com/fcm/send/...)
 *   - marked is_active=false in the DB
 *   - not found in the DB at all
 * ...we call sub.unsubscribe() so isSubscribed becomes false and the
 * "Enable reminders" banner reappears, prompting a fresh subscription.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

export interface PushNotificationState {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permissionState: PermissionState;
  swRegistration: ServiceWorkerRegistration | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

function checkSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function isLegacyFcmEndpoint(endpoint: string): boolean {
  return endpoint.includes("fcm.googleapis.com/fcm/send/");
}

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

function detectBrowserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Unknown";
}

/**
 * Validates the browser's current push subscription against the DB.
 * Returns true if the subscription is valid and active.
 * If invalid/legacy/inactive, unsubscribes the browser and returns false.
 */
async function validateAndCleanSubscription(
  reg: ServiceWorkerRegistration,
  userId: string
): Promise<boolean> {
  let sub: PushSubscription | null = null;
  try {
    sub = await reg.pushManager.getSubscription();
  } catch {
    return false;
  }

  if (!sub) return false;

  // Immediately kill legacy FCM endpoints — they never work
  if (isLegacyFcmEndpoint(sub.endpoint)) {
    console.log("[Push] Legacy FCM endpoint detected — unsubscribing browser");
    try {
      await sub.unsubscribe();
      await removeSubscriptionFromSupabase(sub.endpoint);
    } catch {}
    return false;
  }

  // Check DB: is this subscription active?
  try {
    const { data } = await supabase
      .from("push_subscriptions" as any)
      .select("is_active, failed_count")
      .eq("endpoint", sub.endpoint)
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) {
      // Not in DB at all — unsubscribe so user can re-subscribe cleanly
      console.log("[Push] Subscription not found in DB — unsubscribing browser");
      try { await sub.unsubscribe(); } catch {}
      return false;
    }

    if (!(data as any).is_active || (data as any).failed_count >= 10) {
      // Marked inactive or too many failures — force re-subscribe
      console.log("[Push] Subscription inactive in DB — unsubscribing browser");
      try { await sub.unsubscribe(); } catch {}
      return false;
    }

    return true;
  } catch {
    // DB check failed — trust the browser for now
    return true;
  }
}

export function usePushNotifications(): PushNotificationState {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true); // start true while we validate
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>("default");
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const swRegisteredRef = useRef(false);
  const validatedRef = useRef(false);

  const isSupported = checkSupport();

  // ── Register SW + validate existing subscription on mount ──────────────────
  useEffect(() => {
    if (!isSupported || swRegisteredRef.current) return;
    swRegisteredRef.current = true;

    if ("Notification" in window) {
      setPermissionState(Notification.permission as PermissionState);
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (reg) => {
        setSwRegistration(reg);

        // Wait for SW to be ready before checking subscription
        await navigator.serviceWorker.ready;

        if (user && !validatedRef.current) {
          validatedRef.current = true;
          const valid = await validateAndCleanSubscription(reg, user.id);
          setIsSubscribed(valid);
        } else if (!user) {
          // Not logged in yet — just check existence without DB validation
          const existing = await reg.pushManager.getSubscription();
          const notLegacy = existing && !isLegacyFcmEndpoint(existing.endpoint);
          setIsSubscribed(!!notLegacy);
        }

        setIsLoading(false);
      })
      .catch((err) => {
        console.warn("[Push] Service worker registration failed:", err);
        setIsLoading(false);
      });
  }, [isSupported]); // intentionally only runs once on mount

  // ── Re-validate when user becomes available (if SW was already registered) ─
  useEffect(() => {
    if (!user || !swRegistration || validatedRef.current) return;
    validatedRef.current = true;

    setIsLoading(true);
    validateAndCleanSubscription(swRegistration, user.id).then((valid) => {
      setIsSubscribed(valid);
      setIsLoading(false);
    });
  }, [user, swRegistration]);

  // ── SW message: re-save new subscription after push subscription change ────
  useEffect(() => {
    if (!isSupported) return;
    const handler = async (event: MessageEvent) => {
      if (
        event.data?.type === "PUSH_SUBSCRIPTION_CHANGED" &&
        event.data.subscription &&
        user
      ) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
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

  // ── Subscribe ────────────────────────────────────────────────────────────────
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user) return false;

    setIsLoading(true);
    try {
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!vapidPublicKey) {
        toast.error(
          "Push notifications not configured. Add VITE_VAPID_PUBLIC_KEY to your project settings.",
          { duration: 8000 }
        );
        return false;
      }

      const permission = await Notification.requestPermission();
      setPermissionState(permission as PermissionState);

      if (permission !== "granted") {
        if (permission === "denied") {
          toast.error("Notifications blocked. Enable them in your browser settings.", {
            duration: 6000,
          });
        }
        return false;
      }

      let reg = swRegistration;
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        setSwRegistration(reg);
        await navigator.serviceWorker.ready;
      }

      // Unsubscribe any existing (possibly stale) subscription first
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
      }

      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const pushSubscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // Reject legacy endpoints (shouldn't happen with fresh subscribe, but safety check)
      if (isLegacyFcmEndpoint(pushSubscription.endpoint)) {
        await pushSubscription.unsubscribe();
        toast.error(
          "Your browser returned a legacy push endpoint. Try in an updated Chrome or Edge.",
          { duration: 8000 }
        );
        return false;
      }

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
      toast.success(
        "🔔 Meeting notifications enabled! You'll be reminded 60 min and 10 min before each meeting.",
        { duration: 6000 }
      );
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

  // ── Unsubscribe ──────────────────────────────────────────────────────────────
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