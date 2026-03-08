

## Problem

When email confirmation is **enabled** in Supabase (the default), users register successfully but their account stays unconfirmed. When they try to log in, Supabase returns "Invalid login credentials" because the email isn't verified. If they try to register again, they get "User already registered."

## Root Cause

Two issues:
1. **Supabase email confirmation is likely still enabled** — you need to disable it in the Dashboard (Authentication → Providers → Email → toggle off "Confirm email")
2. **The signup code always shows "check your email"** even when confirmation is disabled and Supabase returns a session immediately

## Plan

### Step 1: Manual — Disable email confirmation in Supabase Dashboard
Go to **Authentication → Providers → Email** and toggle **off** "Confirm email". Save.

### Step 2: Code — Update LoginPage signup handler
Modify the signup success handler in `src/pages/LoginPage.tsx` to check if a session was returned. If yes (confirmation disabled), navigate directly to `/dashboard`. If no session (confirmation still enabled), show the "check your email" toast.

```typescript
// Current: always shows "check email" toast
// New: check if session exists after signup
const { data, error } = await supabase.auth.signUp({...});
if (error) throw error;
if (data.session) {
  navigate("/dashboard");  // auto-signed in
} else {
  toast({ title: "Check your email", description: "..." });
}
```

This single change to `LoginPage.tsx` handles both scenarios correctly.

