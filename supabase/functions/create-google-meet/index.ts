/**
 * create-google-meet/index.ts
 * Supabase Edge Function
 *
 * Creates a Google Calendar event with a Meet conference link for the
 * authenticated user, using encrypted OAuth tokens.
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateMeetRequest {
  title: string;
  participants?: string[];
  scheduled_time: string;
  duration_minutes?: number;
  meeting_type?: string;
}

// ── AES-GCM helpers (must match oauth-callback / oauth-refresh) ──────────────
async function encrypt(text: string, keyStr: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(keyStr.padEnd(32, "0").slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, keyMaterial, encoder.encode(text));
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encryptedStr: string, keyStr: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(keyStr.padEnd(32, "0").slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const combined = Uint8Array.from(atob(encryptedStr), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyMaterial, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ── Token refresh ─────────────────────────────────────────────────────────────
async function refreshGoogleToken(
  supabase: any,
  userId: string,
  refreshToken: string,
  encryptionKey: string,
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${await res.text()}`);
  }

  const tokens = await res.json();
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const encryptedAccess = await encrypt(tokens.access_token, encryptionKey);

  await supabase
    .from("integrations")
    .update({
      access_token_encrypted: encryptedAccess,
      expires_at: newExpiry,
    })
    .eq("user_id", userId)
    .eq("provider", "google_meet");

  return tokens.access_token;
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: verify JWT and derive user_id from the token, never from the body.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const user_id = user.id;

    const body: CreateMeetRequest = await req.json();
    const {
      title,
      participants = [],
      scheduled_time,
      duration_minutes = 60,
      meeting_type,
    } = body;

    if (!title || !scheduled_time) {
      return new Response(
        JSON.stringify({ error: "title and scheduled_time are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const encryptionKey = Deno.env.get("INTEGRATION_ENCRYPTION_KEY")!;

    // ── Get Google OAuth tokens (encrypted columns) ──────────────────────
    const { data: integration, error: intErr } = await supabase
      .from("integrations")
      .select("access_token_encrypted, refresh_token_encrypted, expires_at, status")
      .eq("user_id", user_id)
      .eq("provider", "google_meet")
      .maybeSingle();

    if (intErr || !integration || integration.status !== "connected") {
      return new Response(
        JSON.stringify({ error: "Google Meet is not connected. Please connect it in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.refresh_token_encrypted) {
      return new Response(
        JSON.stringify({ error: "Missing OAuth refresh token. Please reconnect Google Meet in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decrypt and refresh if needed
    let accessToken = integration.access_token_encrypted
      ? await decrypt(integration.access_token_encrypted, encryptionKey)
      : "";
    const refreshToken = await decrypt(integration.refresh_token_encrypted, encryptionKey);
    const expiresAt = integration.expires_at ? new Date(integration.expires_at) : new Date(0);
    if (!accessToken || expiresAt.getTime() - Date.now() < 60_000) {
      accessToken = await refreshGoogleToken(supabase, user_id, refreshToken, encryptionKey);
    }

    // ── Build calendar event ──────────────────────────────────────────────
    const startTime = new Date(scheduled_time).toISOString();
    const endTime = new Date(
      new Date(scheduled_time).getTime() + duration_minutes * 60_000
    ).toISOString();

    const meetingTypeLabels: Record<string, string> = {
      discovery: "Discovery Call",
      demo: "Product Demo",
      follow_up: "Follow-up",
      negotiation: "Negotiation",
      other: "Meeting",
    };
    const typeLabel = meeting_type ? (meetingTypeLabels[meeting_type] ?? "Meeting") : "Meeting";

    const eventBody = {
      summary: title,
      description: `${typeLabel} scheduled via Fixsense Sales Intelligence`,
      start: { dateTime: startTime, timeZone: "UTC" },
      end: { dateTime: endTime, timeZone: "UTC" },
      attendees: participants.map((email: string) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 60 },
          { method: "popup", minutes: 10 },
        ],
      },
    };

    const calRes = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events" +
      "?conferenceDataVersion=1&sendUpdates=all",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      }
    );

    if (!calRes.ok) {
      const calErr = await calRes.text();
      console.error("Google Calendar API error:", calErr);
      return new Response(
        JSON.stringify({ error: "Failed to create Google Calendar event", detail: calErr }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const eventData = await calRes.json();

    const meetLink =
      eventData.conferenceData?.entryPoints?.find(
        (e: any) => e.entryPointType === "video"
      )?.uri ??
      eventData.hangoutLink ??
      null;

    if (!meetLink) {
      console.error("No Meet link in event data:", JSON.stringify(eventData));
      return new Response(
        JSON.stringify({
          error: "Google Calendar event created but no Meet link was generated. " +
                 "Ensure your Google Workspace allows Meet conference creation.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        meet_link: meetLink,
        calendar_event_id: eventData.id,
        event_html_link: eventData.htmlLink,
        start_time: startTime,
        end_time: endTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("create-google-meet error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
