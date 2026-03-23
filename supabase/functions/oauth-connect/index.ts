import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ProviderConfig {
  authUrl: string;
  scopes: string;
  clientIdEnv: string;
}

const providers: Record<string, ProviderConfig> = {
  zoom: {
    authUrl: "https://zoom.us/oauth/authorize",
    scopes: "meeting:read meeting:write user:read recording:read",
    clientIdEnv: "ZOOM_CLIENT_ID",
  },
  google_meet: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes:
      "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email",
    clientIdEnv: "GOOGLE_CLIENT_ID",
  },
  // ── Google Calendar (used by the calendar sync / Live Call feature) ───────
  // Shares the same Google OAuth app as google_meet but is tracked separately
  // in the integrations table so connection state is independent.
  google_calendar: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
    clientIdEnv: "GOOGLE_CLIENT_ID",
  },
  teams: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    scopes: "OnlineMeetings.Read Calendars.Read User.Read offline_access",
    clientIdEnv: "MICROSOFT_CLIENT_ID",
  },
  salesforce: {
    authUrl: "https://login.salesforce.com/services/oauth2/authorize",
    scopes: "api refresh_token",
    clientIdEnv: "SALESFORCE_CLIENT_ID",
  },
  hubspot: {
    authUrl: "https://app.hubspot.com/oauth/authorize",
    scopes:
      "crm.objects.contacts.read crm.objects.deals.read crm.objects.deals.write",
    clientIdEnv: "HUBSPOT_CLIENT_ID",
  },
  slack: {
    authUrl: "https://slack.com/oauth/v2/authorize",
    scopes: "chat:write incoming-webhook channels:read",
    clientIdEnv: "SLACK_CLIENT_ID",
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider, redirect_uri } = await req.json();

    if (!provider || !providers[provider]) {
      return new Response(
        JSON.stringify({ error: "Invalid provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    const config = providers[provider];
    const clientId = Deno.env.get(config.clientIdEnv);

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: `${provider} not configured. Missing client ID.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-callback`;

    // Encode state with provider + user ID for callback
    const state = btoa(JSON.stringify({ provider, userId, redirect_uri: redirect_uri || "" }));

    // Google providers need access_type=offline and prompt=consent to get a refresh token
    const isGoogle = provider === "google_meet" || provider === "google_calendar";

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: config.scopes,
      state,
    });

    if (isGoogle) {
      params.set("access_type", "offline");
      params.set("prompt", "consent");
    }

    const oauthUrl = `${config.authUrl}?${params.toString()}`;

    return new Response(
      JSON.stringify({ url: oauthUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
