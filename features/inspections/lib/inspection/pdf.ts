// features/inspections/lib/inspection/pdf.ts
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { InspectionSession } from "./types";

export async function generateInspectionPDF(
  session: InspectionSession,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { height, width } = page.getSize();

  const fontSize = 12;
  const margin = 50;
  const lineHeight = 20;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y = height - margin;

  const drawText = (text: string) => {
    // Simple page break
    if (y < margin) {
      const p = pdfDoc.addPage([width, height]);
      y = height - margin;
      p.setFont(font);
      p.setFontSize(fontSize);
      // rebind to new page
      currentPage = p;
    }
    currentPage.drawText(text, {
      x: margin,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
  };

  let currentPage = page;

  // ---- Customer Info --------------------------------------------------------
  drawText("Customer Info:");
  const firstName = session.customer?.first_name ?? "";
  const lastName = session.customer?.last_name ?? "";
  drawText(`Name: ${firstName} ${lastName}`.trim());
  drawText(`Phone: ${session.customer?.phone ?? ""}`);
  drawText(`Email: ${session.customer?.email ?? ""}`);
  drawText(""); // spacer

  // ---- Vehicle Info ---------------------------------------------------------
  drawText("Vehicle Info:");
  const year = session.vehicle?.year ?? "";
  const make = session.vehicle?.make ?? "";
  const model = session.vehicle?.model ?? "";
  drawText(`Year/Make/Model: ${year} ${make} ${model}`.trim());
  drawText(`VIN: ${session.vehicle?.vin ?? ""}`);
  drawText(`License Plate: ${session.vehicle?.license_plate ?? ""}`);
  drawText(`Mileage: ${session.vehicle?.mileage ?? ""}`);
  drawText(`Color: ${session.vehicle?.color ?? ""}`);
  drawText(""); // spacer

  // ---- Session Meta ---------------------------------------------------------
  drawText(`Inspection Summary - ${session.templateName ?? ""}`);
  drawText(`Status: ${session.status ?? "unknown"}`);
  drawText(`Vehicle ID: ${session.vehicleId ?? "N/A"}`);
  drawText(`Customer ID: ${session.customerId ?? "N/A"}`);
  drawText(`Location: ${session.location ?? "N/A"}`);
  drawText(`Started: ${session.started ? "Yes" : "No"}`);
  drawText(`Completed: ${session.completed ? "Yes" : "No"}`);
  drawText(`Transcript: ${session.transcript ?? "None"}`);
  drawText(""); // spacer

  // ---- Sections / Items -----------------------------------------------------
  session.sections.forEach((section, sectionIndex) => {
    drawText(`Section ${sectionIndex + 1}: ${section.title}`);

    section.items.forEach((it) => {
      const itemName = it.item ?? it.name ?? "";
      drawText(`  - Item: ${itemName}`);
      drawText(`    Status: ${it.status ?? "N/A"}`);

      if (it.value !== undefined && it.value !== null) {
        drawText(`    Value: ${String(it.value)}`);
      }
      if (it.unit) drawText(`    Unit: ${it.unit}`);
      if (it.notes) drawText(`    Notes: ${it.notes}`);
      if (Array.isArray(it.recommend) && it.recommend.length > 0) {
        drawText(`    Recommend: ${it.recommend.join(", ")}`);
      }
      if (Array.isArray(it.photoUrls) && it.photoUrls.length > 0) {
        drawText(`    Photos: ${it.photoUrls.join(", ")}`);
      }
    });

    // small gap after each section
    y -= lineHeight / 2;
  });

  return pdfDoc.save();
}