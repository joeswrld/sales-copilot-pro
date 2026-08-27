/**
 * MeetingEntry.tsx
 *
 * Sits in front of every Fixsense Meeting link (/meeting/:roomName,
 * /join/:roomName, /meet/:roomName — the exact URLs create-daily-room's
 * `share_link` produces and the only links ever shown to or emailed to
 * candidates/clients) and decides, from the authenticated user and DB
 * meeting ownership, whether to hand off to the existing Host experience
 * (LiveMeeting.tsx, at /live/:id) or the existing Guest experience
 * (GuestJoin.tsx). Neither of those pages is modified — this component only
 * decides which one runs.
 *
 * WHY THIS EXISTS: before this fix, every one of these links rendered
 * GuestJoin unconditionally, for anyone — including the recruiter who
 * created the Fixsense Meeting. A logged-in host clicking their own
 * "Interview" meeting link would join their own meeting as a guest.
 *
 * RULE: a user is the Host only if they are authenticated AND the DB shows
 * they created this exact meeting (native_meeting_rooms.host_id, backed by
 * calls.user_id). Never anything looser than that:
 *  - Not authenticated at all              -> Guest (no lookup needed)
 *  - Authenticated but lookup finds no row -> Guest (RLS-hidden or missing;
 *                                             a role check without a
 *                                             confirmed row is not a host)
 *  - Authenticated, row visible, but
 *    host_id !== this user's id            -> Guest (e.g. a teammate who
 *                                             can see the room because they
 *                                             share the recruiting team —
 *                                             visibility is not ownership)
 *  - Authenticated AND host_id === user.id -> Host, redirect to /live/:id
 *
 * This keeps the existing candidate/job/interview workflow, the
 * create-daily-room / native_meeting_rooms / calls tables, and both
 * downstream pages completely untouched.
 */

import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import GuestJoin from "@/pages/GuestJoin";

type Resolution =
  | { status: "loading" }
  | { status: "host"; callId: string }
  | { status: "guest" };

export default function MeetingEntry() {
  const { roomName } = useParams<{ roomName: string }>();
  const { user, loading: authLoading } = useAuth();
  const [resolution, setResolution] = useState<Resolution>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      // Still figuring out auth state — don't decide yet. Auth loading is
      // normally sub-second and app-wide (see AuthContext), so this never
      // becomes a real wait for the guest case.
      if (authLoading) return;

      // Not logged in at all: definitely a guest, no DB round trip needed.
      if (!user || !roomName) {
        if (!cancelled) setResolution({ status: "guest" });
        return;
      }

      try {
        // Look up the meeting by its room name and compare true ownership
        // against the authenticated user's id. RLS on native_meeting_rooms
        // also allows other members of the recruiting team linked to this
        // interview to read this row (so they can join the interview as
        // guests) — so a returned row is NOT by itself proof of hosting.
        // Only an exact host_id match counts.
        const { data, error } = await supabase
          .from("native_meeting_rooms")
          .select("call_id, host_id")
          .eq("room_name", roomName)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data || !data.call_id) {
          // No visible row (or no linked call) — either the room doesn't
          // exist, already expired, or (most commonly) this user just
          // isn't part of it. Falling through to Guest is always the safe
          // direction here; GuestJoin has its own "meeting not found /
          // locked" handling.
          setResolution({ status: "guest" });
          return;
        }

        if (data.host_id === user.id) {
          setResolution({ status: "host", callId: data.call_id });
        } else {
          setResolution({ status: "guest" });
        }
      } catch {
        if (!cancelled) setResolution({ status: "guest" });
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [user, authLoading, roomName]);

  if (resolution.status === "loading") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#FAFAF8",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          border: "2px solid rgba(34,49,92,0.15)", borderTopColor: "#22315C",
          animation: "meeting-entry-spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes meeting-entry-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (resolution.status === "host") {
    // Hand off to the existing, untouched Host experience. LiveMeeting
    // resolves its own call/room state independently once mounted there —
    // this redirect only ever fires for a confirmed owner match above.
    return <Navigate to={`/live/${resolution.callId}`} replace />;
  }

  // Guest (including "not sure" outcomes) — the existing, untouched Guest
  // experience. GuestJoin never assumes host privileges for anyone.
  return <GuestJoin />;
}