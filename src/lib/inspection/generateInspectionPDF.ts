// src/lib/inspection/generateInspectionPDF.ts

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { InspectionSession } from './types';

export async function generateInspectionPDF(session: InspectionSession): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;
  const lineHeight = 18;
  const margin = 40;

  let y = height - margin;

  const drawText = (text: string = '', options: { bold?: boolean } = {}) => {
    if (y < margin) {
      page.drawText('...continued on next page...', {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(1, 0, 0),
      });
      y = height - margin;
    }

    page.drawText(text, {
      x: margin,
      y,
      size: fontSize,
      font,
      color: options.bold ? rgb(0, 0, 0.8) : rgb(0, 0, 0),
    });

    y -= lineHeight;
  };

  const drawMultiline = (label: string, content: string) => {
    const lines = content.split('\n');
    drawText(`${label}:`);
    lines.forEach(line => drawText(`    ${line}`));
  };

  // --- HEADER ---
  drawText('Inspection Summary', { bold: true });
  drawText(`Template: ${session.templateName ?? 'N/A'}`);
  drawText('');

  // --- CUSTOMER INFO ---
  drawText('Customer Info:', { bold: true });
  drawText(`Name: ${session.customer?.first_name ?? ''} ${session.customer?.last_name ?? ''}`);
  drawText(`Phone: ${session.customer?.phone ?? ''}`);
  drawText(`Email: ${session.customer?.email ?? ''}`);
  drawText('');

  // --- VEHICLE INFO ---
  drawText('Vehicle Info:', { bold: true });
  drawText(`Year/Make/Model: ${session.vehicle?.year ?? ''} ${session.vehicle?.make ?? ''} ${session.vehicle?.model ?? ''}`);
  drawText(`VIN: ${session.vehicle?.vin ?? ''}`);
  drawText(`License Plate: ${session.vehicle?.license_plate ?? ''}`);
  drawText(`Mileage: ${session.vehicle?.mileage ?? ''}`);
  drawText(`Color: ${session.vehicle?.color ?? ''}`);
  drawText('');

  // --- INSPECTION METADATA ---
  drawText('Inspection Metadata:', { bold: true });
  drawText(`Status: ${session.status ?? 'N/A'}`);
  drawText(`Vehicle ID: ${session.vehicleId ?? 'N/A'}`);
  drawText(`Customer ID: ${session.customerId ?? 'N/A'}`);
  drawText(`Location: ${session.location ?? 'N/A'}`);
  drawText(`Started: ${session.started ? 'Yes' : 'No'}`);
  drawText(`Completed: ${session.completed ? 'Yes' : 'No'}`);
  drawText('');

  // --- INSPECTION SECTIONS & ITEMS ---
  session.sections.forEach((section, sectionIndex) => {
    drawText(`Section ${sectionIndex + 1}: ${section.title}`, { bold: true });

    section.items.forEach((item, itemIndex) => {
      drawText(`  • ${item.name}`);
      drawText(`    Status: ${item.status ?? 'N/A'}`);
      if (item.value) drawText(`    Value: ${item.value}`);
      if (item.unit) drawText(`    Unit: ${item.unit}`);
      if (item.notes) drawMultiline('    Notes', item.notes);
      if (item.recommend?.length) drawText(`    Recommend: ${item.recommend.join(', ')}`);
      if (item.photoUrls?.length) drawText(`    Photos: ${item.photoUrls.join(', ')}`);
    });

    drawText('');
  });

  return await pdfDoc.save();
}