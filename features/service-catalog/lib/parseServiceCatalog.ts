// features/service-catalog/lib/parseServiceCatalog.ts
//
// Pure (no I/O) analysis of a service-catalog / canned-job CSV. The same plan
// drives both the read-only preview and the confirmed import, so what the shop
// sees before clicking "Import & activate" is exactly what gets written.

import { createHash } from "node:crypto";

export const SERVICE_CATALOG_HIGH_CONFIDENCE = 0.85;
export const SERVICE_CATALOG_MAX_CSV_BYTES = 2 * 1024 * 1024;
export const SERVICE_CATALOG_MAX_ROWS = 5000;

export type CatalogChecklistSection = { title: string; items: string[] };

export type CatalogTemplateCandidate = {
  /** Stable shop-scoped identity. Never depends on the intake/upload. */
  importKey: string;
  templateName: string;
  note: string | null;
  usageContext: string | null;
  /** Canonical inspection vehicle type (car | truck | bus | trailer) derived from the usage context, when recognizable. */
  vehicleType: "car" | "truck" | "bus" | "trailer" | null;
  /** Exactly the shape the inspection runtime consumes (toInspectionCategories). */
  sections: CatalogChecklistSection[];
  itemCount: number;
  confidence: number;
  needsReview: boolean;
};

export type CatalogPartCandidate = {
  /** Part number (or SKU) as written in the CSV. */
  partNumber: string;
  /** Normalized identity used to match inventory (upper-case alphanumerics). */
  partKey: string;
  /** Free-text name, used when the part is not in inventory. */
  name: string | null;
  quantity: number;
};

export type CatalogServiceCandidate = {
  importKey: string;
  /** menu_items.service_key */
  serviceKey: string;
  serviceCode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  laborHours: number | null;
  price: number | null;
  /** importKey of the template this service links to, when importable. */
  templateKey: string | null;
  templateName: string | null;
  parts: CatalogPartCandidate[];
  linkSource: "explicit" | "name_match" | null;
  confidence: number;
  needsReview: boolean;
  reviewReason: string | null;
};

export type CatalogPlan = {
  services: CatalogServiceCandidate[];
  templates: CatalogTemplateCandidate[];
  warnings: string[];
  summary: {
    rowCount: number;
    servicesRecognized: number;
    servicesImportable: number;
    templatesImportable: number;
    linksImportable: number;
    reviewRequired: number;
    partsRecognized: number;
  };
};

type CsvRow = Record<string, string>;

/* ------------------------------- CSV parsing ------------------------------ */

/** inspection_templates.vehicle_type is a small vocabulary, not free text. */
export function deriveVehicleType(usageContext: string | null): CatalogTemplateCandidate["vehicleType"] {
  const text = normalizeCatalogText(usageContext);
  if (!text) return null;
  if (/\b(bus|coach)\b/.test(text)) return "bus";
  if (/\b(truck|trucks|tractor|tractors|heavy duty)\b/.test(text)) return "truck";
  if (/\btrailers?\b/.test(text)) return "trailer";
  if (/\b(car|cars|passenger|light duty)\b/.test(text)) return "car";
  return null;
}

export function parseCatalogCsv(csv: string): { header: string[]; rows: CsvRow[] } {
  const text = csv.replace(/^﻿/, "");
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  const endField = () => {
    record.push(field.trim());
    field = "";
  };
  const endRecord = () => {
    endField();
    if (record.some((cell) => cell.length > 0)) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") endField();
    else if (ch === "\n") endRecord();
    else if (ch !== "\r") field += ch;
  }
  if (field.length > 0 || record.length > 0) endRecord();

  if (records.length < 2) return { header: [], rows: [] };

  const header = records[0].map((h) => h.trim());
  const keys = header.map((h, idx) =>
    h
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `col_${idx + 1}`,
  );

  const rows = records.slice(1).map((cols) => {
    const row: CsvRow = {};
    keys.forEach((key, idx) => {
      row[key] = cols[idx] ?? "";
    });
    return row;
  });
  return { header, rows };
}

/* --------------------------------- helpers -------------------------------- */

export function normalizeCatalogText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(value: string): string {
  return normalizeCatalogText(value).replace(/\s+/g, "-").slice(0, 80);
}

/**
 * Header lookup in priority order: the first pattern that matches any non-empty
 * column wins, so an exact `service_name` beats a loose `/service/` match on
 * `service_code`.
 */
function pick(row: CsvRow, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    for (const [key, raw] of Object.entries(row)) {
      if (!pattern.test(key)) continue;
      const value = raw.trim();
      if (value) return value;
    }
  }
  return null;
}

function parseNumber(value: string | null): number | null {
  const s = (value ?? "").trim();
  if (!s) return null;
  const cleaned = s.replace(/[^0-9,.\-]/g, "");
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) normalized = cleaned.replace(/,/g, "");
  else if (cleaned.includes(",")) normalized = cleaned.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseHours(value: string | null): number | null {
  const n = parseNumber(value);
  return n !== null && n >= 0 && n <= 24 ? n : null;
}

function parsePrice(value: string | null): number | null {
  const n = parseNumber(value);
  return n !== null && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function tokenSet(value: string): Set<string> {
  return new Set(value.split(" ").filter((part) => part.length >= 3));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function namesMatch(serviceName: string, templateName: string): boolean {
  const a = normalizeCatalogText(serviceName);
  const b = normalizeCatalogText(templateName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (jaccard(tokenSet(a), tokenSet(b)) >= 0.88) return true;
  return a.length >= 12 && b.length >= 12 && (a.includes(b) || b.includes(a));
}

/** Same normalization the parts matcher and the database resolver use. */
export function normalizeCatalogPartKey(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

export const SERVICE_CATALOG_MAX_PARTS_PER_SERVICE = 100;
export const SERVICE_CATALOG_MAX_PART_QTY = 10000;

function shortHash(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex").slice(0, 10);
}

/** menu_items.service_key. Shop-scoped identity: code first, name fallback. */
export function buildCatalogServiceKey(serviceCode: string | null, name: string): { importKey: string; serviceKey: string } {
  const code = serviceCode ? slug(serviceCode) : "";
  const importKey = code ? `code:${code}` : `name:${slug(name) || shortHash(name)}`;
  return { importKey, serviceKey: `catalog:${importKey}` };
}

/* ---------------------------------- plan ---------------------------------- */

type TemplateAccumulator = {
  templateName: string;
  note: string | null;
  usageContext: string | null;
  sections: Map<string, string[]>;
  seen: Set<string>;
};

type ServiceAccumulator = Omit<CatalogServiceCandidate, "templateKey" | "templateName" | "linkSource" | "parts"> & {
  explicitTemplateName: string | null;
};

export function buildCatalogPlan(csv: string): CatalogPlan {
  const { rows } = parseCatalogCsv(csv);
  const warnings: string[] = [];

  const templates = new Map<string, TemplateAccumulator>();
  const services = new Map<string, ServiceAccumulator>();
  const partRows: Array<{
    serviceImportKey: string | null;
    serviceCode: string | null;
    label: string;
    part: CatalogPartCandidate;
  }> = [];

  for (const row of rows) {
    const serviceCode = pick(row, [/^service_code$/, /^operation_code$/, /^code$/]);
    const serviceName = pick(row, [/^service_name$/, /^job_name$/, /^operation_name$/, /^operation$/, /^service$/, /^name$/, /^menu_item$/]);
    const description = pick(row, [/^description$/, /^service_description$/, /^details$/, /^op_description$/]);
    const category = pick(row, [/^category$/, /^service_category$/, /^department$/, /^shop_department$/]);
    const intervalKm = pick(row, [/^recommended_interval_km$/, /^interval_km$/]);
    const intervalMonths = pick(row, [/^recommended_interval_months$/, /^interval_months$/]);
    const interval =
      intervalKm || intervalMonths
        ? `Recommended interval: ${[intervalKm ? `${Number(intervalKm).toLocaleString("en-US")} km` : null, intervalMonths ? `${intervalMonths} months` : null].filter(Boolean).join(" / ")}`
        : null;
    const laborHours = parseHours(
      pick(row, [/^default_labor_hours$/, /^labor_hours$/, /^labor_time$/, /^hours$/, /^flat_rate$/]),
    );
    const laborRate = parseNumber(pick(row, [/^default_labor_rate$/, /^labor_rate$/]));
    const explicitPrice = parsePrice(pick(row, [/^price$/, /^menu_price$/, /^retail_price$/, /^sell_price$/, /^total_price$/]));
    const price =
      explicitPrice ??
      (laborHours !== null && laborRate !== null ? Math.round(laborHours * laborRate * 100) / 100 : null);

    const templateName = pick(row, [
      /^inspection_template$/,
      /^template_name$/,
      /^template$/,
      /^inspection_name$/,
      /^inspection$/,
      /^checklist_name$/,
      /^checklist$/,
      /^form_name$/,
    ]);
    const sectionName = pick(row, [/^section$/, /^section_name$/, /^checklist_section$/, /^group$/, /^inspection_section$/]);
    const itemName = pick(row, [/^checklist_item$/, /^inspection_item$/, /^item$/, /^item_name$/, /^checkpoint$/, /^check_item$/, /^question$/, /^point$/]);
    const usageContext = pick(row, [/^usage_context$/, /^vehicle_type$/, /^applies_to$/, /^usage$/]);
    const inspectionNote = pick(row, [/^inspection_note$/, /^template_description$/]);

    const partNumber = pick(row, [/^part_number$/, /^part_no$/, /^part$/, /^part_sku$/, /^sku$/]);
    const partName = pick(row, [/^part_name$/, /^part_description$/]);
    const partQtyRaw = pick(row, [/^part_qty$/, /^part_quantity$/, /^quantity$/, /^qty$/]);

    const fullDescription = [description, interval].filter(Boolean).join(" • ") || null;

    if (serviceName) {
      const { importKey, serviceKey } = buildCatalogServiceKey(serviceCode, serviceName);
      const existing = services.get(importKey);
      if (!existing) {
        const hasPricing = price !== null || laborHours !== null;
        const confidence = hasPricing ? (serviceCode ? 0.92 : 0.9) : 0.68;
        services.set(importKey, {
          importKey,
          serviceKey,
          serviceCode,
          name: serviceName,
          description: fullDescription,
          category,
          laborHours,
          price,
          confidence,
          needsReview: confidence < SERVICE_CATALOG_HIGH_CONFIDENCE,
          reviewReason: hasPricing ? null : "No labor hours or price",
          explicitTemplateName: templateName,
        });
      } else {
        // Same service on another row (e.g. one row per checklist item): fill gaps only.
        existing.description ??= fullDescription;
        existing.category ??= category;
        existing.laborHours ??= laborHours;
        existing.price ??= price;
        existing.explicitTemplateName ??= templateName;
        if (templateName && existing.explicitTemplateName !== templateName) {
          warnings.push(
            `${serviceName}: listed with more than one inspection template; keeping "${existing.explicitTemplateName}".`,
          );
        }
        if (existing.needsReview && (existing.laborHours !== null || existing.price !== null)) {
          existing.confidence = existing.serviceCode ? 0.92 : 0.9;
          existing.needsReview = false;
          existing.reviewReason = null;
        }
      }
    }

    if (partNumber || partName) {
      const label = serviceName ?? serviceCode ?? "(unknown service)";
      const qty = partQtyRaw === null ? 1 : parseNumber(partQtyRaw);
      const partKey = normalizeCatalogPartKey(partNumber);
      if (!partNumber || !partKey) {
        warnings.push(`${label}: part "${partName}" has no part number; skipped.`);
      } else if (qty === null || qty <= 0 || qty > SERVICE_CATALOG_MAX_PART_QTY) {
        warnings.push(`${label}: part ${partNumber} has an invalid quantity (${partQtyRaw}); skipped.`);
      } else {
        partRows.push({
          serviceImportKey: serviceName ? buildCatalogServiceKey(serviceCode, serviceName).importKey : null,
          serviceCode,
          label,
          part: { partNumber, partKey, name: partName, quantity: qty },
        });
      }
    }

    if (templateName && itemName) {
      const templateKey = `tpl:${slug(templateName) || shortHash(templateName)}`;
      const acc = templates.get(templateKey) ?? {
        templateName,
        note: inspectionNote,
        usageContext,
        sections: new Map<string, string[]>(),
        seen: new Set<string>(),
      };
      acc.note ??= inspectionNote;
      acc.usageContext ??= usageContext;
      const section = sectionName ?? "General";
      const dedupe = `${normalizeCatalogText(section)}|${normalizeCatalogText(itemName)}`;
      if (!acc.seen.has(dedupe)) {
        acc.seen.add(dedupe);
        const items = acc.sections.get(section) ?? [];
        items.push(itemName);
        acc.sections.set(section, items);
      }
      templates.set(templateKey, acc);
    }
  }

  const templateCandidates: CatalogTemplateCandidate[] = [];
  for (const [importKey, acc] of templates) {
    const sections = Array.from(acc.sections.entries()).map(([title, items]) => ({ title, items }));
    const itemCount = sections.reduce((sum, s) => sum + s.items.length, 0);
    const confidence = itemCount >= 8 ? 0.9 : itemCount >= 5 ? 0.82 : 0.62;
    templateCandidates.push({
      importKey,
      templateName: acc.templateName,
      note: acc.note,
      usageContext: acc.usageContext,
      vehicleType: deriveVehicleType(acc.usageContext),
      sections,
      itemCount,
      confidence,
      needsReview: confidence < SERVICE_CATALOG_HIGH_CONFIDENCE,
    });
  }

  const importable = templateCandidates.filter((t) => !t.needsReview);
  const byNormalizedName = new Map(importable.map((t) => [normalizeCatalogText(t.templateName), t]));

  const partsByService = new Map<string, Map<string, CatalogPartCandidate>>();
  const servicesByCode = new Map<string, string>();
  for (const svc of services.values()) {
    if (svc.serviceCode) servicesByCode.set(slug(svc.serviceCode), svc.importKey);
  }
  for (const row of partRows) {
    const key = row.serviceImportKey ?? (row.serviceCode ? servicesByCode.get(slug(row.serviceCode)) : undefined);
    if (!key || !services.has(key)) {
      warnings.push(`${row.label}: part ${row.part.partNumber} does not belong to a known service; skipped.`);
      continue;
    }
    const bucket = partsByService.get(key) ?? new Map<string, CatalogPartCandidate>();
    if (bucket.has(row.part.partKey)) {
      warnings.push(`${row.label}: part ${row.part.partNumber} is listed more than once; keeping the first.`);
    } else if (bucket.size >= SERVICE_CATALOG_MAX_PARTS_PER_SERVICE) {
      warnings.push(`${row.label}: more than ${SERVICE_CATALOG_MAX_PARTS_PER_SERVICE} parts; extra parts skipped.`);
    } else {
      bucket.set(row.part.partKey, row.part);
    }
    partsByService.set(key, bucket);
  }

  const serviceCandidates: CatalogServiceCandidate[] = [];
  for (const svc of services.values()) {
    const { explicitTemplateName, ...rest } = svc;
    let link: CatalogTemplateCandidate | null = null;
    let linkSource: CatalogServiceCandidate["linkSource"] = null;

    if (!svc.needsReview) {
      if (explicitTemplateName) {
        link = byNormalizedName.get(normalizeCatalogText(explicitTemplateName)) ?? null;
        if (link) linkSource = "explicit";
      } else {
        link = importable.find((t) => namesMatch(svc.name, t.templateName)) ?? null;
        if (link) linkSource = "name_match";
      }
    }

    serviceCandidates.push({
      ...rest,
      templateKey: link?.importKey ?? null,
      templateName: link?.templateName ?? null,
      parts: svc.needsReview ? [] : Array.from(partsByService.get(svc.importKey)?.values() ?? []),
      linkSource,
    });
  }

  for (const template of templateCandidates) {
    if (template.needsReview) {
      warnings.push(
        `Inspection "${template.templateName}" has only ${template.itemCount} checklist item${template.itemCount === 1 ? "" : "s"}; needs review before import.`,
      );
    }
  }

  const servicesImportable = serviceCandidates.filter((s) => !s.needsReview).length;
  const linksImportable = serviceCandidates.filter((s) => !s.needsReview && s.templateKey).length;
  const reviewRequired =
    serviceCandidates.filter((s) => s.needsReview).length + templateCandidates.filter((t) => t.needsReview).length;

  return {
    services: serviceCandidates,
    templates: templateCandidates,
    warnings,
    summary: {
      rowCount: rows.length,
      servicesRecognized: serviceCandidates.length,
      servicesImportable,
      templatesImportable: importable.length,
      linksImportable,
      reviewRequired,
      partsRecognized: serviceCandidates.reduce((sum, svc) => sum + svc.parts.length, 0),
    },
  };
}

/** Importable subset sent to the transactional import function. */
export function toImportPayload(plan: CatalogPlan): {
  templates: Array<{
    import_key: string;
    name: string;
    description: string | null;
    vehicle_type: string | null;
    usage_context: string | null;
    sections: CatalogChecklistSection[];
  }>;
  services: Array<{
    import_key: string;
    service_key: string;
    service_code: string | null;
    name: string;
    description: string | null;
    category: string | null;
    labor_hours: number | null;
    price: number | null;
    template_key: string | null;
  }>;
  parts: Array<{
    service_key: string;
    part_number: string;
    name: string | null;
    quantity: number;
  }>;
} {
  const templates = plan.templates
    .filter((t) => !t.needsReview)
    .map((t) => ({
      import_key: t.importKey,
      name: t.templateName,
      description: t.note,
      vehicle_type: t.vehicleType,
      usage_context: t.usageContext,
      sections: t.sections,
    }));
  const services = plan.services
    .filter((s) => !s.needsReview)
    .map((s) => ({
      import_key: s.importKey,
      service_key: s.serviceKey,
      service_code: s.serviceCode,
      name: s.name,
      description: s.description,
      category: s.category,
      labor_hours: s.laborHours,
      price: s.price,
      template_key: s.templateKey,
    }));
  const parts = plan.services
    .filter((s) => !s.needsReview)
    .flatMap((s) =>
      s.parts.map((p) => ({ service_key: s.serviceKey, part_number: p.partNumber, name: p.name, quantity: p.quantity })),
    );
  return { templates, services, parts };
}
