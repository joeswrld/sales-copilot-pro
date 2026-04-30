# Fixsense PWA — Integration Guide

## Files Deployed to Supabase

### Edge Functions Fixed ✅
1. **`create-daily-room`** (v7) — Removed invalid `enable_recording_ui` property. Daily.co only accepts valid room properties per their API spec.
2. **`generate-call-action`** (v3) — Now falls back to Claude (ANTHROPIC_API_KEY) when GEMINI_API_KEY is not set. Uses `claude-haiku-4-5-20251001`.
3. **`send-push-notification`** (NEW) — Sends Web Push notifications to all user devices after call summaries.

### Database Migrations ✅
- `push_subscriptions` table — stores Web Push endpoint + keys per user, with RLS.

---

## Files to Add to Your React App

### 1. `public/manifest.json` → copy to `public/`
Already created. Links app to "Add to Home Screen" on mobile.

### 2. `public/sw.js` → copy to `public/`
Service worker with:
- Static asset caching (app shell)
- Network-first with offline fallback for Supabase API calls
- Offline call list from cache
- Push notification handling

### 3. `src/hooks/usePWA.ts` → copy to `src/hooks/`
React hook for:
- SW registration
- Install prompt (beforeinstallprompt)
- Online/offline detection
- Push subscription management

### 4. `src/components/PWABanner.tsx` → copy to `src/components/`
Components:
- `<PWABanner />` — shows install prompt + offline banner (add to App.tsx)
- `<PushNotificationToggle />` — for Settings page

### 5. `index.html` — update your existing `index.html`
Adds: manifest link, apple-mobile-web-app-* meta tags, theme-color, SW registration script, safe-area CSS vars.

---

## Integration Steps

### Step 1: Add to `index.html`
Replace your current index.html with the provided one, or merge the relevant `<head>` tags and the SW registration `<script>` at the bottom.

### Step 2: Add `<PWABanner />` to App.tsx
```tsx
import PWABanner from '@/components/PWABanner';

// In your App component, inside the Router:
<PWABanner />
```

### Step 3: Add push toggle to SettingsPage.tsx
```tsx
import { PushNotificationToggle } from '@/components/PWABanner';

// Inside the Security section of SettingsPage:
<PushNotificationToggle />
```

iko### Step 4: Trigger push after call summary
In `generate-call-summary` edge function, after saving the summary, add:
```ts
// Fire-and-forget push notification
supabase.functions.invoke('send-push-notification', {
  body: {
    user_id: userId,
    title: 'Call Summary Ready',
    body: `${callName} analyzed · Score: ${meetingScore}/100`,
    url: `/dashboard/calls/${callId}`,
    tag: 'call-summary',
  }
}).catch(console.warn);
```

### Step 5: Set Supabase Secrets (for push notifications)
```bash
# Generate VAPID keys:
npx web-push generate-vapid-keys

# Set in Supabase Dashboard → Settings → Edge Functions → Secrets:
VAPID_PUBLIC_KEY=<your-public-key>
VAPID_PRIVATE_KEY=<your-private-key>
VAPID_EMAIL=mailto:support@fixsense.com.ng

# Also set in your .env for the client:
VITE_VAPID_PUBLIC_KEY=<your-public-key>
```

---

## PWA Score Improvements (35 → 80+)

| Feature | Before | After |
|---|---|---|
| Web App Manifest | ❌ | ✅ |
| Service Worker | ❌ | ✅ |
| Offline support | ❌ | ✅ Cache fallback |
| Install prompt | ❌ | ✅ |
| Push notifications | ❌ | ✅ |
| Theme color | ❌ | ✅ #7c3aed |
| Apple PWA meta | ❌ | ✅ |
| Safe area insets | ❌ | ✅ |
| Icons (192/512) | ❌ | ✅ |
| Shortcuts | ❌ | ✅ Live + Calls |

---

## API Fixes Summary

### Daily.co 400 Error
**Cause:** `enable_recording_ui` is not a valid Daily.co room property.  
**Fix:** Removed. Cloud recording is still enabled via `enable_recording: "cloud"`. The recording UI is controlled by the Daily prebuilt client automatically.

### generate-call-action 500 Error
**Cause:** `GEMINI_API_KEY not configured` with no fallback.  
**Fix:** Added Claude fallback. Priority: Gemini → Claude. At least one must be set.  
To fix immediately: set `ANTHROPIC_API_KEY` in Supabase secrets (Dashboard → Settings → Edge Functions).