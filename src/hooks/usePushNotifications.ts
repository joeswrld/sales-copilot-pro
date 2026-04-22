/**
 * usePushNotifications.ts — v5
 *
 * KEY FIX: Chrome on Android ALWAYS issues fcm.googleapis.com endpoints.
 * This is not a bug — it is how Chrome's push service works globally.
 * We now ACCEPT all endpoints (including FCM) and store them in the DB.
 * The server-side send-push-notification edge function routes FCM endpoints
 * through the FCM v1 HTTP API and non-FCM through standard VAPID.
 *
 * Changes from v4:
 *  - Removed all isLegacyFcm() rejection/retry loops (they caused the error)
 *  - Any PushSubscription from the browser is saved as-is
 *  - 401 fix: getFreshToken() refreshes near-expiry tokens before every save
 *  - isLoading starts false when SW is unsupported (no banner flicker)
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function detectBrowserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Unknown";
}

/** Always returns a fresh, non-expiring access token. */
async function getFreshToken(): Promise<string | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return null;
    const expiresAt = session.expires_at ?? 0;
    const nowSec = Math.floor(Date.now() / 1000);
    if (expiresAt - nowSec < 300) {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshed.session) return null;
      return refreshed.session.access_token;
    }
    return session.access_token;
  } catch {
    return null;
  }
}

async function saveSubscriptionToServer(
  subscription: PushSubscription,
  accessToken: string
): Promise<boolean> {
  const subJson = subscription.toJSON();
  const keys = subJson.keys ?? {};
  try {
    const { error } = await supabase.functions.invoke("save-push-subscription", {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        endpoint:     subscription.endpoint,
        p256dh:       keys.p256dh ?? "",
        auth:         keys.auth   ?? "",
        browser_name: detectBrowserName(),
        user_agent:   navigator.userAgent.slice(0, 200),
      },
    });
    if (error) {
      console.error("[Push] save error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Push] save threw:", err);
    return false;
  }
}

async function deactivateInDb(endpoint: string): Promise<void> {
  try {
    await supabase
      .from("push_subscriptions" as any)
      .update({ is_active: false } as any)
      .eq("endpoint", endpoint);
  } catch {}
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePushNotifications(): PushNotificationState {
  const { user } = useAuth();
  const isSupported = checkSupport();

  const [isLoading, setIsLoading]             = useState(isSupported);
  const [isSubscribed, setIsSubscribed]       = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>("default");
  const [swRegistration, setSwRegistration]   = useState<ServiceWorkerRegistration | null>(null);

  const swRegisteredRef = useRef(false);
  const validatedRef    = useRef(false);

  // ── Validate existing browser subscription against DB ─────────────────────
  const validateSubscription = useCallback(
    async (reg: ServiceWorkerRegistration, userId: string): Promise<void> => {
      let sub: PushSubscription | null = null;
      try { sub = await reg.pushManager.getSubscription(); } catch {}

      if (!sub) {
        setIsSubscribed(false);
        setIsLoading(false);
        return;
      }

      try {
        const { data } = await supabase
          .from("push_subscriptions" as any)
          .select("is_active, failed_count")
          .eq("endpoint", sub.endpoint)
          .eq("user_id", userId)
          .maybeSingle();

        const isActive =
          !!data &&
          (data as any).is_active === true &&
          ((data as any).failed_count ?? 0) < 10;

        if (isActive) {
          setIsSubscribed(true);
          setIsLoading(false);
          return;
        }

        // Not in DB or stale — re-save it if permission is still granted
        const permState = "Notification" in window ? Notification.permission : "default";
        if (permState === "granted") {
          const token = await getFreshToken();
          if (token) {
            const saved = await saveSubscriptionToServer(sub, token);
            if (saved) {
              setIsSubscribed(true);
              setIsLoading(false);
              return;
            }
          }
        }
      } catch {
        // DB check failed — optimistically trust the browser sub
        setIsSubscribed(true);
        setIsLoading(false);
        return;
      }

      setIsSubscribed(false);
      setIsLoading(false);
    },
    []
  );

  // ── Register SW on mount ───────────────────────────────────────────────────
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
        await navigator.serviceWorker.ready;

        if (user && !validatedRef.current) {
          validatedRef.current = true;
          await validateSubscription(reg, user.id);
        } else {
          const existing = await reg.pushManager.getSubscription().catch(() => null);
          setIsSubscribed(!!existing);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn("[Push] SW registration failed:", err);
        setIsLoading(false);
      });
  }, [isSupported]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-validate once user is available ────────────────────────────────────
  useEffect(() => {
    if (!user || !swRegistration || validatedRef.current) return;
    validatedRef.current = true;
    setIsLoading(true);
    validateSubscription(swRegistration, user.id);
  }, [user, swRegistration, validateSubscription]);

  // ── Handle browser-auto-renewed subscriptions ──────────────────────────────
  useEffect(() => {
    if (!isSupported) return;
    const handler = async (event: MessageEvent) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED" && event.data.subscription && user) {
        const token = await getFreshToken();
        if (!token) return;
        const newSub = event.data.subscription as PushSubscriptionJSON;
        if (newSub.endpoint && newSub.keys) {
          await supabase.functions.invoke("save-push-subscription", {
            headers: { Authorization: `Bearer ${token}` },
            body: {
              endpoint:     newSub.endpoint,
              p256dh:       newSub.keys.p256dh ?? "",
              auth:         newSub.keys.auth   ?? "",
              browser_name: detectBrowserName(),
            },
          });
        }
      }
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [isSupported, user]);

  // ── Manual subscribe ───────────────────────────────────────────────────────
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

      // Unsubscribe stale sub first (clean slate)
      const existing = await reg.pushManager.getSubscription().catch(() => null);
      if (existing) await existing.unsubscribe().catch(() => {});

      // Subscribe — Chrome Android returns an FCM endpoint, that's fine and expected
      const newSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const isFcm = newSub.endpoint.includes("fcm.googleapis.com");
      console.log(`[Push] Got ${isFcm ? "FCM" : "VAPID"} endpoint — saving to server`);

      // Get a fresh token immediately before the network call (avoids 401)
      const token = await getFreshToken();
      if (!token) {
        toast.error("Please sign in to enable notifications.");
        await newSub.unsubscribe().catch(() => {});
        return false;
      }

      const saved = await saveSubscriptionToServer(newSub, token);
      if (!saved) {
        toast.error("Failed to save notification subscription. Please try again.");
        await newSub.unsubscribe().catch(() => {});
        return false;
      }

      setIsSubscribed(true);
      toast.success(
        "🔔 Notifications enabled! You'll be reminded 60 min and 10 min before each meeting.",
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

  // ── Manual unsubscribe ─────────────────────────────────────────────────────
  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!swRegistration) return;
    setIsLoading(true);
    try {
      const sub = await swRegistration.pushManager.getSubscription();
      if (sub) {
        await deactivateInDb(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
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