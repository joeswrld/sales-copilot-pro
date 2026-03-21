/**
 * create-google-meet/index.ts
 * Supabase Edge Function
 *
 * Creates a Google Calendar event with a Meet conference link,
 * sends invites to participants, and returns the Meet URL.
 *
 * Deploy: supabase functions deploy create-google-meet
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateMeetRequest {
  user_id: string;
  title: string;
  participants: string[];        // array of email strings
  scheduled_time: string;        // ISO string
  duration_minutes?: number;     // default 60
  meeting_type?: string;
}

// ── Token refresh ─────────────────────────────────────────────────────────────
async function refreshGoogleToken(
  supabase: any,
  userId: string,
  refreshToken: string
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

  // Persist refreshed token
  await supabase
    .from("integrations")
    .update({
      access_token: tokens.access_token,
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
    const body: CreateMeetRequest = await req.json();
    const {
      user_id,
      title,
      participants = [],
      scheduled_time,
      duration_minutes = 60,
      meeting_type,
    } = body;

    if (!user_id || !title || !scheduled_time) {
      return new Response(
        JSON.stringify({ error: "user_id, title, and scheduled_time are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Get Google OAuth tokens ────────────────────────────────────────────
    const { data: integration, error: intErr } = await supabase
      .from("integrations")
      .select("access_token, refresh_token, expires_at, status")
      .eq("user_id", user_id)
      .eq("provider", "google_meet")
      .maybeSingle();

    if (intErr || !integration || integration.status !== "connected") {
      return new Response(
        JSON.stringify({ error: "Google Meet is not connected. Please connect it in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.refresh_token) {
      return new Response(
        JSON.stringify({ error: "Missing OAuth refresh token. Please reconnect Google Meet in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Refresh access token if expired (or within 60 seconds of expiry)
    let accessToken = integration.access_token;
    const expiresAt = integration.expires_at ? new Date(integration.expires_at) : new Date(0);
    if (expiresAt.getTime() - Date.now() < 60_000) {
      accessToken = await refreshGoogleToken(supabase, user_id, integration.refresh_token);
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

    // ── Create Google Calendar event ──────────────────────────────────────
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

    // Extract Meet link from conference data
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
