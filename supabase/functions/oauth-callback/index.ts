import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getClientIP, recordFailure } from "../_shared/rate-limiter.ts";
import { logSecurityEvent } from "../_shared/security-logger.ts";

const RATE_CONFIG = { maxRequests: 15, windowMs: 60_000, maxFailures: 8, blockDurationMs: 900_000 };

interface TokenExchangeConfig {
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

const tokenConfigs: Record<string, TokenExchangeConfig> = {
  zoom: { tokenUrl: "https://zoom.us/oauth/token", clientIdEnv: "ZOOM_CLIENT_ID", clientSecretEnv: "ZOOM_CLIENT_SECRET" },
  google_meet: { tokenUrl: "https://oauth2.googleapis.com/token", clientIdEnv: "GOOGLE_CLIENT_ID", clientSecretEnv: "GOOGLE_CLIENT_SECRET" },
  google_calendar: { tokenUrl: "https://oauth2.googleapis.com/token", clientIdEnv: "GOOGLE_CLIENT_ID", clientSecretEnv: "GOOGLE_CLIENT_SECRET" },
  teams: { tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token", clientIdEnv: "MICROSOFT_CLIENT_ID", clientSecretEnv: "MICROSOFT_CLIENT_SECRET" },
  salesforce: { tokenUrl: "https://login.salesforce.com/services/oauth2/token", clientIdEnv: "SALESFORCE_CLIENT_ID", clientSecretEnv: "SALESFORCE_CLIENT_SECRET" },
  hubspot: { tokenUrl: "https://api.hubapi.com/oauth/v1/token", clientIdEnv: "HUBSPOT_CLIENT_ID", clientSecretEnv: "HUBSPOT_CLIENT_SECRET" },
  slack: { tokenUrl: "https://slack.com/api/oauth.v2.access", clientIdEnv: "SLACK_CLIENT_ID", clientSecretEnv: "SLACK_CLIENT_SECRET" },
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function encrypt(text: string, keyStr: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(keyStr.padEnd(32, "0").slice(0, 32)), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, keyMaterial, encoder.encode(text));
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

// Verify HMAC-signed state from oauth-connect
async function verifyState(signedState: string, secret: string): Promise<{ provider: string; userId: string; redirect_uri?: string } | null> {
  const dotIdx = signedState.lastIndexOf(".");
  if (dotIdx === -1) return null;

  const payloadB64 = signedState.slice(0, dotIdx);
  const sigHex = signedState.slice(dotIdx + 1);

  let payload: string;
  try {
    payload = atob(payloadB64);
  } catch {
    return null;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sigBytes = Uint8Array.from((sigHex.match(/.{2}/g) || []).map((b) => parseInt(b, 16)));
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(payload));
  if (!valid) return null;

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const ip = getClientIP(req);
  const blocked = checkRateLimit(ip, "oauth-callback", RATE_CONFIG);
  if (blocked) return blocked;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    const safeError = escapeHtml(error);
    return new Response(`<html><body><script>window.close();</script><p>Authorization denied: ${safeError}. You can close this window.</p></body></html>`, {
      headers: { "Content-Type": "text/html" },
    });
  }

  if (!code || !stateParam) {
    return new Response(`<html><body><p>Missing authorization code. You can close this window.</p></body></html>`, {
      headers: { "Content-Type": "text/html" },
    });
  }

  // Verify HMAC-signed state
  const hmacSecret = Deno.env.get("INTEGRATION_ENCRYPTION_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const state = await verifyState(stateParam, hmacSecret);

  if (!state) {
    // Fallback: try legacy unsigned state (for in-flight OAuth flows during migration)
    try {
      const legacy = JSON.parse(atob(stateParam));
      if (legacy?.provider && legacy?.userId && tokenConfigs[legacy.provider]) {
        // Accept legacy but log warning
        console.warn("OAuth callback: accepting legacy unsigned state — will be rejected after migration");
        Object.assign(state || {}, legacy);
      }
    } catch {
      // ignore
    }
    if (!state) {
      return new Response(`<html><body><p>Invalid or tampered state parameter.</p></body></html>`, {
        headers: { "Content-Type": "text/html" },
      });
    }
  }

  const config = tokenConfigs[state.provider];
  if (!config) {
    return new Response(`<html><body><p>Unknown provider.</p></body></html>`, {
      headers: { "Content-Type": "text/html" },
    });
  }

  const clientId = Deno.env.get(config.clientIdEnv)!;
  const clientSecret = Deno.env.get(config.clientSecretEnv)!;
  const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-callback`;
  const encryptionKey = Deno.env.get("INTEGRATION_ENCRYPTION_KEY")!;

  try {
    let tokenResponse: Response;

    if (state.provider === "zoom") {
      const basic = btoa(`${clientId}:${clientSecret}`);
      tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackUrl }),
      });
    } else {
      tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl }),
      });
    }

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      console.error("Token exchange failed:", tokenData);
      const safeErr = escapeHtml(tokenData.error_description || tokenData.error || "Unknown error");
      return new Response(
        `<html><body><script>window.close();</script><p>Token exchange failed: ${safeErr}. You can close this window.</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    let accessToken: string;
    let refreshToken: string | null = null;
    let expiresIn: number | null = null;
    let instanceUrl: string | null = null;
    let channelId: string | null = null;

    if (state.provider === "slack") {
      accessToken = tokenData.access_token || tokenData.authed_user?.access_token || "";
      channelId = tokenData.incoming_webhook?.channel_id || null;
    } else {
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token || null;
      expiresIn = tokenData.expires_in || null;
    }

    if (state.provider === "salesforce") {
      instanceUrl = tokenData.instance_url || null;
    }

    const encryptedAccess = await encrypt(accessToken, encryptionKey);
    const encryptedRefresh = refreshToken ? await encrypt(refreshToken, encryptionKey) : null;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { error: dbError } = await supabase
      .from("integrations")
      .update({
        status: "connected",
        access_token_encrypted: encryptedAccess,
        refresh_token_encrypted: encryptedRefresh,
        expires_at: expiresAt,
        instance_url: instanceUrl,
        channel_id: channelId,
      })
      .eq("user_id", state.userId)
      .eq("provider", state.provider);

    if (dbError) {
      console.error("DB update failed:", dbError);
      return new Response(`<html><body><p>Failed to save integration. Please try again.</p></body></html>`, { headers: { "Content-Type": "text/html" } });
    }

    // Validate redirect_uri against allowlist
    const allowedRedirects = ["", "/settings", "/integrations", "/dashboard/integrations"];
    const redirectUri = state.redirect_uri || "";
    const redirectTarget = allowedRedirects.includes(redirectUri) ? (redirectUri || "/settings") : "/settings";
    const safeProvider = escapeHtml(state.provider);
    const safeRedirect = escapeHtml(redirectTarget);

    return new Response(
      `<html><body>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'oauth-success', provider: '${safeProvider}' }, window.location.origin);
            window.close();
          } else {
            window.location.href = '${safeRedirect}';
          }
        </script>
        <p>Connected successfully! Redirecting...</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (e: unknown) {
    console.error("OAuth callback error:", e);
    return new Response(
      `<html><body><script>window.close();</script><p>An error occurred. You can close this window.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
});
