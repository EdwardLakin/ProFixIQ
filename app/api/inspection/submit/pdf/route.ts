import { NextResponse } from 'next/server';
import { generateInspectionPDF } from '@lib/inspection/pdf';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const summary = body.summary;

    const pdfBuffer = await generateInspectionPDF(summary);

    const response = new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="inspection.pdf"',
      },
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}