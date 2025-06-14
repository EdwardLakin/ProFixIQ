// functions/sendEmail/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const { to, subject, html } = await req.json()

  const apiKey = Deno.env.get('SENDGRID_API_KEY')
  if (!apiKey) {
    return new Response('Missing SENDGRID_API_KEY', { status: 500 })
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'support@profixiq.app', name: 'ProFixIQ' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    return new Response(`SendGrid Error: ${error}`, { status: 500 })
  }

  return new Response('Email sent successfully', { status: 200 })
})