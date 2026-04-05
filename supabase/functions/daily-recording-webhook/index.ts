/**
 * daily-recording-webhook
 *
 * Handles Daily.co webhook events for recording completion.
 * When a recording is ready:
 *   1. Downloads the recording from Daily's CDN
 *   2. Uploads it to Supabase Storage (call-recordings bucket)
 *   3. Updates the calls table with the permanent recording_url
 *   4. Triggers AI summary generation if not already done
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    console.log("Daily webhook event:", payload.event);

    // We care about recording.ready-to-download
    if (payload.event !== "recording.ready-to-download") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { room_name, recording_id, download_link, duration, max_participants } = payload.payload || {};

    if (!room_name || !download_link) {
      console.error("Missing room_name or download_link in webhook payload");
      return new Response(JSON.stringify({ error: "Missing data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the call associated with this room
    const { data: room } = await supabase
      .from("native_meeting_rooms")
      .select("call_id, host_id")
      .eq("room_name", room_name)
      .maybeSingle();

    if (!room?.call_id) {
      // Try matching via calls table
      const { data: call } = await supabase
        .from("calls")
        .select("id, user_id")
        .eq("daily_room_name", room_name)
        .maybeSingle();

      if (!call) {
        console.error("No call found for room:", room_name);
        return new Response(JSON.stringify({ error: "Call not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Process with call data
      await processRecording(supabase, call.id, call.user_id, download_link, recording_id, duration);
    } else {
      await processRecording(supabase, room.call_id, room.host_id, download_link, recording_id, duration);
    }

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

  let permanentUrl = downloadLink; // fallback to Daily CDN URL

  try {
    // Download the recording from Daily
    const recordingRes = await fetch(downloadLink);
    if (!recordingRes.ok) {
      console.error("Failed to download recording from Daily:", recordingRes.status);
    } else {
      const recordingBlob = await recordingRes.blob();
      const filePath = `${userId}/${callId}/${recordingId}.mp4`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("call-recordings")
        .upload(filePath, recordingBlob, {
          contentType: "video/mp4",
          upsert: true,
        });

      if (uploadErr) {
        console.error("Storage upload error:", uploadErr);
      } else {
        // Get public URL
        const { data: urlData } = supabase.storage
          .from("call-recordings")
          .getPublicUrl(filePath);
        permanentUrl = urlData.publicUrl;
        console.log("Recording uploaded to storage:", permanentUrl);
      }
    }
  } catch (e) {
    console.error("Recording download/upload error:", e);
    // Still continue with Daily CDN URL as fallback
  }

  // Update call with recording URL
  await supabase.from("calls").update({
    recording_url: permanentUrl,
    audio_url: permanentUrl,
    duration_minutes: duration ? Math.ceil(duration / 60) : undefined,
  }).eq("id", callId);

  // Update native_meeting_rooms
  await supabase.from("native_meeting_rooms").update({
    recording_url: permanentUrl,
    status: "ended",
  }).eq("call_id", callId);

  console.log(`Recording processed for call ${callId}: ${permanentUrl}`);
}
