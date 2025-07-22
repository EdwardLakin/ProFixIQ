// app/api/send-email/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { email, subject, html, summaryHtml, fileName } = await req.json();
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

  if (!SENDGRID_API_KEY) {
    return NextResponse.json({ error: 'Missing SendGrid API Key' }, { status: 500 });
  }

  if (!email || !subject || !html) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  let attachments: any[] = [];

  // Optional: Generate PDF attachment from summaryHtml
  if (summaryHtml && fileName) {
    try {
      const jsPDF = await import('jspdf');
      const doc = new jsPDF.jsPDF();

      doc.html(summaryHtml, {
        callback: function (pdf: any) {
          const base64 = btoa(String.fromCharCode(...pdf.output('arraybuffer')));
          attachments.push({
            content: base64,
            filename: fileName,
            type: 'application/pdf',
            disposition: 'attachment',
          });
        },
      });
    } catch (err) {
      console.error('PDF generation failed:', err);
      return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
    }
  }

  // Send the email using SendGrid
  const sendgridRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email }],
        },
      ],
      from: { email: 'support@profixiq.com', name: 'ProFixIQ' },
      subject,
      content: [
        {
          type: 'text/html',
          value: html,
        },
      ],
      attachments,
    }),
  });

  if (!sendgridRes.ok) {
    const errorText = await sendgridRes.text();
    console.error('SendGrid Error:', errorText);
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 });
  }

  return NextResponse.json({ message: 'Email sent successfully' }, { status: 200 });
}