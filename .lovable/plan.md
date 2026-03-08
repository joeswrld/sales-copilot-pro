

## Problem

The Resend API is rejecting emails because `onboarding@resend.dev` (free tier) can only send to your own email address. To send to other recipients, you'd need to verify a custom domain in Resend.

## Simpler Solution: Use Supabase Auth Invitations

Instead of Resend, we can use **Supabase's built-in `auth.admin.inviteUserByEmail()`** in the edge function. This:
- Sends an email through Supabase's own email system (no domain verification needed)
- Creates a pre-registered user in Supabase Auth automatically
- Sends a magic link the invitee clicks to set their password and activate their account
- The `accept_pending_invitations` trigger already handles adding them to the team on signup

## Plan

1. **Rewrite `send-invite-email` edge function** to use the Supabase Admin client's `inviteUserByEmail()` instead of Resend. Pass `redirectTo` pointing to your app's login page. Include team metadata (team name, role, inviter) in the `data` field so it's available after signup.

2. **No database changes needed** — the existing `team_invitations` table and `accept_pending_invitations` trigger already handle the post-signup flow.

3. **No new secrets needed** — the edge function already has access to `SUPABASE_SERVICE_ROLE_KEY`.

## Technical Detail

```text
Current flow (broken):
  invite → Resend API → ❌ blocked (no verified domain)

New flow:
  invite → supabase.auth.admin.inviteUserByEmail() → ✅ Supabase sends email
  user clicks link → redirected to app → sets password → profile trigger fires
  → accept_pending_invitations trigger adds them to team
```

The edge function will create a Supabase admin client and call:
```typescript
const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
  redirectTo: signupUrl,
  data: { full_name: '', invited_team: teamName, invited_role: role }
});
```

