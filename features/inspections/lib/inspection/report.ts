import type {
  InspectionItemStatus,
  InspectionSession,
} from "./types";

export type InspectionReportItem = {
  label: string;
  status: InspectionItemStatus | "not_checked";
  value: string | null;
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
  };
};

function text(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
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
  };
  const sections = (session.sections ?? []).map((section, sectionIndex) => ({
    title: text(section.title) ?? `Section ${sectionIndex + 1}`,
    items: (section.items ?? []).map((item) => {
      const status: InspectionReportItem["status"] =
        item.status ?? "not_checked";
      if (status !== "not_checked") totals.checked += 1;
      if (status === "ok") totals.ok += 1;
      if (status === "fail") totals.failed += 1;
      if (status === "recommend") totals.recommended += 1;
      if (status === "na") totals.notApplicable += 1;
      return {
        label: text(item.item ?? item.name) ?? "Inspection item",
        status,
        value: text(item.value),
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
