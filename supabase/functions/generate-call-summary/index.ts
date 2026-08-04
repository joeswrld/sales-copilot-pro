/**
 * generate-call-summary
 *
 * Produces the full post-meeting AI report shown on Call Details.
 *
 * FIX (root cause of "I end a meeting but never get analysed results"):
 * this function used to read the legacy `transcripts` table, which nothing
 * writes anymore — the authoritative transcript lives in
 * `call_final_transcripts` (Deepgram diarized utterances). With an empty
 * transcript it fell back to a one-line placeholder, never populated the
 * analysis fields Call Details renders (sentiment, engagement, questions,
 * next best actions, coaching feedback, follow-up email), and never set
 * `analysis_status`, so every meeting stayed stuck on "pending"/"Processing".
 *
 * It now:
 *   1. reads the final diarized transcript (falls back to `transcripts`)
 *   2. marks analysis_status = processing, then completed/failed
 *   3. writes the complete report + name-keyed talk ratio
 *   4. is idempotent via transcript_hash unless { force: true }
 *   5. accepts a service-role Authorization header for server-side chaining
 *   6. audit-logs every transcript read with user/role attribution
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { auditTranscriptAccess } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Line {
  speaker: string;        // "You" | "Guest"
  speaker_name: string;
  text: string;
  timestamp: string;
}

/**
 * Route a meeting recap into the right conversation:
 *  1. Deal channel (when a deal is linked)
 *  2. DM with the single other participant
 *  3. #activity channel fallback
 */
async function postRecapToDmOrActivity(
  supabase: any,
  userId: string,
  callId: string,
  body: string,
  opts: { dealId?: string },
) {
  try {
    const { data: parts } = await supabase
      .from("daily_participant_sessions")
      .select("user_id, participant_email")
      .eq("call_id", callId);

    const otherIds = new Set<string>();
    for (const p of parts || []) {
      if (p.user_id && p.user_id !== userId) otherIds.add(p.user_id);
    }
    if (otherIds.size === 0 && parts?.length) {
      const emails = Array.from(new Set(parts.map((p: any) => p.participant_email).filter(Boolean)));
      if (emails.length) {
        const { data: profs } = await supabase.from("profiles").select("id,email").in("email", emails);
        for (const p of profs || []) if (p.id !== userId) otherIds.add(p.id);
      }
    }

    if (otherIds.size === 1) {
      const other = Array.from(otherIds)[0];
      const [a, b] = userId < other ? [userId, other] : [other, userId];
      const dmKey = `${a}:${b}`;
      let { data: conv } = await supabase
        .from("team_conversations")
        .select("id")
        .eq("dm_key", dmKey)
        .eq("type", "dm")
        .maybeSingle();
      if (!conv) {
        const { data: created } = await supabase
          .from("team_conversations")
          .insert({ type: "dm", dm_key: dmKey })
          .select("id")
          .single();
        conv = created;
        if (conv) {
          await supabase.from("conversation_participants").insert([
            { conversation_id: conv.id, user_id: a },
            { conversation_id: conv.id, user_id: b },
          ]);
        }
      }
      if (conv?.id) {
        await supabase.from("team_messages").insert({
          conversation_id: conv.id,
          sender_id: userId,
          message_text: body,
          metadata: { kind: "call_recap", call_id: callId, deal_id: opts.dealId ?? null },
        });
        return;
      }
    }

    const { data: team } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (!team?.team_id) return;

    const { data: activity } = await supabase
      .from("deal_channels")
      .select("id")
      .eq("team_id", team.team_id)
      .eq("type", "activity")
      .maybeSingle();
    if (activity?.id) {
      await supabase.from("deal_channel_messages").insert({
        channel_id: activity.id,
        user_id: userId,
        content: body,
        type: "system",
        metadata: { call_id: callId, deal_id: opts.dealId ?? null, kind: "call_recap" },
      });
    }
  } catch (e) {
    console.warn("postRecapToDmOrActivity non-fatal:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let callIdForFailure: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.slice("Bearer ".length).trim();

    const body = await req.json().catch(() => ({}));
    const call_id: string | undefined = body?.call_id;
    const force: boolean = body?.force === true;
    if (!call_id) return json({ error: "call_id required" }, 400);
    callIdForFailure = call_id;

    // ── Auth: end-user JWT (must own the call) or internal service-role call ──
    const isInternal = token === serviceRoleKey;
    let userId: string | null = null;
    let actorEmail: string | null = null;

    if (!isInternal) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const anonClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await anonClient.auth.getUser();
      if (userError || !user) return json({ error: "Unauthorized" }, 401);
      userId = user.id;
      actorEmail = user.email ?? null;
    }

    const { data: call } = await supabase.from("calls").select("*").eq("id", call_id).maybeSingle();
    if (!call) return json({ error: "Call not found" }, 404);
    if (!isInternal && call.user_id !== userId) return json({ error: "Forbidden" }, 403);
    const ownerId: string = call.user_id;

    // ── Load the authoritative transcript ────────────────────────────────
    const { data: finalT } = await supabase
      .from("call_final_transcripts")
      .select("status, full_text, utterances, provider")
      .eq("call_id", call_id)
      .maybeSingle();

    let lines: Line[] = [];
    let transcriptSource = "final";

    const utterances = Array.isArray(finalT?.utterances) ? finalT!.utterances as any[] : [];
    if (utterances.length) {
      lines = utterances.map((u: any) => ({
        speaker: (u.role ?? "").toLowerCase() === "host" ? "You" : "Guest",
        speaker_name: u.speaker_name || (((u.role ?? "").toLowerCase() === "host") ? "Host" : "Guest"),
        text: String(u.text ?? "").trim(),
        timestamp: mmss(Number(u.start ?? 0)),
      })).filter((l) => l.text.length > 0);
    } else if (finalT?.full_text) {
      lines = [{ speaker: "You", speaker_name: "Host", text: finalT.full_text, timestamp: "0:00" }];
    } else {
      // Legacy fallback — live-transcription rows, if any exist
      const { data: legacy } = await supabase
        .from("transcripts")
        .select("speaker, speaker_name, speaker_role, text, timestamp")
        .eq("call_id", call_id)
        .eq("is_partial", false)
        .order("timestamp", { ascending: true });
      if (legacy?.length) {
        transcriptSource = "live";
        lines = legacy.map((t: any) => ({
          speaker: t.speaker === "Rep" || t.speaker_role === "host" ? "You" : "Guest",
          speaker_name: t.speaker_name || t.speaker || "Speaker",
          text: String(t.text ?? "").trim(),
          timestamp: typeof t.timestamp === "string" ? t.timestamp : "0:00",
        })).filter((l: Line) => l.text.length > 0);
      }
    }

    const transcriptText = lines.map((l) => `${l.speaker_name}: ${l.text}`).join("\n");

    // Audit: this request read a meeting transcript
    await auditTranscriptAccess(
      {
        user_id: userId ?? ownerId,
        actor_email: actorEmail,
        actor_role: isInternal ? "service_role" : undefined,
        target_type: "call",
        target_id: call_id,
        details: {
          reason: "ai_analysis",
          internal: isInternal,
          provider: finalT?.provider ?? null,
          transcript_chars: transcriptText.length,
        },
        req,
      },
      "transcript.read",
    );

    // ── Nothing to analyse yet ───────────────────────────────────────────
    if (transcriptText.trim().length < 20) {
      const pipelineDone = call.final_transcript_status === "completed" || call.final_transcript_status === "failed";
      await supabase.from("call_summaries").upsert({
        call_id,
        user_id: ownerId,
        summary: pipelineDone
          ? "No speech was detected in this meeting's recording, so there is nothing to analyse."
          : "",
        analysis_status: pipelineDone ? "failed" : "pending",
        transcript_source: transcriptSource,
        ai_generated: false,
        transcript: lines,
      }, { onConflict: "call_id" });
      return json({ success: true, skipped: true, reason: "no transcript yet", status: pipelineDone ? "failed" : "pending" });
    }

    // ── Idempotency ──────────────────────────────────────────────────────
    const transcriptHash = await sha256(transcriptText);
    const { data: existing } = await supabase
      .from("call_summaries")
      .select("id, transcript_hash, analysis_status, summary")
      .eq("call_id", call_id)
      .maybeSingle();

    if (!force && existing?.analysis_status === "completed" && existing.transcript_hash === transcriptHash) {
      return json({ success: true, cached: true, summary: existing.summary });
    }

    // Mark processing so Call Details shows a live "Processing Meeting…" state
    await supabase.from("call_summaries").upsert({
      call_id,
      user_id: ownerId,
      analysis_status: "processing",
      transcript_source: transcriptSource,
      transcript: lines,
    }, { onConflict: "call_id" });

    // ── Talk ratio keyed by real participant names ───────────────────────
    const wordsByName: Record<string, number> = {};
    for (const l of lines) {
      const w = l.text.split(/\s+/).filter(Boolean).length;
      wordsByName[l.speaker_name] = (wordsByName[l.speaker_name] || 0) + w;
    }
    const totalWords = Object.values(wordsByName).reduce((a, b) => a + b, 0) || 1;
    const talkRatio: Record<string, number> = {};
    for (const [name, w] of Object.entries(wordsByName)) {
      talkRatio[name] = Math.round((w / totalWords) * 100);
    }

    const { data: objections } = await supabase.from("objections").select("*").eq("call_id", call_id);
    const { data: topics } = await supabase.from("key_topics").select("*").eq("call_id", call_id);
    const objectionList = (objections || []).map((o: any) => ({
      type: o.objection_type, suggestion: o.suggestion, confidence: o.confidence_score,
    }));

    // ── AI analysis ──────────────────────────────────────────────────────
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      await supabase.from("call_summaries").update({ analysis_status: "failed" }).eq("call_id", call_id);
      return json({ error: "AI not configured" }, 500);
    }

    const participantNames = Object.keys(wordsByName).join(", ");
    const prompt = `You are Fixsense AI, an expert meeting analyst and sales coach.
Analyse the meeting transcript below and produce a complete post-meeting report.

Meeting name: ${call.name ?? "Untitled meeting"}
Meeting type: ${call.meeting_type ?? "unknown"}
Participants: ${participantNames}
Talk ratio (words): ${JSON.stringify(talkRatio)}
Known objections: ${JSON.stringify(objectionList)}
Known topics: ${JSON.stringify((topics || []).map((t: any) => t.topic))}

Transcript:
${transcriptText.slice(0, 24000)}

Return STRICT JSON with exactly these keys:
{
  "summary": "2-4 sentence recap of what happened and the outcome",
  "meeting_score": 0-10 number,
  "sentiment": "positive" | "neutral" | "negative",
  "sentiment_score": 0-100 integer,
  "engagement_score": 0-100 integer,
  "topics": ["topic"],
  "key_decisions": ["decision"],
  "action_items": ["specific task for the host"],
  "next_steps": ["agreed next step"],
  "buying_signals": ["signal"],
  "objections": [{"type":"price|timing|authority|need|competitor|other","suggestion":"how to handle","confidence":0-1}],
  "questions_asked": [{"question":"...","asked_by":"name","answered":true}],
  "next_best_actions": [{"action":"...","priority":"high|medium|low","why":"..."}],
  "follow_up_email_subject": "...",
  "follow_up_email_body": "Short professional follow-up email addressed to the other participant(s)",
  "coaching_feedback": {
    "strengths": ["what the host did well"],
    "improvements": ["what to do better next time"],
    "talk_ratio_feedback": "one sentence",
    "overall": "2 sentence coaching note"
  }
}
Base everything strictly on the transcript. Use empty arrays when nothing applies. Never invent participants. No prose outside the JSON.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: "You output only strict, valid JSON. No markdown fences." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Lovable AI error:", res.status, errText);
      await supabase.from("call_summaries").update({ analysis_status: "failed" }).eq("call_id", call_id);
      if (res.status === 429) return json({ error: "AI rate limit reached — please retry in a minute." }, 429);
      if (res.status === 402) return json({ error: "AI credits exhausted — add credits to continue." }, 402);
      return json({ error: "AI analysis failed" }, 502);
    }

    const aiData = await res.json();
    const raw = aiData?.choices?.[0]?.message?.content ?? "";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = {}; } }
    }

    if (!parsed?.summary) {
      await supabase.from("call_summaries").update({ analysis_status: "failed" }).eq("call_id", call_id);
      return json({ error: "AI returned an unusable response" }, 502);
    }

    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    const clampInt = (v: unknown, min: number, max: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;
    };

    const summary: string = String(parsed.summary);
    const nextSteps: string[] = arr(parsed.next_steps).map(String);
    const actionItems: string[] = arr(parsed.action_items).map(String);
    const keyDecisions: string[] = arr(parsed.key_decisions).map(String);
    const buyingSignals: string[] = arr(parsed.buying_signals).map(String);
    const topicList: string[] = arr(parsed.topics).length
      ? arr(parsed.topics).map(String)
      : (topics || []).map((t: any) => t.topic);
    const meetingScore =
      Number.isFinite(Number(parsed.meeting_score))
        ? Math.min(10, Math.max(0, Number(parsed.meeting_score)))
        : null;

    const payload = {
      call_id,
      user_id: ownerId,
      summary,
      key_decisions: keyDecisions,
      next_steps: nextSteps,
      action_items: actionItems,
      buying_signals: buyingSignals,
      topics: topicList,
      objections: arr(parsed.objections).length ? parsed.objections : objectionList,
      questions_asked: arr(parsed.questions_asked),
      next_best_actions: arr(parsed.next_best_actions),
      coaching_feedback: parsed.coaching_feedback ?? null,
      follow_up_email_subject: parsed.follow_up_email_subject ?? null,
      follow_up_email_body: parsed.follow_up_email_body ?? null,
      sentiment: ["positive", "neutral", "negative"].includes(parsed.sentiment) ? parsed.sentiment : "neutral",
      sentiment_score: clampInt(parsed.sentiment_score, 0, 100),
      engagement_score: clampInt(parsed.engagement_score, 0, 100),
      meeting_score: meetingScore,
      talk_ratio: talkRatio,
      transcript: lines,
      transcript_hash: transcriptHash,
      transcript_source: transcriptSource,
      analysis_status: "completed",
      analyzed_at: new Date().toISOString(),
      ai_generated: true,
    };

    const { error: saveError } = await supabase
      .from("call_summaries")
      .upsert(payload, { onConflict: "call_id" });
    if (saveError) {
      console.error("Failed to save summary:", saveError);
      await supabase.from("call_summaries").update({ analysis_status: "failed" }).eq("call_id", call_id);
      throw saveError;
    }

    // ── Roll computed values onto the call row ───────────────────────────
    const durationMinutes = call.start_time && call.end_time
      ? Math.max(1, Math.round((new Date(call.end_time).getTime() - new Date(call.start_time).getTime()) / 60000))
      : call.duration_minutes ?? null;

    await supabase.from("calls").update({
      duration_minutes: durationMinutes,
      objections_count: arr(payload.objections).length,
      sentiment_score: payload.sentiment_score ?? call.sentiment_score,
    }).eq("id", call_id);

    // ── Deal linkage + recap distribution (non-fatal) ────────────────────
    try {
      let dealId: string | null = call.deal_id ?? null;
      if (!dealId) {
        const { data: matched } = await supabase.rpc("find_deal_by_participants", { p_call_id: call_id });
        if (matched) {
          dealId = matched as unknown as string;
          await supabase.from("calls").update({ deal_id: dealId }).eq("id", call_id);
        }
      }

      const recapTitle = `Call recap — ${call.name ?? "Untitled meeting"}`;
      const recapLines = [summary];
      if (meetingScore != null) recapLines.push(`Score: ${meetingScore}/10`);
      if (nextSteps[0]) recapLines.push(`Next step: ${nextSteps[0]}`);
      recapLines.push(`Call Details: /dashboard/calls/${call_id}`);
      if (dealId) recapLines.push(`Deal: /dashboard/deals/${dealId}`);
      const recapBody = recapLines.join("\n");

      if (dealId) {
        await supabase.from("deals").update({
          last_call_at: new Date().toISOString(),
          last_call_id: call_id,
          updated_at: new Date().toISOString(),
          ...(nextSteps[0] ? { next_step: nextSteps[0] } : {}),
        }).eq("id", dealId);

        await supabase.from("deal_timeline_events").insert({
          deal_id: dealId,
          user_id: ownerId,
          event_type: "meeting_completed",
          title: recapTitle,
          detail: summary,
          metadata: {
            call_id, meeting_score: meetingScore, next_step: nextSteps[0] ?? null,
            action_items: actionItems, key_decisions: keyDecisions, buying_signals: buyingSignals,
          },
          happened_at: new Date().toISOString(),
        });

        const { data: dealChannel } = await supabase
          .from("deal_channels").select("id").eq("deal_id", dealId).maybeSingle();

        if (dealChannel?.id) {
          await supabase.from("deal_channel_messages").insert({
            channel_id: dealChannel.id, user_id: ownerId, content: recapBody,
            type: "system", metadata: { call_id, deal_id: dealId, kind: "call_recap" },
          });
        } else {
          await postRecapToDmOrActivity(supabase, ownerId, call_id, recapBody, { dealId });
        }

        supabase.functions.invoke("analyze-deal-changes", { body: { deal_id: dealId, call_id } })
          .catch((e: unknown) => console.warn("analyze-deal-changes non-fatal:", e));
      } else {
        await postRecapToDmOrActivity(supabase, ownerId, call_id, recapBody, {});
      }
    } catch (e) {
      console.warn("deal/recap linkage non-fatal:", e);
    }

    // ── Notify the host that their report is ready ───────────────────────
    try {
      await supabase.from("notifications").insert({
        user_id: ownerId,
        title: "Meeting analysis ready",
        body: `${call.name ?? "Your meeting"} has been analysed${meetingScore != null ? ` — score ${meetingScore}/10` : ""}.`,
        type: "meeting",
        link: `/dashboard/calls/${call_id}`,
      });
    } catch (e) {
      console.warn("notification non-fatal:", e);
    }

    return json({
      success: true,
      summary,
      meetingScore,
      nextSteps,
      keyDecisions,
      buyingSignals,
      actionItems,
      talkRatio,
      analysis_status: "completed",
    });
  } catch (error) {
    console.error("generate-call-summary error:", error);
    if (callIdForFailure) {
      await supabase.from("call_summaries")
        .update({ analysis_status: "failed" })
        .eq("call_id", callIdForFailure)
        .then(() => {}, () => {});
    }
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
