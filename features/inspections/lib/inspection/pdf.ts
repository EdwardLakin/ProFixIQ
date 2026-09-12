// features/inspections/lib/inspection/pdf.ts
import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFImage,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { assembleInspectionReport } from "./report";
import type {
  InspectionSession,
  InspectionItem,
  InspectionItemStatus,
  InspectionSection,
} from "./types";

type InspectionPdfBrand = {
  logoUrl?: string | null;
  shopName?: string | null;
  colors?: {
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
  } | null;
};

/**
 * A signature recorded against the inspection's current signing cycle. Image
 * bytes are passed in already resolved so the renderer never depends on a
 * signed URL that can expire between signing and rendering.
 */
export type InspectionPdfSignature = {
  role: string;
  signedName: string | null;
  signedAt: string | null;
  signatureHash?: string | null;
  imageBytes?: Uint8Array | null;
};

export type InspectionPdfOptions = InspectionPdfBrand & {
  signatures?: InspectionPdfSignature[] | null;
};

type PdfRgb = ReturnType<typeof rgb>;

/** Every item the technician was presented with, in template order. */
type ReportItem = {
  position: number;
  label: string;
  status: InspectionItemStatus | undefined;
  fieldType: string;
  value?: string;
  unit?: string;
  notes?: string;
  recommend: string[];
  parts: string[];
  laborHours: number | null;
  photoUrls: string[];
  /** Findings and anything carrying evidence get the full card treatment. */
  detailed: boolean;
};

type ReportSection = {
  title: string;
  items: ReportItem[];
  failCount: number;
  recommendCount: number;
};

type ReportTotals = {
  items: number;
  ok: number;
  fail: number;
  recommend: number;
  na: number;
  unchecked: number;
  defectItems: number;
  noDefect: number;
  majorDefects: number;
  minorDefects: number;
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function pdfSafeText(value: string, font: PDFFont): string {
  return Array.from(value, (character) => {
    try {
      font.encodeText(character);
      return character;
    } catch {
      return "?";
    }
  }).join("");
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function wrapText(text: string, maxChars: number): string[] {
  const t = safeStr(text).trim();
  if (!t) return ["—"];

  const words = t.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if ((current + " " + word).length <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : ["—"];
}

function joinWith(separator: string, parts: Array<string | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join(separator);
}

/** "9" + "mm" reads as a measurement; "9, mm" reads as a list. */
function measurementText(
  value: string | undefined,
  unit: string | undefined,
): string {
  return joinWith(" ", [value, unit]);
}

function compactCsv(parts: Array<string | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join(", ");
}

function itemFieldType(item: InspectionItem): string {
  const value = (item as InspectionItem & { fieldType?: unknown }).fieldType;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function statusLabel(
  status: InspectionItemStatus | undefined,
  fieldType?: string,
): string {
  if (!status) return "NOT CHECKED";
  if (fieldType === "defect") {
    if (status === "ok") return "NO DEFECT";
    if (status === "fail") return "MAJOR DEFECT";
    if (status === "recommend") return "MINOR DEFECT";
    if (status === "na") return "N/A";
  }
  if (status === "ok") return "PASS";
  if (status === "fail") return "FAIL";
  if (status === "recommend") return "RECOMMEND";
  if (status === "na") return "N/A";
  return safeStr(status).toUpperCase();
}

function getItemLabel(item: InspectionItem): string {
  return safeStr(item.item ?? item.name).trim() || "Item";
}

function normalizeOptionalText(value: unknown): string | undefined {
  const s = safeStr(value).trim();
  return s.length > 0 ? s : undefined;
}

function normalizeRecommend(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => safeStr(v).trim()).filter((v) => v.length > 0);
}

function normalizeParts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const part = entry as { description?: unknown; qty?: unknown };
      const description = safeStr(part.description).trim();
      if (!description) return "";
      const qty = Number(part.qty);
      return Number.isFinite(qty) && qty > 0
        ? `${description} (x${qty})`
        : description;
    })
    .filter((entry) => entry.length > 0);
}

function normalizePhotoUrls(value: unknown): string[] {
  if (!isStringArray(value)) return [];
  return value.map((v) => v.trim()).filter((v) => v.length > 0);
}

function hexToRgbColor(hex: string | null | undefined, fallback: PdfRgb): PdfRgb {
  const raw = String(hex ?? "").trim().replace("#", "");
  const base = raw.length >= 6 ? raw.slice(0, 6) : "";
  if (!base) return fallback;

  const r = Number.parseInt(base.slice(0, 2), 16);
  const g = Number.parseInt(base.slice(2, 4), 16);
  const b = Number.parseInt(base.slice(4, 6), 16);

  if ([r, g, b].some((v) => Number.isNaN(v))) return fallback;
  return rgb(r / 255, g / 255, b / 255);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

/**
 * Walks the PNG chunk table without decoding pixels. A PNG whose chunk lengths
 * do not line up can send the decoder into a non-terminating loop that blocks
 * the event loop rather than throwing, so malformed bytes have to be rejected
 * before they reach it.
 */
function isStructurallyValidPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_MAGIC.length + 12) return false;
  for (let i = 0; i < PNG_MAGIC.length; i += 1) {
    if (bytes[i] !== PNG_MAGIC[i]) return false;
  }

  let offset = PNG_MAGIC.length;
  let sawHeaderChunk = false;

  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    if (!/^[A-Za-z]{4}$/.test(type)) return false;

    // 4 length bytes + 4 type bytes + payload + 4 CRC bytes.
    const nextOffset = offset + 12 + length;
    if (nextOffset > bytes.length) return false;

    if (offset === PNG_MAGIC.length) {
      if (type !== "IHDR") return false;
      sawHeaderChunk = true;
    }
    if (type === "IEND") return sawHeaderChunk && nextOffset === bytes.length;

    offset = nextOffset;
  }

  return false;
}

function isStructurallyValidJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}

async function embedImageBytes(
  pdfDoc: PDFDocument,
  bytes: Uint8Array,
): Promise<PDFImage> {
  if (isStructurallyValidJpeg(bytes)) return pdfDoc.embedJpg(bytes);
  if (isStructurallyValidPng(bytes)) return pdfDoc.embedPng(bytes);
  throw new Error("Image data is not a readable PNG or JPEG.");
}

async function tryEmbedImage(pdfDoc: PDFDocument, url: string): Promise<PDFImage> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

  return embedImageBytes(pdfDoc, new Uint8Array(await res.arrayBuffer()));
}

function signatureRoleLabel(role: string): string {
  const normalized = safeStr(role).trim().toLowerCase();
  if (normalized === "technician") return "Technician";
  if (normalized === "advisor") return "Service Advisor";
  if (normalized === "customer") return "Customer";
  return normalized ? normalized.replaceAll("_", " ").toUpperCase() : "Signatory";
}

function formatSignedAt(value: string | null | undefined): string {
  const raw = safeStr(value).trim();
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  try {
    return `${parsed.toLocaleString("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    })} UTC`;
  } catch {
    return parsed.toISOString();
  }
}

/**
 * Flattens the session into every item in template order. Nothing is dropped:
 * a customer reading the report can see each point that was checked, while
 * only findings and items carrying evidence are expanded into full cards.
 */
function buildReportModel(sections: InspectionSection[]): {
  sections: ReportSection[];
  totals: ReportTotals;
} {
  const totals: ReportTotals = {
    items: 0,
    ok: 0,
    fail: 0,
    recommend: 0,
    na: 0,
    unchecked: 0,
    defectItems: 0,
    noDefect: 0,
    majorDefects: 0,
    minorDefects: 0,
  };

  const rendered = sections.map((section, sectionIndex) => {
    const title =
      normalizeOptionalText(section.title) || `Section ${sectionIndex + 1}`;
    const items = Array.isArray(section.items) ? section.items : [];

    let failCount = 0;
    let recommendCount = 0;

    const reportItems = items.map((item, itemIndex) => {
      const status = item.status;
      const fieldType = itemFieldType(item);

      totals.items += 1;
      if (status === "ok") totals.ok += 1;
      else if (status === "fail") totals.fail += 1;
      else if (status === "recommend") totals.recommend += 1;
      else if (status === "na") totals.na += 1;
      else totals.unchecked += 1;

      if (fieldType === "defect") {
        totals.defectItems += 1;
        if (status === "ok") totals.noDefect += 1;
        else if (status === "fail") totals.majorDefects += 1;
        else if (status === "recommend") totals.minorDefects += 1;
      }

      if (status === "fail") failCount += 1;
      if (status === "recommend") recommendCount += 1;

      const notes = normalizeOptionalText(item.notes ?? item.note);
      const recommend = normalizeRecommend(item.recommend);
      const parts = normalizeParts(item.parts);
      const photoUrls = normalizePhotoUrls(item.photoUrls);
      const laborHoursRaw = Number(item.laborHours);
      const laborHours =
        Number.isFinite(laborHoursRaw) && laborHoursRaw > 0
          ? laborHoursRaw
          : null;

      return {
        position: itemIndex + 1,
        label: getItemLabel(item),
        status,
        fieldType,
        value: normalizeOptionalText(item.value),
        unit: normalizeOptionalText(item.unit),
        notes,
        recommend,
        parts,
        laborHours,
        photoUrls,
        detailed:
          status === "fail" ||
          status === "recommend" ||
          Boolean(notes) ||
          recommend.length > 0 ||
          parts.length > 0 ||
          photoUrls.length > 0,
      } satisfies ReportItem;
    });

    return {
      title,
      items: reportItems,
      failCount,
      recommendCount,
    } satisfies ReportSection;
  });

  return { sections: rendered, totals };
}

export async function generateInspectionPDF(
  session: InspectionSession,
  options?: InspectionPdfOptions,
): Promise<Uint8Array> {
  const brand: InspectionPdfBrand | undefined = options;
  const signatures = options?.signatures ?? [];
  const pdfDoc = await PDFDocument.create();

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN_X = 42;
  const TOP = PAGE_H - 46;
  // Leaves room for the page footer rule and caption.
  const BOTTOM = 58;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const COLOR_TEXT = rgb(0.08, 0.08, 0.1);
  const COLOR_MUTED = rgb(0.38, 0.4, 0.45);
  const COLOR_FAINT = rgb(0.58, 0.6, 0.65);
  const COLOR_RULE = rgb(0.85, 0.87, 0.9);
  const COLOR_PANEL = rgb(0.97, 0.975, 0.98);
  const COLOR_ZEBRA = rgb(0.965, 0.97, 0.977);
  const COLOR_WHITE = rgb(1, 1, 1);

  const COLOR_PASS = rgb(0.12, 0.55, 0.3);
  const COLOR_FAIL = rgb(0.78, 0.18, 0.18);
  const COLOR_NA = rgb(0.47, 0.5, 0.56);
  const COLOR_UNCHECKED = rgb(0.66, 0.68, 0.72);

  const COLOR_PRIMARY = hexToRgbColor(
    brand?.colors?.primary,
    rgb(0.79, 0.48, 0.24),
  );
  const COLOR_SECONDARY = hexToRgbColor(
    brand?.colors?.secondary,
    rgb(0.09, 0.13, 0.2),
  );

  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = TOP;

  /** Redrawn as "(continued)" whenever a section spills onto a new page. */
  let openSectionTitle: string | null = null;

  const textWidth = (text: string, size: number, useBold = false): number => {
    const selected = useBold ? bold : font;
    return selected.widthOfTextAtSize(pdfSafeText(text, selected), size);
  };

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    opts?: {
      size?: number;
      bold?: boolean;
      color?: PdfRgb;
    },
  ) => {
    const selectedFont = opts?.bold ? bold : font;
    page.drawText(pdfSafeText(text, selectedFont), {
      x,
      y: yPos,
      size: opts?.size ?? 10,
      font: selectedFont,
      color: opts?.color ?? COLOR_TEXT,
    });
  };

  const drawTextRight = (
    text: string,
    rightX: number,
    yPos: number,
    opts?: { size?: number; bold?: boolean; color?: PdfRgb },
  ) => {
    const size = opts?.size ?? 10;
    drawText(text, rightX - textWidth(text, size, opts?.bold), yPos, opts);
  };

  /** Truncates to a pixel budget so long labels never collide with a chip. */
  const fit = (text: string, maxWidth: number, size: number, isBold = false) => {
    if (textWidth(text, size, isBold) <= maxWidth) return text;
    let clipped = text;
    while (
      clipped.length > 1 &&
      textWidth(`${clipped}…`, size, isBold) > maxWidth
    ) {
      clipped = clipped.slice(0, -1);
    }
    return `${clipped}…`;
  };

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = TOP;
  };

  const SECTION_BAND_H = 24;

  const drawSectionBand = (title: string, meta: string | null) => {
    page.drawRectangle({
      x: MARGIN_X,
      y: y - SECTION_BAND_H + 4,
      width: CONTENT_W,
      height: SECTION_BAND_H,
      color: COLOR_SECONDARY,
    });
    drawText(fit(title, CONTENT_W - 180, 11, true), MARGIN_X + 12, y - 12, {
      size: 11,
      bold: true,
      color: COLOR_WHITE,
    });
    if (meta) {
      drawTextRight(meta, PAGE_W - MARGIN_X - 12, y - 11, {
        size: 8,
        color: rgb(0.82, 0.85, 0.89),
      });
    }
    y -= SECTION_BAND_H + 8;
  };

  const ensureSpace = (height: number) => {
    if (y - height >= BOTTOM) return;
    newPage();
    if (openSectionTitle) {
      drawSectionBand(`${openSectionTitle} (continued)`, null);
    }
  };

  const drawRule = () => {
    // A separator at the very top of a fresh page reads as a stray mark.
    if (y >= TOP - 0.5) return;
    ensureSpace(12);
    page.drawLine({
      start: { x: MARGIN_X, y },
      end: { x: PAGE_W - MARGIN_X, y },
      thickness: 1,
      color: COLOR_RULE,
    });
    y -= 12;
  };

  /** Heading for a top-level block of the document (Overview, Signatures, …). */
  const drawSectionHeader = (title: string) => {
    ensureSpace(32);
    drawText(title.toUpperCase(), MARGIN_X, y - 10, {
      size: 10.5,
      bold: true,
      color: COLOR_SECONDARY,
    });
    page.drawRectangle({
      x: MARGIN_X,
      y: y - 18,
      width: 34,
      height: 2.5,
      color: COLOR_PRIMARY,
    });
    y -= 32;
  };

  const statusPalette = (
    status: InspectionItemStatus | undefined,
  ): PdfRgb => {
    if (status === "fail") return COLOR_FAIL;
    if (status === "recommend") return COLOR_PRIMARY;
    if (status === "ok") return COLOR_PASS;
    if (status === "na") return COLOR_NA;
    return COLOR_UNCHECKED;
  };

  const drawChip = (
    label: string,
    rightX: number,
    baselineY: number,
    fill: PdfRgb,
    size = 7,
  ) => {
    const labelWidth = textWidth(label, size, true);
    const width = Math.max(58, labelWidth + 16);
    page.drawRectangle({
      x: rightX - width,
      y: baselineY - 3.5,
      width,
      height: 12.5,
      color: fill,
    });
    drawText(label, rightX - width + (width - labelWidth) / 2, baselineY, {
      size,
      bold: true,
      color: COLOR_WHITE,
    });
  };

  const drawMetaRow = (label: string, value: string | undefined) => {
    ensureSpace(15);
    drawText(`${label}: ${value?.trim() || "—"}`, MARGIN_X, y, {
      size: 10,
      color: COLOR_MUTED,
    });
    y -= 15;
  };

  const drawWrappedParagraph = (
    value: string,
    opts?: {
      x?: number;
      widthChars?: number;
      size?: number;
      color?: PdfRgb;
      lineGap?: number;
    },
  ) => {
    const lines = wrapText(value, opts?.widthChars ?? 82);
    const x = opts?.x ?? MARGIN_X;
    const gap = opts?.lineGap ?? 14;

    for (const line of lines) {
      ensureSpace(gap);
      drawText(line, x, y, {
        size: opts?.size ?? 10,
        color: opts?.color ?? COLOR_MUTED,
      });
      y -= gap;
    }
  };

  /** Two-column key/value card used for the customer and vehicle blocks. */
  const drawFactCard = (
    x: number,
    width: number,
    heading: string,
    rows: Array<[string, string]>,
  ) => {
    const rowHeight = 14;
    const height = 30 + rows.length * rowHeight;

    page.drawRectangle({
      x,
      y: y - height,
      width,
      height,
      color: COLOR_PANEL,
    });
    page.drawRectangle({
      x,
      y: y - height,
      width: 3,
      height,
      color: COLOR_PRIMARY,
    });
    drawText(heading.toUpperCase(), x + 12, y - 16, {
      size: 7.5,
      bold: true,
      color: COLOR_MUTED,
    });

    let rowY = y - 32;
    for (const [label, value] of rows) {
      drawText(label, x + 12, rowY, { size: 8, color: COLOR_FAINT });
      drawTextRight(
        fit(value || "—", width - 96, 8.5, true),
        x + width - 12,
        rowY,
        { size: 8.5, bold: true, color: COLOR_TEXT },
      );
      rowY -= rowHeight;
    }

    return height;
  };

  const drawSummaryTile = (
    x: number,
    width: number,
    title: string,
    value: string,
    fill: PdfRgb,
  ) => {
    page.drawRectangle({
      x,
      y: y - 48,
      width,
      height: 44,
      color: fill,
    });

    drawText(title, x + 10, y - 17, {
      size: 8,
      bold: true,
      color: COLOR_WHITE,
    });
    drawText(value, x + 10, y - 36, {
      size: 16,
      bold: true,
      color: COLOR_WHITE,
    });
  };

  /** Proportional bar giving the whole result at a glance. */
  const drawResultBar = (
    segments: Array<{ value: number; color: PdfRgb; label: string }>,
  ) => {
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    if (total <= 0) return;

    ensureSpace(34);
    const barHeight = 9;
    let x = MARGIN_X;

    for (const segment of segments) {
      if (segment.value <= 0) continue;
      const width = (segment.value / total) * CONTENT_W;
      page.drawRectangle({
        x,
        y: y - barHeight,
        width,
        height: barHeight,
        color: segment.color,
      });
      x += width;
    }

    y -= barHeight + 12;

    let legendX = MARGIN_X;
    for (const segment of segments) {
      if (segment.value <= 0) continue;
      page.drawRectangle({
        x: legendX,
        y: y - 0.5,
        width: 7,
        height: 7,
        color: segment.color,
      });
      const caption = `${segment.label} ${segment.value}`;
      drawText(caption, legendX + 11, y, { size: 8, color: COLOR_MUTED });
      legendX += 11 + textWidth(caption, 8) + 14;
    }

    y -= 16;
  };

  const drawPhotoGrid = async (photoUrls: string[], indent: number) => {
    const usable = photoUrls.slice(0, 4);
    if (usable.length === 0) return;

    const gap = 8;
    const cellWidth = (CONTENT_W - indent - 16 - gap) / 2;
    const maxCellHeight = 96;

    for (let i = 0; i < usable.length; i += 2) {
      ensureSpace(110);

      let rowBottom = y;

      for (let j = 0; j < 2; j += 1) {
        const idx = i + j;
        if (idx >= usable.length) continue;

        const photoUrl = usable[idx];
        const x = MARGIN_X + indent + j * (cellWidth + gap);

        try {
          const img = await tryEmbedImage(pdfDoc, photoUrl);
          const scale = Math.min(cellWidth / img.width, maxCellHeight / img.height, 1);
          const width = img.width * scale;
          const height = img.height * scale;

          page.drawImage(img, {
            x,
            y: y - height,
            width,
            height,
          });

          rowBottom = Math.min(rowBottom, y - height);
        } catch {
          page.drawRectangle({
            x,
            y: y - 48,
            width: cellWidth,
            height: 42,
            color: COLOR_RULE,
          });
          drawText("Photo unavailable", x + 10, y - 24, {
            size: 9,
            color: COLOR_MUTED,
          });
          rowBottom = Math.min(rowBottom, y - 48);
        }
      }

      y = rowBottom - 10;
    }
  };

  /** One-line row for a checked item that needs no elaboration. */
  const drawCompactRow = (item: ReportItem, zebra: boolean) => {
    const ROW_H = 17;
    ensureSpace(ROW_H);

    if (zebra) {
      page.drawRectangle({
        x: MARGIN_X,
        y: y - ROW_H + 4,
        width: CONTENT_W,
        height: ROW_H,
        color: COLOR_ZEBRA,
      });
    }

    const baseline = y - ROW_H + 9;
    const chipRight = PAGE_W - MARGIN_X - 8;
    const measurement = measurementText(item.value, item.unit);

    drawText(String(item.position).padStart(2, "0"), MARGIN_X + 10, baseline, {
      size: 7.5,
      color: COLOR_FAINT,
    });
    drawText(fit(item.label, 268, 9), MARGIN_X + 30, baseline, {
      size: 9,
      color: COLOR_TEXT,
    });
    if (measurement) {
      drawText(fit(measurement, 118, 8.5), MARGIN_X + 306, baseline, {
        size: 8.5,
        color: COLOR_MUTED,
      });
    }
    drawChip(
      statusLabel(item.status, item.fieldType),
      chipRight,
      baseline,
      statusPalette(item.status),
    );

    y -= ROW_H;
  };

  /** Expanded card carrying the evidence behind a finding. */
  const drawDetailCard = async (item: ReportItem) => {
    const INDENT = 14;
    const textLeft = MARGIN_X + INDENT + 12;
    const wrapWidth = 74;

    const noteLines = item.notes ? wrapText(item.notes, wrapWidth) : [];
    const bulleted = (entries: string[]): string[] =>
      entries.flatMap((entry) =>
        wrapText(entry, wrapWidth - 2).map((line, lineIndex) =>
          lineIndex === 0 ? `• ${line}` : `  ${line}`,
        ),
      );
    const recommendLines = bulleted(item.recommend);
    const partsLines = bulleted(item.parts);
    const measurement = measurementText(item.value, item.unit);
    const laborLine =
      item.laborHours != null ? `${item.laborHours} h estimated labour` : "";

    let height = 34;
    if (measurement || laborLine) height += 14;
    if (noteLines.length) height += 14 + noteLines.length * 12;
    if (recommendLines.length) height += 14 + recommendLines.length * 12;
    if (partsLines.length) height += 14 + partsLines.length * 12;
    height += 8;

    // Keep the card head with at least its first lines; photos flow after.
    ensureSpace(height + 6);

    const accent = statusPalette(item.status);
    const cardTop = y;

    page.drawRectangle({
      x: MARGIN_X + INDENT,
      y: cardTop - height,
      width: CONTENT_W - INDENT,
      height,
      color: COLOR_PANEL,
    });
    page.drawRectangle({
      x: MARGIN_X + INDENT,
      y: cardTop - height,
      width: 3.5,
      height,
      color: accent,
    });

    drawText(String(item.position).padStart(2, "0"), textLeft, cardTop - 15, {
      size: 7.5,
      color: COLOR_FAINT,
    });
    drawText(fit(item.label, 300, 11, true), textLeft + 20, cardTop - 16, {
      size: 11,
      bold: true,
      color: COLOR_TEXT,
    });
    drawChip(
      statusLabel(item.status, item.fieldType),
      PAGE_W - MARGIN_X - 8,
      cardTop - 15,
      accent,
      7.5,
    );

    let cardY = cardTop - 34;

    const drawLabelledBlock = (label: string, lines: string[]) => {
      if (!lines.length) return;
      drawText(label, textLeft, cardY, {
        size: 8,
        bold: true,
        color: COLOR_SECONDARY,
      });
      cardY -= 14;
      for (const line of lines) {
        drawText(line, textLeft + 8, cardY, { size: 9, color: COLOR_MUTED });
        cardY -= 12;
      }
    };

    if (measurement || laborLine) {
      drawText(
        joinWith(" · ", [
          measurement ? `Measured ${measurement}` : undefined,
          laborLine,
        ]),
        textLeft,
        cardY,
        { size: 9, color: COLOR_MUTED },
      );
      cardY -= 14;
    }

    drawLabelledBlock("TECHNICIAN NOTES", noteLines);
    drawLabelledBlock("RECOMMENDED", recommendLines);
    drawLabelledBlock("PARTS", partsLines);

    y = cardTop - height - 6;
    if (item.photoUrls.length > 0) {
      // Caption and the first photo row travel together.
      ensureSpace(18 + 110);
      drawText("PHOTO EVIDENCE", textLeft, y - 8, {
        size: 7.5,
        bold: true,
        color: COLOR_FAINT,
      });
      y -= 18;
      await drawPhotoGrid(item.photoUrls, INDENT + 12);
    }
  };

  const drawSignatureCard = async (signature: InspectionPdfSignature) => {
    const CARD_HEIGHT = 104;
    const IMAGE_BOX_W = 190;
    const IMAGE_BOX_H = 40;

    ensureSpace(CARD_HEIGHT + 8);

    const cardTop = y;
    const cardBottom = cardTop - CARD_HEIGHT;

    page.drawRectangle({
      x: MARGIN_X,
      y: cardBottom,
      width: CONTENT_W,
      height: CARD_HEIGHT,
      color: COLOR_PANEL,
    });
    page.drawRectangle({
      x: MARGIN_X,
      y: cardBottom,
      width: 6,
      height: CARD_HEIGHT,
      color: COLOR_SECONDARY,
    });

    drawText(signatureRoleLabel(signature.role), MARGIN_X + 16, cardTop - 16, {
      size: 8,
      bold: true,
      color: COLOR_MUTED,
    });

    const imageBaseline = cardBottom + 34;
    let drewImage = false;
    if (signature.imageBytes && signature.imageBytes.byteLength > 0) {
      try {
        const img = await embedImageBytes(pdfDoc, signature.imageBytes);
        const scale = Math.min(
          IMAGE_BOX_W / img.width,
          IMAGE_BOX_H / img.height,
          1,
        );
        page.drawImage(img, {
          x: MARGIN_X + 16,
          y: imageBaseline,
          width: img.width * scale,
          height: img.height * scale,
        });
        drewImage = true;
      } catch {
        drewImage = false;
      }
    }

    if (!drewImage) {
      drawText(
        signature.imageBytes
          ? "Signature image unavailable"
          : "Typed acknowledgement — no drawn signature captured",
        MARGIN_X + 16,
        imageBaseline + 12,
        { size: 9, color: COLOR_MUTED },
      );
    }

    page.drawLine({
      start: { x: MARGIN_X + 16, y: imageBaseline - 6 },
      end: { x: MARGIN_X + 16 + IMAGE_BOX_W, y: imageBaseline - 6 },
      thickness: 1,
      color: COLOR_RULE,
    });

    drawText(
      safeStr(signature.signedName).trim() || "—",
      MARGIN_X + 16,
      imageBaseline - 20,
      { size: 11, bold: true, color: COLOR_TEXT },
    );

    drawText(
      `Signed ${formatSignedAt(signature.signedAt)}`,
      PAGE_W - MARGIN_X - 200,
      cardTop - 16,
      { size: 9, color: COLOR_MUTED },
    );

    const hash = safeStr(signature.signatureHash).trim();
    if (hash) {
      drawText(
        `Signature reference ${hash.slice(0, 16)}`,
        PAGE_W - MARGIN_X - 200,
        cardTop - 30,
        { size: 7, color: COLOR_MUTED },
      );
    }

    y = cardBottom - 10;
  };

  const sections: InspectionSection[] = Array.isArray(session.sections)
    ? session.sections
    : [];

  const { sections: reportSections, totals } = buildReportModel(sections);

  const hasDefectClassification = totals.defectItems > 0;
  const genericOk = Math.max(0, totals.ok - totals.noDefect);
  const genericFail = Math.max(0, totals.fail - totals.majorDefects);
  const genericRecommend = Math.max(0, totals.recommend - totals.minorDefects);

  const shopName = safeStr(brand?.shopName).trim() || "ProFixIQ";
  const templateName = safeStr(session.templateName).trim() || "—";
  const sessionStatus = safeStr(session.status).trim() || "unknown";

  const customerName =
    joinWith(" ", [
      safeStr(session.customer?.first_name).trim() || undefined,
      safeStr(session.customer?.last_name).trim() || undefined,
    ]) ||
    safeStr(session.customer?.name).trim() ||
    "—";

  const customerPhone = safeStr(session.customer?.phone).trim() || "—";
  const customerEmail = safeStr(session.customer?.email).trim() || "—";
  const customerBusiness = safeStr(session.customer?.business_name).trim() || "—";

  const vehicleLabel =
    joinWith(" ", [
      safeStr(session.vehicle?.year).trim() || undefined,
      safeStr(session.vehicle?.make).trim() || undefined,
      safeStr(session.vehicle?.model).trim() || undefined,
    ]) || "—";

  const vehicleVin = safeStr(session.vehicle?.vin).trim() || "—";
  const vehiclePlate = safeStr(session.vehicle?.license_plate).trim() || "—";
  const vehicleUnit = safeStr(session.vehicle?.unit_number).trim() || "—";
  const vehicleMileage = safeStr(session.vehicle?.mileage).trim() || "—";
  const vehicleColor = safeStr(session.vehicle?.color).trim() || "—";
  const engineHours = safeStr(session.vehicle?.engine_hours).trim() || "—";

  const transcript = safeStr(session.transcript).trim();

  /* ---------------------------------------------------------------- Masthead */

  page.drawRectangle({
    x: 0,
    y: PAGE_H - 96,
    width: PAGE_W,
    height: 96,
    color: COLOR_SECONDARY,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 99,
    width: PAGE_W,
    height: 3,
    color: COLOR_PRIMARY,
  });

  let drewLogo = false;
  if (brand?.logoUrl) {
    try {
      const img = await tryEmbedImage(pdfDoc, brand.logoUrl);
      const scale = Math.min(120 / img.width, 40 / img.height, 1);
      page.drawImage(img, {
        x: MARGIN_X,
        y: PAGE_H - 64,
        width: img.width * scale,
        height: img.height * scale,
      });
      drewLogo = true;
    } catch {
      drewLogo = false;
    }
  }
  if (!drewLogo) {
    drawText(fit(shopName, 280, 17, true), MARGIN_X, PAGE_H - 46, {
      size: 17,
      bold: true,
      color: COLOR_WHITE,
    });
  }
  if (drewLogo) {
    drawText(fit(shopName, 280, 8), MARGIN_X, PAGE_H - 76, {
      size: 8,
      color: rgb(0.72, 0.76, 0.82),
    });
  }

  drawTextRight("INSPECTION REPORT", PAGE_W - MARGIN_X, PAGE_H - 44, {
    size: 15,
    bold: true,
    color: COLOR_WHITE,
  });
  drawTextRight(fit(templateName, 300, 9), PAGE_W - MARGIN_X, PAGE_H - 60, {
    size: 9,
    color: rgb(0.82, 0.85, 0.89),
  });
  drawTextRight(
    `${session.completed ? "Completed" : "In progress"} · ${totals.items} inspection point${
      totals.items === 1 ? "" : "s"
    }`,
    PAGE_W - MARGIN_X,
    PAGE_H - 76,
    { size: 8, color: rgb(0.72, 0.76, 0.82) },
  );

  y = PAGE_H - 122;

  /* ------------------------------------------------------- Customer + vehicle */

  const cardGap = 12;
  const cardWidth = (CONTENT_W - cardGap) / 2;
  const cardTopY = y;

  const technicianSignature = signatures.find(
    (signature) => safeStr(signature.role).trim().toLowerCase() === "technician",
  );

  const customerHeight = drawFactCard(MARGIN_X, cardWidth, "Customer", [
    ["Name", customerName],
    ["Business", customerBusiness],
    ["Phone", customerPhone],
    ["Email", customerEmail],
    ["Inspected by", safeStr(technicianSignature?.signedName).trim() || "—"],
    ["Signed", formatSignedAt(technicianSignature?.signedAt ?? null)],
  ]);

  y = cardTopY;
  const vehicleHeight = drawFactCard(
    MARGIN_X + cardWidth + cardGap,
    cardWidth,
    "Vehicle",
    [
      ["Vehicle", vehicleLabel],
      ["VIN", vehicleVin],
      ["Plate", vehiclePlate],
      ["Unit", vehicleUnit],
      [
        "Odometer",
        joinWith(" · ", [
          vehicleMileage !== "—" ? vehicleMileage : undefined,
          engineHours !== "—" ? `${engineHours} h` : undefined,
        ]) || "—",
      ],
      ["Colour", vehicleColor],
    ],
  );

  y = cardTopY - Math.max(customerHeight, vehicleHeight) - 22;

  /* ------------------------------------------------------------------ Results */

  drawSectionHeader("Result summary");

  const summaryTiles: Array<{ title: string; value: number; fill: PdfRgb }> = [];
  if (hasDefectClassification) {
    summaryTiles.push(
      { title: "NO DEFECT", value: totals.noDefect, fill: COLOR_PASS },
      { title: "MAJOR", value: totals.majorDefects, fill: COLOR_FAIL },
      { title: "MINOR", value: totals.minorDefects, fill: COLOR_PRIMARY },
    );
  }
  if (!hasDefectClassification || genericOk + genericFail + genericRecommend > 0) {
    summaryTiles.push(
      { title: "FAIL", value: genericFail, fill: COLOR_FAIL },
      { title: "RECOMMEND", value: genericRecommend, fill: COLOR_PRIMARY },
      { title: "PASS", value: genericOk, fill: COLOR_PASS },
    );
  }
  summaryTiles.push({ title: "N/A", value: totals.na, fill: COLOR_NA });
  if (totals.unchecked > 0) {
    summaryTiles.push({
      title: "NOT CHECKED",
      value: totals.unchecked,
      fill: COLOR_UNCHECKED,
    });
  }

  const tileGap = 10;
  const tilesPerRow = summaryTiles.length === 5 ? 5 : 4;
  const tileWidth = (CONTENT_W - tileGap * (tilesPerRow - 1)) / tilesPerRow;
  const summaryRowCount = Math.ceil(summaryTiles.length / tilesPerRow);
  ensureSpace(summaryRowCount * 60);
  for (let index = 0; index < summaryTiles.length; index += 1) {
    const column = index % tilesPerRow;
    const row = Math.floor(index / tilesPerRow);
    const baseY = y;
    y = baseY - row * 60;
    const tile = summaryTiles[index];
    drawSummaryTile(
      MARGIN_X + column * (tileWidth + tileGap),
      tileWidth,
      tile.title,
      String(tile.value),
      tile.fill,
    );
    y = baseY;
  }
  y -= summaryRowCount * 60 + 6;

  drawResultBar([
    { value: totals.fail, color: COLOR_FAIL, label: "Failed" },
    { value: totals.recommend, color: COLOR_PRIMARY, label: "Recommended" },
    { value: totals.ok, color: COLOR_PASS, label: "Passed" },
    { value: totals.na, color: COLOR_NA, label: "N/A" },
    { value: totals.unchecked, color: COLOR_UNCHECKED, label: "Not checked" },
  ]);

  drawMetaRow("Template", templateName);
  drawMetaRow("Inspection status", sessionStatus);
  drawMetaRow("Sections inspected", String(reportSections.length));

  /* ------------------------------------------------------- Priority findings */

  const priorityItems = reportSections.flatMap((section) =>
    section.items
      .filter((item) => item.status === "fail" || item.status === "recommend")
      .map((item) => ({ section: section.title, item })),
  );
  priorityItems.sort((a, b) => {
    const rank = (status: InspectionItemStatus | undefined) =>
      status === "fail" ? 0 : 1;
    return rank(a.item.status) - rank(b.item.status);
  });

  drawRule();
  drawSectionHeader("Priority findings");

  if (priorityItems.length === 0) {
    drawWrappedParagraph(
      hasDefectClassification
        ? "No major or minor defects were recorded during this inspection."
        : "No failed or recommended items were recorded during this inspection.",
      { widthChars: 82, size: 10, color: COLOR_MUTED, lineGap: 14 },
    );
  } else {
    for (const entry of priorityItems) {
      ensureSpace(16);
      const baseline = y - 8;
      page.drawRectangle({
        x: MARGIN_X,
        y: baseline - 1,
        width: 3,
        height: 9,
        color: statusPalette(entry.item.status),
      });
      drawText(
        fit(`${entry.section} — ${entry.item.label}`, 330, 9, true),
        MARGIN_X + 12,
        baseline,
        { size: 9, bold: true, color: COLOR_TEXT },
      );
      drawChip(
        statusLabel(entry.item.status, entry.item.fieldType),
        PAGE_W - MARGIN_X - 8,
        baseline,
        statusPalette(entry.item.status),
      );
      y -= 16;
    }
  }

  if (transcript.length > 0) {
    drawRule();
    drawSectionHeader("Technician summary");
    drawWrappedParagraph(transcript, {
      widthChars: 82,
      size: 10,
      color: COLOR_MUTED,
      lineGap: 14,
    });
  }

  /* --------------------------------------------------- Imported form context */

  // An imported customer form carries blocks the checklist cannot express: the
  // trip and vehicle record, the printed regulatory declaration, the free-text
  // defect boxes and the completion and certification block. These live in
  // session.formContext, outside session.sections, so rendering the checklist
  // alone would drop them from a finalized regulatory report.
  const contextBlocks = assembleInspectionReport(session).formContext;
  for (const block of contextBlocks) {
    drawRule();
    drawSectionHeader(block.title);
    for (const item of block.items) {
      if (block.block === "branding" || block.block === "notices") {
        drawWrappedParagraph(item.label, {
          widthChars: 92,
          size: 9,
          color: COLOR_MUTED,
          lineGap: 12,
        });
        continue;
      }
      const label = item.unit ? `${item.label} (${item.unit})` : item.label;
      if (block.block === "notes") {
        ensureSpace(14);
        drawText(label, MARGIN_X, y, { size: 10, bold: true });
        y -= 14;
        drawWrappedParagraph(item.value ?? "—", {
          widthChars: 92,
          size: 10,
          lineGap: 13,
        });
        continue;
      }
      drawMetaRow(label, item.value ?? undefined);
    }
  }

  /* -------------------------------------------------------- Full item detail */

  // Heading, intro, the first section band and a few of its rows travel
  // together; a heading alone at the foot of a page reads as a mistake.
  ensureSpace(140);
  drawRule();
  drawSectionHeader("Full inspection detail");
  drawWrappedParagraph(
    "Every inspection point is listed below in the order it was performed. Failed and recommended items include the technician's notes, recommendations and photo evidence.",
    { widthChars: 92, size: 8.5, color: COLOR_FAINT, lineGap: 11 },
  );
  y -= 4;

  for (const section of reportSections) {
    const meta = compactCsv([
      `${section.items.length} item${section.items.length === 1 ? "" : "s"}`,
      section.failCount ? `${section.failCount} failed` : undefined,
      section.recommendCount
        ? `${section.recommendCount} recommended`
        : undefined,
    ]);

    // A band alone at the foot of a page reads as an orphan heading.
    ensureSpace(SECTION_BAND_H + 30);
    openSectionTitle = section.title;
    drawSectionBand(section.title, meta);

    if (section.items.length === 0) {
      ensureSpace(18);
      drawText("No items recorded in this section.", MARGIN_X + 12, y - 10, {
        size: 9,
        color: COLOR_FAINT,
      });
      y -= 20;
    }

    let zebra = false;
    for (const item of section.items) {
      if (item.detailed) {
        await drawDetailCard(item);
        zebra = false;
      } else {
        drawCompactRow(item, zebra);
        zebra = !zebra;
      }
    }

    openSectionTitle = null;
    y -= 10;
  }

  /* --------------------------------------------------------------- Signatures */

  drawRule();
  drawSectionHeader("Signatures");

  if (signatures.length === 0) {
    drawWrappedParagraph(
      "No signature has been recorded for this inspection. An inspection is only locked and certified once it is signed.",
      {
        widthChars: 82,
        size: 10,
        color: COLOR_MUTED,
        lineGap: 14,
      },
    );
  } else {
    for (const signature of signatures) {
      await drawSignatureCard(signature);
    }
  }

  /* ------------------------------------------------------------------ Footers */

  const pages = pdfDoc.getPages();
  const footerCaption = compactCsv([
    shopName,
    vehicleLabel !== "—" ? vehicleLabel : undefined,
    vehicleVin !== "—" ? `VIN ${vehicleVin}` : undefined,
  ]);

  pages.forEach((current, index) => {
    current.drawLine({
      start: { x: MARGIN_X, y: 44 },
      end: { x: PAGE_W - MARGIN_X, y: 44 },
      thickness: 0.75,
      color: COLOR_RULE,
    });
    current.drawText(pdfSafeText(fit(footerCaption, 380, 7.5), font), {
      x: MARGIN_X,
      y: 32,
      size: 7.5,
      font,
      color: COLOR_FAINT,
    });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    current.drawText(pdfSafeText(pageLabel, font), {
      x: PAGE_W - MARGIN_X - font.widthOfTextAtSize(pageLabel, 7.5),
      y: 32,
      size: 7.5,
      font,
      color: COLOR_FAINT,
    });
  });

  return pdfDoc.save();
}
