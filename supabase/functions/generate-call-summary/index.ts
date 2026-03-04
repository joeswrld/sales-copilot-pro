import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const userId = claimsData.claims.sub as string;

    const { call_id } = await req.json();
    if (!call_id) {
      return new Response(JSON.stringify({ error: "call_id required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Fetch transcripts
    const { data: transcripts } = await supabase
      .from("transcripts")
      .select("*")
      .eq("call_id", call_id)
      .order("timestamp", { ascending: true });

    // Fetch objections
    const { data: objections } = await supabase
      .from("objections")
      .select("*")
      .eq("call_id", call_id);

    // Fetch key topics
    const { data: topics } = await supabase
      .from("key_topics")
      .select("*")
      .eq("call_id", call_id);

    // Fetch call info
    const { data: call } = await supabase
      .from("calls")
      .select("*")
      .eq("id", call_id)
      .single();

    const transcriptText = (transcripts || [])
      .map((t: any) => `${t.speaker}: ${t.text}`)
      .join("\n");

    const topicList = (topics || []).map((t: any) => t.topic);
    const objectionList = (objections || []).map((o: any) => ({
      type: o.objection_type,
      suggestion: o.suggestion,
      confidence: o.confidence_score,
    }));

    // Generate AI summary
    let summary = "";
    let nextSteps: string[] = [];
    let keyDecisions: string[] = [];

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (geminiKey && transcriptText.length > 0) {
      try {
        const prompt = `Analyze this sales call transcript and provide:
1. A concise summary (2-3 sentences)
2. Key decisions made (bullet points)
3. Next steps / action items (bullet points)

Transcript:
${transcriptText.slice(0, 8000)}

Objections detected: ${JSON.stringify(objectionList)}
Topics discussed: ${topicList.join(", ")}

Respond in JSON format:
{"summary": "...", "key_decisions": ["..."], "next_steps": ["..."]}`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
            }),
          }
        );
        const geminiData = await res.json();
        const text =
          geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          summary = parsed.summary || "";
          keyDecisions = parsed.key_decisions || [];
          nextSteps = parsed.next_steps || [];
        }
      } catch (e) {
        console.error("AI summary generation failed:", e);
        summary = `Call on ${call?.platform || "unknown"} with ${(transcripts || []).length} transcript segments. ${(objections || []).length} objections detected.`;
      }
    } else {
      summary = `Call on ${call?.platform || "unknown"} with ${(transcripts || []).length} transcript segments. ${(objections || []).length} objections detected.`;
      nextSteps = ["Review call recording", "Follow up with prospect"];
    }

    // Upsert call summary
    const { error: upsertError } = await supabase
      .from("call_summaries")
      .upsert(
        {
          call_id,
          user_id: userId,
          summary,
          key_decisions: keyDecisions,
          next_steps: nextSteps,
          topics: topicList,
          objections: objectionList,
          transcript: (transcripts || []).map((t: any) => ({
            speaker: t.speaker,
            text: t.text,
            timestamp: t.timestamp,
          })),
        },
        { onConflict: "call_id" }
      );

    if (upsertError) {
      console.error("Failed to save summary:", upsertError);
      throw upsertError;
    }

    // Update call with computed fields
    const durationMinutes = call?.start_time && call?.end_time
      ? Math.round(
          (new Date(call.end_time).getTime() -
            new Date(call.start_time).getTime()) /
            60000
        )
      : null;

    await supabase
      .from("calls")
      .update({
        duration_minutes: durationMinutes,
        objections_count: (objections || []).length,
      })
      .eq("id", call_id);

    // Increment calls_used in profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("calls_used")
      .eq("id", userId)
      .single();

    if (profile) {
      await supabase
        .from("profiles")
        .update({ calls_used: (profile.calls_used || 0) + 1 })
        .eq("id", userId);
    }

    return new Response(
      JSON.stringify({ success: true, summary, nextSteps, keyDecisions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
