import {
  PDFDocument,
  degrees,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { InvoiceSnapshot } from "@/features/invoices/server/getInvoiceSnapshot";
import type { ActiveBrandRender } from "@/features/branding/server/getActiveBrandForRender";

export type InvoicePdfDocument = {
  invoiceNumber?: string | null;
  versionNumber?: number | null;
  status: string;
  issuedAt?: string | null;
  paidTotal?: number | null;
  refundedTotal?: number | null;
  outstandingTotal?: number | null;
  notes?: string | null;
  draft: boolean;
};

type RenderInput = {
  snapshot: InvoiceSnapshot;
  document: InvoicePdfDocument;
  brand: ActiveBrandRender;
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = 48;

async function embedInvoiceFonts(doc: PDFDocument): Promise<{
  regular: PDFFont;
  bold: PDFFont;
}> {
  doc.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(resolve(process.cwd(), "public/invoice-fonts/DejaVuSans.ttf")),
    readFile(resolve(process.cwd(), "public/invoice-fonts/DejaVuSans-Bold.ttf")),
  ]);
  const [regular, bold] = await Promise.all([
    doc.embedFont(new Uint8Array(regularBytes), { subset: true }),
    doc.embedFont(new Uint8Array(boldBytes), { subset: true }),
  ]);
  return { regular, bold };
}

function finite(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clean(value: unknown): string {
  return String(value ?? "")
    .replaceAll("\u2013", "-")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2212", "-")
    .replaceAll("\u00d7", "x")
    .replaceAll("\u2022", "-")
    .replaceAll("\u2026", "...")
    .replaceAll("\u00a0", " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
    .trim();
}

function display(value: unknown, fallback = "-"): string {
  return clean(value) || fallback;
}

function joined(values: unknown[], separator = ", "): string {
  return values.map((value) => clean(value)).filter(Boolean).join(separator);
}

function customerName(snapshot: InvoiceSnapshot): string {
  return (
    clean(snapshot.customer?.name) ||
    joined([snapshot.customer?.first_name, snapshot.customer?.last_name], " ") ||
    clean(snapshot.workOrder.customer_name) ||
    "Customer"
  );
}

function shopName(snapshot: InvoiceSnapshot): string {
  return (
    clean(snapshot.shop?.business_name) ||
    clean(snapshot.shop?.shop_name) ||
    clean(snapshot.shop?.name) ||
    "ProFixIQ"
  );
}

function money(value: unknown, currency: "CAD" | "USD"): string {
  return new Intl.NumberFormat(currency === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(finite(value))
    .replaceAll("\u00a0", " ");
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "Not issued";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not issued";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function hexColor(value: string | null | undefined, fallback: RGB): RGB {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value ?? "").trim());
  if (!match) return fallback;
  const raw = match[1];
  return rgb(
    Number.parseInt(raw.slice(0, 2), 16) / 255,
    Number.parseInt(raw.slice(2, 4), 16) / 255,
    Number.parseInt(raw.slice(4, 6), 16) / 255,
  );
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = clean(text).split(/\n+/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }
      let fragment = "";
      for (const character of word) {
        const next = fragment + character;
        if (font.widthOfTextAtSize(next, size) > maxWidth && fragment) {
          lines.push(fragment);
          fragment = character;
        } else {
          fragment = next;
        }
      }
      current = fragment;
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : ["-"];
}

async function loadLogo(doc: PDFDocument, logoUrl: string | null): Promise<PDFImage | null> {
  if (!logoUrl) return null;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    try {
      return await doc.embedPng(bytes);
    } catch {
      return await doc.embedJpg(bytes);
    }
  } catch {
    return null;
  }
}

function normalizedStatus(document: InvoicePdfDocument): string {
  if (document.draft) return "DRAFT";
  return clean(document.status).replaceAll("_", " ").toUpperCase() || "ISSUED";
}

function safeFileIdentifier(snapshot: InvoiceSnapshot, document: InvoicePdfDocument): string {
  const raw = clean(document.invoiceNumber) || clean(snapshot.workOrder.custom_id) || snapshot.workOrder.id;
  return raw.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "invoice";
}

export function premiumInvoiceFilename(
  snapshot: InvoiceSnapshot,
  document: InvoicePdfDocument,
): string {
  const prefix = document.draft ? "Draft_Invoice" : "Invoice";
  return `${prefix}_${safeFileIdentifier(snapshot, document)}.pdf`;
}

export async function renderPremiumInvoicePdf(input: RenderInput): Promise<Uint8Array> {
  const { snapshot, document, brand } = input;
  const doc = await PDFDocument.create();
  const { regular, bold } = await embedInvoiceFonts(doc);
  const logo = await loadLogo(doc, brand.logoUrl);

  const navy = hexColor(brand.colors.secondary, rgb(0.055, 0.09, 0.16));
  const copper = hexColor(brand.colors.primary, rgb(0.79, 0.42, 0.2));
  const accent = hexColor(brand.colors.accent, rgb(0.9, 0.62, 0.35));
  const ink = rgb(0.08, 0.1, 0.14);
  const muted = rgb(0.38, 0.42, 0.48);
  const border = rgb(0.86, 0.88, 0.91);
  const panel = rgb(0.965, 0.97, 0.98);
  const white = rgb(1, 1, 1);
  const currency = snapshot.currency;
  const workOrderLabel = clean(snapshot.workOrder.custom_id) || `WO-${snapshot.workOrder.id.slice(0, 8)}`;
  const invoiceLabel = clean(document.invoiceNumber) || (document.draft ? "Draft preview" : workOrderLabel);
  const status = normalizedStatus(document);
  let page = doc.addPage([PAGE_W, PAGE_H]);
  const pages: PDFPage[] = [page];
  let pageInitialized = false;
  let y = 0;

  const drawRight = (
    value: string,
    xRight: number,
    atY: number,
    size: number,
    font: PDFFont = regular,
    color: RGB = ink,
  ) => {
    const text = clean(value);
    page.drawText(text, {
      x: xRight - font.widthOfTextAtSize(text, size),
      y: atY,
      size,
      font,
      color,
    });
  };

  const addPage = () => {
    if (pageInitialized) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      pages.push(page);
    }
    pageInitialized = true;
    page.drawRectangle({ x: 0, y: PAGE_H - 112, width: PAGE_W, height: 112, color: navy });
    page.drawRectangle({ x: 0, y: PAGE_H - 116, width: PAGE_W, height: 4, color: copper });

    if (logo) {
      const scale = Math.min(132 / logo.width, 42 / logo.height, 1);
      page.drawImage(logo, {
        x: MARGIN,
        y: PAGE_H - 67,
        width: logo.width * scale,
        height: logo.height * scale,
      });
    } else {
      page.drawText(shopName(snapshot), { x: MARGIN, y: PAGE_H - 53, size: 18, font: bold, color: white });
    }

    const shopLine = joined([
      snapshot.shop?.phone_number,
      snapshot.shop?.email,
    ], "  |  ");
    if (shopLine) page.drawText(shopLine, { x: MARGIN, y: PAGE_H - 87, size: 8.5, font: regular, color: rgb(0.8, 0.84, 0.89) });

    drawRight("INVOICE", PAGE_W - MARGIN, PAGE_H - 48, 22, bold, white);
    drawRight(invoiceLabel, PAGE_W - MARGIN, PAGE_H - 67, 10, regular, rgb(0.85, 0.88, 0.92));
    drawRight(status, PAGE_W - MARGIN, PAGE_H - 86, 9, bold, accent);

    if (document.draft) {
      page.drawText("DRAFT", {
        x: 135,
        y: 330,
        size: 82,
        font: bold,
        color: copper,
        rotate: degrees(32),
        opacity: 0.07,
      });
    }
    y = PAGE_H - 140;
  };

  const ensure = (height: number): boolean => {
    if (y - height >= BOTTOM) return false;
    addPage();
    return true;
  };

  const textLines = (
    value: string,
    x: number,
    width: number,
    size = 9,
    color: RGB = ink,
    font: PDFFont = regular,
    gap = 4,
  ) => {
    const lines = wrapText(value, font, size, width);
    for (const line of lines) {
      ensure(size + gap);
      page.drawText(line, { x, y, size, font, color });
      y -= size + gap;
    }
  };

  const sectionTitle = (value: string) => {
    ensure(28);
    page.drawText(clean(value).toUpperCase(), { x: MARGIN, y, size: 9, font: bold, color: copper });
    y -= 9;
    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 1, color: border });
    y -= 18;
  };

  addPage();

  const customerAddress = joined([
    snapshot.customer?.street,
    snapshot.customer?.city,
    snapshot.customer?.province,
    snapshot.customer?.postal_code,
  ]);
  const shopAddress = joined([
    snapshot.shop?.street,
    snapshot.shop?.city,
    snapshot.shop?.province,
    snapshot.shop?.postal_code,
  ]);
  const vehicleLabel = joined([
    snapshot.vehicle?.year,
    snapshot.vehicle?.make,
    snapshot.vehicle?.model,
  ], " ");
  const cardTop = y;
  const cardH = 120;
  const gap = 14;
  const cardW = (CONTENT_W - gap) / 2;
  page.drawRectangle({ x: MARGIN, y: cardTop - cardH, width: cardW, height: cardH, color: panel, borderColor: border, borderWidth: 0.8 });
  page.drawRectangle({ x: MARGIN + cardW + gap, y: cardTop - cardH, width: cardW, height: cardH, color: panel, borderColor: border, borderWidth: 0.8 });

  page.drawText("BILL TO", { x: MARGIN + 14, y: cardTop - 20, size: 8, font: bold, color: copper });
  page.drawText(customerName(snapshot), { x: MARGIN + 14, y: cardTop - 39, size: 11, font: bold, color: ink });
  const customerDetails = [
    clean(snapshot.customer?.business_name),
    customerAddress,
    joined([snapshot.customer?.phone_number || snapshot.customer?.phone, snapshot.customer?.email], "  |  "),
  ].filter(Boolean);
  let cardY = cardTop - 56;
  for (const detail of customerDetails.slice(0, 3)) {
    for (const line of wrapText(detail, regular, 8.5, cardW - 28).slice(0, 2)) {
      page.drawText(line, { x: MARGIN + 14, y: cardY, size: 8.5, font: regular, color: muted });
      cardY -= 12;
    }
  }

  const rightCardX = MARGIN + cardW + gap + 14;
  page.drawText("VEHICLE / ASSET", { x: rightCardX, y: cardTop - 20, size: 8, font: bold, color: copper });
  page.drawText(vehicleLabel || "No vehicle recorded", { x: rightCardX, y: cardTop - 39, size: 11, font: bold, color: ink });
  const vehicleDetails = [
    `VIN: ${display(snapshot.vehicle?.vin)}`,
    joined([snapshot.vehicle?.license_plate ? `Plate: ${snapshot.vehicle.license_plate}` : "", snapshot.vehicle?.unit_number ? `Unit: ${snapshot.vehicle.unit_number}` : ""], "  |  "),
    joined([snapshot.vehicle?.mileage != null ? `Mileage: ${snapshot.vehicle.mileage}` : "", snapshot.vehicle?.engine_hours != null ? `Hours: ${snapshot.vehicle.engine_hours}` : ""], "  |  "),
  ].filter(Boolean);
  cardY = cardTop - 58;
  for (const detail of vehicleDetails) {
    page.drawText(clean(detail), { x: rightCardX, y: cardY, size: 8.5, font: regular, color: muted });
    cardY -= 14;
  }

  y = cardTop - cardH - 22;
  page.drawText(`Work order: ${workOrderLabel}`, { x: MARGIN, y, size: 9, font: bold, color: ink });
  drawRight(`Issued: ${dateLabel(document.issuedAt)}`, PAGE_W - MARGIN, y, 9, regular, muted);
  y -= 26;

  sectionTitle("Services and parts");
  const drawTableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_W, height: 22, color: navy });
    page.drawText("DESCRIPTION", { x: MARGIN + 10, y: y - 11, size: 8, font: bold, color: white });
    drawRight("AMOUNT", PAGE_W - MARGIN - 10, y - 11, 8, bold, white);
    y -= 30;
  };
  drawTableHeader();

  const assignedPartIds = new Set<string>();
  snapshot.lines.forEach((line, index) => {
    if (ensure(86)) drawTableHeader();
    const description = clean(line.description) || clean(line.complaint) || `Service ${line.line_no ?? index + 1}`;
    const descriptionLines = wrapText(description, bold, 10, 390);
    page.drawText(descriptionLines[0], { x: MARGIN + 10, y, size: 10, font: bold, color: ink });
    drawRight(money(line.resolvedLineTotal, currency), PAGE_W - MARGIN - 10, y, 10, bold, ink);
    y -= 15;
    for (const extra of descriptionLines.slice(1)) {
      page.drawText(extra, { x: MARGIN + 10, y, size: 9, font: regular, color: ink });
      y -= 13;
    }

    const narratives = [
      ["Complaint", line.complaint],
      ["Cause", line.cause],
      ["Correction", line.correction],
    ] as const;
    for (const [label, value] of narratives) {
      const cleaned = clean(value);
      if (!cleaned || cleaned === description) continue;
      const narrativeLines = wrapText(`${label}: ${cleaned}`, regular, 8.5, 470);
      for (const narrative of narrativeLines) {
        ensure(13);
        page.drawText(narrative, { x: MARGIN + 18, y, size: 8.5, font: regular, color: muted });
        y -= 12;
      }
    }

    if (line.resolvedLaborHours > 0 || line.resolvedLaborTotal > 0) {
      ensure(16);
      const laborLabel = `${finite(line.resolvedLaborHours)} hr labor @ ${money(line.resolvedLaborRate, currency)}/hr`;
      page.drawText(laborLabel, { x: MARGIN + 18, y, size: 8.5, font: regular, color: muted });
      drawRight(money(line.resolvedLaborTotal, currency), PAGE_W - MARGIN - 10, y, 8.5, regular, muted);
      y -= 15;
    }

    const lineParts = snapshot.parts.filter((part) => part.lineId === line.id);
    for (const part of lineParts) {
      assignedPartIds.add(part.id);
      if (ensure(20)) drawTableHeader();
      const identity = joined([part.name, part.partNumber || part.sku], " - ") || "Part";
      const label = `${finite(part.qty)} x ${identity} @ ${money(part.unitPrice, currency)}`;
      const rows = wrapText(label, regular, 8.5, 420);
      page.drawText(rows[0], { x: MARGIN + 18, y, size: 8.5, font: regular, color: muted });
      drawRight(money(part.totalPrice, currency), PAGE_W - MARGIN - 10, y, 8.5, regular, muted);
      y -= 13;
      for (const extra of rows.slice(1)) {
        page.drawText(extra, { x: MARGIN + 18, y, size: 8.5, font: regular, color: muted });
        y -= 12;
      }
    }
    page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 0.8, color: border });
    y -= 15;
  });

  if (snapshot.lines.length === 0 && snapshot.parts.length === 0) {
    page.drawText("No billable service lines are recorded.", {
      x: MARGIN + 10,
      y,
      size: 9,
      font: regular,
      color: muted,
    });
    y -= 24;
  }

  const unassignedParts = snapshot.parts.filter((part) => !assignedPartIds.has(part.id));
  for (const part of unassignedParts) {
    if (ensure(24)) drawTableHeader();
    const identity = joined([part.name, part.partNumber || part.sku], " - ") || "Part";
    const label = `${finite(part.qty)} x ${identity} @ ${money(part.unitPrice, currency)}`;
    page.drawText(label, { x: MARGIN + 10, y, size: 8.5, font: regular, color: muted });
    drawRight(money(part.totalPrice, currency), PAGE_W - MARGIN - 10, y, 8.5, regular, muted);
    y -= 16;
  }

  const totalsW = 238;
  const totalsX = PAGE_W - MARGIN - totalsW;
  const totalsRows: Array<[string, number, boolean?]> = [
    ["Labor", finite(snapshot.laborCost)],
    ["Parts", finite(snapshot.partsCost)],
    ["Shop supplies", finite(snapshot.shopSuppliesTotal)],
    ["Subtotal", finite(snapshot.subtotal), true],
  ];
  if (finite(snapshot.discountTotal) > 0) totalsRows.push(["Discount", -finite(snapshot.discountTotal)]);
  totalsRows.push([`Tax${finite(snapshot.taxRate) > 0 ? ` (${finite(snapshot.taxRate)}%)` : ""}`, finite(snapshot.taxTotal)]);
  const totalsH = 62 + totalsRows.length * 19 + (document.draft ? 0 : 40);
  ensure(totalsH + 16);
  page.drawRectangle({ x: totalsX, y: y - totalsH, width: totalsW, height: totalsH, color: panel, borderColor: border, borderWidth: 0.8 });
  let totalsY = y - 22;
  for (const [label, amount, emphasized] of totalsRows) {
    page.drawText(label, { x: totalsX + 14, y: totalsY, size: 9, font: emphasized ? bold : regular, color: emphasized ? ink : muted });
    drawRight(money(amount, currency), totalsX + totalsW - 14, totalsY, 9, emphasized ? bold : regular, emphasized ? ink : muted);
    totalsY -= 19;
  }
  page.drawRectangle({ x: totalsX + 14, y: totalsY + 7, width: totalsW - 28, height: 1, color: copper });
  page.drawText(document.draft ? "ESTIMATED TOTAL" : "INVOICE TOTAL", { x: totalsX + 14, y: totalsY - 11, size: 10, font: bold, color: ink });
  drawRight(money(snapshot.total, currency), totalsX + totalsW - 14, totalsY - 11, 14, bold, copper);
  totalsY -= 34;

  if (!document.draft) {
    const paid = Math.max(0, finite(document.paidTotal) - finite(document.refundedTotal));
    const balance = Math.max(0, finite(document.outstandingTotal));
    page.drawText("Paid", { x: totalsX + 14, y: totalsY, size: 9, font: regular, color: muted });
    drawRight(money(paid, currency), totalsX + totalsW - 14, totalsY, 9, regular, muted);
    totalsY -= 18;
    page.drawText("Balance due", { x: totalsX + 14, y: totalsY, size: 10, font: bold, color: ink });
    drawRight(money(balance, currency), totalsX + totalsW - 14, totalsY, 10, bold, ink);
  }
  y -= totalsH + 22;

  const notes = clean(document.notes || snapshot.invoice?.notes);
  if (notes) {
    sectionTitle("Notes");
    textLines(notes, MARGIN, CONTENT_W, 9, muted, regular, 5);
    y -= 8;
  }

  ensure(64);
  page.drawRectangle({ x: MARGIN, y: y - 48, width: CONTENT_W, height: 48, color: navy });
  page.drawText(document.draft ? "Draft preview - not an issued invoice" : "Thank you for your business", {
    x: MARGIN + 14,
    y: y - 21,
    size: 10,
    font: bold,
    color: white,
  });
  const addressOrContact = shopAddress || joined([snapshot.shop?.phone_number, snapshot.shop?.email], " | ");
  if (addressOrContact) {
    page.drawText(addressOrContact, { x: MARGIN + 14, y: y - 36, size: 8, font: regular, color: rgb(0.8, 0.84, 0.89) });
  }

  pages.forEach((pdfPage, index) => {
    pdfPage.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 34, color: navy });
    pdfPage.drawText(`${shopName(snapshot)}  |  ${workOrderLabel}`, { x: MARGIN, y: 13, size: 7.5, font: regular, color: rgb(0.78, 0.82, 0.87) });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    pdfPage.drawText(pageLabel, {
      x: PAGE_W - MARGIN - regular.widthOfTextAtSize(pageLabel, 7.5),
      y: 13,
      size: 7.5,
      font: regular,
      color: rgb(0.78, 0.82, 0.87),
    });
  });

  doc.setTitle(`${document.draft ? "Draft invoice" : "Invoice"} ${invoiceLabel}`);
  doc.setAuthor(shopName(snapshot));
  doc.setSubject(`Work order ${workOrderLabel}`);
  doc.setCreator("ProFixIQ");
  return doc.save();
}
