import Papa from "papaparse";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostPreflightReport, type ShopBoostPreflightReport } from "@/features/integrations/shopBoost/preflightAnalysis";
import { SHOP_BOOST_UPLOAD_DATASET_KEYS, type ShopBoostUploadDatasetKey } from "@/features/integrations/shopBoost/uploadDatasets";

type CsvRow = Record<string, string>;

type ShadowDomainKey = "customers" | "vehicles" | "history" | "parts" | "staff";
const SHADOW_DATASET_KEYS: ShadowDomainKey[] = ["customers", "vehicles", "history", "parts", "staff"];

export type ShadowPreviewItem = {
  id: string;
  title: string;
  subtitle: string;
  confidence: number;
  reviewFlag: boolean;
  blocked: boolean;
};

export type ShadowSetupIssue = {
  id: string;
  severity: "review" | "blocker";
  title: string;
  detail: string;
};

export type ShadowShopSnapshot = {
  intakeId: string;
  generatedAt: string;
  uploadSummary: Record<ShadowDomainKey, { count: number; fileName: string | null }>;
  preflightReport: ShopBoostPreflightReport;
  dashboard: {
    estimatedImportedRecords: number;
    reviewQueueCount: number;
    blockerCount: number;
    readinessLabel: string;
    trustScore: number;
  };
  customers: ShadowPreviewItem[];
  vehicles: ShadowPreviewItem[];
  workOrders: ShadowPreviewItem[];
  parts: ShadowPreviewItem[];
  setupIssues: ShadowSetupIssue[];
};

export type ShadowPreviewContext = {
  demoId: string;
  intakeId: string;
  shopName: string;
  country: string;
  snapshot: ShadowShopSnapshot;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseCsv(text: string): CsvRow[] {
  const result = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  if (result.errors.length > 0) {
    return [];
  }

  return result.data.map((row) => {
    const cleaned: CsvRow = {};
    for (const [key, value] of Object.entries(row)) {
      cleaned[key] = String(value ?? "").trim();
    }
    return cleaned;
  });
}

function pick(row: CsvRow, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = row[key];
    if (value && value.trim().length > 0) return value.trim();
  }
  return fallback;
}

function confidenceFromCompleteness(row: CsvRow, keys: string[]): number {
  if (keys.length === 0) return 70;
  const populated = keys.reduce((count, key) => (row[key]?.trim() ? count + 1 : count), 0);
  const ratio = populated / keys.length;
  return Math.max(35, Math.min(98, Math.round(45 + ratio * 53)));
}

function buildItems(rows: CsvRow[], domain: ShadowDomainKey): ShadowPreviewItem[] {
  return rows.slice(0, 8).map((row, index) => {
    if (domain === "customers") {
      const name = pick(row, ["name", "customer_name", "full_name", "company"], `Customer ${index + 1}`);
      const contact = pick(row, ["email", "phone", "phone_number", "mobile"], "No contact provided");
      const confidence = confidenceFromCompleteness(row, ["name", "email", "phone"]);
      return {
        id: `customer-${index}`,
        title: name,
        subtitle: contact,
        confidence,
        reviewFlag: confidence < 78,
        blocked: false,
      };
    }

    if (domain === "vehicles") {
      const unit = pick(row, ["vin", "license_plate", "plate", "unit_number"], `Vehicle ${index + 1}`);
      const descriptor = [row.year, row.make, row.model].filter(Boolean).join(" ") || "Vehicle profile";
      const confidence = confidenceFromCompleteness(row, ["vin", "license_plate", "make", "model"]);
      return {
        id: `vehicle-${index}`,
        title: unit,
        subtitle: descriptor,
        confidence,
        reviewFlag: confidence < 76,
        blocked: !row.vin && !row.license_plate,
      };
    }

    if (domain === "history") {
      const roNumber = pick(row, ["work_order", "ro", "invoice_number", "order_number"], `RO-${index + 1}`);
      const descriptor = pick(row, ["description", "concern", "job", "service"], "Historical repair order");
      const confidence = confidenceFromCompleteness(row, ["work_order", "invoice_number", "customer", "vehicle"]);
      return {
        id: `history-${index}`,
        title: roNumber,
        subtitle: descriptor,
        confidence,
        reviewFlag: confidence < 75,
        blocked: false,
      };
    }

    const partId = pick(row, ["part_number", "sku", "item", "name"], `Part ${index + 1}`);
    const descriptor = pick(row, ["description", "name", "category"], "Catalog item");
    const confidence = confidenceFromCompleteness(row, ["part_number", "sku", "name"]);
    return {
      id: `part-${index}`,
      title: partId,
      subtitle: descriptor,
      confidence,
      reviewFlag: confidence < 74,
      blocked: !row.part_number && !row.sku,
    };
  });
}

function mapEntityType(key: ShadowDomainKey): string {
  if (key === "history") return "history";
  return key;
}

export async function buildShadowShopSnapshot(args: {
  intakeId: string;
  uploadedFiles: Partial<Record<ShopBoostUploadDatasetKey, File>>;
}): Promise<ShadowShopSnapshot> {
  const rowsByDomain: Record<ShadowDomainKey, CsvRow[]> = {
    customers: [],
    vehicles: [],
    history: [],
    parts: [],
    staff: [],
  };

  const uploadSummary: Record<ShadowDomainKey, { count: number; fileName: string | null }> = {
    customers: { count: 0, fileName: null },
    vehicles: { count: 0, fileName: null },
    history: { count: 0, fileName: null },
    parts: { count: 0, fileName: null },
    staff: { count: 0, fileName: null },
  };

  for (const key of SHOP_BOOST_UPLOAD_DATASET_KEYS) {
    if (!SHADOW_DATASET_KEYS.includes(key as ShadowDomainKey)) continue;
    const shadowKey = key as ShadowDomainKey;
    const file = args.uploadedFiles[key];
    if (!file) continue;
    const text = await file.text();
    const rows = parseCsv(text);
    rowsByDomain[shadowKey] = rows;
    uploadSummary[shadowKey] = {
      count: rows.length,
      fileName: file.name,
    };
  }

  const preflightRows = (Object.keys(rowsByDomain) as ShadowDomainKey[]).flatMap((domain) =>
    rowsByDomain[domain].map((row) => ({
      entity_type: mapEntityType(domain),
      raw: row,
      normalized: row,
    })),
  );

  const preflightReport = buildShopBoostPreflightReport({
    rows: preflightRows,
    hasHistoryData: rowsByDomain.history.length > 0,
    hasVehicleData: rowsByDomain.vehicles.length > 0,
    hasCustomerData: rowsByDomain.customers.length > 0,
    menuSuggestionCount: 0,
    inspectionSuggestionCount: 0,
  });

  const setupIssues: ShadowSetupIssue[] = [
    ...preflightReport.blockers.map((blocker, index) => ({
      id: `blocker-${index}`,
      severity: "blocker" as const,
      title: blocker.code.replace(/_/g, " "),
      detail: blocker.guidance,
    })),
    ...(preflightReport.reviewNotes.slice(0, 3).map((note, index) => ({
      id: `review-${index}`,
      severity: "review" as const,
      title: "Manual review recommendation",
      detail: note,
    }))),
  ];

  return {
    intakeId: args.intakeId,
    generatedAt: new Date().toISOString(),
    uploadSummary,
    preflightReport,
    dashboard: {
      estimatedImportedRecords: preflightReport.totals.likelyAutoImportCount,
      reviewQueueCount: preflightReport.totals.likelyReviewNeededCount,
      blockerCount: preflightReport.totals.likelyBlockerCount,
      readinessLabel: preflightReport.confidence.readiness,
      trustScore: preflightReport.confidence.score,
    },
    customers: buildItems(rowsByDomain.customers, "customers"),
    vehicles: buildItems(rowsByDomain.vehicles, "vehicles"),
    workOrders: buildItems(rowsByDomain.history, "history"),
    parts: buildItems(rowsByDomain.parts, "parts"),
    setupIssues,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseSnapshot(value: unknown): ShadowShopSnapshot | null {
  const record = asRecord(value);
  const intakeId = asString(record.intakeId);
  if (!isUuid(intakeId)) return null;
  const report = asRecord(record.preflightReport);
  if (!report.totals || !report.confidence) return null;
  return record as unknown as ShadowShopSnapshot;
}

export async function loadShadowPreviewContext(args: {
  demoId: string;
  intakeId: string;
}): Promise<ShadowPreviewContext | null> {
  if (!isUuid(args.demoId) || !isUuid(args.intakeId)) return null;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("demo_shop_boosts")
    .select("id, shop_name, country, snapshot")
    .eq("id", args.demoId)
    .maybeSingle();

  if (error || !data) return null;

  const snapshot = parseSnapshot(data.snapshot);
  if (!snapshot || snapshot.intakeId !== args.intakeId) return null;

  return {
    demoId: data.id,
    intakeId: snapshot.intakeId,
    shopName: data.shop_name,
    country: data.country,
    snapshot,
  };
}
