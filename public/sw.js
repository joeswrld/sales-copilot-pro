/**
 * Fixsense Service Worker — v4
 *
 * v4 FIX: The v3 fetch handler forwarded EVERY intercepted request —
 * including WebSocket upgrade handshakes — through `fetch(request)`.
 * Service workers aren't supposed to receive fetch events for WebSocket
 * connections at all per spec, but that isn't reliably true across every
 * browser/version, and the Fetch API has no way to represent a "101
 * Switching Protocols" response. If the handshake to transcribe-live
 * (real-time captions) ever got routed through here, replaying it via
 * fetch() would break the upgrade — observed client-side as the socket
 * silently failing to reach 'connected' and a 405 logged for the request.
 * WebSocket upgrade requests are now explicitly bypassed before any other
 * handling, so they always go straight to the browser's native network
 * stack untouched.
 *
 * v3 FIX: Added fetch handler that passes API/WebSocket calls directly
 * to the network, bypassing any cache layer entirely.
 *
 * Root cause of the 16:30:48 flood:
 *   No fetch handler existed here, but vite-plugin-pwa's Workbox runtime
 *   was injecting its own cache-first strategy for ALL requests. When Daily.co
 *   WebSocket dropped, Workbox entered a broken state and started returning
 *   cached (failed) responses for every subsequent fetch — including all
 *   Supabase REST, edge functions, and realtime calls.
 *
 * Fix: Explicitly intercept fetch events and force network-only for all
 *      API domains. Only cache static assets (JS/CSS/fonts/images).
 */

const CACHE_NAME = 'fixsense-v5';

// Domains that must ALWAYS go direct to network — never cached
const NETWORK_ONLY_HOSTS = [
  'supabase.co',       // REST, auth, realtime, storage, edge functions
  'daily.co',          // Video signaling, room checks, media servers
  'gs.daily.co',       // Daily.co geo servers
  'deepgram.com',      // Speech-to-text
  'anthropic.com',     // AI analysis
  'api.openai.com',    // Whisper fallback
  'paystack.co',       // Billing
  'paystack.com',      // Billing
];

// Static asset extensions worth caching
const CACHE_EXTENSIONS = ['.js', '.css', '.woff', '.woff2', '.ttf', '.png', '.jpg', '.svg', '.ico'];

function isNetworkOnly(url) {
  try {
    const parsed = new URL(url);
    // Force network for all API hosts
    if (NETWORK_ONLY_HOSTS.some(h => parsed.hostname.endsWith(h))) return true;
    // Force network for all non-GET requests (POST/PATCH/DELETE)
    return false;
  } catch {
    return false;
  }
}

function isCacheable(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    // Only cache same-origin static assets
    if (parsed.origin !== self.location.origin) return false;
    return CACHE_EXTENSIONS.some(ext => path.endsWith(ext));
  } catch {
    return false;
  }
}

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v3...');
  // Skip waiting immediately — don't hold old SW active
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activated v3');
  event.waitUntil(
    Promise.all([
      // Take control of all clients immediately
      clients.claim(),
      // Delete old cache versions
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(k => k !== CACHE_NAME)
            .map(k => {
              console.log('[SW] Deleting old cache:', k);
              return caches.delete(k);
            })
        )
      ),
    ])
  );
});

// ── Fetch: CRITICAL FIX ───────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // 0. NEVER touch WebSocket upgrade requests. Per spec, fetch events
  //    aren't supposed to fire for these at all, but that isn't perfectly
  //    consistent across browsers/versions — and fetch() has no way to
  //    represent a "101 Switching Protocols" response, so if one of these
  //    ever does land here and gets forwarded via fetch(request), the
  //    upgrade breaks. This is exactly the request useLiveTranscriptionSocket
  //    makes to transcribe-live for real-time captions — bail out
  //    immediately and let the browser's native network stack handle the
  //    handshake untouched.
  if ((request.headers.get('upgrade') || '').toLowerCase() === 'websocket') {
    return;
  }

  // 1. NETWORK ONLY: API calls must never be cached or intercepted
  if (isNetworkOnly(url) || request.method !== 'GET') {
    event.respondWith(
      fetch(request).catch(err => {
        // Return a proper network error response instead of hanging
        console.warn('[SW] Network-only fetch failed:', url, err.message);
        return new Response(
          JSON.stringify({ error: 'Network error', offline: !navigator.onLine }),
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );
    return;
  }

  // 2. CACHE FIRST for static assets (JS bundles, CSS, fonts, images)
  if (isCacheable(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch {
          // No network and no cache — nothing we can do
          return new Response('Offline', { status: 503 });
        }
      })
    );
    return;
  }

  // 3. NETWORK FIRST for HTML navigation (app shell)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        // Offline: serve cached index.html if available
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('/index.html') || await cache.match('/');
        return cached || new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // 4. Everything else: network only, no caching
  event.respondWith(fetch(request));
});

// ── Message handler: receive network-only domain updates from app ─────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Allow app to dynamically add network-only patterns
  if (event.data?.type === 'NETWORK_ONLY_PATTERNS') {
    const patterns = event.data.patterns || [];
    patterns.forEach(p => {
      if (!NETWORK_ONLY_HOSTS.includes(p)) {
        NETWORK_ONLY_HOSTS.push(p);
      }
    });
    console.log('[SW] Updated network-only hosts:', NETWORK_ONLY_HOSTS);
  }
});

// ── Push: show notification ───────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');

  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch {
    data = {
      title: '📅 Fixsense Reminder',
      body: event.data ? event.data.text() : 'You have an upcoming meeting.',
    };
  }

  const {
    title = '📅 Fixsense Reminder',
    body = 'You have an upcoming meeting.',
    icon = '/fixsense_icon_logo (2).png',
    badge = '/fixsense_icon_logo (2).png',
    tag = 'fixsense-reminder',
    url = '/live',
    requireInteraction = false,
    vibrate = [200, 100, 200],
    actions = [],
    data: notifData = {},
  } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body, icon, badge, tag, requireInteraction, vibrate, actions,
      data: { url, ...notifData },
      timestamp: Date.now(),
      silent: false,
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action);
  event.notification.close();

  const notifData = event.notification.data || {};
  let targetUrl = notifData.url || '/live';

  if (event.action === 'join' && notifData.meeting_link) {
    targetUrl = notifData.meeting_link;
  } else if (event.action === 'dismiss') {
    return;
  }

  if (!targetUrl.startsWith('http')) {
    targetUrl = self.location.origin + targetUrl;
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});

// ── Push subscription change ──────────────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed — re-subscribing...');
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true })
      .then(subscription =>
        clients.matchAll({ type: 'window' }).then(windowClients => {
          for (const client of windowClients) {
            client.postMessage({
              type: 'PUSH_SUBSCRIPTION_CHANGED',
              subscription: subscription.toJSON(),
            });
          }
        })
      )
      .catch(err => console.error('[SW] Re-subscription failed:', err))
  );
});