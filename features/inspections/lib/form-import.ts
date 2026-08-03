export type InspectionFormImportState =
  | "queued"
  | "processing"
  | "ready_for_review"
  | "failed"
  | "approved";

export type InspectionFormItem = {
  item: string;
  unit?: string | null;
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
      if (label) items.push({ item: label, unit: nullableText(item.unit) });
    }
    if (items.length) sections.push({ title, items });
  }
  return sections;
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
