import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { InspectionSession } from './types';

export async function generateInspectionPDF(session: InspectionSession): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();

  const fontSize = 12;
  const margin = 50;
  const lineHeight = 20;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y = height - margin;

  const drawText = (text: string) => {
    page.drawText(text, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
    y -= lineHeight;
  };

  drawText(`Inspection Summary - ${session.templateName}`);
  drawText(`Status: ${session.status ?? 'unknown'}`);
  drawText(`Vehicle ID: ${session.vehicleId ?? 'N/A'}`);
  drawText(`Customer ID: ${session.customerId ?? 'N/A'}`);
  drawText(`Location: ${session.location ?? 'N/A'}`);
  drawText(`Started: ${session.started ? 'Yes' : 'No'}`);
  drawText(`Completed: ${session.completed ? 'Yes' : 'No'}`);
  drawText(`Transcript: ${session.transcript ?? 'None'}`);
  y -= lineHeight;

  session.sections.forEach((section, sectionIndex) => {
    drawText(`Section ${sectionIndex + 1}: ${section.section}`);

    section.items.forEach((item, itemIndex) => {
      drawText(`  - Item: ${item.item}`);
      drawText(`    Status: ${item.status ?? 'N/A'}`);
      if (item.value !== undefined) drawText(`    Value: ${item.value}`);
      if (item.unit) drawText(`    Unit: ${item.unit}`);
      if (item.note) drawText(`    Notes: ${item.note}`);
      if (item.recommend && item.recommend.length > 0)
        drawText(`    Recommend: ${item.recommend.join(', ')}`);
      if (item.photoUrls && item.photoUrls.length > 0)
        drawText(`    Photos: ${item.photoUrls.join(', ')}`);
    });

    y -= lineHeight / 2;
  });

  return await pdfDoc.save();
}