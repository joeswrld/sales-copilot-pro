import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const { call_id, audio_base64, chunk_index } = await req.json();
    if (!call_id || !audio_base64) {
      return new Response(JSON.stringify({ error: "Missing call_id or audio_base64" }), { status: 400, headers: corsHeaders });
    }

    // Ownership check: verify the user owns this call
    const { data: ownedCall, error: ownErr } = await supabase
      .from("calls")
      .select("id")
      .eq("id", call_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (ownErr || !ownedCall) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Use Lovable AI to transcribe and analyze the audio chunk
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an AI sales call analyst. You receive base64-encoded audio chunks from a sales call. 
Your job is to:
1. Transcribe the audio accurately
2. Identify the speaker (label as "Rep" or "Prospect")
3. Detect any sales objections (price, timing, competitor, authority, need)
4. Identify key topics being discussed
5. Rate engagement level (0-100)

Respond using the suggest_analysis tool.`,
          },
          {
            role: "user",
            content: `Analyze this audio chunk (chunk #${chunk_index || 0}) from a live sales call. Audio data (base64): ${audio_base64.substring(0, 500)}...
            
If the audio is unclear or too short, still provide your best analysis based on what you can detect.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_analysis",
              description: "Return the analysis of the audio chunk",
              parameters: {
                type: "object",
                properties: {
                  transcript_lines: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        speaker: { type: "string", enum: ["Rep", "Prospect"] },
                        text: { type: "string" },
                      },
                      required: ["speaker", "text"],
                      additionalProperties: false,
                    },
                  },
                  objections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string" },
                        suggestion: { type: "string" },
                        confidence: { type: "number" },
                      },
                      required: ["type", "suggestion", "confidence"],
                      additionalProperties: false,
                    },
                  },
                  topics: {
                    type: "array",
                    items: { type: "string" },
                  },
                  engagement_score: { type: "integer" },
                },
                required: ["transcript_lines", "objections", "topics", "engagement_score"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_analysis" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again" }), { status: 429, headers: corsHeaders });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: corsHeaders });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), { status: 500, headers: corsHeaders });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    let analysis = { transcript_lines: [], objections: [], topics: [], engagement_score: 50 };
    if (toolCall?.function?.arguments) {
      try {
        analysis = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error("Failed to parse AI response");
      }
    }

    // Use service role for inserts to bypass RLS (we've already verified the user)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Insert transcript lines
    if (analysis.transcript_lines?.length > 0) {
      const transcriptRows = analysis.transcript_lines.map((line: any) => ({
        call_id,
        user_id: userId,
        speaker: line.speaker,
        text: line.text,
      }));
      await adminClient.from("transcripts").insert(transcriptRows);
    }

    // Insert objections
    if (analysis.objections?.length > 0) {
      const objectionRows = analysis.objections.map((obj: any) => ({
        call_id,
        user_id: userId,
        objection_type: obj.type,
        suggestion: obj.suggestion,
        confidence_score: obj.confidence,
      }));
      await adminClient.from("objections").insert(objectionRows);
    }

    // Insert key topics
    if (analysis.topics?.length > 0) {
      const topicRows = analysis.topics.map((topic: string) => ({
        call_id,
        user_id: userId,
        topic,
      }));
      await adminClient.from("key_topics").insert(topicRows);
    }

    // Update call engagement score
    if (analysis.engagement_score !== undefined) {
      await adminClient
        .from("calls")
        .update({ sentiment_score: analysis.engagement_score })
        .eq("id", call_id)
        .eq("user_id", userId);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      analysis: {
        transcript_count: analysis.transcript_lines?.length || 0,
        objections_count: analysis.objections?.length || 0,
        topics_count: analysis.topics?.length || 0,
        engagement_score: analysis.engagement_score,
      }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("transcribe-audio error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
