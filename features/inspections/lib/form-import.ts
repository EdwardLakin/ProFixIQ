export type InspectionFormImportState =
  | "queued"
  | "processing"
  | "ready_for_review"
  | "failed"
  | "approved";

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
 * Convert structural OCR into the subset that the canonical inspection runner
 * can execute. New imports are classified by the vision model, so branding,
 * legal copy, identity fields, signatures, free-text summary boxes and trip
 * logs are intentionally excluded instead of being turned into OK/FAIL rows.
 *
 * Old already-processed imports did not carry fieldType. Preserve those rows so
 * reviewing an existing job does not destructively rewrite historical data.
 */
export function selectRunnableInspectionFormSections(
  value: unknown,
): InspectionFormSection[] {
  const sections = normalizeInspectionFormSections(value);
  const hasClassifiedItems = sections.some((section) =>
    section.items.some((item) => Boolean(item.fieldType)),
  );

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!hasClassifiedItems) return true;
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
