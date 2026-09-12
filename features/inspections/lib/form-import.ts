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
  formContext: InspectionFormContext;
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
  formContext: InspectionFormContext;
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

/**
 * The classifications the canonical inspection runner can execute. Everything
 * else on an imported form is preserved as form context rather than run.
 */
export const RUNNABLE_INSPECTION_FORM_FIELD_TYPES = [
  "check",
  "defect",
  "measurement",
] as const satisfies readonly InspectionFormFieldType[];

export type RunnableInspectionFormFieldType =
  (typeof RUNNABLE_INSPECTION_FORM_FIELD_TYPES)[number];

const RUNNABLE_FIELD_TYPE_SET = new Set<InspectionFormFieldType>(
  RUNNABLE_INSPECTION_FORM_FIELD_TYPES,
);

export function isRunnableInspectionFormFieldType(
  value: unknown,
): value is RunnableInspectionFormFieldType {
  return (
    typeof value === "string" &&
    RUNNABLE_FIELD_TYPE_SET.has(value as InspectionFormFieldType)
  );
}

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
          item.fieldType && RUNNABLE_FIELD_TYPE_SET.has(item.fieldType),
        );
      }),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Everything on an imported form that the checklist runner cannot execute but
 * the form still needs in order to be the customer's document: the trip/vehicle
 * header, the regulatory wording, the free-text defect boxes, and the
 * completion and certification blocks.
 *
 * These rows used to be classified and then discarded, which turned a
 * commercial trip-inspection report into a bare checklist. They are preserved
 * here, grouped by role, with their printed section titles intact.
 */
export type InspectionFormContextBlock =
  | "header"
  | "notices"
  | "notes"
  | "completion"
  | "branding";

export type InspectionFormContext = Record<
  InspectionFormContextBlock,
  InspectionFormSection[]
>;

const FORM_CONTEXT_BLOCK_BY_FIELD_TYPE: Partial<
  Record<InspectionFormFieldType, InspectionFormContextBlock>
> = {
  identity: "header",
  trip: "header",
  instruction: "notices",
  text: "notes",
  signature: "completion",
  branding: "branding",
};

export const INSPECTION_FORM_CONTEXT_BLOCKS = [
  "header",
  "notices",
  "notes",
  "completion",
  "branding",
] as const satisfies readonly InspectionFormContextBlock[];

export function emptyInspectionFormContext(): InspectionFormContext {
  return {
    header: [],
    notices: [],
    notes: [],
    completion: [],
    branding: [],
  };
}

export function isInspectionFormContextEmpty(
  context: InspectionFormContext,
): boolean {
  return INSPECTION_FORM_CONTEXT_BLOCKS.every(
    (block) => context[block].length === 0,
  );
}

/**
 * Split one persisted OCR page into the context blocks the runner should show
 * around the checklist. Legacy pages carry no classifications at all, so they
 * contribute no context and keep their existing "every row is an item"
 * behaviour.
 */
export function selectInspectionFormContext(
  value: unknown,
  formatVersion = 1,
): InspectionFormContext {
  const context = emptyInspectionFormContext();
  if (formatVersion < INSPECTION_FORM_IMPORT_FORMAT_VERSION) return context;

  for (const section of normalizeInspectionFormSections(value)) {
    const byBlock = new Map<InspectionFormContextBlock, InspectionFormItem[]>();
    for (const item of section.items) {
      if (!item.fieldType || RUNNABLE_FIELD_TYPE_SET.has(item.fieldType)) {
        continue;
      }
      const block = FORM_CONTEXT_BLOCK_BY_FIELD_TYPE[item.fieldType];
      if (!block) continue;
      const bucket = byBlock.get(block);
      if (bucket) bucket.push(item);
      else byBlock.set(block, [item]);
    }
    for (const [block, items] of byBlock) {
      context[block].push({ title: section.title, items });
    }
  }

  return context;
}

export function mergeInspectionFormContexts(
  contexts: InspectionFormContext[],
): InspectionFormContext {
  const merged = emptyInspectionFormContext();
  for (const context of contexts) {
    for (const block of INSPECTION_FORM_CONTEXT_BLOCKS) {
      merged[block].push(...context[block]);
    }
  }
  return merged;
}

export function normalizeInspectionFormContext(
  value: unknown,
): InspectionFormContext {
  const source = record(value);
  const context = emptyInspectionFormContext();
  for (const block of INSPECTION_FORM_CONTEXT_BLOCKS) {
    context[block] = normalizeInspectionFormSections(source[block]);
  }
  return context;
}

/**
 * Stable key for one captured form-context value.
 *
 * Section titles repeat across blocks on real forms (Calgary prints
 * "Date (yyyy/mm/dd)" in both the trip header and the corrective-action
 * block), and a multi-page import can contribute two same-titled sections to
 * one block, so the key carries the block, the section's position within that
 * block, and the section title as well as the label. Every reader derives the
 * index by iterating the block in order, which is the order it is stored in.
 */
export function inspectionFormContextValueKey(
  block: InspectionFormContextBlock,
  sectionIndex: number,
  sectionTitle: string,
  label: string,
): string {
  return [block, String(sectionIndex), sectionTitle, label].join("::");
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
    formContext: normalizeInspectionFormContext(summary.formContext),
    extractedText: text(summary.extractedText),
    failedPages,
  };
}
