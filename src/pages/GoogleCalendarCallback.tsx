/**
 * GoogleCalendarCallback.tsx
 *
 * Route: /auth/google/callback
 *
 * Google redirects here after the user approves calendar access.
 * We exchange the ?code= param for tokens via the edge function,
 * then redirect back to the dashboard.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function GoogleCalendarCallback() {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Connecting your Google Calendar…");

  useEffect(() => {
    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code   = params.get("code");
        const error  = params.get("error");
        const state  = params.get("state");

        if (error) {
          setStatus("error");
          setMessage("Google Calendar access was denied. You can try again in Settings.");
          setTimeout(() => navigate("/dashboard/live"), 3000);
          return;
        }

        if (!code) {
          setStatus("error");
          setMessage("No authorization code received from Google.");
          setTimeout(() => navigate("/dashboard/live"), 3000);
          return;
        }

        const userId = user?.id ?? state;
        if (!userId) {
          setStatus("error");
          setMessage("Could not identify user. Please try again.");
          setTimeout(() => navigate("/dashboard/live"), 3000);
          return;
        }

        setMessage("Exchanging tokens with Google…");

        const { data, error: fnErr } = await supabase.functions.invoke(
          "sync-google-calendar",
          { body: { action: "oauth_callback", code, user_id: userId } },
        );

        if (fnErr || !data?.ok) {
          console.error("Callback error:", fnErr ?? data?.error);
          setStatus("error");
          setMessage("Failed to connect Google Calendar. Please try again.");
          setTimeout(() => navigate("/dashboard/live"), 3000);
          return;
        }

        setStatus("success");
        setMessage(
          `Connected! Found ${data.synced ?? 0} upcoming meetings. Redirecting…`
        );
        toast.success("Google Calendar connected — your meetings will auto-join!");
        setTimeout(() => navigate("/dashboard/live"), 2000);

      } catch (err: any) {
        console.error("Callback exception:", err);
        setStatus("error");
        setMessage("Something went wrong. Please try connecting again.");
        setTimeout(() => navigate("/dashboard/live"), 3000);
      }
    };

    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="glass rounded-2xl p-10 max-w-sm w-full text-center border border-border space-y-5">
        {status === "loading" && (
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
          </div>
        )}
        {status === "success" && (
          <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7 text-green-500" />
          </div>
        )}
        {status === "error" && (
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-destructive" />
          </div>
        )}

        <div>
          <h2 className="text-lg font-bold font-display mb-1">
            {status === "loading" ? "Connecting Calendar…"
             : status === "success" ? "Calendar Connected!"
             : "Connection Failed"}
          </h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default GoogleCalendarCallback;