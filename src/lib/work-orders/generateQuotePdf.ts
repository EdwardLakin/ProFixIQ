import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { QuoteLine } from '@lib/quote/generateQuoteFromInspection';
import type { InspectionSummary } from '@lib/inspection/types';

export async function generateQuotePDF(
  quote: QuoteLine[],
  summary: InspectionSummary
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();

  const fontSize = 12;
  const margin = 50;
  let y = height - margin;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const drawLine = (text: string) => {
    if (y < margin) {
      y = height - margin;
      pdfDoc.addPage();
    }
    page.drawText(text, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
    y -= fontSize + 4;
  };

  drawLine(`Inspection Summary:`);
  drawLine(`Template: ${summary.templateName}`);
  drawLine(`Date: ${summary.date}`);
  drawLine('');
  summary.summaryText.split('\n').forEach(drawLine);

  drawLine('');
  drawLine(`Quote Summary:`);
  quote.forEach((line) => {
    drawLine(
      `${line.description} - ${line.hours} hrs @ $${line.rate}/hr = $${line.total.toFixed(2)}`
    );
  });

  return await pdfDoc.save();
}