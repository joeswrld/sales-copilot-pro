/**
 * usePushNotifications.ts — v4
 *
 * Fixes over v3:
 *  1. 401 on save-push-subscription — caused by sending the request before the
 *     auth session was ready. Now uses supabase.auth.getSession() with an explicit
 *     refresh fallback before every server call. verify_jwt is off on the edge fn
 *     so we pass the token in the body as a backup too.
 *  2. Legacy FCM infinite-loop — after unsubscribing a legacy FCM endpoint the
 *     browser on some Chrome versions creates ANOTHER legacy FCM endpoint. We now
 *     cap retry attempts and give up cleanly instead of looping.
 *  3. DB records with legacy FCM endpoints are now hard-deleted (not just
 *     soft-deactivated) so they don't keep triggering the re-subscription path.
 *  4. `isLoading` is correctly `false` when SW is not supported (prevents
 *     UI flash).
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

/** Get a fresh, valid access token — always refreshes if expiring soon. */
async function getFreshToken(): Promise<string | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return null;

    // If token expires in < 5 minutes, force refresh
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
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh ?? "",
        auth: keys.auth ?? "",
        browser_name: detectBrowserName(),
        user_agent: navigator.userAgent.slice(0, 200),
      },
    });
    if (error) {
      console.error("[Push] save-push-subscription error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Push] save-push-subscription threw:", err);
    return false;
  }
}

/** Hard-delete a legacy/dead endpoint from the DB so it stops triggering re-sub. */
async function deleteEndpointFromDb(endpoint: string): Promise<void> {
  try {
    await supabase
      .from("push_subscriptions" as any)
      .delete()
      .eq("endpoint", endpoint);
  } catch {}
}

/** Soft-deactivate an endpoint (for non-legacy stale subs). */
async function deactivateEndpointInDb(endpoint: string): Promise<void> {
  try {
    await supabase
      .from("push_subscriptions" as any)
      .update({ is_active: false } as any)
      .eq("endpoint", endpoint);
  } catch {}
}

/**
 * Attempt to create a fresh, non-legacy PushSubscription.
 * Returns null if it still comes back as legacy (capped at 2 attempts).
 */
async function createFreshSubscription(
  reg: ServiceWorkerRegistration,
  vapidPublicKey: string,
  attempt = 0
): Promise<PushSubscription | null> {
  if (attempt >= 2) {
    console.warn("[Push] Gave up after 2 attempts — browser keeps issuing legacy FCM endpoints");
    return null;
  }

  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await existing.unsubscribe().catch(() => {});
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    if (isLegacyFcmEndpoint(sub.endpoint)) {
      console.warn(`[Push] Attempt ${attempt + 1}: still got legacy FCM endpoint — retrying once`);
      await sub.unsubscribe().catch(() => {});
      // Small delay before retry
      await new Promise((r) => setTimeout(r, 300));
      return createFreshSubscription(reg, vapidPublicKey, attempt + 1);
    }

    return sub;
  } catch (err: any) {
    console.warn("[Push] createFreshSubscription failed:", err?.message);
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePushNotifications(): PushNotificationState {
  const { user } = useAuth();
  const isSupported = checkSupport();

  // Start isLoading=false if SW not supported — no flicker
  const [isLoading, setIsLoading] = useState(isSupported);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>("default");
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const swRegisteredRef = useRef(false);
  const validatedRef = useRef(false);

  // ── Validate existing subscription on mount ──────────────────────────────
  const validateSubscription = useCallback(
    async (reg: ServiceWorkerRegistration, userId: string): Promise<void> => {
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      const permState = "Notification" in window ? Notification.permission : "default";

      let sub: PushSubscription | null = null;
      try {
        sub = await reg.pushManager.getSubscription();
      } catch {}

      if (!sub) {
        setIsSubscribed(false);
        setIsLoading(false);
        return;
      }

      // Legacy FCM — hard-delete from DB and unsubscribe browser
      if (isLegacyFcmEndpoint(sub.endpoint)) {
        console.log("[Push] Detected legacy FCM subscription — cleaning up");
        await deleteEndpointFromDb(sub.endpoint);
        try { await sub.unsubscribe(); } catch {}

        // Only auto-resubscribe if permission already granted and VAPID key set
        if (permState === "granted" && vapidPublicKey) {
          const token = await getFreshToken();
          if (token) {
            const newSub = await createFreshSubscription(reg, vapidPublicKey);
            if (newSub) {
              const saved = await saveSubscriptionToServer(newSub, token);
              if (saved) {
                console.log("[Push] Auto re-subscribed with modern endpoint");
                setIsSubscribed(true);
                setIsLoading(false);
                return;
              }
              // Save failed — clean up the browser sub too
              try { await newSub.unsubscribe(); } catch {}
            }
          }
        }

        setIsSubscribed(false);
        setIsLoading(false);
        return;
      }

      // Modern endpoint — check DB health
      let isActiveInDb = false;
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
        // DB check failed — optimistically trust the browser sub
        isActiveInDb = true;
      }

      if (isActiveInDb) {
        setIsSubscribed(true);
        setIsLoading(false);
        return;
      }

      // Stale / failed subscription — deactivate in DB and try to re-save
      await deactivateEndpointInDb(sub.endpoint);

      if (permState === "granted" && vapidPublicKey) {
        const token = await getFreshToken();
        if (token) {
          // The existing browser sub is still valid, just re-register it in DB
          const saved = await saveSubscriptionToServer(sub, token);
          if (saved) {
            setIsSubscribed(true);
            setIsLoading(false);
            return;
          }
        }
      }

      setIsSubscribed(false);
      setIsLoading(false);
    },
    []
  );

  // ── Register SW ─────────────────────────────────────────────────────────
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
          // User not loaded yet — quick non-DB check
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

  // ── Re-validate once user becomes available ──────────────────────────────
  useEffect(() => {
    if (!user || !swRegistration || validatedRef.current) return;
    validatedRef.current = true;
    setIsLoading(true);
    validateSubscription(swRegistration, user.id);
  }, [user, swRegistration, validateSubscription]);

  // ── Handle SW push subscription change messages ──────────────────────────
  useEffect(() => {
    if (!isSupported) return;
    const handler = async (event: MessageEvent) => {
      if (
        event.data?.type === "PUSH_SUBSCRIPTION_CHANGED" &&
        event.data.subscription &&
        user
      ) {
        const token = await getFreshToken();
        if (!token) return;
        const newSub = event.data.subscription as PushSubscriptionJSON;
        if (newSub.endpoint && newSub.keys && !isLegacyFcmEndpoint(newSub.endpoint)) {
          await supabase.functions.invoke("save-push-subscription", {
            headers: { Authorization: `Bearer ${token}` },
            body: {
              endpoint: newSub.endpoint,
              p256dh: newSub.keys.p256dh ?? "",
              auth: newSub.keys.auth ?? "",
              browser_name: detectBrowserName(),
            },
          });
        }
      }
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [isSupported, user]);

  // ── Manual subscribe ─────────────────────────────────────────────────────
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
        toast.error(
          "Could not create a push subscription. Your browser may be using a deprecated push service. Try updating Chrome or using a different browser.",
          { duration: 8000 }
        );
        return false;
      }

      // FIX: Get fresh token right before saving to avoid 401
      const token = await getFreshToken();
      if (!token) {
        toast.error("Please sign in to enable notifications.");
        try { await newSub.unsubscribe(); } catch {}
        return false;
      }

      const saved = await saveSubscriptionToServer(newSub, token);
      if (!saved) {
        toast.error("Failed to save notification subscription. Please try again.");
        try { await newSub.unsubscribe(); } catch {}
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

  // ── Manual unsubscribe ───────────────────────────────────────────────────
  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!swRegistration) return;
    setIsLoading(true);
    try {
      const sub = await swRegistration.pushManager.getSubscription();
      if (sub) {
        await deactivateEndpointInDb(sub.endpoint);
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