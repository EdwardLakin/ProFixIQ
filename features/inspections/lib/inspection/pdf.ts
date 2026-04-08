// features/inspections/lib/inspection/pdf.ts
import { PDFDocument, rgb, StandardFonts, type PDFImage } from "pdf-lib";
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

type PdfRgb = ReturnType<typeof rgb>;

type FindingRow = {
  sectionTitle: string;
  itemLabel: string;
  status: InspectionItemStatus | undefined;
  value?: string;
  unit?: string;
  notes?: string;
  recommend?: string[];
  photoUrls: string[];
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
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

function statusLabel(status: InspectionItemStatus | undefined): string {
  if (!status) return "—";
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
  return value
    .map((v) => safeStr(v).trim())
    .filter((v) => v.length > 0);
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

async function tryEmbedImage(pdfDoc: PDFDocument, url: string): Promise<PDFImage> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

  const bytes = new Uint8Array(await res.arrayBuffer());

  try {
    return await pdfDoc.embedJpg(bytes);
  } catch {
    return await pdfDoc.embedPng(bytes);
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
} {
  const failRows: FindingRow[] = [];
  const recommendRows: FindingRow[] = [];
  const notableRows: FindingRow[] = [];

  let okCount = 0;
  let failCount = 0;
  let recommendCount = 0;
  let naCount = 0;

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const sectionTitle =
      normalizeOptionalText(section.title) || `Section ${sectionIndex + 1}`;

    const items = Array.isArray(section.items) ? section.items : [];
    for (const item of items) {
      const status = item.status;
      if (status === "ok") okCount += 1;
      else if (status === "fail") failCount += 1;
      else if (status === "recommend") recommendCount += 1;
      else if (status === "na") naCount += 1;

      const row: FindingRow = {
        sectionTitle,
        itemLabel: getItemLabel(item),
        status,
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
  };
}

export async function generateInspectionPDF(
  session: InspectionSession,
  brand?: InspectionPdfBrand,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN_X = 42;
  const TOP = PAGE_H - 42;
  const BOTTOM = 42;

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
    page.drawText(text, {
      x,
      y: yPos,
      size: opts?.size ?? 10,
      font: opts?.bold ? bold : font,
      color: opts?.color ?? COLOR_TEXT,
    });
  };

  const drawWrappedText = (
    label: string,
    value: string | undefined,
    opts?: {
      x?: number;
      widthChars?: number;
      size?: number;
      color?: PdfRgb;
      labelBold?: boolean;
      lineGap?: number;
    },
  ) => {
    const x = opts?.x ?? MARGIN_X;
    const lines = wrapText(value?.trim() || "—", opts?.widthChars ?? 78);
    drawText(`${label}${lines[0]}`, x, y, {
      size: opts?.size ?? 10,
      bold: opts?.labelBold ?? false,
      color: opts?.color ?? COLOR_MUTED,
    });
    y -= opts?.lineGap ?? 15;

    for (const extra of lines.slice(1)) {
      drawText(extra, x + 10, y, {
        size: opts?.size ?? 10,
        color: opts?.color ?? COLOR_MUTED,
      });
      y -= opts?.lineGap ?? 15;
    }
  };

  const drawSectionHeader = (title: string) => {
    ensureSpace(30);
    page.drawRectangle({
      x: MARGIN_X,
      y: y - 18,
      width: PAGE_W - MARGIN_X * 2,
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

  const drawRule = () => {
    ensureSpace(12);
    page.drawLine({
      start: { x: MARGIN_X, y: y },
      end: { x: PAGE_W - MARGIN_X, y: y },
      thickness: 1,
      color: COLOR_RULE,
    });
    y -= 12;
  };

  const drawMetaRow = (label: string, value: string | undefined) => {
    ensureSpace(15);
    drawText(`${label}: ${value?.trim() || "—"}`, MARGIN_X, y, {
      size: 10,
      color: COLOR_MUTED,
    });
    y -= 15;
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

  const drawFindingCard = async (row: FindingRow) => {
    const recommendText =
      row.recommend && row.recommend.length > 0 ? row.recommend.join(", ") : undefined;
    const noteLines = row.notes ? wrapText(row.notes, 78) : [];
    const recommendLines = recommendText ? wrapText(recommendText, 78) : [];
    const hasValueLine = Boolean(row.value || row.unit);
    const photosToRender = row.photoUrls.slice(0, 2);

    let estimatedHeight = 72;
    estimatedHeight += noteLines.length * 14;
    estimatedHeight += recommendLines.length * 14;
    if (hasValueLine) estimatedHeight += 14;
    if (photosToRender.length > 0) estimatedHeight += 120 * photosToRender.length;

    ensureSpace(estimatedHeight);

    page.drawRectangle({
      x: MARGIN_X,
      y: y - estimatedHeight + 10,
      width: PAGE_W - MARGIN_X * 2,
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

    drawText(statusLabel(row.status), PAGE_W - MARGIN_X - 90, y - 30, {
      size: 10,
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

    for (const photoUrl of photosToRender) {
      try {
        const img = await tryEmbedImage(pdfDoc, photoUrl);
        const maxW = PAGE_W - MARGIN_X * 2 - 32;
        const maxH = 108;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const width = img.width * scale;
        const height = img.height * scale;

        page.drawImage(img, {
          x: MARGIN_X + 16,
          y: cardY - height,
          width,
          height,
        });

        cardY -= height + 10;
      } catch {
        drawText("Photo unavailable", MARGIN_X + 16, cardY, {
          size: 10,
          color: COLOR_MUTED,
        });
        cardY -= 14;
      }
    }

    y -= estimatedHeight;
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
  } = collectFindings(sections);

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

  const customerPhone =
    safeStr(session.customer?.phone).trim() ||
    "—";

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

  const tileGap = 10;
  const tileWidth = (PAGE_W - MARGIN_X * 2 - tileGap * 3) / 4;

  drawSummaryTile(MARGIN_X, tileWidth, "FAIL", String(failCount), rgb(0.78, 0.18, 0.18));
  drawSummaryTile(
    MARGIN_X + tileWidth + tileGap,
    tileWidth,
    "RECOMMEND",
    String(recommendCount),
    COLOR_PRIMARY,
  );
  drawSummaryTile(
    MARGIN_X + (tileWidth + tileGap) * 2,
    tileWidth,
    "OK",
    String(okCount),
    rgb(0.12, 0.55, 0.3),
  );
  drawSummaryTile(
    MARGIN_X + (tileWidth + tileGap) * 3,
    tileWidth,
    "N/A",
    String(naCount),
    rgb(0.47, 0.5, 0.56),
  );

  y -= 60;

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

  if (transcript.length > 0) {
    drawRule();
    drawSectionHeader("Technician Summary");
    drawWrappedText("", transcript, {
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
    drawWrappedText(
      "",
      "No failures or recommended items were captured in this inspection.",
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
  drawSectionHeader("Appendix");

  drawMetaRow("Sections", String(sections.length));
  drawMetaRow("Fail Items", String(failCount));
  drawMetaRow("Recommended Items", String(recommendCount));
  drawMetaRow("OK Items", String(okCount));
  drawMetaRow("N/A Items", String(naCount));
  drawMetaRow(
    "Rendering Mode",
    "Actionable findings only. OK and N/A checklist items are summarized, not fully listed.",
  );

  return pdfDoc.save();
}
