/**
 * Fixsense Service Worker
 * Handles Web Push notifications for meeting reminders.
 * Must be placed at /public/sw.js (served from root).
 */

const CACHE_NAME = "fixsense-v1";

// ── Install: cache app shell ─────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] Installing...");
  self.skipWaiting();
});

// ── Activate: take control immediately ───────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[SW] Activated");
  event.waitUntil(clients.claim());
});

// ── Push: show notification when message arrives ──────────────────────────────
self.addEventListener("push", (event) => {
  console.log("[SW] Push received");

  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (err) {
    console.warn("[SW] Could not parse push data:", err);
    data = {
      title: "📅 Fixsense Reminder",
      body: event.data ? event.data.text() : "You have an upcoming meeting.",
    };
  }

  const {
    title = "📅 Fixsense Reminder",
    body = "You have an upcoming meeting.",
    icon = "/fixsense_icon_logo (2).png",
    badge = "/fixsense_icon_logo (2).png",
    tag = "fixsense-reminder",
    url = "/live",
    requireInteraction = false,
    vibrate = [200, 100, 200],
    actions = [],
    data: notifData = {},
  } = data;

  const options = {
    body,
    icon,
    badge,
    tag,
    requireInteraction,
    vibrate,
    actions,
    data: { url, ...notifData },
    timestamp: Date.now(),
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: open the app or meeting link ──────────────────────────
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification click:", event.action);
  event.notification.close();

  const notifData = event.notification.data || {};
  let targetUrl = notifData.url || "/live";

  // Handle action buttons
  if (event.action === "join" && notifData.meeting_link) {
    targetUrl = notifData.meeting_link;
  } else if (event.action === "dismiss") {
    return; // Just close
  } else if (event.action === "open" || !event.action) {
    targetUrl = notifData.url || "/live";
  }

  // Ensure absolute URL
  if (!targetUrl.startsWith("http")) {
    targetUrl = self.location.origin + targetUrl;
  }

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if already open
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        // Otherwise open a new window
        return clients.openWindow(targetUrl);
      })
  );
});

// ── Push subscription change: re-subscribe automatically ──────────────────────
self.addEventListener("pushsubscriptionchange", (event) => {
  console.log("[SW] Push subscription changed — re-subscribing...");
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true })
      .then((subscription) => {
        // Notify all open app clients so they can save the new subscription
        return clients.matchAll({ type: "window" }).then((windowClients) => {
          for (const client of windowClients) {
            client.postMessage({
              type: "PUSH_SUBSCRIPTION_CHANGED",
              subscription: subscription.toJSON(),
            });
          }
        });
      })
      .catch((err) => console.error("[SW] Re-subscription failed:", err))
  );
});