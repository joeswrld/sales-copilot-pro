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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for DB operations, anon client for auth verification
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? serviceRoleKey;

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    // Use service role client for all DB operations
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { call_id } = await req.json();
    if (!call_id) {
      return new Response(JSON.stringify({ error: "call_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Compute talk ratio from transcripts
    const repWords = (transcripts || [])
      .filter((t: any) => t.speaker === "Rep")
      .reduce((sum: number, t: any) => sum + (t.text?.split(/\s+/).length || 0), 0);
    const prospectWords = (transcripts || [])
      .filter((t: any) => t.speaker !== "Rep")
      .reduce((sum: number, t: any) => sum + (t.text?.split(/\s+/).length || 0), 0);
    const totalWords = repWords + prospectWords;
    const talkRatio = totalWords > 0
      ? { rep: Math.round((repWords / totalWords) * 100), prospect: Math.round((prospectWords / totalWords) * 100) }
      : { rep: 0, prospect: 0 };

    // Generate AI summary
    let summary = "";
    let nextSteps: string[] = [];
    let keyDecisions: string[] = [];
    let meetingScore: number | null = null;
    let buyingSignals: string[] = [];
    let actionItems: string[] = [];

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (geminiKey && transcriptText.length > 0) {
      try {
        const meetingType = call?.meeting_type || "sales call";
        const prompt = `Analyze this ${meetingType} sales call transcript and provide a comprehensive analysis:

1. A concise summary (2-3 sentences capturing the key outcome)
2. Meeting score (0-10, based on: rapport building, discovery depth, objection handling, next step clarity)
3. Key decisions made (bullet points)
4. Action items for the sales rep (specific, actionable tasks)
5. Buying signals detected (phrases or behaviors indicating purchase intent)
6. Next steps agreed upon

Transcript:
${transcriptText.slice(0, 8000)}

Talk ratio: Rep ${talkRatio.rep}%, Prospect ${talkRatio.prospect}%
Objections detected: ${JSON.stringify(objectionList)}
Topics discussed: ${topicList.join(", ")}

Respond in JSON format:
{
  "summary": "...",
  "meeting_score": 7.5,
  "key_decisions": ["..."],
  "action_items": ["Send pricing document", "Schedule follow-up demo"],
  "buying_signals": ["Prospect asked about implementation timeline", "..."],
  "next_steps": ["..."]
}`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
            }),
          }
        );
        const geminiData = await res.json();
        const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          summary = parsed.summary || "";
          keyDecisions = parsed.key_decisions || [];
          nextSteps = parsed.next_steps || [];
          meetingScore = typeof parsed.meeting_score === "number" ? parsed.meeting_score : null;
          buyingSignals = parsed.buying_signals || [];
          actionItems = parsed.action_items || [];
        }
      } catch (e) {
        console.error("AI summary generation failed:", e);
        summary = `Call on ${call?.platform || "unknown"} with ${(transcripts || []).length} transcript segments. ${(objections || []).length} objections detected.`;
      }
    } else {
      summary = `Call on ${call?.platform || "unknown"} with ${(transcripts || []).length} transcript segments. ${(objections || []).length} objections detected.`;
      nextSteps = ["Review call recording", "Follow up with prospect"];
    }

    // Check if summary already exists for this call
    const { data: existingSummary } = await supabase
      .from("call_summaries")
      .select("id")
      .eq("call_id", call_id)
      .maybeSingle();

    const summaryPayload = {
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
      meeting_score: meetingScore,
      talk_ratio: talkRatio,
      buying_signals: buyingSignals,
      action_items: actionItems,
    };

    let saveError;
    if (existingSummary?.id) {
      // Update existing
      const { error } = await supabase
        .from("call_summaries")
        .update(summaryPayload)
        .eq("id", existingSummary.id);
      saveError = error;
    } else {
      // Insert new
      const { error } = await supabase
        .from("call_summaries")
        .insert(summaryPayload);
      saveError = error;
    }

    if (saveError) {
      console.error("Failed to save summary:", saveError);
      throw saveError;
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
      JSON.stringify({ success: true, summary, meetingScore, nextSteps, keyDecisions, buyingSignals, actionItems, talkRatio }),
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
