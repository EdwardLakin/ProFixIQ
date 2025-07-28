import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@lib/supabaseServerClient';
import { extractSummaryFromSession } from '@lib/inspection/summary';
import { generateInspectionSummary } from '@lib/inspection/generateInspectionSummary';
import { generateQuoteFromInspection } from '@lib/inspection/generateQuoteFromInspection';
import { generateQuotePdf } from '@lib/inspection/generateQuotePdf';
import { sendEmail } from '@lib/email/sendEmail';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { inspectionSession, workOrderId, customerEmail } = await req.json();

  if (!inspectionSession || !workOrderId || !customerEmail) {
    return NextResponse.json({ error: 'Missing input' }, { status: 400 });
  }

  try {
    const summaryItems = extractSummaryFromSession(inspectionSession);
    const summaryText = generateInspectionSummary(inspectionSession);
    const { quote } = await generateQuoteFromInspection(summaryItems);
    const pdf = await generateQuotePdf(quote, workOrderId);

    await sendEmail({
      to: customerEmail,
      subject: `Inspection Summary & Quote — Work Order ${workOrderId}`,
      text: summaryText,
      attachments: [
        {
          filename: `Inspection_Summary_${workOrderId}.pdf`,
          content: pdf.toString('base64'),
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ],
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[INSPECTION SUBMIT ERROR]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}