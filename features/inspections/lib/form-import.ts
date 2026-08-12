export type InspectionFormImportState =
  | "queued"
  | "processing"
  | "ready_for_review"
  | "failed"
  | "approved";

export const INSPECTION_FORM_IMPORT_FORMAT_VERSION = 2;

export type InspectionFormFieldType =
  | "check"
  | "defect"
  | "measurement"
  | "text"
  | "instruction"
  | "identity"
  | "signature"
  | "trip"
  | "branding";

export type InspectionFormItem = {
  item: string;
  unit?: string | null;
  fieldType?: InspectionFormFieldType;
};

export type InspectionFormSection = {
  title: string;
  items: InspectionFormItem[];
};

export type InspectionFormImportSummary = {
  state: InspectionFormImportState;
  title: string;
  vehicleType: string;
  dutyClass: string;
  customerId: string | null;
  customerName: string | null;
  fleetId: string | null;
  fleetName: string | null;
  draftSections: InspectionFormSection[];
  extractedText: string;
  failedPages: Array<{ page: number; message: string }>;
};

export type InspectionFormImportView = {
  id: string;
  status: string;
  state: InspectionFormImportState;
  title: string;
  vehicleType: string;
  dutyClass: string;
  customerId: string | null;
  customerName: string | null;
  fleetId: string | null;
  fleetName: string | null;
  draftSections: InspectionFormSection[];
  extractedText: string;
  failedPages: Array<{ page: number; message: string }>;
  totalPages: number;
  processedPages: number;
  errorMessage: string | null;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
};

const INSPECTION_FORM_FIELD_TYPES = new Set<InspectionFormFieldType>([
  "check",
  "defect",
  "measurement",
  "text",
  "instruction",
  "identity",
  "signature",
  "trip",
  "branding",
]);

const RUNNABLE_INSPECTION_FORM_FIELD_TYPES = new Set<InspectionFormFieldType>([
  "check",
  "defect",
  "measurement",
]);

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function normalizeInspectionFormFieldType(
  value: unknown,
): InspectionFormFieldType | undefined {
  const normalized = text(value).toLowerCase().replaceAll("-", "_");
  if (!normalized) return undefined;
  const aliases: Record<string, InspectionFormFieldType> = {
    checklist: "check",
    pass_fail: "check",
    condition: "check",
    defect_check: "defect",
    defect_classification: "defect",
    numeric: "measurement",
    number: "measurement",
    textarea: "text",
    free_text: "text",
    header: "branding",
    admin: "identity",
    administrative: "identity",
    certification: "signature",
    trip_log: "trip",
  };
  const candidate = aliases[normalized] ?? normalized;
  return INSPECTION_FORM_FIELD_TYPES.has(candidate as InspectionFormFieldType)
    ? (candidate as InspectionFormFieldType)
    : undefined;
}

export function normalizeInspectionFormSections(
  value: unknown,
): InspectionFormSection[] {
  if (!Array.isArray(value)) return [];
  const sections: InspectionFormSection[] = [];
  for (const sectionValue of value) {
    const section = record(sectionValue);
    const title = text(section.title) || "Section";
    const rawItems = Array.isArray(section.items) ? section.items : [];
    const items: InspectionFormItem[] = [];
    for (const itemValue of rawItems) {
      const item = record(itemValue);
      const label = text(item.item ?? item.label ?? item.name);
      if (!label) continue;
      const fieldType = normalizeInspectionFormFieldType(
        item.fieldType ?? item.field_type ?? item.kind,
      );
      items.push({
        item: label,
        unit: nullableText(item.unit),
        ...(fieldType ? { fieldType } : {}),
      });
    }
    if (items.length) sections.push({ title, items });
  }
  return sections;
}

/**
 * Strict V2 structural OCR contract. Every returned row must carry a recognized
 * classification. This deliberately rejects partially or wholly unclassified
 * model output instead of silently falling back to the legacy "every row is an
 * inspection item" behavior.
 */
export function normalizeInspectionFormSectionsV2(
  value: unknown,
): InspectionFormSection[] | null {
  if (!Array.isArray(value)) return null;

  const sections: InspectionFormSection[] = [];
  let sourceItemCount = 0;

  for (const sectionValue of value) {
    const section = record(sectionValue);
    const title = text(section.title) || "Section";
    const rawItems = Array.isArray(section.items) ? section.items : [];
    const items: InspectionFormItem[] = [];

    for (const itemValue of rawItems) {
      sourceItemCount += 1;
      const item = record(itemValue);
      const label = text(item.item ?? item.label ?? item.name);
      const fieldType = normalizeInspectionFormFieldType(
        item.fieldType ?? item.field_type ?? item.kind,
      );
      if (!label || !fieldType) return null;
      items.push({
        item: label,
        unit: nullableText(item.unit),
        fieldType,
      });
    }

    if (items.length) sections.push({ title, items });
  }

  return sourceItemCount > 0 && sections.length > 0 ? sections : null;
}

/**
 * Convert one persisted OCR page into the subset the canonical inspection
 * runner can execute. The persisted page format version is authoritative:
 * legacy pages preserve unclassified rows for rolling-deploy compatibility,
 * while V2 pages require and filter by structural classifications.
 */
export function selectRunnableInspectionFormSections(
  value: unknown,
  formatVersion = 1,
): InspectionFormSection[] {
  const sections = normalizeInspectionFormSections(value);
  const classified = formatVersion >= INSPECTION_FORM_IMPORT_FORMAT_VERSION;

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!classified) return true;
        return Boolean(
          item.fieldType &&
            RUNNABLE_INSPECTION_FORM_FIELD_TYPES.has(item.fieldType),
        );
      }),
    }))
    .filter((section) => section.items.length > 0);
}

export function inspectionFormImportState(
  jobStatus: string | null | undefined,
  summaryValue: unknown,
): InspectionFormImportState {
  const summary = record(summaryValue);
  const state = text(summary.state);
  if (
    state === "queued" ||
    state === "processing" ||
    state === "ready_for_review" ||
    state === "failed" ||
    state === "approved"
  ) {
    return state;
  }
  if (jobStatus === "completed") return "ready_for_review";
  if (jobStatus === "failed") return "failed";
  if (jobStatus === "processing") return "processing";
  return "queued";
}

export function normalizeInspectionFormImportSummary(
  value: unknown,
): InspectionFormImportSummary {
  const summary = record(value);
  const failedPages = Array.isArray(summary.failedPages)
    ? summary.failedPages
        .map((entryValue) => {
          const entry = record(entryValue);
          const page = Number(entry.page);
          const message = text(entry.message);
          return Number.isInteger(page) && page > 0 && message
            ? { page, message }
            : null;
        })
        .filter(
          (entry): entry is { page: number; message: string } => entry !== null,
        )
    : [];

  return {
    state: inspectionFormImportState(undefined, summary),
    title: text(summary.title) || "Imported Inspection Form",
    vehicleType: text(summary.vehicleType),
    dutyClass: text(summary.dutyClass),
    customerId: nullableText(summary.customerId),
    customerName: nullableText(summary.customerName),
    fleetId: nullableText(summary.fleetId),
    fleetName: nullableText(summary.fleetName),
    draftSections: normalizeInspectionFormSections(summary.draftSections),
    extractedText: text(summary.extractedText),
    failedPages,
  };
}
