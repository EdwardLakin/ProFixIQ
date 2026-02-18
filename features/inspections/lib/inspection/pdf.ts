// features/inspections/lib/inspection/pdf.ts ✅ FULL FILE REPLACEMENT (NO any)
import { PDFDocument, rgb, StandardFonts, type PDFImage } from "pdf-lib";
import type {
  InspectionSession,
  InspectionItem,
  InspectionItemStatus,
  InspectionSection,
} from "./types";

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
    if ((cur + " " + w).length <= maxChars) cur = cur + " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ["—"];
}

function statusLabel(s: InspectionItemStatus | undefined): string {
  if (!s) return "—";
  return s.toUpperCase();
}

function getItemLabel(it: InspectionItem): string {
  return safeStr(it.item ?? it.name).trim() || "Item";
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

async function tryEmbedImage(pdfDoc: PDFDocument, url: string): Promise<PDFImage> {
  // Node runtime supports fetch in Next (nodejs runtime).
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());

  // try jpg then png
  try {
    return await pdfDoc.embedJpg(buf);
  } catch {
    return await pdfDoc.embedPng(buf);
  }
}

export async function generateInspectionPDF(
  session: InspectionSession,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;

  const margin = 48;
  const fontSize = 11;
  const lineHeight = fontSize + 7;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const C_TEXT = rgb(0.05, 0.05, 0.05);
  const C_MUTED = rgb(0.35, 0.35, 0.35);
  const C_RULE = rgb(0.85, 0.85, 0.85);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - margin;

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - margin;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) newPage();
  };

  const hr = () => {
    ensureSpace(16);
    page.drawLine({
      start: { x: margin, y: y - 6 },
      end: { x: PAGE_W - margin, y: y - 6 },
      thickness: 1,
      color: C_RULE,
    });
    y -= 16;
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

  const drawWrapped = (label: string, value: unknown, maxChars = 92, indent = "") => {
    const v = safeStr(value).trim();
    const out = v.length ? v : "—";
    const lines = wrapText(out, maxChars);
    drawLine(`${indent}${label}: ${lines[0]}`, { color: C_MUTED });
    for (const extra of lines.slice(1)) {
      drawLine(`${indent}   ${extra}`, { color: C_MUTED });
    }
  };

  // ---- Header ---------------------------------------------------------------
  drawLine("Inspection Report", { bold: true });
  drawLine(`Template: ${safeStr(session.templateName).trim() || "—"}`, {
    color: C_MUTED,
  });
  drawLine(
    `Status: ${safeStr(session.status).trim() || "unknown"} • Completed: ${
      session.completed ? "Yes" : "No"
    }`,
    { color: C_MUTED },
  );
  hr();

  // ---- Customer Info --------------------------------------------------------
  drawLine("Customer", { bold: true });
  const firstName = safeStr(session.customer?.first_name).trim();
  const lastName = safeStr(session.customer?.last_name).trim();
  const fullName =
    `${firstName} ${lastName}`.trim() ||
    safeStr(session.customer?.name).trim() ||
    "—";
  drawLine(`Name: ${fullName}`, { color: C_MUTED });
  drawLine(`Phone: ${safeStr(session.customer?.phone).trim() || "—"}`, {
    color: C_MUTED,
  });
  drawLine(`Email: ${safeStr(session.customer?.email).trim() || "—"}`, {
    color: C_MUTED,
  });
  hr();

  // ---- Vehicle Info ---------------------------------------------------------
  drawLine("Vehicle", { bold: true });
  const year = safeStr(session.vehicle?.year).trim();
  const make = safeStr(session.vehicle?.make).trim();
  const model = safeStr(session.vehicle?.model).trim();
  drawLine(
    `Year/Make/Model: ${[year, make, model].filter(Boolean).join(" ") || "—"}`,
    { color: C_MUTED },
  );
  drawLine(`VIN: ${safeStr(session.vehicle?.vin).trim() || "—"}`, { color: C_MUTED });
  drawLine(
    `License Plate: ${safeStr(session.vehicle?.license_plate).trim() || "—"}`,
    { color: C_MUTED },
  );
  drawLine(`Mileage: ${safeStr(session.vehicle?.mileage).trim() || "—"}`, {
    color: C_MUTED,
  });
  drawLine(`Color: ${safeStr(session.vehicle?.color).trim() || "—"}`, { color: C_MUTED });
  hr();

  // ---- Summary --------------------------------------------------------------
  const sections: InspectionSection[] = Array.isArray(session.sections)
    ? session.sections
    : [];

  let ok = 0;
  let fail = 0;
  let rec = 0;
  let na = 0;

  for (const s of sections) {
    const items = Array.isArray(s.items) ? s.items : [];
    for (const it of items) {
      const st = it.status;
      if (st === "ok") ok++;
      else if (st === "fail") fail++;
      else if (st === "recommend") rec++;
      else if (st === "na") na++;
    }
  }

  drawLine("Summary", { bold: true });
  drawLine(`OK: ${ok}   FAIL: ${fail}   RECOMMEND: ${rec}   NA: ${na}`, {
    color: C_MUTED,
  });

  const transcript = safeStr(session.transcript).trim();
  if (transcript.length) drawWrapped("Transcript", transcript, 92);
  hr();

  // ---- Sections / Items -----------------------------------------------------
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    const title = safeStr(section.title).trim() || `Section ${sIdx + 1}`;

    drawLine(title, { bold: true });

    const items = Array.isArray(section.items) ? section.items : [];
    if (!items.length) {
      drawLine("— No items —", { color: C_MUTED });
      drawLine("");
      continue;
    }

    for (const it of items) {
      const itemName = getItemLabel(it);
      const status = it.status;

      drawLine(`• ${itemName}`, { bold: true });
      drawLine(`  Status: ${statusLabel(status)}`, { color: C_MUTED });

      const value = it.value;
      if (value !== undefined && value !== null && safeStr(value).trim().length) {
        drawLine(`  Value: ${safeStr(value).trim()}`, { color: C_MUTED });
      }

      const unit = safeStr(it.unit).trim();
      if (unit.length) drawLine(`  Unit: ${unit}`, { color: C_MUTED });

      const notes = safeStr(it.notes ?? it.note).trim();
      if (notes.length) drawWrapped("  Notes", notes, 88, "");

      const recommend = it.recommend;
      if (Array.isArray(recommend) && recommend.length > 0) {
        drawWrapped("  Recommend", recommend.join(", "), 88, "");
      }

      const photoUrls = it.photoUrls;
      if (isStringArray(photoUrls) && photoUrls.length > 0) {
        // Embed up to 2 thumbnails if possible; fallback to listing urls.
        const toTry = photoUrls.slice(0, 2);
        let embeddedAny = false;

        for (const u of toTry) {
          try {
            const img = await tryEmbedImage(pdfDoc, u);
            const maxW = 160;
            const maxH = 120;
            const scale = Math.min(maxW / img.width, maxH / img.height, 1);
            const w = img.width * scale;
            const h = img.height * scale;

            ensureSpace(h + 22);
            page.drawText("  Photo:", { x: margin, y, size: 10, font, color: C_MUTED });
            y -= 14;

            page.drawImage(img, {
              x: margin + 18,
              y: y - h,
              width: w,
              height: h,
            });
            y -= h + 8;
            embeddedAny = true;
          } catch {
            // continue trying next, but don't throw
          }
        }

        if (!embeddedAny) {
          drawWrapped("  Photos", photoUrls.slice(0, 6).join(", "), 88, "");
          if (photoUrls.length > 6) {
            drawLine(`  …and ${photoUrls.length - 6} more`, { color: C_MUTED });
          }
        }
      }

      drawLine("");
    }

    hr();
  }

  return pdfDoc.save();
}