/**
 * meeting-reminders — Cron edge function (runs every minute via pg_cron)
 * 
 * Checks scheduled_meetings and fires notifications at:
 * - 60 minutes before
 * - 10 minutes before  
 * - At start time
 * 
 * Also sends push notifications and handles reschedule deduplication.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const in60 = new Date(now.getTime() + 61 * 60_000); // 61min window
    const in59 = new Date(now.getTime() + 59 * 60_000); // 59min window

    // Get all upcoming scheduled meetings (next 61 minutes)
    const { data: meetings, error } = await supabase
      .from("scheduled_meetings")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_time", in60.toISOString())
      .gte("scheduled_time", new Date(now.getTime() - 2 * 60_000).toISOString()); // not more than 2min past

    if (error) {
      console.error("Failed to fetch meetings:", error);
      throw error;
    }

    let notificationsSent = 0;

    for (const meeting of (meetings || [])) {
      const scheduledTime = new Date(meeting.scheduled_time);
      const minutesUntil = Math.round((scheduledTime.getTime() - now.getTime()) / 60_000);

      const reminders: Array<{ type: string; flag: string; title: string; message: string; minutes: number }> = [];

      // 60 minute reminder
      if (minutesUntil >= 58 && minutesUntil <= 62 && !meeting.reminder_60min_sent) {
        reminders.push({
          type: "reminder_60min",
          flag: "reminder_60min_sent",
          title: "Meeting in 1 hour",
          message: `"${meeting.title}" starts in about 1 hour`,
          minutes: 60,
        });
      }

      // 10 minute reminder
      if (minutesUntil >= 8 && minutesUntil <= 12 && !meeting.reminder_10min_sent) {
        reminders.push({
          type: "reminder_10min",
          flag: "reminder_10min_sent",
          title: "Meeting in 10 minutes",
          message: `"${meeting.title}" starts in 10 minutes — get ready!`,
          minutes: 10,
        });
      }

      // Start time reminder
      if (minutesUntil >= -2 && minutesUntil <= 1 && !meeting.reminder_start_sent) {
        reminders.push({
          type: "reminder_start",
          flag: "reminder_start_sent",
          title: "Meeting starting now",
          message: `"${meeting.title}" is starting now!`,
          minutes: 0,
        });
      }

      for (const reminder of reminders) {
        const idempotencyKey = `meeting_${meeting.id}_${reminder.type}`;
        const link = meeting.meeting_link
          ? `/live/${meeting.id}`
          : `/calls`;

        // Create notification with deduplication
        const { error: notifErr } = await supabase.rpc("create_notification", {
          p_user_id: meeting.user_id,
          p_type: "meeting",
          p_title: reminder.title,
          p_message: reminder.message,
          p_link: link,
          p_reference_id: meeting.id,
          p_idempotency_key: idempotencyKey,
        });

        if (notifErr) {
          console.error(`Notification failed for meeting ${meeting.id}:`, notifErr);
          continue;
        }

        // Mark reminder as sent
        const updateData: Record<string, any> = { [reminder.flag]: true };
        await supabase
          .from("scheduled_meetings")
          .update(updateData)
          .eq("id", meeting.id);

        // Send push notification
        try {
          await supabase.functions.invoke("send-push-notification", {
            body: {
              user_id: meeting.user_id,
              title: reminder.title,
              message: reminder.message,
              link,
              tag: `meeting-${meeting.id}`,
            },
          });
        } catch (pushErr) {
          console.error(`Push failed for meeting ${meeting.id}:`, pushErr);
        }

        notificationsSent++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: (meetings || []).length, notificationsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("meeting-reminders error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
