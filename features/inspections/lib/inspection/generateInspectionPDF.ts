import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { InspectionSummaryItem } from "@inspections/lib/inspection/summary";

export async function generateInspectionPDF(items: InspectionSummaryItem[]) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();
  let y = height - 50;

  page.drawText("Inspection Summary", {
    x: 50,
    y,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });
  y -= 30;

  for (const item of items) {
    if (y < 100) {
      y = height - 50;
      doc.addPage([600, 800]);
    }

    page.drawText(`Section: ${item.section}`, { x: 50, y, size: 12, font });
    y -= 15;
    page.drawText(`Item: ${item.item}`, { x: 50, y, size: 12, font });
    y -= 15;
    page.drawText(`Status: ${item.status}`, { x: 50, y, size: 12, font });
    y -= 15;
    if (item.note) {
      page.drawText(`Note: ${item.note}`, { x: 50, y, size: 12, font });
      y -= 15;
    }
    if (item.value) {
      page.drawText(`Measurement: ${item.value}${item.unit || ""}`, {
        x: 50,
        y,
        size: 12,
        font,
      });
      y -= 15;
    }
    if (item.photoUrls && item.photoUrls.length > 0) {
      page.drawText(`Photos: ${item.photoUrls.length} attached`, {
        x: 50,
        y,
        size: 12,
        font,
      });
      y -= 15;
    }

    y -= 10;
  }

  const pdfBytes = await doc.save();
  return pdfBytes;
}
