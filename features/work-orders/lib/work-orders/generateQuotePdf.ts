import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { QuoteLineItem } from "@inspections/lib/inspection/types";

export async function generateQuotePDFBytes(
  quoteLines: QuoteLineItem[],
  summary: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;

  let y = page.getSize().height - 40;
  const drawText = (text: string) => {
    page.drawText(text, { x: 50, y, size: fontSize, font, color: rgb(0, 0, 0) });
    y -= fontSize + 6;
  };

  drawText("Inspection Summary:");
  for (const line of summary.split("\n")) drawText(line);

  y -= 20;
  drawText("Quote Items:");

  for (const line of quoteLines) {
    drawText(`• ${line.description ?? line.name}`);
    drawText(`   Part: ${line.part?.name} - $${line.part?.price?.toFixed(2)}`);
    drawText(`   Labor: ${line.laborHours ?? 0} hrs - $${line.price?.toFixed(2)}`);
    drawText(`   Status: ${line.status}`);
    if (line.notes) drawText(`   Notes: ${line.notes}`);

    y -= 10;
    if (y < 60) {
      page = pdfDoc.addPage();
      y = page.getSize().height - 40;
    }
  }

  return pdfDoc.save(); // Uint8Array
}