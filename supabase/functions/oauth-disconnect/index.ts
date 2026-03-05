import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Revocation endpoints (where supported)
const revokeUrls: Record<string, string> = {
  google_meet: "https://oauth2.googleapis.com/revoke",
  slack: "https://slack.com/api/auth.revoke",
};

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
    // Verify user
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

    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    const { provider } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const encryptionKey = Deno.env.get("INTEGRATION_ENCRYPTION_KEY")!;

    // Try to revoke token if supported
    const { data: integration } = await supabase
      .from("integrations")
      .select("access_token_encrypted")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single();

    if (integration?.access_token_encrypted && revokeUrls[provider]) {
      try {
        const token = await decrypt(integration.access_token_encrypted, encryptionKey);
        await fetch(revokeUrls[provider], {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
      } catch (e) {
        console.warn("Token revocation failed (non-critical):", e.message);
      }
    }

    // Clear tokens and set disconnected
    const { error: dbError } = await supabase
      .from("integrations")
      .update({
        status: "disconnected",
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        expires_at: null,
        instance_url: null,
        channel_id: null,
      })
      .eq("user_id", userId)
      .eq("provider", provider);

    if (dbError) throw dbError;

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
