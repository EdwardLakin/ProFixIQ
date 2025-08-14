import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { InspectionSession } from "./types";

export async function generateInspectionPDF(
  session: InspectionSession,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { height } = page.getSize();

  const fontSize = 12;
  const margin = 50;
  const lineHeight = 20;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y = height - margin;

  const drawText = (text: string) => {
    page.drawText(text, {
      x: margin,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
  };

  drawText("Customer Info:");
  drawText(
    `Name: ${session.customer?.first_name ?? ""} ${session.customer?.last_name ?? ""}`,
  );
  drawText(`Phone: ${session.customer?.phone ?? ""}`);
  drawText(`Email: ${session.customer?.email ?? ""}`);
  drawText(""); // spacer

  drawText(
    `Customer Name: ${session.customer?.first_name ?? ""} ${session.customer?.last_name ?? ""}`,
  );
  drawText(`Phone: ${session.customer?.phone ?? ""}`);
  drawText(`Email: ${session.customer?.email ?? ""}`);
  drawText(
    `Vehicle: ${session.vehicle.year} ${session.vehicle.make} ${session.vehicle.model}`,
  );
  drawText(`VIN: ${session.vehicle.vin}`);
  drawText(`License Plate: ${session.vehicle.license_plate}`);
  drawText(`Mileage: ${session.vehicle.mileage}`);
  drawText(`Color: ${session.vehicle.color}`);
  drawText(""); // empty line before summary

  drawText("Vehicle Info:");
  drawText(
    `Year/Make/Model: ${session.vehicle?.year ?? ""} ${session.vehicle?.make ?? ""} ${session.vehicle?.model ?? ""}`,
  );
  drawText(`VIN: ${session.vehicle?.vin ?? ""}`);
  drawText(`License Plate: ${session.vehicle?.license_plate ?? ""}`);
  drawText(`Mileage: ${session.vehicle?.mileage ?? ""}`);
  drawText(`Color: ${session.vehicle?.color ?? ""}`);
  drawText(""); // spacer

  drawText(`Inspection Summary - ${session.templateName}`);
  drawText(`Status: ${session.status ?? "unknown"}`);
  drawText(`Vehicle ID: ${session.vehicleId ?? "N/A"}`);
  drawText(`Customer ID: ${session.customerId ?? "N/A"}`);
  drawText(`Location: ${session.location ?? "N/A"}`);
  drawText(`Started: ${session.started ? "Yes" : "No"}`);
  drawText(`Completed: ${session.completed ? "Yes" : "No"}`);
  drawText(`Transcript: ${session.transcript ?? "None"}`);
  y -= lineHeight;

  session.sections.forEach((section, sectionIndex) => {
    drawText(`Section ${sectionIndex + 1}: ${section.title}`);

    section.items.forEach((item) => {
      drawText(`  - Item: ${item.item}`);
      drawText(`    Status: ${item.status ?? "N/A"}`);
      if (item.value !== undefined) drawText(`    Value: ${item.value}`);
      if (item.unit) drawText(`    Unit: ${item.unit}`);
      if (item.notes) drawText(`    Notes: ${item.notes}`);
      if (item.recommend && item.recommend.length > 0)
        drawText(`    Recommend: ${item.recommend.join(", ")}`);
      if (item.photoUrls && item.photoUrls.length > 0)
        drawText(`    Photos: ${item.photoUrls.join(", ")}`);
    });

    y -= lineHeight / 2;
  });

  return await pdfDoc.save();
}
