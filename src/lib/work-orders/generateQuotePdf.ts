import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { QuoteLine } from '@lib/quote/generateQuoteFromInspection';

/**
 * Generate a PDF for quote and summary
 * @param quote - array of quote line items
 * @param workOrderId - ID of the associated work order
 * @param summary - inspection summary string
 */
export async function generateQuotePDF(
  quote: QuoteLine[],
  workOrderId: string,
  summary: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();

  let y = height - 40;

  // Header
  page.drawText(`Inspection Quote Summary`, {
    x: 50,
    y,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });

  y -= 25;
  page.drawText(`Work Order ID: ${workOrderId}`, {
    x: 50,
    y,
    size: 12,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  y -= 30;

  // Summary Text
  const summaryLines = summary.split('\n');
  for (const line of summaryLines) {
    if (y < 50) {
      y = height - 40;
      pdfDoc.addPage([600, 800]);
    }
    page.drawText(line, {
      x: 50,
      y,
      size: 10,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 16;
  }

  y -= 20;

  // Quote Items
  page.drawText('Quote Details:', {
    x: 50,
    y,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });

  y -= 20;

  for (const job of quote) {
    const text = `• ${job.description} — ${job.job_type} — ${job.hours} hrs @ $${job.rate}/hr — Total: $${job.total.toFixed(
      2
    )}`;

    if (y < 50) {
      y = height - 40;
      pdfDoc.addPage([600, 800]);
    }

    page.drawText(text, {
      x: 50,
      y,
      size: 11,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
    y -= 18;
  }

  return await pdfDoc.save();
}