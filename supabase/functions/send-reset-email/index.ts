// supabase/functions/send-email/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const FROM_EMAIL = "support@profixiq.com";
const FROM_NAME = "ProFixIQ";
const ALLOWED_HOSTNAMES = ["profixiq.com", "localhost", "127.0.0.1"];

serve(async (req) => {
  try {
    const { email, resetUrl } = await req.json();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return new Response("Invalid email", { status: 400 });
    }

    let url: URL;
    try {
      url = new URL(resetUrl);
    } catch {
      return new Response("Malformed reset URL", { status: 400 });
    }

    if (!ALLOWED_HOSTNAMES.some((host) => url.hostname.endsWith(host))) {
      return new Response("Invalid reset URL hostname", { status: 400 });
    }

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: "Reset Your Password",
        content: [
          {
            type: "text/html",
            value: `
              <p>Hi,</p>
              <p>You requested a password reset. Click below to set a new password:</p>
              <p><a href="${resetUrl}" style="background-color: #f97316; padding: 10px 20px; color: black; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
              <p>If you didn’t request this, feel free to ignore this email.</p>
            `,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("SendGrid Error:", error);
      return new Response("Email send failed", { status: 500 });
    }

    return new Response("Reset email sent", { status: 200 });
  } catch (err) {
    console.error("Unexpected Error:", err);
    return new Response("Unexpected error", { status: 500 });
  }
});