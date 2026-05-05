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

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { call_id } = await req.json();
    if (!call_id) {
      return new Response(JSON.stringify({ error: "call_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ownership check: verify the user owns this call
    const { data: ownedCall, error: ownErr } = await anonClient
      .from("calls")
      .select("id")
      .eq("id", call_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (ownErr || !ownedCall) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if action already exists
    const { data: existing } = await supabase
      .from("call_actions")
      .select("*")
      .eq("call_id", call_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ action: existing }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get call + summary data
    const { data: call } = await supabase.from("calls").select("*").eq("id", call_id).single();
    const { data: summaryData } = await supabase.from("call_summaries").select("*").eq("call_id", call_id).maybeSingle();

    if (!call || !summaryData) {
      return new Response(JSON.stringify({ error: "Call or summary not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user profile for email drafting
    const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).single();
    const repName = profile?.full_name || profile?.email?.split("@")[0] || "there";

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are a sales coach. Based on this completed sales call, generate:
1. ONE single prioritized next action (not a list — just the most important thing to do right now)
2. A follow-up email draft to the prospect

Call: "${call.name}"
Summary: ${summaryData.summary || "No summary available"}
Action Items: ${JSON.stringify(summaryData.action_items || [])}
Next Steps: ${JSON.stringify(summaryData.next_steps || [])}
Key Decisions: ${JSON.stringify(summaryData.key_decisions || [])}
Buying Signals: ${JSON.stringify(summaryData.buying_signals || [])}
Meeting Score: ${summaryData.meeting_score || "N/A"}

Rep name: ${repName}

Respond in JSON:
{
  "priority_action": "Send the custom pricing proposal highlighting the enterprise discount discussed",
  "email_subject": "Great connecting today — next steps for [Company]",
  "email_body": "Hi [Name],\\n\\nThank you for taking the time..."
}

Keep the action specific and actionable. The email should be professional, reference specific points from the call, and include a clear CTA.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
        }),
      }
    );

    const geminiData = await res.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Failed to parse AI response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const actionRow = {
      call_id,
      user_id: user.id,
      priority_action: parsed.priority_action || "Follow up with prospect",
      draft_email_subject: parsed.email_subject || null,
      draft_email_body: parsed.email_body || null,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("call_actions")
      .insert(actionRow)
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw insertError;
    }

    return new Response(JSON.stringify({ action: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
