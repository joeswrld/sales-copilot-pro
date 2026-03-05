import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RefreshConfig {
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

const refreshConfigs: Record<string, RefreshConfig> = {
  zoom: {
    tokenUrl: "https://zoom.us/oauth/token",
    clientIdEnv: "ZOOM_CLIENT_ID",
    clientSecretEnv: "ZOOM_CLIENT_SECRET",
  },
  google_meet: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  teams: {
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientIdEnv: "MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
  },
  salesforce: {
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    clientIdEnv: "SALESFORCE_CLIENT_ID",
    clientSecretEnv: "SALESFORCE_CLIENT_SECRET",
  },
  hubspot: {
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    clientIdEnv: "HUBSPOT_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_CLIENT_SECRET",
  },
};

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
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    encoder.encode(text)
  );
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
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider, user_id } = await req.json();

    if (!provider || !refreshConfigs[provider]) {
      return new Response(
        JSON.stringify({ error: "Provider does not support refresh" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const encryptionKey = Deno.env.get("INTEGRATION_ENCRYPTION_KEY")!;

    // Get current integration
    const { data: integration, error: fetchErr } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user_id)
      .eq("provider", provider)
      .single();

    if (fetchErr || !integration?.refresh_token_encrypted) {
      return new Response(
        JSON.stringify({ error: "No refresh token available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const refreshToken = await decrypt(integration.refresh_token_encrypted, encryptionKey);
    const config = refreshConfigs[provider];
    const clientId = Deno.env.get(config.clientIdEnv)!;
    const clientSecret = Deno.env.get(config.clientSecretEnv)!;

    let tokenResponse: Response;

    if (provider === "zoom") {
      const basic = btoa(`${clientId}:${clientSecret}`);
      tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
    } else {
      tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
    }

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      // Mark as disconnected on refresh failure
      await supabase
        .from("integrations")
        .update({
          status: "disconnected",
          access_token_encrypted: null,
          refresh_token_encrypted: null,
          expires_at: null,
        })
        .eq("user_id", user_id)
        .eq("provider", provider);

      return new Response(
        JSON.stringify({ error: "Token refresh failed", disconnected: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const encryptedAccess = await encrypt(tokenData.access_token, encryptionKey);
    const encryptedRefresh = tokenData.refresh_token
      ? await encrypt(tokenData.refresh_token, encryptionKey)
      : integration.refresh_token_encrypted;

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    await supabase
      .from("integrations")
      .update({
        access_token_encrypted: encryptedAccess,
        refresh_token_encrypted: encryptedRefresh,
        expires_at: expiresAt,
        status: "connected",
      })
      .eq("user_id", user_id)
      .eq("provider", provider);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
