import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;

serve(async (req) => {
  const { email, resetUrl } = await req.json();

  if (!email || !resetUrl) {
    return new Response("Missing email or resetUrl", { status: 400 });
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: { email: "support@profixiq.com", name: "ProFixIQ" },
      subject: "Reset Your Password",
      content: [{
        type: "text/html",
        value: `
          <p>Click the link below to reset your password:</p>
          <a href="${resetUrl}">${resetUrl}</a>
        `
      }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("SendGrid Error:", error);
    return new Response("Email send failed", { status: 500 });
  }

  return new Response("Reset email sent", { status: 200 });
});