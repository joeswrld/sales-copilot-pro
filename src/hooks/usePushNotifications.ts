/**
 * usePushNotifications.ts — v3
 *
 * Key fixes:
 *  1. Detects legacy FCM endpoints (fcm.googleapis.com/fcm/send/) and
 *     automatically unsubscribes + re-subscribes silently in the background,
 *     so the user never sees the "Enable reminders" button reappear.
 *  2. Validates subscription against DB on mount — if inactive/missing,
 *     silently re-subscribes if permission is already granted.
 *  3. isLoading = true while validation runs to prevent banner flicker.
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

function detectBrowserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Unknown";
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
      console.error("[Push] Save error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Push] Save threw:", err);
    return false;
  }
}

async function removeFromSupabase(endpoint: string): Promise<void> {
  try {
    await supabase
      .from("push_subscriptions" as any)
      .update({ is_active: false } as any)
      .eq("endpoint", endpoint);
  } catch {}
}

/**
 * Unsubscribes any existing browser subscription and creates a fresh one.
 * Returns the new PushSubscription or null if it failed.
 */
async function createFreshSubscription(
  reg: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    if (isLegacyFcmEndpoint(sub.endpoint)) {
      await sub.unsubscribe();
      console.warn("[Push] New subscription is still legacy FCM — cannot use");
      return null;
    }

    return sub;
  } catch (err: any) {
    console.warn("[Push] createFreshSubscription failed:", err?.message);
    return null;
  }
}

export function usePushNotifications(): PushNotificationState {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>("default");
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const swRegisteredRef = useRef(false);
  const validatedRef = useRef(false);

  const isSupported = checkSupport();

  // ── Core: validate existing subscription, auto-heal if stale ───────────────
  const validateSubscription = useCallback(
    async (reg: ServiceWorkerRegistration, userId: string): Promise<void> => {
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      const permState =
        "Notification" in window ? Notification.permission : "default";

      let sub: PushSubscription | null = null;
      try {
        sub = await reg.pushManager.getSubscription();
      } catch {}

      // No subscription — nothing to validate
      if (!sub) {
        setIsSubscribed(false);
        setIsLoading(false);
        return;
      }

      const isLegacy = isLegacyFcmEndpoint(sub.endpoint);

      // Check DB validity (only if not legacy)
      let isActiveInDb = false;
      if (!isLegacy) {
        try {
          const { data } = await supabase
            .from("push_subscriptions" as any)
            .select("is_active, failed_count")
            .eq("endpoint", sub.endpoint)
            .eq("user_id", userId)
            .maybeSingle();

          isActiveInDb =
            !!data &&
            (data as any).is_active === true &&
            ((data as any).failed_count ?? 0) < 10;
        } catch {
          // DB check failed — optimistically trust the browser
          isActiveInDb = true;
        }
      }

      // Subscription is healthy — done
      if (!isLegacy && isActiveInDb) {
        setIsSubscribed(true);
        setIsLoading(false);
        return;
      }

      // ── Needs refresh ────────────────────────────────────────────────────────
      console.log(
        `[Push] ${isLegacy ? "Legacy FCM endpoint" : "Inactive subscription"} detected — auto re-subscribing silently`
      );

      // Mark old endpoint as inactive in DB
      await removeFromSupabase(sub.endpoint);

      // Can only auto-resubscribe if permission is already granted and VAPID is set
      if (permState !== "granted" || !vapidPublicKey) {
        try { await sub.unsubscribe(); } catch {}
        setIsSubscribed(false);
        setIsLoading(false);
        return;
      }

      // Create a fresh subscription silently
      const newSub = await createFreshSubscription(reg, vapidPublicKey);
      if (!newSub) {
        setIsSubscribed(false);
        setIsLoading(false);
        return;
      }

      // Save to Supabase
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          const saved = await saveSubscriptionToSupabase(newSub, session.access_token);
          if (saved) {
            console.log("[Push] Auto re-subscribed successfully with modern endpoint");
            setIsSubscribed(true);
            setIsLoading(false);
            return;
          }
        }
      } catch {}

      // Save failed — browser subscription was created but not persisted
      try { await newSub.unsubscribe(); } catch {}
      setIsSubscribed(false);
      setIsLoading(false);
    },
    [] // stable — only uses refs and external functions
  );

  // ── Register SW on mount ─────────────────────────────────────────────────────
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
          // User not loaded yet — do a quick check without DB
          const existing = await reg.pushManager.getSubscription().catch(() => null);
          const valid = !!existing && !isLegacyFcmEndpoint(existing.endpoint);
          setIsSubscribed(valid);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn("[Push] SW registration failed:", err);
        setIsLoading(false);
      });
  }, [isSupported]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-validate once user becomes available (if SW already registered) ──────
  useEffect(() => {
    if (!user || !swRegistration || validatedRef.current) return;
    validatedRef.current = true;
    setIsLoading(true);
    validateSubscription(swRegistration, user.id);
  }, [user, swRegistration, validateSubscription]);

  // ── SW message: re-save subscription when browser auto-renews it ────────────
  useEffect(() => {
    if (!isSupported) return;
    const handler = async (event: MessageEvent) => {
      if (
        event.data?.type === "PUSH_SUBSCRIPTION_CHANGED" &&
        event.data.subscription &&
        user
      ) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
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

  // ── Manual subscribe (user presses button) ───────────────────────────────────
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

      const newSub = await createFreshSubscription(reg, vapidPublicKey);
      if (!newSub) {
        toast.error("Could not create push subscription. Try updating your browser.", {
          duration: 6000,
        });
        return false;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Please sign in to enable notifications.");
        return false;
      }

      const saved = await saveSubscriptionToSupabase(newSub, session.access_token);
      if (!saved) {
        toast.error("Failed to save notification subscription. Please try again.");
        await newSub.unsubscribe();
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

  // ── Manual unsubscribe ───────────────────────────────────────────────────────
  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!swRegistration) return;
    setIsLoading(true);
    try {
      const sub = await swRegistration.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await removeFromSupabase(endpoint);
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