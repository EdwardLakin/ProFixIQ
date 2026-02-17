// features/inspections/lib/inspection/pdf.ts ✅ FULL FILE REPLACEMENT

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { InspectionSession } from "./types";

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function wrapText(text: string, maxChars: number): string[] {
  const t = safeStr(text).trim();
  if (!t) return ["—"];
  const words = t.split(/\s+/);
  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    if (!cur) {
      cur = w;
      continue;
    }
    if ((cur + " " + w).length <= maxChars) {
      cur = cur + " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ["—"];
}

export async function generateInspectionPDF(
  session: InspectionSession,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // A4-ish sizing (so it matches your other PDFs more closely)
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;

  const margin = 48;
  const fontSize = 11;
  const lineHeight = fontSize + 7;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const C_TEXT = rgb(0.05, 0.05, 0.05);
  const C_MUTED = rgb(0.35, 0.35, 0.35);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - margin;

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - margin;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) newPage();
  };

  const drawLine = (
    text: string,
    opts?: { bold?: boolean; color?: ReturnType<typeof rgb> },
  ) => {
    ensureSpace(lineHeight);
    page.drawText(text, {
      x: margin,
      y,
      size: fontSize,
      font: opts?.bold ? bold : font,
      color: opts?.color ?? C_TEXT,
    });
    y -= lineHeight;
  };

  const drawWrapped = (
    label: string,
    value: unknown,
    maxChars = 92,
    indent = "",
  ) => {
    const v = safeStr(value).trim();
    const out = v.length ? v : "—";
    const lines = wrapText(out, maxChars);
    drawLine(`${indent}${label}: ${lines[0]}`, { color: C_MUTED });
    for (const extra of lines.slice(1)) drawLine(`${indent}   ${extra}`, { color: C_MUTED });
  };

  // ---- Header ---------------------------------------------------------------
  drawLine("Inspection Report", { bold: true });
  drawLine(`Template: ${safeStr((session as unknown as { templateName?: unknown }).templateName) || "—"}`, { color: C_MUTED });
  drawLine("");

  // ---- Customer Info --------------------------------------------------------
  drawLine("Customer", { bold: true });
  const firstName = safeStr(session.customer?.first_name).trim();
  const lastName = safeStr(session.customer?.last_name).trim();
  const fullName = `${firstName} ${lastName}`.trim() || safeStr(session.customer?.name).trim() || "—";
  drawLine(`Name: ${fullName}`, { color: C_MUTED });
  drawLine(`Phone: ${safeStr(session.customer?.phone).trim() || "—"}`, { color: C_MUTED });
  drawLine(`Email: ${safeStr(session.customer?.email).trim() || "—"}`, { color: C_MUTED });
  drawLine("");

  // ---- Vehicle Info ---------------------------------------------------------
  drawLine("Vehicle", { bold: true });
  const year = safeStr(session.vehicle?.year).trim();
  const make = safeStr(session.vehicle?.make).trim();
  const model = safeStr(session.vehicle?.model).trim();
  drawLine(`Year/Make/Model: ${[year, make, model].filter(Boolean).join(" ") || "—"}`, { color: C_MUTED });
  drawLine(`VIN: ${safeStr(session.vehicle?.vin).trim() || "—"}`, { color: C_MUTED });
  drawLine(`License Plate: ${safeStr(session.vehicle?.license_plate).trim() || "—"}`, { color: C_MUTED });
  drawLine(`Mileage: ${safeStr(session.vehicle?.mileage).trim() || "—"}`, { color: C_MUTED });
  drawLine(`Color: ${safeStr(session.vehicle?.color).trim() || "—"}`, { color: C_MUTED });
  drawLine("");

  // ---- Session Meta ---------------------------------------------------------
  drawLine("Session", { bold: true });
  drawLine(`Status: ${safeStr(session.status).trim() || "unknown"}`, { color: C_MUTED });
  drawLine(`Vehicle ID: ${safeStr(session.vehicleId).trim() || "—"}`, { color: C_MUTED });
  drawLine(`Customer ID: ${safeStr(session.customerId).trim() || "—"}`, { color: C_MUTED });
  drawLine(`Location: ${safeStr(session.location).trim() || "—"}`, { color: C_MUTED });
  drawLine(`Started: ${session.started ? "Yes" : "No"}`, { color: C_MUTED });
  drawLine(`Completed: ${session.completed ? "Yes" : "No"}`, { color: C_MUTED });

  const transcript = safeStr(session.transcript).trim();
  if (transcript.length) drawWrapped("Transcript", transcript, 92);

  drawLine("");

  // ---- Sections / Items -----------------------------------------------------
  const sections = Array.isArray(session.sections) ? session.sections : [];

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    const title = safeStr(section?.title).trim() || `Section ${sIdx + 1}`;

    drawLine(title, { bold: true });

    const items = Array.isArray(section?.items) ? section.items : [];
    if (!items.length) {
      drawLine("— No items —", { color: C_MUTED });
      drawLine("");
      continue;
    }

    for (const it of items) {
      const itemName = safeStr((it as unknown as { item?: unknown }).item ?? (it as unknown as { name?: unknown }).name).trim() || "Item";
      const status = safeStr((it as unknown as { status?: unknown }).status).trim() || "—";

      drawLine(`• ${itemName}`, { bold: true });
      drawLine(`  Status: ${status}`, { color: C_MUTED });

      const value = (it as unknown as { value?: unknown }).value;
      if (value !== undefined && value !== null && safeStr(value).trim().length) {
        drawLine(`  Value: ${safeStr(value).trim()}`, { color: C_MUTED });
      }

      const unit = safeStr((it as unknown as { unit?: unknown }).unit).trim();
      if (unit.length) drawLine(`  Unit: ${unit}`, { color: C_MUTED });

      const notes = safeStr((it as unknown as { notes?: unknown }).notes).trim();
      if (notes.length) drawWrapped("  Notes", notes, 88, "");

      const recommend = (it as unknown as { recommend?: unknown }).recommend;
      if (Array.isArray(recommend) && recommend.length > 0) {
        drawWrapped("  Recommend", recommend.join(", "), 88, "");
      }

      const photoUrls = (it as unknown as { photoUrls?: unknown }).photoUrls;
      if (Array.isArray(photoUrls) && photoUrls.length > 0) {
        // keep URLs readable but not insane
        drawWrapped("  Photos", photoUrls.slice(0, 6).join(", "), 88, "");
        if (photoUrls.length > 6) drawLine(`  …and ${photoUrls.length - 6} more`, { color: C_MUTED });
      }

      drawLine("");
    }

    drawLine("");
  }

  return pdfDoc.save();
}