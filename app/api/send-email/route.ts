// app/api/send-email/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

  if (!SENDGRID_API_KEY) {
    console.error('❌ Missing SendGrid API Key');
    return NextResponse.json({ error: 'Missing SendGrid API Key' }, { status: 500 });
  }

  const { email, subject, templateId, dynamicTemplateData, html } = await req.json();

  if (!email || !subject || (!templateId && !html)) {
    console.error('❌ Missing required email fields');
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const body: any = {
    personalizations: [
      {
        to: [{ email }],
        subject,
        dynamic_template_data: dynamicTemplateData || {},
      },
    ],
    from: {
      email: 'support@profixiq.com',
      name: 'ProFixIQ',
    },
  };

  if (templateId) {
    body.template_id = templateId;
  } else {
    body.content = [{ type: 'text/html', value: html }];
  }

  let attempt = 0;
  const maxRetries = 3;
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  while (attempt < maxRetries) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.status === 202) {
      return NextResponse.json({ success: true });
    }

    const text = await res.text();
    const headers = Object.fromEntries(res.headers.entries());

    console.error('❌ SendGrid Error:', {
      status: res.status,
      headers,
      body: text,
      payload: body,
    });

    if (res.status === 429) {
      attempt++;
      if (attempt < maxRetries) await delay(2000);
      else {
        return NextResponse.json(
          { error: 'SendGrid rate limit exceeded', details: text },
          { status: 429 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Email send failed', details: text },
        { status: res.status }
      );
    }
  }

  return NextResponse.json({ error: 'Unexpected failure' }, { status: 500 });
}