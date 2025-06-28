import { PDFDocument } from 'pdf-lib';
import { InspectionSummary }from './summary';
import { rgb } from 'pdf-lib';

export async function generateInspectionPDF(summary: InspectionSummary) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  const drawText = (text: string, x: number, y: number) => {
    page.drawText(text, {
      x,
      y,
      size: 12,
      color: rgb(0, 0, 0),
    });
  };

  drawText(`Inspection Summary - ${summary.templateName}`, margin, y);
  y -= 25;

  for (const item of summary.items) {
    drawText(`Section: ${item.section}`, margin, y);
    y -= 15;

    drawText(`Item: ${item.item}`, margin + 20, y);
    y -= 15;

    drawText(`Status: ${item.status}`, margin + 20, y);
    y -= 15;

    if (item.note2 || item.note2r) {
  const combinedNotes = [item.note2, item.note2r].filter(Boolean).join(' | ');
  drawText(`Notes: ${combinedNotes}`, margin + 20, y);
  y += 15;
}

    y -= 10;

    if (y < margin + 50) {
      y = height - margin;
      page = pdfDoc.addPage(); // ✅ changed const to let so this works
    }
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}