import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Mail, ArrowRight, LogOut, RefreshCw } from "lucide-react";

/** Stable-ish client hint sent as one of several risk signals (not a security control). */
function computeFingerprint(): string {
  try {
    const parts = [
      navigator.userAgent,
      navigator.language,
      String(navigator.hardwareConcurrency || ""),
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      String((navigator as any).deviceMemory || ""),
      String((navigator as any).maxTouchPoints || ""),
    ];
    return btoa(unescape(encodeURIComponent(parts.join("|")))).slice(0, 256);
  } catch {
    return "";
  }
}

export default function VerifyEmailPage() {
  const { user, session, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [newEmail, setNewEmail] = useState("");

  // If not signed in at all, bounce to login
  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  // If already verified, start trial then continue to dashboard
  useEffect(() => {
    if (!user?.email_confirmed_at || !session) return;
    (async () => {
      try {
        await supabase.functions.invoke("start-trial", {
          body: { fingerprint: computeFingerprint() },
        });
      } catch {
        /* non-blocking */
      }
      navigate("/dashboard", { replace: true });
    })();
  }, [user, session, navigate]);

  // Poll every 5s in case verification happened in another tab
  useEffect(() => {
    if (!user || user.email_confirmed_at) return;
    const t = setInterval(() => supabase.auth.refreshSession().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (!user?.email || resending || cooldown > 0) return;
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-verification", {
        body: { email: user.email, redirectTo: `${window.location.origin}/verify-email` },
      });
      if (error) throw error;
      if ((data as any)?.error === "cooldown") {
        setCooldown((data as any)?.retry_after ?? 60);
        toast({ title: "Please wait", description: "You can request another email shortly." });
      } else if ((data as any)?.error) {
        throw new Error((data as any).error);
      } else {
        setCooldown(60);
        toast({ title: "Verification email sent", description: `Check ${user.email}.` });
      }
    } catch (e: any) {
      toast({ title: "Couldn't resend", description: e?.message ?? "Try again shortly.", variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.updateUser({ email });
    if (error) {
      toast({ title: "Couldn't update email", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Confirmation sent",
      description: `We sent a link to ${email}. Confirm to complete the change.`,
    });
    setNewEmail("");
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-lg">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mx-auto mb-5">
          <Mail className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-center text-foreground mb-2">Verify your email</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          We sent a verification link to <span className="font-medium text-foreground">{user.email}</span>.
          Click it to activate your account and start your free trial.
        </p>

        <button
          onClick={handleResend}
          disabled={resending || cooldown > 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <RefreshCw className={`w-4 h-4 ${resending ? "animate-spin" : ""}`} />
          {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending…" : "Resend verification email"}
        </button>

        <div className="my-6 h-px bg-border" />

        <form onSubmit={handleChangeEmail} className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Wrong address? Change your email
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@email.com"
              className="flex-1 px-3 py-2 rounded-lg bg-background border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition inline-flex items-center gap-1"
            >
              Update <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        <button
          onClick={async () => {
            await signOut();
            navigate("/login", { replace: true });
          }}
          className="w-full mt-6 inline-flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
}
