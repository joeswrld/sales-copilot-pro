import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the user from their JWT
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Delete user data in dependent order
    const userId = user.id;

    // Storage cleanup (team attachments)
    // Delete profile, preferences, integrations, subscriptions, calls & related, team memberships
    // The cascade and RLS will handle most, but we clean up explicitly for safety
    await adminClient.from("chat_messages").delete().eq("user_id", userId);
    await adminClient.from("user_preferences").delete().eq("user_id", userId);
    await adminClient.from("notifications").delete().eq("user_id", userId);
    await adminClient.from("crm_sync_logs").delete().eq("user_id", userId);
    await adminClient.from("integrations").delete().eq("user_id", userId);
    await adminClient.from("subscriptions").delete().eq("user_id", userId);
    await adminClient.from("scheduled_calls").delete().eq("user_id", userId);

    // Call-related
    await adminClient.from("key_topics").delete().eq("user_id", userId);
    await adminClient.from("objections").delete().eq("user_id", userId);
    await adminClient.from("transcripts").delete().eq("user_id", userId);
    await adminClient.from("call_summaries").delete().eq("user_id", userId);
    await adminClient.from("calls").delete().eq("user_id", userId);

    // Team: remove memberships (but don't delete teams the user created — they persist for other members)
    await adminClient.from("team_members").delete().eq("user_id", userId);
    await adminClient.from("conversation_participants").delete().eq("user_id", userId);

    // Profile
    await adminClient.from("profiles").delete().eq("id", userId);

    // Finally delete the auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
