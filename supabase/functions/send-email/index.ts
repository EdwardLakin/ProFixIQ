/// <reference types="https://deno.land/x/supabase@1.0.0/types.ts" />

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SENDGRID_API_KEY) {
    return new Response('Missing environment variables', { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { email, subject, html } = await req.json();

  if (!email || !subject || !html) {
    return new Response('Missing required fields', { status: 400 });
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
          subject,
        },
      ],
      from: { email: "support@profixiq.app", name: "ProFixIQ" },
      content: [{ type: "text/html", value: html }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return new Response(`SendGrid Error: ${error}`, { status: 500 });
  }

  return new Response('Email sent successfully', { status: 200 });
});