import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Decrypt helper (same as oauth functions)
async function decrypt(encrypted: string, keyHex: string): Promise<string> {
  const raw = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const keyBuf = Uint8Array.from(keyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const cryptoKey = await crypto.subtle.importKey("raw", keyBuf, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ciphertext);
  return new TextDecoder().decode(plain);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check — require valid JWT and enforce ownership
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { call_id, user_id } = await req.json();
    if (!call_id) {
      return new Response(JSON.stringify({ error: "Missing call_id" }), { status: 400, headers: corsHeaders });
    }

    // Enforce ownership: user_id must match the authenticated user
    const effectiveUserId = user.id;
    if (user_id && user_id !== effectiveUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if Slack is connected
    const { data: slackInt } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", effectiveUserId)
      .eq("provider", "slack")
      .eq("status", "connected")
      .maybeSingle();

    if (!slackInt?.access_token_encrypted) {
      return new Response(JSON.stringify({ skipped: true, reason: "Slack not connected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user owns this call
    const { data: call } = await supabase
      .from("calls")
      .select("name, platform, duration_minutes, sentiment_score, user_id")
      .eq("id", call_id)
      .single();

    if (!call) {
      return new Response(JSON.stringify({ error: "Call not found" }), { status: 404, headers: corsHeaders });
    }

    if (call.user_id !== effectiveUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    // Get call summary
    const { data: summary } = await supabase
      .from("call_summaries")
      .select("*")
      .eq("call_id", call_id)
      .maybeSingle();

    // Decrypt Slack token
    const encKey = Deno.env.get("INTEGRATION_ENCRYPTION_KEY")!;
    const slackToken = await decrypt(slackInt.access_token_encrypted, encKey);

    // Build Slack message
    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: `📞 Call Summary: ${call.name}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Platform:*\n${call.platform || "Unknown"}` },
          { type: "mrkdwn", text: `*Duration:*\n${call.duration_minutes || 0} min` },
          { type: "mrkdwn", text: `*Engagement:*\n${call.sentiment_score || 0}%` },
        ],
      },
    ];

    if (summary?.summary) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Summary:*\n${summary.summary}` },
      } as any);
    }

    if (summary?.next_steps?.length) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Next Steps:*\n${summary.next_steps.map((s: string) => `• ${s}`).join("\n")}` },
      } as any);
    }

    // Post to Slack
    const channelId = slackInt.channel_id || "general";
    const slackRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        blocks,
        text: `Call Summary: ${call.name}`,
      }),
    });

    const slackData = await slackRes.json();

    // Log sync
    await supabase.from("crm_sync_logs").insert({
      user_id: effectiveUserId,
      call_id,
      provider: "slack",
      status: slackData.ok ? "success" : "failed",
      response_payload: slackData,
    });

    return new Response(JSON.stringify({ success: slackData.ok }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("slack-notify error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
