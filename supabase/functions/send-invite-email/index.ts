import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { email, teamName, inviterName, role, signupUrl } = await req.json();

    if (!email || !teamName) {
      return new Response(
        JSON.stringify({ error: "email and teamName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const finalSignupUrl = signupUrl || "https://fixsense.com.ng/login";

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="background:#0d9488;padding:32px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:22px;margin:0;">You're Invited!</h1>
    </div>
    <div style="padding:32px 24px;">
      <p style="font-size:16px;color:#18181b;margin:0 0 16px;">Hi there,</p>
      <p style="font-size:15px;color:#3f3f46;line-height:1.6;margin:0 0 16px;">
        <strong>${inviterName || "A team admin"}</strong> has invited you to join
        <strong>${teamName}</strong> as a <strong>${role || "member"}</strong> on FixSense.
      </p>
      <p style="font-size:15px;color:#3f3f46;line-height:1.6;margin:0 0 24px;">
        Create your account to get started. You'll be automatically added to the team once you sign up with this email address.
      </p>
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${finalSignupUrl}"
           style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;">
          Create Account &amp; Join Team
        </a>
      </div>
      <p style="font-size:13px;color:#71717a;line-height:1.5;margin:0;">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
    </div>
    <div style="padding:16px 24px;background:#fafafa;text-align:center;border-top:1px solid #e4e4e7;">
      <p style="font-size:12px;color:#a1a1aa;margin:0;">FixSense · Sales Performance Platform</p>
    </div>
  </div>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "FixSense <onboarding@resend.dev>",
        to: [email],
        subject: `You're invited to join ${teamName} on FixSense`,
        html: htmlBody,
      }),
    });

    const resData = await res.json();

    if (!res.ok) {
      console.error("Resend error:", resData);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: resData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: resData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-invite-email error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
