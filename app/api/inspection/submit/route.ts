import { NextRequest, NextResponse } from 'next/server';
import { generateQuoteFromInspection } from '@lib/quote/generateQuoteFromInspection';
import { generateQuotePDF } from '@lib/work-orders/generateQuotePdf';
import { sendQuoteEmail } from '@lib/email/sendQuoteEmail';
import { generateInspectionSummary } from '@lib/inspection/generateInspectionSummary';
import type { InspectionSession } from '@lib/inspection/types';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    inspectionSession,
    workOrderId,
    customerEmail,
  }: {
    inspectionSession: InspectionSession;
    workOrderId: string;
    customerEmail: string;
  } = body;

  if (!inspectionSession || !workOrderId || !customerEmail) {
    return NextResponse.json({ error: 'Missing input' }, { status: 400 });
  }

  try {
    // ✅ Generate structured summary (summaryText, date, items, etc.)
    const summary = generateInspectionSummary(inspectionSession);

    // ✅ Flatten raw inspection items for quote generation
    const allItems = inspectionSession.sections.flatMap((section) => section.items);

    // ✅ Generate quote from inspection items
    const { quote, summary: quoteSummary } = await generateQuoteFromInspection(allItems);

    // ✅ Generate PDF using quote lines and summary text
    const pdfBuffer = await generateQuotePDF(quote, summary);
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

    // ✅ Send email with PDF
    await sendQuoteEmail({
      to: customerEmail,
      workOrderId,
      pdfBuffer: pdfBase64,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error generating and sending quote:', error);
    return NextResponse.json({ error: 'Failed to generate and send quote' }, { status: 500 });
  }
}