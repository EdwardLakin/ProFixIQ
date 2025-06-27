import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generatePdfBuffer } from "../_shared/pdf.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { email, subject, html, summaryHtml, fileName } = await req.json();

  if (!email || !subject || !html) {
    return new Response("Missing required fields", { status: 400 });
  }

  let attachments: any[] = [];

  if (summaryHtml && fileName) {
    try {
      const buffer = await generatePdfBuffer(summaryHtml);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      attachments.push({
        content: base64,
        filename: fileName,
        type: "application/pdf",
        disposition: "attachment",
      });
    } catch (err) {
      console.error("PDF generation failed:", err);
      return new Response("PDF generation failed", { status: 500 });
    }
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email }],
        },
      ],
      from: { email: "support@profixiq.com", name: "ProFixIQ" },
      subject,
      content: [
        {
          type: "text/html",
          value: html,
        },
      ],
      attachments,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("SendGrid Error:", error);
    return new Response("Email send failed", { status: 500 });
  }

  return new Response("Email sent successfully", { status: 200 });
});