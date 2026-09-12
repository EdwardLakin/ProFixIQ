// features/inspections/lib/inspection/pdf.ts
import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFImage,
  type PDFFont,
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

type FindingRow = {
  sectionTitle: string;
  itemLabel: string;
  status: InspectionItemStatus | undefined;
  fieldType?: string;
  value?: string;
  unit?: string;
  notes?: string;
  recommend?: string[];
  photoUrls: string[];
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
  if (!status) return "—";
  if (fieldType === "defect") {
    if (status === "ok") return "NO DEFECT";
    if (status === "fail") return "MAJOR DEFECT";
    if (status === "recommend") return "MINOR DEFECT";
    if (status === "na") return "N/A";
  }
  if (status === "ok") return "OK";
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

function collectFindings(sections: InspectionSection[]): {
  failRows: FindingRow[];
  recommendRows: FindingRow[];
  notableRows: FindingRow[];
  okCount: number;
  failCount: number;
  recommendCount: number;
  naCount: number;
  defectItemCount: number;
  noDefectCount: number;
  majorDefectCount: number;
  minorDefectCount: number;
} {
  const failRows: FindingRow[] = [];
  const recommendRows: FindingRow[] = [];
  const notableRows: FindingRow[] = [];

  let okCount = 0;
  let failCount = 0;
  let recommendCount = 0;
  let naCount = 0;
  let defectItemCount = 0;
  let noDefectCount = 0;
  let majorDefectCount = 0;
  let minorDefectCount = 0;

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const sectionTitle =
      normalizeOptionalText(section.title) || `Section ${sectionIndex + 1}`;

    const items = Array.isArray(section.items) ? section.items : [];
    for (const item of items) {
      const status = item.status;
      const fieldType = itemFieldType(item);
      if (status === "ok") okCount += 1;
      else if (status === "fail") failCount += 1;
      else if (status === "recommend") recommendCount += 1;
      else if (status === "na") naCount += 1;

      if (fieldType === "defect") {
        defectItemCount += 1;
        if (status === "ok") noDefectCount += 1;
        else if (status === "fail") majorDefectCount += 1;
        else if (status === "recommend") minorDefectCount += 1;
      }

      const row: FindingRow = {
        sectionTitle,
        itemLabel: getItemLabel(item),
        status,
        fieldType,
        value: normalizeOptionalText(item.value),
        unit: normalizeOptionalText(item.unit),
        notes: normalizeOptionalText(item.notes ?? item.note),
        recommend: normalizeRecommend(item.recommend),
        photoUrls: normalizePhotoUrls(item.photoUrls),
      };

      const isNotable =
        status === "fail" ||
        status === "recommend" ||
        Boolean(row.notes) ||
        row.photoUrls.length > 0;

      if (status === "fail") failRows.push(row);
      else if (status === "recommend") recommendRows.push(row);
      else if (isNotable) notableRows.push(row);
    }
  }

  return {
    failRows,
    recommendRows,
    notableRows,
    okCount,
    failCount,
    recommendCount,
    naCount,
    defectItemCount,
    noDefectCount,
    majorDefectCount,
    minorDefectCount,
  };
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
  const TOP = PAGE_H - 42;
  const BOTTOM = 42;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const COLOR_TEXT = rgb(0.08, 0.08, 0.1);
  const COLOR_MUTED = rgb(0.38, 0.4, 0.45);
  const COLOR_RULE = rgb(0.85, 0.87, 0.9);
  const COLOR_PANEL = rgb(0.97, 0.975, 0.98);
  const COLOR_PANEL_ALT = rgb(0.94, 0.95, 0.96);
  const COLOR_WHITE = rgb(1, 1, 1);

  const COLOR_PRIMARY = hexToRgbColor(
    brand?.colors?.primary,
    rgb(0.79, 0.48, 0.24),
  );
  const COLOR_SECONDARY = hexToRgbColor(
    brand?.colors?.secondary,
    rgb(0.09, 0.13, 0.2),
  );

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = TOP;

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = TOP;
  };

  const ensureSpace = (height: number) => {
    if (y - height < BOTTOM) newPage();
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

  const drawRule = () => {
    ensureSpace(12);
    page.drawLine({
      start: { x: MARGIN_X, y },
      end: { x: PAGE_W - MARGIN_X, y },
      thickness: 1,
      color: COLOR_RULE,
    });
    y -= 12;
  };

  const drawSectionHeader = (title: string) => {
    ensureSpace(30);
    page.drawRectangle({
      x: MARGIN_X,
      y: y - 18,
      width: CONTENT_W,
      height: 20,
      color: COLOR_PANEL_ALT,
    });
    drawText(title, MARGIN_X + 10, y - 4, {
      size: 12,
      bold: true,
      color: COLOR_SECONDARY,
    });
    y -= 30;
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

  const drawPhotoGrid = async (photoUrls: string[]) => {
    const usable = photoUrls.slice(0, 4);
    if (usable.length === 0) return;

    const gap = 8;
    const cellWidth = (CONTENT_W - 32 - gap) / 2;
    const maxCellHeight = 96;

    for (let i = 0; i < usable.length; i += 2) {
      ensureSpace(110);

      let rowBottom = y;

      for (let j = 0; j < 2; j += 1) {
        const idx = i + j;
        if (idx >= usable.length) continue;

        const photoUrl = usable[idx];
        const x = MARGIN_X + 16 + j * (cellWidth + gap);

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
            color: COLOR_PANEL_ALT,
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

  const drawFindingCard = async (row: FindingRow) => {
    const recommendText =
      row.recommend && row.recommend.length > 0 ? row.recommend.join(", ") : undefined;
    const noteLines = row.notes ? wrapText(row.notes, 78) : [];
    const recommendLines = recommendText ? wrapText(recommendText, 78) : [];
    const hasValueLine = Boolean(row.value || row.unit);
    const photoCount = Math.min(row.photoUrls.length, 4);
    const photoRowCount = Math.ceil(photoCount / 2);

    let estimatedHeight = 72;
    estimatedHeight += noteLines.length * 14;
    estimatedHeight += recommendLines.length * 14;
    if (hasValueLine) estimatedHeight += 14;
    if (photoCount > 0) estimatedHeight += photoRowCount * 110;

    ensureSpace(estimatedHeight);

    page.drawRectangle({
      x: MARGIN_X,
      y: y - estimatedHeight + 10,
      width: CONTENT_W,
      height: estimatedHeight - 6,
      color: COLOR_PANEL,
    });

    const badgeColor =
      row.status === "fail"
        ? rgb(0.78, 0.18, 0.18)
        : row.status === "recommend"
          ? COLOR_PRIMARY
          : COLOR_SECONDARY;

    page.drawRectangle({
      x: MARGIN_X,
      y: y - estimatedHeight + 10,
      width: 6,
      height: estimatedHeight - 6,
      color: badgeColor,
    });

    drawText(row.sectionTitle, MARGIN_X + 16, y - 12, {
      size: 8,
      bold: true,
      color: COLOR_MUTED,
    });

    drawText(row.itemLabel, MARGIN_X + 16, y - 30, {
      size: 12,
      bold: true,
      color: COLOR_TEXT,
    });

    drawText(statusLabel(row.status, row.fieldType), PAGE_W - MARGIN_X - 110, y - 30, {
      size: 9,
      bold: true,
      color: badgeColor,
    });

    let cardY = y - 48;

    if (hasValueLine) {
      const valueText = compactCsv([
        row.value ? `Value ${row.value}` : undefined,
        row.unit ? `Unit ${row.unit}` : undefined,
      ]);
      drawText(valueText || "—", MARGIN_X + 16, cardY, {
        size: 10,
        color: COLOR_MUTED,
      });
      cardY -= 15;
    }

    if (noteLines.length > 0) {
      drawText("Notes:", MARGIN_X + 16, cardY, {
        size: 10,
        bold: true,
        color: COLOR_TEXT,
      });
      cardY -= 14;
      for (const line of noteLines) {
        drawText(line, MARGIN_X + 26, cardY, {
          size: 10,
          color: COLOR_MUTED,
        });
        cardY -= 14;
      }
    }

    if (recommendLines.length > 0) {
      drawText("Recommended:", MARGIN_X + 16, cardY, {
        size: 10,
        bold: true,
        color: COLOR_TEXT,
      });
      cardY -= 14;
      for (const line of recommendLines) {
        drawText(line, MARGIN_X + 26, cardY, {
          size: 10,
          color: COLOR_MUTED,
        });
        cardY -= 14;
      }
    }

    y = cardY;
    await drawPhotoGrid(row.photoUrls);

    y -= 8;
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

  const {
    failRows,
    recommendRows,
    notableRows,
    okCount,
    failCount,
    recommendCount,
    naCount,
    defectItemCount,
    noDefectCount,
    majorDefectCount,
    minorDefectCount,
  } = collectFindings(sections);
  const genericOkCount = Math.max(0, okCount - noDefectCount);
  const genericFailCount = Math.max(0, failCount - majorDefectCount);
  const genericRecommendCount = Math.max(
    0,
    recommendCount - minorDefectCount,
  );

  const shopName = safeStr(brand?.shopName).trim() || "ProFixIQ";
  const templateName = safeStr(session.templateName).trim() || "—";
  const sessionStatus = safeStr(session.status).trim() || "unknown";

  const customerName =
    compactCsv([
      safeStr(session.customer?.first_name).trim() || undefined,
      safeStr(session.customer?.last_name).trim() || undefined,
    ]) ||
    safeStr(session.customer?.name).trim() ||
    "—";

  const customerPhone = safeStr(session.customer?.phone).trim() || "—";
  const customerEmail = safeStr(session.customer?.email).trim() || "—";
  const customerBusiness = safeStr(session.customer?.business_name).trim() || "—";

  const vehicleLabel =
    compactCsv([
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

  page.drawRectangle({
    x: 0,
    y: PAGE_H - 94,
    width: PAGE_W,
    height: 94,
    color: COLOR_SECONDARY,
  });

  if (brand?.logoUrl) {
    try {
      const img = await tryEmbedImage(pdfDoc, brand.logoUrl);
      const maxW = 120;
      const maxH = 40;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const width = img.width * scale;
      const height = img.height * scale;

      page.drawImage(img, {
        x: MARGIN_X,
        y: PAGE_H - 62,
        width,
        height,
      });
    } catch {
      drawText(shopName, MARGIN_X, PAGE_H - 42, {
        size: 18,
        bold: true,
        color: COLOR_WHITE,
      });
    }
  } else {
    drawText(shopName, MARGIN_X, PAGE_H - 42, {
      size: 18,
      bold: true,
      color: COLOR_WHITE,
    });
  }

  drawText("Inspection Report", PAGE_W - 176, PAGE_H - 40, {
    size: 18,
    bold: true,
    color: COLOR_WHITE,
  });

  drawText(
    `${templateName} • ${session.completed ? "Completed" : "In Progress"}`,
    PAGE_W - 230,
    PAGE_H - 60,
    {
      size: 9,
      color: COLOR_WHITE,
    },
  );

  y = PAGE_H - 120;

  drawSectionHeader("Overview");

  const summaryTiles: Array<{ title: string; value: number; fill: PdfRgb }> = [];
  const hasDefectClassification = defectItemCount > 0;
  const hasGenericStatuses =
    !hasDefectClassification ||
    genericOkCount > 0 ||
    genericFailCount > 0 ||
    genericRecommendCount > 0;

  if (hasDefectClassification) {
    summaryTiles.push(
      { title: "NO DEFECT", value: noDefectCount, fill: rgb(0.12, 0.55, 0.3) },
      { title: "MAJOR", value: majorDefectCount, fill: rgb(0.78, 0.18, 0.18) },
      { title: "MINOR", value: minorDefectCount, fill: COLOR_PRIMARY },
    );
  }
  if (hasGenericStatuses) {
    summaryTiles.push(
      { title: "FAIL", value: genericFailCount, fill: rgb(0.78, 0.18, 0.18) },
      { title: "RECOMMEND", value: genericRecommendCount, fill: COLOR_PRIMARY },
      { title: "OK", value: genericOkCount, fill: rgb(0.12, 0.55, 0.3) },
    );
  }
  summaryTiles.push({ title: "N/A", value: naCount, fill: rgb(0.47, 0.5, 0.56) });

  const tileGap = 10;
  const tilesPerRow = 4;
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
  y -= summaryRowCount * 60;

  drawMetaRow("Shop", shopName);
  drawMetaRow("Template", templateName);
  drawMetaRow("Inspection Status", sessionStatus);
  drawMetaRow("Completed", session.completed ? "Yes" : "No");

  drawRule();

  drawSectionHeader("Customer");
  drawMetaRow("Name", customerName);
  drawMetaRow("Business", customerBusiness);
  drawMetaRow("Phone", customerPhone);
  drawMetaRow("Email", customerEmail);

  drawRule();

  drawSectionHeader("Vehicle");
  drawMetaRow("Vehicle", vehicleLabel);
  drawMetaRow("VIN", vehicleVin);
  drawMetaRow("License Plate", vehiclePlate);
  drawMetaRow("Unit Number", vehicleUnit);
  drawMetaRow("Mileage", vehicleMileage);
  drawMetaRow("Color", vehicleColor);
  drawMetaRow("Engine Hours", engineHours);

  // An imported customer form carries blocks the checklist cannot express: the
  // trip and vehicle record, the printed regulatory declaration, the free-text
  // defect boxes and the completion and certification block. Reproduce them so
  // the PDF is the customer's document and not just ProFixIQ's checklist.
  const contextBlocks = assembleInspectionReport(session).formContext;
  if (contextBlocks.length > 0) {
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
  }

  if (transcript.length > 0) {
    drawRule();
    drawSectionHeader("Technician Summary");
    drawWrappedParagraph(transcript, {
      widthChars: 82,
      size: 10,
      color: COLOR_MUTED,
      lineGap: 14,
    });
  }

  const hasActionable =
    failRows.length > 0 || recommendRows.length > 0 || notableRows.length > 0;

  drawRule();
  drawSectionHeader("Actionable Findings");

  if (!hasActionable) {
    drawWrappedParagraph(
      hasDefectClassification
        ? "No major or minor defects were captured in this inspection."
        : "No failures or recommended items were captured in this inspection.",
      {
        widthChars: 82,
        size: 10,
        color: COLOR_MUTED,
        lineGap: 14,
      },
    );
  } else {
    for (const row of failRows) {
      await drawFindingCard(row);
    }

    for (const row of recommendRows) {
      await drawFindingCard(row);
    }

    for (const row of notableRows) {
      await drawFindingCard(row);
    }
  }

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

  drawRule();
  drawSectionHeader("Appendix");
  drawMetaRow("Sections", String(sections.length));
  if (hasDefectClassification) {
    drawMetaRow("No Defect Items", String(noDefectCount));
    drawMetaRow("Major Defects", String(majorDefectCount));
    drawMetaRow("Minor Defects", String(minorDefectCount));
  }
  if (hasGenericStatuses) {
    drawMetaRow("Fail Items", String(genericFailCount));
    drawMetaRow("Recommended Items", String(genericRecommendCount));
    drawMetaRow("OK Items", String(genericOkCount));
  }
  drawMetaRow("N/A Items", String(naCount));
  drawWrappedParagraph(
    hasDefectClassification
      ? "Rendering Mode: Actionable findings only. No-defect and N/A checklist items are summarized, not fully listed."
      : "Rendering Mode: Actionable findings only. OK and N/A checklist items are summarized, not fully listed.",
    {
      widthChars: 82,
      size: 10,
      color: COLOR_MUTED,
      lineGap: 14,
    },
  );

  return pdfDoc.save();
}
