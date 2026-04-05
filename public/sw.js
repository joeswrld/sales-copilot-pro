/**
 * Fixsense Service Worker
 * - Caches shell + static assets
 * - Offline-capable call list (network-first with cache fallback)
 * - Push notification support for post-call summaries
 */

const CACHE_NAME = 'fixsense-v1';
const STATIC_CACHE = 'fixsense-static-v1';
const API_CACHE = 'fixsense-api-v1';

// App shell files to cache immediately
const SHELL_ASSETS = [
  '/',
  '/dashboard',
  '/dashboard/calls',
  '/dashboard/live',
  '/manifest.json',
  '/fixsense_icon_logo (2).png',
];

// ── Install: cache app shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Failed to cache some shell assets:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== API_CACHE && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, and Supabase realtime (websockets)
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.pathname.startsWith('/realtime/')) return;

  // Supabase REST API → Network-first with API cache fallback
  if (url.hostname.includes('supabase.co') && url.pathname.startsWith('/rest/')) {
    event.respondWith(networkFirstWithCache(request, API_CACHE, 60 * 5)); // 5 min TTL
    return;
  }

  // Static assets (js, css, images, fonts) → Cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|eot)$/)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigation requests (HTML pages) → Network-first, offline fallback to /
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/') || caches.match('/dashboard')
      )
    );
    return;
  }

  // Default: network-first
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ── Cache helpers ─────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstWithCache(request, cacheName, ttlSeconds = 300) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      // Store with timestamp header for TTL enforcement
      const headers = new Headers(response.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const cachedResponse = new Response(response.clone().body, { headers });
      cache.put(request, cachedResponse);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      const cachedAt = parseInt(cached.headers.get('sw-cached-at') || '0');
      if (Date.now() - cachedAt < ttlSeconds * 1000) {
        return cached;
      }
    }
    return new Response(
      JSON.stringify({ error: 'offline', message: 'You appear to be offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Fixsense', body: 'You have a new update', url: '/dashboard' };

  try {
    data = event.data?.json() || data;
  } catch {
    data.body = event.data?.text() || data.body;
  }

  const options = {
    body: data.body,
    icon: '/fixsense_icon_logo (2).png',
    badge: '/fixsense_icon_logo (2).png',
    tag: data.tag || 'fixsense-notification',
    renotify: true,
    data: { url: data.url || '/dashboard' },
    actions: [
      { action: 'open', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Fixsense', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Open new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

// ── Background sync (for queued actions when offline) ─────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-calls') {
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  // Future: sync any queued offline actions back to Supabase
  console.log('[SW] Background sync triggered');
}