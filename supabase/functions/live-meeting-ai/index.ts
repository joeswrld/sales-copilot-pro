// live-meeting-ai
// Async AI analysis + coaching generator called periodically from the client
// during a live call. Runs entirely server-side so audio/transcription is
// never blocked. Produces meeting_signals + ai_coaching_suggestions rows.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MEETING_TYPES = [
  "discovery", "demo", "sales_pitch", "negotiation", "closing",
  "onboarding", "support", "check_in", "kickoff", "internal", "other",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { call_id } = await req.json();
    if (!call_id) return json({ error: "call_id required" }, 400);

    // Ownership
    const { data: call } = await admin
      .from("calls")
      .select("id, user_id, name, meeting_type, deal_id")
      .eq("id", call_id)
      .maybeSingle();
    if (!call || call.user_id !== user.id) return json({ error: "Forbidden" }, 403);

    // Pull recent transcripts – prefer unanalyzed, add a few analyzed for context.
    const { data: fresh } = await admin
      .from("transcripts")
      .select("id, speaker, speaker_name, speaker_role, text, timestamp, is_partial, ai_analyzed")
      .eq("call_id", call_id)
      .eq("is_partial", false)
      .eq("ai_analyzed", false)
      .order("timestamp", { ascending: true })
      .limit(80);

    if (!fresh || fresh.length < 3) {
      return json({ ok: true, skipped: true, reason: "not enough new transcript" });
    }

    const { data: recentCtx } = await admin
      .from("transcripts")
      .select("speaker_name, speaker_role, text")
      .eq("call_id", call_id)
      .eq("is_partial", false)
      .eq("ai_analyzed", true)
      .order("timestamp", { ascending: false })
      .limit(15);

    const context = (recentCtx ?? []).reverse()
      .map((t: any) => `${t.speaker_name || t.speaker_role || "Speaker"}: ${t.text}`)
      .join("\n");

    const newSegment = fresh
      .map((t: any) => `${t.speaker_name || t.speaker_role || "Speaker"}: ${t.text}`)
      .join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    const prompt = `You are Fixsense AI, an elite real-time meeting analyst and sales coach.
Detect the meeting type and produce SHORT, HIGH-VALUE coaching for the HOST right now.

Recent context (already analyzed):
${context || "(none)"}

New transcript segment to analyze:
${newSegment}

Return STRICT JSON:
{
  "meeting_type": "one of: ${MEETING_TYPES.join(", ")}",
  "meeting_type_confidence": 0.0-1.0,
  "one_line_insight": "≤ 140 chars — what is happening right now",
  "coaching_tips": [{"text":"actionable tip to host","priority":"high|medium|low"}],   // 0–3
  "next_best_actions": [{"text":"specific next step","priority":"high|medium|low"}],   // 0–2
  "objections": [{"text":"objection raised","suggested_response":"how to handle"}],    // 0–3
  "buying_signals": ["signal phrase"],       // 0–3
  "risks": ["risk phrase"],                  // 0–3
  "competitor_mentions": ["name"],           // 0–3
  "follow_up_commitments": ["commitment"]    // 0–3
}
Only include items backed by the transcript. Empty arrays are OK. No prose outside JSON.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You output only strict JSON. No markdown." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      if (aiRes.status === 402) return json({ error: "AI credits exhausted" }, 402);
      if (aiRes.status === 429) return json({ error: "Rate limited" }, 429);
      return json({ error: "AI failed" }, 500);
    }

    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    // Persist meeting_type on call
    if (parsed.meeting_type && (parsed.meeting_type_confidence ?? 0) >= 0.5) {
      if (call.meeting_type !== parsed.meeting_type) {
        await admin.from("calls")
          .update({ meeting_type: parsed.meeting_type })
          .eq("id", call_id);
      }
    }

    // Coaching suggestions
    const coachingRows: any[] = [];
    for (const tip of (parsed.coaching_tips ?? [])) {
      if (tip?.text) coachingRows.push({
        call_id, suggestion_text: String(tip.text).slice(0, 500),
        category: "coaching", priority: tip.priority || "medium",
      });
    }
    for (const a of (parsed.next_best_actions ?? [])) {
      if (a?.text) coachingRows.push({
        call_id, suggestion_text: String(a.text).slice(0, 500),
        category: "next_step", priority: a.priority || "high",
      });
    }
    for (const o of (parsed.objections ?? [])) {
      if (o?.text) coachingRows.push({
        call_id,
        suggestion_text: `Objection: ${o.text}${o.suggested_response ? `\nResponse: ${o.suggested_response}` : ""}`.slice(0, 800),
        category: "objection", priority: "high",
      });
    }
    for (const r of (parsed.risks ?? [])) {
      if (typeof r === "string" && r) coachingRows.push({
        call_id, suggestion_text: `⚠ Risk: ${r}`.slice(0, 500),
        category: "risk", priority: "high",
      });
    }

    if (coachingRows.length) {
      await admin.from("ai_coaching_suggestions").insert(coachingRows);
    }

    // Signals
    const signalRows: any[] = [];
    for (const s of (parsed.buying_signals ?? [])) {
      if (typeof s === "string" && s) signalRows.push({
        call_id, signal_type: "buying_signal", text: s.slice(0, 300),
        confidence: 0.75, metadata: {},
      });
    }
    for (const c of (parsed.competitor_mentions ?? [])) {
      if (typeof c === "string" && c) signalRows.push({
        call_id, signal_type: "competitor_mention", text: c.slice(0, 200),
        confidence: 0.8, metadata: {},
      });
    }
    for (const f of (parsed.follow_up_commitments ?? [])) {
      if (typeof f === "string" && f) signalRows.push({
        call_id, signal_type: "follow_up_commitment", text: f.slice(0, 300),
        confidence: 0.7, metadata: {},
      });
    }
    if (signalRows.length) {
      await admin.from("meeting_signals").insert(signalRows);
    }

    // Mark analyzed
    const ids = fresh.map((t: any) => t.id);
    await admin.from("transcripts").update({ ai_analyzed: true }).in("id", ids);

    return json({
      ok: true,
      meeting_type: parsed.meeting_type,
      insight: parsed.one_line_insight,
      coaching: coachingRows.length,
      signals: signalRows.length,
    });
  } catch (e) {
    console.error("live-meeting-ai fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
