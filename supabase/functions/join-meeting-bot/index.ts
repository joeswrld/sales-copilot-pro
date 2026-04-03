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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const meetingbaasKey = Deno.env.get("MEETINGBAAS_API_KEY") ?? "";

    // Authenticate user
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? serviceRoleKey,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { call_id, meeting_url, call_name } = await req.json();

    if (!call_id || !meeting_url) {
      return new Response(
        JSON.stringify({ error: "call_id and meeting_url are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect platform
    let platform = "unknown";
    if (meeting_url.includes("meet.google.com")) platform = "google_meet";
    else if (meeting_url.includes("zoom.us")) platform = "zoom";
    else if (meeting_url.includes("teams.microsoft.com")) platform = "teams";

    // Update call with bot status
    await supabase.from("calls").update({
      recall_bot_status: "joining",
    }).eq("id", call_id);

    // Create bot_sessions record
    await supabase.from("bot_sessions").upsert({
      call_id,
      meeting_url,
      platform,
      status: "joining",
      join_attempts: 1,
      last_attempt_at: new Date().toISOString(),
    }, { onConflict: "call_id" });

    // If MeetingBaas API key is configured, dispatch real bot
    if (meetingbaasKey) {
      try {
        const mbRes = await fetch("https://api.meetingbaas.com/bots", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-meeting-baas-api-key": meetingbaasKey,
          },
          body: JSON.stringify({
            meeting_url,
            bot_name: "Fixsense AI Recorder",
            recording_mode: "speaker_view",
            bot_image: "https://fixsense.com.ng/logo.png",
            entry_message: "Fixsense AI Recorder has joined. This meeting will be recorded for analysis.",
            reserved: false,
            speech_to_text: { provider: "Default" },
            automatic_leave: { waiting_room_timeout: 600 },
          }),
        });

        const mbData = await mbRes.json();

        if (mbRes.ok && mbData.bot_id) {
          await supabase.from("calls").update({
            recall_bot_id: mbData.bot_id,
            recall_bot_status: "joining",
          }).eq("id", call_id);

          await supabase.from("bot_sessions").update({
            bot_id: mbData.bot_id,
            status: "joining",
          }).eq("call_id", call_id);
        } else {
          console.error("MeetingBaas error:", mbData);
          await supabase.from("calls").update({
            recall_bot_status: "failed",
          }).eq("id", call_id);

          await supabase.from("bot_sessions").update({
            status: "failed",
            error_message: mbData?.message || "Bot dispatch failed",
          }).eq("call_id", call_id);
        }
      } catch (e: unknown) {
        console.error("MeetingBaas dispatch error:", e);
        await supabase.from("calls").update({
          recall_bot_status: "failed",
        }).eq("id", call_id);

        await supabase.from("bot_sessions").update({
          status: "failed",
          error_message: (e as Error).message,
        }).eq("call_id", call_id);
      }
    } else {
      // No bot service configured — mark as simulated/joining for UI feedback
      console.log("No MEETINGBAAS_API_KEY configured. Bot status set to joining (simulated).");
      // Status stays as "joining" — frontend will show status accordingly
    }

    return new Response(
      JSON.stringify({ success: true, call_id, platform }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: unknown) {
    console.error("join-meeting-bot error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
