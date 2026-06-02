/**
 * daily-recording-webhook
 *
 * Handles Daily.co webhook events for recording completion.
 * Security:
 *   - Verifies HMAC-SHA256 signature using DAILY_WEBHOOK_SECRET (if configured)
 *   - Restricts download URLs to Daily.co CDN domains (SSRF protection)
 *   - Resolves room_name to an owned call before fetching anything
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-daily-signature",
};

const ALLOWED_DOWNLOAD_HOSTS = [
  "daily-recordings-bucket.s3.amazonaws.com",
  "daily-recordings-eu-central-1-prod.s3.eu-central-1.amazonaws.com",
  "daily-recordings-prod.s3.amazonaws.com",
];
const ALLOWED_DOWNLOAD_SUFFIXES = [".daily.co", ".amazonaws.com"];

async function verifySignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Accept either raw hex or "sha256=hex" form
  const normalized = signature.replace(/^sha256=/, "").toLowerCase();
  if (normalized.length !== computed.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ normalized.charCodeAt(i);
  return diff === 0;
}

function isAllowedDownloadUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (ALLOWED_DOWNLOAD_HOSTS.includes(u.hostname)) return true;
    return ALLOWED_DOWNLOAD_SUFFIXES.some((s) => u.hostname.endsWith(s));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookSecret = Deno.env.get("DAILY_WEBHOOK_SECRET");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawBody = await req.text();

    // Signature verification — required if secret is configured
    if (webhookSecret) {
      const sig = req.headers.get("x-daily-signature") ?? req.headers.get("x-webhook-signature");
      const ok = await verifySignature(rawBody, sig, webhookSecret);
      if (!ok) {
        console.warn("Rejected Daily webhook: invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("DAILY_WEBHOOK_SECRET not configured — signature verification skipped. Configure it to fully secure this endpoint.");
    }

    const payload = JSON.parse(rawBody);
    console.log("Daily webhook event:", payload.event);

    if (payload.event !== "recording.ready-to-download") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { room_name, recording_id, download_link, duration } = payload.payload || {};

    if (!room_name || !download_link || !recording_id) {
      return new Response(JSON.stringify({ error: "Missing data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SSRF protection — only fetch known Daily/AWS URLs
    if (!isAllowedDownloadUrl(download_link)) {
      console.warn("Rejected download_link with disallowed host:", download_link);
      return new Response(JSON.stringify({ error: "Disallowed download URL" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve room → call. Reject if no matching call.
    let callId: string | null = null;
    let userId: string | null = null;

    const { data: room } = await supabase
      .from("native_meeting_rooms")
      .select("call_id, host_id")
      .eq("room_name", room_name)
      .maybeSingle();

    if (room?.call_id) {
      callId = room.call_id;
      userId = room.host_id;
    } else {
      const { data: call } = await supabase
        .from("calls")
        .select("id, user_id")
        .eq("daily_room_name", room_name)
        .maybeSingle();
      if (call) { callId = call.id; userId = call.user_id; }
    }

    if (!callId || !userId) {
      console.error("No call found for room:", room_name);
      return new Response(JSON.stringify({ error: "Call not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await processRecording(supabase, callId, userId, download_link, recording_id, duration);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("daily-recording-webhook error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processRecording(
  supabase: any,
  callId: string,
  userId: string,
  downloadLink: string,
  recordingId: string,
  duration?: number
) {
  console.log(`Processing recording for call ${callId}, recording ${recordingId}`);

  let permanentUrl = downloadLink;

  try {
    const recordingRes = await fetch(downloadLink);
    if (!recordingRes.ok) {
      console.error("Failed to download recording from Daily:", recordingRes.status);
    } else {
      const recordingBlob = await recordingRes.blob();
      const filePath = `${userId}/${callId}/${recordingId}.mp4`;

      const { error: uploadErr } = await supabase.storage
        .from("call-recordings")
        .upload(filePath, recordingBlob, { contentType: "video/mp4", upsert: true });

      if (uploadErr) {
        console.error("Storage upload error:", uploadErr);
      } else {
        const { data: signedData, error: signErr } = await supabase.storage
          .from("call-recordings")
          .createSignedUrl(filePath, 60 * 60 * 24 * 7);
        if (!signErr && signedData?.signedUrl) permanentUrl = signedData.signedUrl;
        console.log("Recording uploaded to storage:", filePath);
      }
    }
  } catch (e) {
    console.error("Recording download/upload error:", e);
  }

  await supabase.from("calls").update({
    recording_url: permanentUrl,
    audio_url: permanentUrl,
    duration_minutes: duration ? Math.ceil(duration / 60) : undefined,
  }).eq("id", callId);

  await supabase.from("native_meeting_rooms").update({
    recording_url: permanentUrl,
    status: "ended",
  }).eq("call_id", callId);

  console.log(`Recording processed for call ${callId}`);
}
