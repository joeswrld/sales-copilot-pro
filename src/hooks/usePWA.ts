/**
 * usePWA.ts
 *
 * Handles:
 * - Service worker registration
 * - Push notification subscription
 * - Install prompt (PWA "Add to Home Screen")
 * - Offline detection
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Replace with your VAPID public key from web-push generation
// Run: npx web-push generate-vapid-keys
// Then set VAPID_PUBLIC_KEY in your .env and Supabase secrets
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)));
}

export interface PWAState {
  isInstallable: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  isPushSupported: boolean;
  isPushEnabled: boolean;
  swRegistration: ServiceWorkerRegistration | null;
  promptInstall: () => void;
  enablePush: () => Promise<void>;
  disablePush: () => Promise<void>;
}

export function usePWA(): PWAState {
  const { user } = useAuth();
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);
  const deferredPrompt = useRef<any>(null);

  const isPushSupported =
    'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;

  // ── Register Service Worker ────────────────────────────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        setSwReg(reg);
        console.log('[PWA] Service worker registered:', reg.scope);

        // Check existing push subscription
        return reg.pushManager.getSubscription().then((sub) => {
          setIsPushEnabled(!!sub);
        });
      })
      .catch((err) => console.warn('[PWA] SW registration failed:', err));
  }, []);

  // ── Install prompt ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Detect if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setIsInstallable(false);
      deferredPrompt.current = null;
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ── Online / Offline detection ─────────────────────────────────────────────
  useEffect(() => {
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ── Prompt Install ─────────────────────────────────────────────────────────
  const promptInstall = useCallback(() => {
    if (!deferredPrompt.current) return;
    deferredPrompt.current.prompt();
    deferredPrompt.current.userChoice.then((choice: any) => {
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
      }
      deferredPrompt.current = null;
    });
  }, []);

  // ── Enable Push Notifications ──────────────────────────────────────────────
  const enablePush = useCallback(async () => {
    if (!swReg || !isPushSupported || !user) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[PWA] Push permission denied');
      return;
    }

    try {
      const vapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const subscription = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey.buffer as ArrayBuffer,
      });

      // Store subscription in Supabase for server-side push delivery
      await supabase.from('push_subscriptions' as any).upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: btoa(
          String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))
        ),
        auth: btoa(
          String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))
        ),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,endpoint' });

      setIsPushEnabled(true);
      console.log('[PWA] Push subscription active');
    } catch (err) {
      console.error('[PWA] Failed to subscribe to push:', err);
    }
  }, [swReg, isPushSupported, user]);

  // ── Disable Push Notifications ─────────────────────────────────────────────
  const disablePush = useCallback(async () => {
    if (!swReg || !user) return;

    const sub = await swReg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await supabase
        .from('push_subscriptions' as any)
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', sub.endpoint);
    }
    setIsPushEnabled(false);
  }, [swReg, user]);

  return {
    isInstallable,
    isInstalled,
    isOnline,
    isPushSupported,
    isPushEnabled,
    swRegistration: swReg,
    promptInstall,
    enablePush,
    disablePush,
  };
}

/**
 * Trigger a local push notification (for testing without a server)
 */
export async function sendTestNotification(reg: ServiceWorkerRegistration) {
  await reg.showNotification('Fixsense — Call Summary Ready', {
    body: 'Your call with Acme Corp has been analyzed. Score: 87/100 · 3 action items generated.',
    icon: '/fixsense_icon_logo (2).png',
    badge: '/fixsense_icon_logo (2).png',
    tag: 'test-notification',
    data: { url: '/calls' },
  } as any);
}