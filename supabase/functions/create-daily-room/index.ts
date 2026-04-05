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
    const DAILY_API_KEY = Deno.env.get("DAILY_API_KEY");
    if (!DAILY_API_KEY) {
      return new Response(
        JSON.stringify({ error: "DAILY_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      call_id,
      title = "Fixsense Meeting",
      meeting_type = null,
      exp_minutes = 180,
      app_origin = "https://fixsense.com.ng",
    } = body;

    if (!call_id) {
      return new Response(JSON.stringify({ error: "call_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Daily.co room with cloud recording enabled
    const expiresAt = Math.floor(Date.now() / 1000) + exp_minutes * 60;

    const dailyRes = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: `fixsense-${call_id.slice(0, 8)}-${Date.now()}`,
        privacy: "public",
        properties: {
          exp: expiresAt,
          enable_chat: true,
          enable_screenshare: true,
          enable_recording: "cloud",           // ← Enable cloud recording
          enable_advanced_chat: true,
          start_audio_off: false,
          start_video_off: false,
          // Auto-start recording when first person joins
          enable_recording_ui: true,
        },
      }),
    });

    if (!dailyRes.ok) {
      const errText = await dailyRes.text();
      console.error("Daily API error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to create Daily room", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const roomData = await dailyRes.json();
    const roomName = roomData.name;
    const roomUrl = roomData.url;
    const shareLink = `${app_origin}/meet/${roomName}`;

    // Store in native_meeting_rooms
    await supabase.from("native_meeting_rooms").insert({
      host_id: user.id,
      call_id,
      room_name: roomName,
      room_url: roomUrl,
      share_link: shareLink,
      title,
      meeting_type,
      status: "waiting",
      expires_at: new Date(expiresAt * 1000).toISOString(),
    });

    // Update call with Daily room info
    await supabase.from("calls").update({
      daily_room_name: roomName,
      daily_room_url: roomUrl,
      meeting_url: roomUrl,
      platform: "Daily.co",
    }).eq("id", call_id);

    return new Response(
      JSON.stringify({
        room_name: roomName,
        room_url: roomUrl,
        share_link: shareLink,
        expires_at: new Date(expiresAt * 1000).toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-daily-room error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
