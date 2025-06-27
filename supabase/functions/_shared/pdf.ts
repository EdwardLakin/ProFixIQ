import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

export async function generatePdfBuffer(inspection: any): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Standard A4 size
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = height - 50;

  page.drawText("Inspection Summary", {
    x: 50,
    y,
    size: 20,
    font,
    color: rgb(0, 0, 0),
  });

  y -= 40;
  page.drawText(`Template: ${inspection.templateName || "N/A"}`, { x: 50, y, size: 12, font });
  y -= 20;
  page.drawText(`Date: ${inspection.templateDate || "N/A"}`, { x: 50, y, size: 12, font });
  y -= 20;

  if (inspection.vehicle) {
    page.drawText(`Vehicle: ${inspection.vehicle}`, { x: 50, y, size: 12, font });
    y -= 20;
  }

  if (inspection.sections) {
    for (const section of inspection.sections) {
      page.drawText(`${section.title}`, {
        x: 50,
        y,
        size: 14,
        font,
        color: rgb(0, 0, 1),
      });
      y -= 20;

      for (const item of section.items) {
        const status = item.status?.toUpperCase?.() || "OK";
        const notes = item.notes || "";
        page.drawText(`- ${item.itemName}: ${status}`, { x: 60, y, size: 12, font });
        y -= 15;
        if (notes) {
          page.drawText(`  Notes: ${notes}`, { x: 60, y, size: 10, font });
          y -= 15;
        }

        if (y < 80) {
          y = height - 50;
          page = pdfDoc.addPage([612, 792]);
        }
      }

      y -= 10;
    }
  }

  return await pdfDoc.save();
}