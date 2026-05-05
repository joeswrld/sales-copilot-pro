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

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { deal_id } = await req.json();
    if (!deal_id) {
      return new Response(JSON.stringify({ error: "deal_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ownership check: verify the user owns this deal
    const { data: ownedDeal, error: ownErr } = await anonClient
      .from("deals")
      .select("id")
      .eq("id", deal_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (ownErr || !ownedDeal) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch deal calls with summaries
    const { data: calls, error: callsErr } = await supabase
      .from("calls")
      .select("id, name, date, sentiment_score, duration_minutes, meeting_type")
      .eq("deal_id", deal_id)
      .order("date", { ascending: false })
      .limit(10);

    if (callsErr) throw callsErr;
    if (!calls || calls.length < 1) {
      return new Response(JSON.stringify({
        direction: "stable",
        direction_explanation: "No calls to analyze yet.",
        next_best_action: "Schedule the first call to start building deal intelligence.",
        new_objections: [],
        new_stakeholders: [],
        buying_signals: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get summaries for each call
    const callIds = calls.map((c: any) => c.id);
    const { data: summaries } = await supabase
      .from("call_summaries")
      .select("call_id, summary, objections, next_steps, buying_signals, topics")
      .in("call_id", callIds);

    const summaryMap: Record<string, any> = {};
    (summaries || []).forEach((s: any) => { summaryMap[s.call_id] = s; });

    const callSummaries = calls.map((c: any) => ({
      ...c,
      summary: summaryMap[c.id]?.summary || null,
      objections: summaryMap[c.id]?.objections || [],
      buying_signals: summaryMap[c.id]?.buying_signals || [],
      topics: summaryMap[c.id]?.topics || [],
    }));

    // Use Gemini Flash to analyze
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      // Return basic analysis without AI
      const latestSentiment = calls[0]?.sentiment_score ?? 50;
      const prevSentiment = calls.length > 1 ? calls[1]?.sentiment_score ?? 50 : 50;
      const direction = latestSentiment > prevSentiment ? "improving"
        : latestSentiment < prevSentiment ? "declining" : "stable";

      return new Response(JSON.stringify({
        direction,
        direction_explanation: `Sentiment moved from ${prevSentiment}% to ${latestSentiment}%.`,
        next_best_action: "Review the latest call summary and follow up on action items.",
        new_objections: [],
        new_stakeholders: [],
        buying_signals: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const prompt = `You are a sales intelligence analyst. Compare these calls for a deal (newest first) and provide a concise analysis.

CALLS DATA:
${JSON.stringify(callSummaries, null, 2)}

Respond with JSON only (no markdown):
{
  "direction": "improving" | "declining" | "stable",
  "direction_explanation": "1-2 sentence explanation",
  "next_best_action": "One specific actionable next step",
  "new_objections": ["objections raised in latest call not seen before"],
  "new_stakeholders": ["any new names/roles mentioned"],
  "buying_signals": ["positive signals detected"]
}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", errText);
      throw new Error("AI analysis failed");
    }

    const geminiData = await geminiRes.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty AI response");

    const analysis = JSON.parse(text);

    // Update deal sentiment_trend
    if (analysis.direction) {
      await supabase
        .from("deals")
        .update({ sentiment_trend: analysis.direction })
        .eq("id", deal_id);
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("analyze-deal-changes error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
