import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { QuoteLineItem } from '@lib/inspection/types';

/**
 * Generate a PDF from quote lines and inspection summary.
 * @param quoteLines List of normalized quote lines
 * @param summary Inspection summary text
 * @returns PDF Blob
 */
export async function generateQuotePDF(
  quoteLines: QuoteLineItem[],
  summary: string
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize(); // width is used if you want to align elements, currently not used

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;
  let y = height - 40;

  const drawText = (text: string) => {
    page.drawText(text, {
      x: 50,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    y -= fontSize + 6;
  };

  drawText('Inspection Summary:');
  const lines = summary.split('\n');
  for (const line of lines) {
    drawText(line);
  }

  y -= 20;
  drawText('Quote Items:');

  quoteLines.forEach((line, _idx) => {
    drawText(`• ${line.description ?? line.name}`);
    drawText(`   Part: ${line.part?.name} - $${line.part?.price?.toFixed(2)}`);
    drawText(`   Labor: ${line.laborHours ?? 0} hrs - $${line.price?.toFixed(2)}`);
    drawText(`   Status: ${line.status}`);
    if (line.notes) {
      drawText(`   Notes: ${line.notes}`);
    }
    y -= 10;
    if (y < 60) {
      y = height - 40;
      pdfDoc.addPage();
    }
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}