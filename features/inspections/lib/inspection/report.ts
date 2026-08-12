import type {
  InspectionItemStatus,
  InspectionSession,
} from "./types";

export type InspectionReportItem = {
  label: string;
  status: InspectionItemStatus | "not_checked";
  statusLabel: string;
  value: string | null;
  unit: string | null;
  note: string | null;
  recommendations: string[];
  photoUrls: string[];
};

export type InspectionReport = {
  title: string;
  completedAt: string | null;
  customerName: string | null;
  vehicleLabel: string | null;
  vin: string | null;
  mileage: string | null;
  sections: Array<{ title: string; items: InspectionReportItem[] }>;
  totals: {
    checked: number;
    ok: number;
    failed: number;
    recommended: number;
    notApplicable: number;
    defectItems: number;
    noDefect: number;
    majorDefects: number;
    minorDefects: number;
  };
};

function text(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function itemFieldType(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const value = (item as Record<string, unknown>).fieldType;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function displayStatusLabel(
  status: InspectionReportItem["status"],
  fieldType: string,
): string {
  if (fieldType === "defect") {
    if (status === "ok") return "No defect";
    if (status === "fail") return "Major defect";
    if (status === "recommend") return "Minor defect";
    if (status === "na") return "Not applicable";
    return "Not checked";
  }
  if (status === "ok") return "Pass";
  if (status === "fail") return "Needs attention";
  if (status === "recommend") return "Recommended";
  if (status === "na") return "Not applicable";
  return "Not checked";
}

export function assembleInspectionReport(
  session: InspectionSession,
): InspectionReport {
  const totals = {
    checked: 0,
    ok: 0,
    failed: 0,
    recommended: 0,
    notApplicable: 0,
    defectItems: 0,
    noDefect: 0,
    majorDefects: 0,
    minorDefects: 0,
  };
  const sections = (session.sections ?? []).map((section, sectionIndex) => ({
    title: text(section.title) ?? `Section ${sectionIndex + 1}`,
    items: (section.items ?? []).map((item) => {
      const status: InspectionReportItem["status"] =
        item.status ?? "not_checked";
      const fieldType = itemFieldType(item);
      if (status !== "not_checked") totals.checked += 1;
      if (status === "ok") totals.ok += 1;
      if (status === "fail") totals.failed += 1;
      if (status === "recommend") totals.recommended += 1;
      if (status === "na") totals.notApplicable += 1;
      if (fieldType === "defect") {
        totals.defectItems += 1;
        if (status === "ok") totals.noDefect += 1;
        if (status === "fail") totals.majorDefects += 1;
        if (status === "recommend") totals.minorDefects += 1;
      }
      return {
        label: text(item.item ?? item.name) ?? "Inspection item",
        status,
        statusLabel: displayStatusLabel(status, fieldType),
        value: text(item.value),
        unit: text(item.unit),
        note: text(item.notes ?? item.note),
        recommendations: Array.isArray(item.recommend)
          ? item.recommend.map(text).filter((value): value is string => !!value)
          : [],
        photoUrls: Array.isArray(item.photoUrls)
          ? item.photoUrls.map(text).filter((value): value is string => !!value)
          : [],
      };
    }),
  }));
  const customerName =
    text(session.customer?.business_name) ??
    text(session.customer?.name) ??
    text(
      [session.customer?.first_name, session.customer?.last_name]
        .filter(Boolean)
        .join(" "),
    );
  const vehicleLabel = text(
    [session.vehicle?.year, session.vehicle?.make, session.vehicle?.model]
      .filter(Boolean)
      .join(" "),
  );

  return {
    title: text(session.templateName ?? session.templateitem) ?? "Vehicle inspection report",
    completedAt: text(session.lastUpdated),
    customerName,
    vehicleLabel,
    vin: text(session.vehicle?.vin),
    mileage: text(session.vehicle?.mileage),
    sections,
    totals,
  };
}
