// features/inspections/lib/inspection/generateInspectionPDF.ts
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { SummaryItem } from "@inspections/lib/inspection/types";

export async function generateInspectionPDF(items: SummaryItem[]) {
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
    if (item.value !== undefined && item.value !== null) {
      const unit = item.unit ?? "";
      page.drawText(`Measurement: ${item.value}${unit}`, {
        x: 50,
        y,
        size: 12,
        font,
      });
      y -= 15;
    }
    if (item.photoUrls?.length) {
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

  return await doc.save();
}