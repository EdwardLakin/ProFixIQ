import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type {
  QuoteLine,
  QuoteLineItem,
} from "@inspections/lib/inspection/types";

/**
 * Normalizes either QuoteLine or QuoteLineItem into a common shape
 * so the PDF renderer doesn't care which one you pass.
 */
function toUnified(line: QuoteLine | QuoteLineItem) {
  // Heuristic: QuoteLine has "parts" or "laborTime"
  const isQuoteLine =
    (line as QuoteLine).parts !== undefined ||
    (line as QuoteLine).laborTime !== undefined;

  if (isQuoteLine) {
    const q = line as QuoteLine;
    const first = q.parts?.[0];
    const laborHours = q.laborTime ?? 0;
    const laborRate = q.laborRate ?? 0;
    const laborPrice = laborRate * laborHours;

    return {
      name: q.item ?? q.inspectionItem ?? "",
      description: q.description ?? "",
      status: (q.status ?? "ok") as "ok" | "fail" | "na" | "recommend",
      notes: q.notes ?? "",
      partName: first?.name ?? "",
      partPrice:
        typeof first?.price === "number"
          ? first!.price
          : Number(first?.price ?? 0),
      laborHours,
      laborPrice,
    };
  }

  // Otherwise treat as QuoteLineItem
  const qi = line as QuoteLineItem;
  const numericPartPrice =
    typeof qi.part?.price === "number"
      ? qi.part?.price
      : typeof qi.partPrice === "number"
        ? qi.partPrice
        : Number(qi.partPrice ?? 0);

  return {
    name: qi.name ?? (qi.item ?? ""),
    description: qi.description ?? "",
    status: qi.status,
    notes: qi.notes ?? "",
    partName: qi.part?.name ?? qi.partName ?? "",
    partPrice: numericPartPrice ?? 0,
    laborHours: qi.laborHours ?? 0,
    laborPrice: qi.price ?? 0,
  };
}

export async function generateQuotePDFBytes(
  quoteLines: ReadonlyArray<QuoteLine | QuoteLineItem>,
  summaryText: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;

  const drawText = (text: string, x = 50, dy = fontSize + 6) => {
    const { height } = page.getSize();
    // track y on the page
    if ((drawText as any)._y === undefined) (drawText as any)._y = height - 40;
    let y = (drawText as any)._y as number;

    page.drawText(text, { x, y, size: fontSize, font, color: rgb(0, 0, 0) });
    y -= dy;

    // Start new page if we’re near the bottom
    if (y < 60) {
      page = pdfDoc.addPage();
      y = page.getSize().height - 40;
    }
    (drawText as any)._y = y;
  };

  // Summary
  drawText("Inspection Summary:");
  for (const line of (summaryText || "").split("\n")) {
    drawText(line);
  }

  // Spacer + header
  drawText("", 50, 20);
  drawText("Quote Items:");

  // Items
  for (const raw of quoteLines) {
    const u = toUnified(raw);

    drawText(`• ${u.name || "(unnamed item)"}`);
    if (u.description) drawText(`   ${u.description}`);

    const priceStr =
      typeof u.partPrice === "number" ? u.partPrice.toFixed(2) : "0.00";
    drawText(`   Part: ${u.partName || "—"} - $${priceStr}`);

    drawText(
      `   Labor: ${u.laborHours ?? 0} hrs - $${(u.laborPrice ?? 0).toFixed(2)}`,
    );

    drawText(`   Status: ${u.status}`);
    if (u.notes) drawText(`   Notes: ${u.notes}`);

    // Extra gap between items
    drawText("", 50, 10);
  }

  return pdfDoc.save(); // Uint8Array
}

/** Back-compat alias so existing imports `{ generateQuotePDF }` still compile */
export const generateQuotePDF = generateQuotePDFBytes;