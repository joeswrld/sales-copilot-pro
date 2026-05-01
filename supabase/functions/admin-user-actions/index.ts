// Admin actions: delete user, suspend/unsuspend, reset minutes, change plan.
// Auth: caller must be authenticated AND have role='admin' in user_roles.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  // Verify caller
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Check admin role
  const { data: roleRow, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleErr || !roleRow) return json({ error: "Forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { action, target_user_id, plan_type, calls_limit, calls_used, suspended } = body ?? {};
  if (!action || !target_user_id) return json({ error: "Missing action or target_user_id" }, 400);

  try {
    switch (action) {
      case "delete_user": {
        // Cascade-deletes via FKs / triggers in app schema; auth row removed too.
        const { error } = await admin.auth.admin.deleteUser(target_user_id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "suspend_user": {
        const ban = suspended ? "876000h" : "none"; // ~100yr or unban
        const { error: banErr } = await admin.auth.admin.updateUserById(target_user_id, {
          ban_duration: ban,
        } as any);
        if (banErr) throw banErr;
        const { error: profErr } = await admin
          .from("profiles")
          .update({ suspended: !!suspended })
          .eq("id", target_user_id);
        if (profErr) throw profErr;
        return json({ ok: true });
      }
      case "update_profile": {
        const updates: Record<string, unknown> = {};
        if (typeof plan_type === "string") updates.plan_type = plan_type;
        if (typeof calls_limit === "number") updates.calls_limit = calls_limit;
        if (typeof calls_used === "number") updates.calls_used = calls_used;
        if (Object.keys(updates).length === 0) return json({ error: "No fields" }, 400);
        const { error } = await admin.from("profiles").update(updates).eq("id", target_user_id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "reset_minutes": {
        // Reset both calls_used on profile and minutes_used on subscriptions
        const { error: pErr } = await admin
          .from("profiles")
          .update({ calls_used: 0 })
          .eq("id", target_user_id);
        if (pErr) throw pErr;
        const { error: sErr } = await admin
          .from("subscriptions")
          .update({ minutes_used: 0 })
          .eq("user_id", target_user_id);
        if (sErr) throw sErr;
        return json({ ok: true });
      }
      case "grant_admin":
      case "revoke_admin": {
        if (action === "grant_admin") {
          const { error } = await admin
            .from("user_roles")
            .insert({ user_id: target_user_id, role: "admin" });
          if (error && !String(error.message).includes("duplicate")) throw error;
        } else {
          const { error } = await admin
            .from("user_roles")
            .delete()
            .eq("user_id", target_user_id)
            .eq("role", "admin");
          if (error) throw error;
        }
        return json({ ok: true });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e: any) {
    return json({ error: e.message ?? String(e) }, 500);
  }
});
