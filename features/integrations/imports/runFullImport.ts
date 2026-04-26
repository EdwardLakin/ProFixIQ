// /features/integrations/imports/runFullImport.ts
import { createHash } from "crypto";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  SHOP_BOOST_DIRECT_IMPORT_DATASETS,
  SHOP_BOOST_UPLOAD_DATASET_KEYS,
  type ShopBoostUploadDatasetKey,
} from "@/features/integrations/shopBoost/uploadDatasets";
import { runPartsImportPipeline, type PartsPipelineSummary } from "@/features/integrations/imports/runPartsImportPipeline";
import {
  buildClusterDescriptor,
  computeCompletionState,
  runPostMigrationIntegrityValidation,
  type CompletionState,
  type ReviewIssueType,
} from "@/features/integrations/shopBoost/migrationReliability";
import { buildMigrationStory } from "@/features/integrations/shopBoost/migrationStory";
import { deriveReviewRecommendation } from "@/features/integrations/shopBoost/reviewGuidance";
import {
  decideCustomerResolution,
  normalizeCustomerEmail as normalizeEmail,
  normalizeCustomerPhone as normalizePhone,
} from "@/features/integrations/shopBoost/customerResolution";

type DB = Database;

const SHOP_IMPORT_BUCKET = "shop-imports";

type IntakeRow = DB["public"]["Tables"]["shop_boost_intakes"]["Row"] & {
  customers_file_path?: string | null;
  vehicles_file_path?: string | null;
  parts_file_path?: string | null;
  history_file_path?: string | null;
  staff_file_path?: string | null;
};

type RunArgs = {
  shopId: string;
  intakeId: string;
  /**
   * Safety: staff auth user creation is OFF by default.
   * Only ever allow if both:
   *  - ALLOW_STAFF_AUTOCREATE === "true"
   *  - options.createStaffUsers === true
   */
  options?: {
    createStaffUsers?: boolean;
    materializeDomain?: "customers" | "vehicles" | "history" | "invoices" | "parts" | "staff";
  };
};

export type ShopBoostImportSummary = {
  customersImported: number;
  vehiclesImported: number;
  workOrdersImported: number;
  workOrderLinesImported: number;
  invoicesImported: number;
  partsImported: number;
  linkageSummary: {
    linked: {
      vehiclesCustomerId: number;
      workOrdersCustomerId: number;
      workOrdersVehicleId: number;
      invoicesCustomerId: number;
    };
    unresolved: {
      vehiclesCustomerId: number;
      workOrdersCustomerId: number;
      workOrdersVehicleId: number;
      invoicesCustomerId: number;
    };
  };
  shopBuildSummary: {
    menuItemsCreated: number;
    inspectionTemplatesCreated: number;
    linkedMenuToInspection: number;
    menuSuggestions: number;
    inspectionSuggestions: number;
  };
  partsPipeline?: PartsPipelineSummary;
  canonicalMaterialization: {
    expected: {
      customers: number;
      vehicles: number;
      workOrders: number;
      invoices: number;
      staff: number;
    };
    actual: {
      customers: number;
      vehicles: number;
      workOrders: number;
      invoices: number;
      staffSuggestions: number;
      staffCandidates: number;
    };
    gaps: {
      missingVehicles: boolean;
      missingWorkOrders: boolean;
      missingInvoices: boolean;
      missingStaff: boolean;
    };
    status: "ok" | "partial";
  };
  rowResults: {
    totalRows: number;
    processedRows: number;
    successCount: number;
    reviewCount: number;
    failedCount: number;
    ignoredCount?: number;
    integrityErrors?: string[];
    outcomeBuckets?: {
      materialized: number;
      linked: number;
      ignored: number;
      review_required: number;
      failed: number;
      total_counted: number;
      total_input: number;
      mismatch: number;
    };
    domainDiagnostics?: DomainDiagnosticsMap;
    byDomain: Record<string, { success: number; review: number; failed: number }>;
  };
  completionState: CompletionState;
};

type CsvRow = Record<string, string>;
type RowDomain = "customer" | "vehicle" | "part" | "work_order" | "invoice" | "history";
type MatchStatus = "matched_existing" | "created_new" | "partial_match" | "unmatched" | "invalid" | "ignored";
type MatchConfidence = "high" | "medium" | "low";
type UploadManifestRecord = Partial<
  Record<ShopBoostUploadDatasetKey, { path?: string; fileName?: string | null; importMode?: "direct" | "staging" }>
>;
type MenuBridgeCandidate = {
  title: string;
  description: string | null;
  price: number | null;
  laborHours: number | null;
  confidence: number;
  source: "service_catalog" | "history";
  uniqueKey: string;
};
type InspectionBridgeCandidate = {
  templateName: string;
  note: string | null;
  usageContext: string | null;
  sections: Array<{ title: string; items: string[] }>;
  confidence: number;
  source: "service_catalog" | "history";
  uniqueKey: string;
};
type InspectionTemplateBridgeRef = {
  id: string;
  source: InspectionBridgeCandidate["source"];
  normalizedName: string;
  confidence: number;
};
type InspectionTemplateSuggestionBridgeRef = {
  id: string;
  source: InspectionBridgeCandidate["source"];
  normalizedName: string;
  confidence: number;
};
type IntakeBasics = Record<string, unknown>;
type CacheCustomerRow = Pick<DB["public"]["Tables"]["customers"]["Row"], "id" | "email" | "phone" | "phone_number">;
type CacheVehicleRow = Pick<DB["public"]["Tables"]["vehicles"]["Row"], "id" | "vin" | "license_plate" | "unit_number">;
type CacheProfileRow = Pick<DB["public"]["Tables"]["profiles"]["Row"], "id" | "email" | "full_name">;
type KeyFixRow = Pick<DB["public"]["Tables"]["shop_boost_review_items"]["Row"], "domain" | "issue_type" | "status" | "resolution_action">;
type MaterializeDomain = NonNullable<RunArgs["options"]>["materializeDomain"];
type ProvenanceDomain = "customer" | "vehicle" | "work_order" | "work_order_line" | "invoice";

const DETERMINISTIC_LINKAGE_ORDER = [
  "exact_source_or_external_id",
  "exact_shop_scoped_canonical_identifier",
  "durable_dependency_linkage",
  "explicit_review",
  "safe_fallback_logic",
] as const;

type CanonicalLifecycleStage =
  | "uploaded"
  | "parsed"
  | "normalized"
  | "deterministic_identity"
  | "linked_existing"
  | "materialized_new"
  | "review_required"
  | "failed"
  | "skipped";

type DomainDiagnostics = {
  uploaded: number;
  parsed: number;
  normalized: number;
  deterministic_identity: number;
  linked_existing: number;
  materialized_new: number;
  review_required: number;
  failed: number;
  skipped: number;
  mismatch: number;
};

type DomainDiagnosticsMap = Record<
  "customers" | "vehicles" | "history" | "invoices" | "parts" | "vendors",
  DomainDiagnostics
>;

function createDomainDiagnostics(uploaded: number): DomainDiagnostics {
  return {
    uploaded,
    parsed: uploaded,
    normalized: 0,
    deterministic_identity: 0,
    linked_existing: 0,
    materialized_new: 0,
    review_required: 0,
    failed: 0,
    skipped: 0,
    mismatch: 0,
  };
}

async function recordImportCreatedArtifact(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  intakeId: string;
  domain: ProvenanceDomain;
  recordId: string | null | undefined;
}): Promise<void> {
  if (!args.recordId) return;
  const { error } = await (args.supabase as any).from("shop_boost_import_provenance").insert({
    shop_id: args.shopId,
    intake_id: args.intakeId,
    domain: args.domain,
    record_id: args.recordId,
  });
  if (error) {
    console.warn("[shop-boost] failed to record import provenance", {
      shopId: args.shopId,
      intakeId: args.intakeId,
      domain: args.domain,
      recordId: args.recordId,
      error: error.message,
    });
  }
}

function domainSourceFile(domain: MaterializeDomain): string | null {
  if (domain === "customers") return "customers";
  if (domain === "vehicles") return "vehicles";
  if (domain === "history") return "history";
  if (domain === "invoices") return "invoices";
  if (domain === "parts") return "parts";
  return null;
}

function domainReviewItems(domain: MaterializeDomain): string[] {
  if (domain === "customers") return ["customer"];
  if (domain === "vehicles") return ["vehicle"];
  if (domain === "history") return ["work_order", "history"];
  if (domain === "invoices") return ["invoice"];
  if (domain === "parts") return ["part"];
  if (domain === "staff") return [];
  return [];
}

function norm(s: string): string {
  return (s ?? "").trim();
}

function lower(s: string): string {
  return norm(s).toLowerCase();
}

function normalizeNameKey(value: string | null | undefined): string {
  return normalizeText(value ?? "");
}

function compositeKey(...parts: Array<string | null | undefined>): string {
  const cleaned = parts.map((part) => String(part ?? "").trim().toLowerCase());
  if (cleaned.some((part) => !part)) return "";
  return cleaned.join("|");
}

function addUniqueMatch(map: Map<string, string>, conflicts: Set<string>, key: string, id: string): void {
  if (!key || !id) return;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, id);
    return;
  }
  if (existing !== id) {
    map.delete(key);
    conflicts.add(key);
  }
}

function normalizeText(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dateOnly(iso: string | null): string {
  if (!iso) return "unknown";
  return iso.slice(0, 10);
}

function sha1(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function confidenceScore(confidence: MatchConfidence): number {
  if (confidence === "high") return 1;
  if (confidence === "medium") return 0.65;
  return 0.3;
}

// ✅ ROLE PATCH (only change)
const ROLE_MAP: Record<string, DB["public"]["Enums"]["user_role_enum"]> = {
  owner: "owner",
  admin: "admin",
  manager: "manager",
  advisor: "advisor",
  mechanic: "mechanic",
  parts: "parts",
  driver: "driver",
  dispatcher: "dispatcher",
  fleet_manager: "fleet_manager",

  // common aliases
  tech: "mechanic",
  technician: "mechanic",

  // requested mapping
  accounting: "admin",
};

function normRole(raw: string | null | undefined): DB["public"]["Enums"]["user_role_enum"] {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return ROLE_MAP[key] ?? "mechanic";
}

function parseCsv(csv: string): { header: string[]; rows: CsvRow[] } {
  const lines = csv
    .split(/\r?\n/)
    .filter((l) => l.trim().length);

  if (lines.length < 2) return { header: [], rows: [] };

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];

      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }

      if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }

      cur += ch;
    }

    out.push(cur);
    return out.map((s) => s.trim());
  };

  const normalizeHeader = (header: string): string =>
    header
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .trim();

  const headerAliases = (header: string): string[] => {
    const normalized = normalizeHeader(header);
    if (!normalized) return [];
    const canonical = normalized
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
    const spaced = canonical.replace(/_/g, " ").trim();
    return Array.from(new Set([normalized, canonical, spaced].filter(Boolean)));
  };

  const header = splitLine(lines[0]).map((h) => normalizeHeader(h));
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitLine(lines[i]);
    const rec: CsvRow = {};
    for (let c = 0; c < header.length; c += 1) {
      const rawKey = header[c] || `col_${c + 1}`;
      const value = cols[c] ?? "";
      const aliases = headerAliases(rawKey);
      if (aliases.length === 0) {
        rec[`col_${c + 1}`] = value;
      } else {
        for (const alias of aliases) rec[alias] = value;
      }
    }
    rows.push(rec);
  }

  return { header, rows };
}

function pick(row: CsvRow, patterns: RegExp[]): string | null {
  const keys = Object.keys(row);
  for (const k of keys) {
    const nk = lower(k);
    if (patterns.some((p) => p.test(nk))) {
      const v = norm(row[k] ?? "");
      if (v) return v;
    }
  }
  return null;
}

function parseMoney(v: string | null): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;

  const cleaned = s.replace(/[^0-9,.\-]/g, "");
  if (!cleaned) return null;

  // 1,234.56 -> 1234.56
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const n = Number(cleaned.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  // 6,06 -> 6.06
  if (cleaned.includes(",") && !cleaned.includes(".")) {
    const n = Number(cleaned.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(v: string | null): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/[^0-9\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function slugifyServiceKey(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-").slice(0, 64);
}

function parseLaborHours(v: string | null): number | null {
  const parsed = parseMoney(v);
  if (parsed === null || parsed < 0 || parsed > 24) return null;
  return parsed;
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .split(" ")
      .map((part) => part.trim())
      .filter((part) => part.length >= 3),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function canHighConfidenceLink(args: {
  menu: MenuBridgeCandidate;
  inspection: InspectionTemplateBridgeRef;
}): boolean {
  if (args.menu.source !== args.inspection.source) return false;
  if (args.menu.confidence < 0.85 || args.inspection.confidence < 0.85) return false;

  const menuName = normalizeText(args.menu.title);
  const inspectionName = args.inspection.normalizedName;
  if (!menuName || !inspectionName) return false;
  if (menuName === inspectionName) return true;

  const menuTokens = tokenSet(menuName);
  const inspectionTokens = tokenSet(inspectionName);
  const overlap = jaccardSimilarity(menuTokens, inspectionTokens);
  if (overlap >= 0.88) return true;

  if (menuName.length >= 12 && inspectionName.length >= 12) {
    return menuName.includes(inspectionName) || inspectionName.includes(menuName);
  }
  return false;
}

function canSuggestionLink(args: {
  menu: MenuBridgeCandidate;
  inspectionSuggestion: InspectionTemplateSuggestionBridgeRef;
}): boolean {
  if (args.menu.source !== args.inspectionSuggestion.source) return false;
  if (args.menu.confidence >= 0.85 || args.inspectionSuggestion.confidence >= 0.85) return false;

  const menuName = normalizeText(args.menu.title);
  const inspectionName = args.inspectionSuggestion.normalizedName;
  if (!menuName || !inspectionName) return false;
  if (menuName === inspectionName) return true;

  const overlap = jaccardSimilarity(tokenSet(menuName), tokenSet(inspectionName));
  return overlap >= 0.92;
}

function extractServiceCatalogCandidates(rows: CsvRow[]): {
  menu: MenuBridgeCandidate[];
  inspections: InspectionBridgeCandidate[];
} {
  const menu: MenuBridgeCandidate[] = [];
  const groupedTemplates = new Map<
    string,
    {
      templateName: string;
      usageContext: string | null;
      note: string | null;
      sections: Map<string, Set<string>>;
    }
  >();

  for (const row of rows) {
    const serviceCode = pick(row, [/^service[_\s-]*code$/, /^operation[_\s-]*code$/, /^code$/]);
    const serviceName = pick(row, [/^service[_\s-]*name$/, /service/, /job name/, /operation/, /^name$/, /menu/]);
    const serviceDescription = pick(row, [/description/, /details/, /op description/, /note/]);
    const serviceCategory = pick(row, [/^category$/, /department/, /shop department/]);
    const recommendedKm = pick(row, [/recommended[_\s-]*interval[_\s-]*km$/, /interval km/]);
    const recommendedMonths = pick(row, [/recommended[_\s-]*interval[_\s-]*months$/, /interval months/]);
    const laborHours = parseLaborHours(
      pick(row, [/^default[_\s-]*labor[_\s-]*hours$/, /labor hours/, /hours/, /labor time/, /flat rate/]),
    );
    const laborRate = parseMoney(pick(row, [/^default[_\s-]*labor[_\s-]*rate$/, /labor rate/]));
    const explicitPrice = parseMoney(pick(row, [/price/, /retail/, /sell/, /menu price/]));
    const price = explicitPrice ?? (laborHours !== null && laborRate !== null ? laborHours * laborRate : null);

    if (serviceName) {
      const hasStructuredPricing = price !== null || laborHours !== null;
      const hasServiceCode = Boolean(serviceCode);
      const confidence = hasStructuredPricing ? 0.9 : 0.68;
      menu.push({
        title: serviceName,
        description:
          [
            serviceDescription,
            serviceCategory ? `Category: ${serviceCategory}` : null,
            recommendedKm || recommendedMonths
              ? `Interval: ${recommendedKm ?? "n/a"} km / ${recommendedMonths ?? "n/a"} months`
              : null,
          ]
            .filter(Boolean)
            .join(" • ") || null,
        price,
        laborHours,
        confidence: hasServiceCode ? Math.max(confidence, 0.92) : confidence,
        source: "service_catalog",
        uniqueKey: sha1(
          `svc|${serviceCode ?? normalizeText(serviceName)}|${String(price ?? "")}|${String(laborHours ?? "")}`,
        ).slice(0, 20),
      });
    }

    const templateName =
      pick(row, [/template/, /inspection name/, /checklist/, /form name/]) ??
      (pick(row, [/inspection type/, /inspection category/]) || null) ??
      (serviceCategory ? `${serviceCategory} Inspection` : null);
    const sectionName = pick(row, [/section/, /group/, /category/]) ?? "General";
    const itemName =
      pick(row, [/item/, /checkpoint/, /check item/, /question/, /point/]) ??
      serviceName ??
      null;
    const inspectionNote = pick(row, [/inspection note/, /note/, /details/]) ?? null;
    const usageContext = pick(row, [/usage/, /vehicle type/, /applies to/, /context/]) ?? null;

    if (templateName && itemName) {
      const groupKey = normalizeText(templateName);
      const existing = groupedTemplates.get(groupKey) ?? {
        templateName,
        usageContext,
        note: inspectionNote,
        sections: new Map<string, Set<string>>(),
      };
      const normalizedSection = sectionName || "General";
      const existingSection = existing.sections.get(normalizedSection) ?? new Set<string>();
      existingSection.add(itemName);
      existing.sections.set(normalizedSection, existingSection);
      groupedTemplates.set(groupKey, existing);
    }
  }

  const inspections: InspectionBridgeCandidate[] = [];
  for (const group of groupedTemplates.values()) {
    const sections = Array.from(group.sections.entries()).map(([title, items]) => ({
      title,
      items: Array.from(items),
    }));
    const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
    const confidence = totalItems >= 8 ? 0.9 : totalItems >= 5 ? 0.82 : 0.62;
    inspections.push({
      templateName: group.templateName,
      note: group.note,
      usageContext: group.usageContext,
      sections,
      confidence,
      source: "service_catalog",
      uniqueKey: sha1(`insp|${normalizeText(group.templateName)}|${String(totalItems)}`).slice(0, 20),
    });
  }

  return { menu, inspections };
}

function extractHistoryMenuCandidates(rows: CsvRow[]): MenuBridgeCandidate[] {
  const bucket = new Map<string, { label: string; count: number; avgLaborSeed: number[] }>();
  for (const row of rows) {
    const label =
      pick(row, [/correction/, /work performed/, /description/, /repair/, /service/]) ??
      pick(row, [/complaint/, /concern/]) ??
      null;
    if (!label) continue;
    const normalized = normalizeText(label);
    if (!normalized || normalized.length < 8) continue;

    const laborSeed = parseLaborHours(pick(row, [/labor/, /hours/, /labor time/, /flat rate/]));
    const existing = bucket.get(normalized) ?? { label, count: 0, avgLaborSeed: [] };
    existing.count += 1;
    if (laborSeed !== null) existing.avgLaborSeed.push(laborSeed);
    bucket.set(normalized, existing);
  }

  const out: MenuBridgeCandidate[] = [];
  for (const [normalized, entry] of bucket.entries()) {
    if (entry.count < 3) continue;
    const avgLabor =
      entry.avgLaborSeed.length > 0
        ? entry.avgLaborSeed.reduce((sum, n) => sum + n, 0) / entry.avgLaborSeed.length
        : null;
    const confidence = entry.count >= 6 ? 0.88 : entry.count >= 4 ? 0.83 : 0.74;
    out.push({
      title: entry.label.slice(0, 120),
      description: `Inferred from ${entry.count} similar historical jobs`,
      price: null,
      laborHours: avgLabor,
      confidence,
      source: "history",
      uniqueKey: sha1(`hist|${normalized}`).slice(0, 20),
    });
  }
  return out;
}

async function bridgeOperatingLayerFromCsv(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  intakeId: string;
  serviceCatalogCsv: string | null;
  historyCsv: string | null;
}): Promise<ShopBoostImportSummary["shopBuildSummary"]> {
  const { supabase, shopId, intakeId, serviceCatalogCsv, historyCsv } = args;
  const summary: ShopBoostImportSummary["shopBuildSummary"] = {
    menuItemsCreated: 0,
    inspectionTemplatesCreated: 0,
    linkedMenuToInspection: 0,
    menuSuggestions: 0,
    inspectionSuggestions: 0,
  };
  if (!serviceCatalogCsv && !historyCsv) return summary;

  const menuCandidates: MenuBridgeCandidate[] = [];
  const inspectionCandidates: InspectionBridgeCandidate[] = [];

  if (serviceCatalogCsv) {
    const { rows } = parseCsv(serviceCatalogCsv);
    const extracted = extractServiceCatalogCandidates(rows);
    menuCandidates.push(...extracted.menu);
    inspectionCandidates.push(...extracted.inspections);
  }
  if (historyCsv) {
    const { rows } = parseCsv(historyCsv);
    menuCandidates.push(...extractHistoryMenuCandidates(rows));
  }

  const dedupedMenu = new Map<string, MenuBridgeCandidate>();
  for (const candidate of menuCandidates) {
    const key = `${candidate.source}:${candidate.uniqueKey}`;
    const existing = dedupedMenu.get(key);
    if (!existing || candidate.confidence > existing.confidence) dedupedMenu.set(key, candidate);
  }

  const highConfidenceTemplates: InspectionTemplateBridgeRef[] = [];
  const lowConfidenceTemplateSuggestions: InspectionTemplateSuggestionBridgeRef[] = [];

  for (const candidate of inspectionCandidates) {
    const signature = candidate.sections
      .map((section) => `${normalizeText(section.title)}:${section.items.map((i) => normalizeText(i)).join("|")}`)
      .join("||");
    if (candidate.confidence >= 0.85) {
      const { data: existing } = await supabase
        .from("inspection_templates")
        .select("id")
        .eq("shop_id", shopId)
        .eq("template_name", candidate.templateName)
        .contains("sections", { generated_from_key: candidate.uniqueKey })
        .maybeSingle<{ id: string }>();

      const templateId = existing?.id ?? null;
      if (!templateId) {
        const { data: created } = await supabase
          .from("inspection_templates")
          .insert({
            shop_id: shopId,
            template_name: candidate.templateName,
            description: candidate.note,
            vehicle_type: candidate.usageContext,
            tags: ["shop_boost", `source_intake:${intakeId}`, "confidence:high"],
            is_public: false,
            sections: {
              generated_by: "shop_boost_import_bridge",
              generated_from_key: candidate.uniqueKey,
              source_intake_id: intakeId,
              structured_sections: candidate.sections,
            },
          } as DB["public"]["Tables"]["inspection_templates"]["Insert"])
          .select("id")
          .limit(1)
          .maybeSingle<{ id: string }>();

        if (created?.id) {
          summary.inspectionTemplatesCreated += 1;
          highConfidenceTemplates.push({
            id: created.id,
            source: candidate.source,
            normalizedName: normalizeText(candidate.templateName),
            confidence: candidate.confidence,
          });
        }
      } else {
        highConfidenceTemplates.push({
          id: templateId,
          source: candidate.source,
          normalizedName: normalizeText(candidate.templateName),
          confidence: candidate.confidence,
        });
      }
      continue;
    }

    const suggestionInsert: DB["public"]["Tables"]["inspection_template_suggestions"]["Insert"] = {
      shop_id: shopId,
      intake_id: intakeId,
      template_key: `shop_boost:${intakeId}:${candidate.uniqueKey}`,
      name: candidate.templateName,
      items: {
        note: candidate.note,
        usageContext: candidate.usageContext,
        candidateSections: candidate.sections,
        source: candidate.source,
        signature,
      },
      applies_to: candidate.usageContext,
      confidence: candidate.confidence,
    } as DB["public"]["Tables"]["inspection_template_suggestions"]["Insert"];
    const { data: createdSuggestion } = await supabase
      .from("inspection_template_suggestions")
      .insert(suggestionInsert)
      .select("id")
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (createdSuggestion?.id) {
      summary.inspectionSuggestions += 1;
      lowConfidenceTemplateSuggestions.push({
        id: createdSuggestion.id,
        source: candidate.source,
        normalizedName: normalizeText(candidate.templateName),
        confidence: candidate.confidence,
      });
    }
  }

  for (const candidate of dedupedMenu.values()) {
    const matchedTemplate = highConfidenceTemplates.find((inspection) =>
      canHighConfidenceLink({ menu: candidate, inspection }),
    );
    const serviceKey = `shop_boost:${intakeId}:${slugifyServiceKey(`${candidate.source}-${candidate.uniqueKey}`)}`;
    if (candidate.confidence >= 0.85) {
      const { data: existing } = await supabase
        .from("menu_items")
        .select("id")
        .eq("shop_id", shopId)
        .eq("service_key", serviceKey)
        .maybeSingle<{ id: string }>();
      if (!existing?.id) {
        await supabase.from("menu_items").insert({
          shop_id: shopId,
          name: candidate.title,
          description: candidate.description,
          labor_hours: candidate.laborHours,
          total_price: candidate.price,
          service_key: serviceKey,
          source: "shop_boost",
          is_active: false,
          inspection_template_id: matchedTemplate?.id ?? null,
        } as DB["public"]["Tables"]["menu_items"]["Insert"]);
        summary.menuItemsCreated += 1;
        if (matchedTemplate?.id) summary.linkedMenuToInspection += 1;
      }
      continue;
    }

    const matchedTemplateSuggestion = lowConfidenceTemplateSuggestions.find((inspectionSuggestion) =>
      canSuggestionLink({ menu: candidate, inspectionSuggestion }),
    );
    await supabase.from("menu_item_suggestions").insert({
      shop_id: shopId,
      intake_id: intakeId,
      title: candidate.title,
      category: "shop_boost_import_candidate",
      price_suggestion: candidate.price,
      labor_hours_suggestion: candidate.laborHours,
      confidence: candidate.confidence,
      reason: `Derived from ${candidate.source} upload; review recommended.`,
      inspection_template_suggestion_id: matchedTemplateSuggestion?.id ?? null,
    } as DB["public"]["Tables"]["menu_item_suggestions"]["Insert"]);
    summary.menuSuggestions += 1;
  }

  return summary;
}

function parseDateIso(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;

  // try Date parsing
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();

  // try yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T12:00:00Z").toISOString();

  return null;
}

function pickSourceId(row: CsvRow, patterns: RegExp[]): string | null {
  const raw = pick(row, patterns);
  if (!raw) return null;
  const normalized = raw.trim();
  return normalized.length ? normalized : null;
}

function hasCustomerIdHeader(row: CsvRow): boolean {
  return Object.keys(row).some((key) => {
    const normalized = key
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return normalized === "customer id" || normalized === "customer external id";
  });
}

function classifyDeterministicCustomerMiss(args: {
  sourceCustomerId: string | null;
  sourceMatchedCustomerId: string | null;
  row: CsvRow;
  fallbackCustomerId: string | null;
}): "external_customer_id_not_found" | "customer_external_id_not_persisted" | "csv_alias_parse_miss" | "missing_customer_match" {
  if (args.sourceCustomerId && !args.sourceMatchedCustomerId) {
    return "customer_external_id_not_persisted";
  }
  if (!args.sourceCustomerId && hasCustomerIdHeader(args.row)) {
    return "csv_alias_parse_miss";
  }
  if (!args.sourceCustomerId && args.fallbackCustomerId) {
    return "external_customer_id_not_found";
  }
  return "missing_customer_match";
}

function sourceExternalId(domain: "customer" | "vehicle" | "work_order" | "invoice", sourceId: string): string {
  const normalized = sourceId.trim().toLowerCase();
  return `import:source:${domain}:${sha1(normalized || sourceId).slice(0, 20)}`;
}

function sourceIdentityHashes(sourceId: string | null | undefined): string[] {
  const raw = String(sourceId ?? "").trim();
  if (!raw) return [];
  const normalized = raw.toLowerCase();
  return Array.from(new Set([sha1(raw).slice(0, 20), sha1(normalized).slice(0, 20)]));
}

function resolveSourceLinkedId(map: Map<string, string>, sourceId: string | null | undefined): string | null {
  const hashes = sourceIdentityHashes(sourceId);
  for (const hash of hashes) {
    const id = map.get(hash);
    if (id) return id;
  }
  return null;
}

function rememberSourceLinkedId(map: Map<string, string>, sourceId: string | null | undefined, linkedId: string): void {
  if (!linkedId) return;
  for (const hash of sourceIdentityHashes(sourceId)) map.set(hash, linkedId);
}

async function downloadCsv(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.storage.from(SHOP_IMPORT_BUCKET).download(path);
  if (error || !data) return null;
  return data.text();
}

async function stageSupplementalUploads(args: {
  shopId: string;
  intakeId: string;
  uploadManifest: UploadManifestRecord;
}): Promise<void> {
  const supabase = createAdminSupabase();
  const stagedKinds = SHOP_BOOST_UPLOAD_DATASET_KEYS.filter(
    (key) => !SHOP_BOOST_DIRECT_IMPORT_DATASETS.includes(key),
  );

  for (const kind of stagedKinds) {
    const path = args.uploadManifest[kind]?.path ?? null;
    if (!path) continue;
    const csv = await downloadCsv(path);
    if (!csv) continue;
    const { rows } = parseCsv(csv);

    const { data: existingFile } = await supabase
      .from("shop_import_files")
      .select("id")
      .eq("intake_id", args.intakeId)
      .eq("storage_path", path)
      .maybeSingle<{ id: string }>();

    let fileId = existingFile?.id ?? null;
    if (!fileId) {
      const inserted = await supabase
        .from("shop_import_files")
        .insert({
          intake_id: args.intakeId,
          kind,
          storage_path: path,
          original_filename: args.uploadManifest[kind]?.fileName ?? null,
          parsed_row_count: rows.length,
          status: "needs_review",
        } as DB["public"]["Tables"]["shop_import_files"]["Insert"])
        .select("id")
        .limit(1)
        .maybeSingle<{ id: string }>();
      fileId = inserted.data?.id ?? null;
    }
    if (!fileId || rows.length === 0) continue;

    await supabase.from("shop_import_rows").delete().eq("file_id", fileId);

    const payload = rows.slice(0, 500).map((row, index) => ({
      intake_id: args.intakeId,
      file_id: fileId,
      row_number: index + 1,
      entity_type: kind,
      raw: row,
      normalized: {},
      errors: ["Auto-staged for mapping review"],
    }));
    await supabase.from("shop_import_rows").insert(payload);
  }
}

function classifyLifecycleStage(args: {
  matchStatus: MatchStatus;
  reviewRequired: boolean;
  errorReason?: string | null;
}): CanonicalLifecycleStage {
  if (args.matchStatus === "ignored") return "skipped";
  if (args.reviewRequired) return "review_required";
  if (args.matchStatus === "created_new") return "materialized_new";
  if (args.matchStatus === "matched_existing" || args.matchStatus === "partial_match") return "linked_existing";
  if (args.matchStatus === "invalid" || args.errorReason) return "failed";
  return "normalized";
}

function markDomainOutcome(diagnostics: DomainDiagnostics, stage: CanonicalLifecycleStage): void {
  if (stage === "linked_existing") diagnostics.linked_existing += 1;
  else if (stage === "materialized_new") diagnostics.materialized_new += 1;
  else if (stage === "review_required") diagnostics.review_required += 1;
  else if (stage === "failed") diagnostics.failed += 1;
  else if (stage === "skipped") diagnostics.skipped += 1;
}

async function insertRowResult(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  intakeId: string;
  sourceFile: string;
  sourceRowIndex: number;
  rawPayload: CsvRow;
  normalizedPayload: Record<string, unknown>;
  targetDomain: RowDomain;
  matchStatus: MatchStatus;
  matchConfidence: MatchConfidence;
  matchDetails?: Record<string, unknown> | null;
  errorReason?: string | null;
  reviewRequired: boolean;
  domainDiagnostics?: DomainDiagnostics;
  deterministicResolved?: boolean;
}): Promise<void> {
  if (args.domainDiagnostics) {
    args.domainDiagnostics.normalized += 1;
    if (args.deterministicResolved) args.domainDiagnostics.deterministic_identity += 1;
  }
  const lifecycleStage = classifyLifecycleStage({
    matchStatus: args.matchStatus,
    reviewRequired: args.reviewRequired,
    errorReason: args.errorReason ?? null,
  });
  if (args.domainDiagnostics) {
    markDomainOutcome(args.domainDiagnostics, lifecycleStage);
  }
  const cluster = buildClusterDescriptor({
    domain: args.targetDomain,
    rawPayload: args.rawPayload,
    normalizedPayload: args.normalizedPayload,
  });
  await args.supabase.from("shop_boost_row_results").insert({
    shop_id: args.shopId,
    intake_id: args.intakeId,
    source_file: args.sourceFile,
    source_row_index: args.sourceRowIndex,
    raw_payload: args.rawPayload,
    normalized_payload: args.normalizedPayload,
    target_domain: args.targetDomain,
    match_status: args.matchStatus,
    match_confidence: confidenceScore(args.matchConfidence),
    match_details: {
      resolution_order: DETERMINISTIC_LINKAGE_ORDER,
      lifecycle_stage: lifecycleStage,
      reason_code: args.errorReason ?? null,
      ...(args.matchDetails ?? {}),
    },
    cluster_key: cluster.clusterKey,
    cluster_confidence: cluster.confidence,
    error_reason: args.errorReason ?? null,
    review_required: args.reviewRequired,
  });
}

async function createReviewItem(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  intakeId: string;
  domain: RowDomain;
  issueType: ReviewIssueType;
  summary: string;
  rawPayload: Record<string, unknown>;
  normalizedPayload?: Record<string, unknown>;
  targetDomain?: string;
  blockingReason?: string;
  dependencyRefs?: Record<string, unknown>;
  downstreamImpactCount?: number;
  suggestedMatches?: unknown;
}): Promise<void> {
  const cluster = buildClusterDescriptor({
    domain: args.domain,
    rawPayload: args.rawPayload,
    normalizedPayload: args.normalizedPayload ?? {},
  });
  const recommendation = deriveReviewRecommendation({
    domain: args.domain,
    issueType: args.issueType,
    rawPayload: args.rawPayload,
    normalizedPayload: args.normalizedPayload ?? {},
    suggestedMatches: args.suggestedMatches,
    clusterConfidence: cluster.confidence,
  });

  await args.supabase.from("shop_boost_review_items").insert({
    shop_id: args.shopId,
    intake_id: args.intakeId,
    domain: args.domain,
    issue_type: args.issueType,
    summary: args.summary,
    raw_payload: args.rawPayload,
    normalized_payload: args.normalizedPayload ?? {},
    target_domain: args.targetDomain ?? args.domain,
    blocking_reason: args.blockingReason ?? null,
    dependency_refs: args.dependencyRefs ?? {},
    downstream_impact_count: args.downstreamImpactCount ?? 0,
    cluster_key: cluster.clusterKey,
    cluster_confidence: cluster.confidence,
    suggested_matches: args.suggestedMatches ?? [],
    recommended_action: recommendation.recommendedAction,
    recommendation_reason: recommendation.recommendationReason,
    recommendation_confidence: recommendation.recommendationConfidence,
    candidate_targets: recommendation.candidateTargets,
    recommendation_generated_at: new Date().toISOString(),
    status: "pending",
  });
}

export async function runShopBoostImport(args: RunArgs): Promise<ShopBoostImportSummary> {
  const { shopId, intakeId } = args;
  const supabase = createAdminSupabase();
  const materializeDomain = args.options?.materializeDomain ?? null;
  const runCustomers = !materializeDomain || materializeDomain === "customers";
  const runVehicles = !materializeDomain || materializeDomain === "vehicles";
  const runParts = !materializeDomain || materializeDomain === "parts";
  const runStaff = !materializeDomain || materializeDomain === "staff";
  const runHistory = !materializeDomain || materializeDomain === "history";
  const runInvoices = !materializeDomain || materializeDomain === "invoices";
  const runLinkagePass = !materializeDomain || materializeDomain === "history";

  // 🔒 hard safety gate for any future staff autocreate logic (currently NOT used)
  const createStaffUsers =
    process.env.ALLOW_STAFF_AUTOCREATE === "true" && args.options?.createStaffUsers === true;
  void createStaffUsers; // keep lint happy; staff user creation is intentionally NOT done here

  // Load intake
  const { data: intake, error: intakeErr } = await supabase
    .from("shop_boost_intakes")
    .select("*")
    .eq("id", intakeId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (intakeErr || !intake) {
    console.warn("[runShopBoostImport] intake missing", intakeErr);
    const emptyShopBuildSummary: ShopBoostImportSummary["shopBuildSummary"] = {
      menuItemsCreated: 0,
      inspectionTemplatesCreated: 0,
      linkedMenuToInspection: 0,
      menuSuggestions: 0,
      inspectionSuggestions: 0,
    };
    return {
      customersImported: 0,
      vehiclesImported: 0,
      workOrdersImported: 0,
      workOrderLinesImported: 0,
      invoicesImported: 0,
      partsImported: 0,
      linkageSummary: {
        linked: {
          vehiclesCustomerId: 0,
          workOrdersCustomerId: 0,
          workOrdersVehicleId: 0,
          invoicesCustomerId: 0,
        },
        unresolved: {
          vehiclesCustomerId: 0,
          workOrdersCustomerId: 0,
          workOrdersVehicleId: 0,
          invoicesCustomerId: 0,
        },
      },
      shopBuildSummary: emptyShopBuildSummary,
      canonicalMaterialization: {
        expected: { customers: 0, vehicles: 0, workOrders: 0, invoices: 0, staff: 0 },
        actual: { customers: 0, vehicles: 0, workOrders: 0, invoices: 0, staffSuggestions: 0, staffCandidates: 0 },
        gaps: {
          missingVehicles: false,
          missingWorkOrders: false,
          missingInvoices: false,
          missingStaff: false,
        },
        status: "partial",
      },
      rowResults: {
        totalRows: 0,
        processedRows: 0,
        successCount: 0,
        reviewCount: 0,
        failedCount: 0,
        byDomain: {},
      },
      completionState: "PARTIAL_FAILURE",
    };
  }

  const intakeRow = intake as IntakeRow;
  const intakeBasics = isRecord(intakeRow.intake_basics)
    ? (intakeRow.intake_basics as IntakeBasics)
    : {};
  const uploadManifest = isRecord(intakeBasics.uploadManifest)
    ? (intakeBasics.uploadManifest as UploadManifestRecord)
    : {};

  const [customersCsv, vehiclesCsv, partsCsv, historyCsv, staffCsv, invoicesCsvFromManifest, vendorsCsv] = await Promise.all([
    downloadCsv(intakeRow.customers_file_path ?? null),
    downloadCsv(intakeRow.vehicles_file_path ?? null),
    downloadCsv(intakeRow.parts_file_path ?? null),
    downloadCsv(intakeRow.history_file_path ?? null),
    downloadCsv(intakeRow.staff_file_path ?? null),
    downloadCsv(uploadManifest.invoices?.path ?? null),
    downloadCsv(uploadManifest.vendors?.path ?? null),
  ]);

  const parsedCustomers = customersCsv ? parseCsv(customersCsv).rows : [];
  const parsedVehicles = vehiclesCsv ? parseCsv(vehiclesCsv).rows : [];
  const parsedParts = partsCsv ? parseCsv(partsCsv).rows : [];
  const parsedHistory = historyCsv ? parseCsv(historyCsv).rows : [];
  const parsedInvoices = invoicesCsvFromManifest ? parseCsv(invoicesCsvFromManifest).rows : [];
  const parsedVendors = vendorsCsv ? parseCsv(vendorsCsv).rows : [];
  const totalRows =
    (runCustomers ? parsedCustomers.length : 0) +
    (runVehicles ? parsedVehicles.length : 0) +
    (runParts ? parsedParts.length : 0) +
    (runHistory ? parsedHistory.length : 0) +
    (runInvoices ? parsedInvoices.length : 0);

  const rowOutcome: ShopBoostImportSummary["rowResults"] = {
    totalRows,
    processedRows: 0,
    successCount: 0,
    reviewCount: 0,
    failedCount: 0,
    ignoredCount: 0,
    integrityErrors: [] as string[],
    outcomeBuckets: {
      materialized: 0,
      linked: 0,
      ignored: 0,
      review_required: 0,
      failed: 0,
      total_counted: 0,
      total_input: totalRows,
      mismatch: 0,
    },
    domainDiagnostics: undefined,
    byDomain: {
      customers: { success: 0, review: 0, failed: 0 },
      vehicles: { success: 0, review: 0, failed: 0 },
      parts: { success: 0, review: 0, failed: 0 },
      history: { success: 0, review: 0, failed: 0 },
      invoices: { success: 0, review: 0, failed: 0 },
    },
  };
  const domainDiagnostics: DomainDiagnosticsMap = {
    customers: createDomainDiagnostics(runCustomers ? parsedCustomers.length : 0),
    vehicles: createDomainDiagnostics(runVehicles ? parsedVehicles.length : 0),
    history: createDomainDiagnostics(runHistory ? parsedHistory.length : 0),
    invoices: createDomainDiagnostics(runInvoices ? parsedInvoices.length : 0),
    parts: createDomainDiagnostics(runParts ? parsedParts.length : 0),
    vendors: createDomainDiagnostics(parsedVendors.length),
  };

  if (!materializeDomain) {
    await Promise.all([
      supabase.from("shop_boost_row_results").delete().eq("shop_id", shopId).eq("intake_id", intakeId),
      supabase.from("shop_boost_review_items").delete().eq("shop_id", shopId).eq("intake_id", intakeId),
    ]);
  } else {
    const sourceFile = domainSourceFile(materializeDomain);
    if (sourceFile) {
      await supabase
        .from("shop_boost_row_results")
        .delete()
        .eq("shop_id", shopId)
        .eq("intake_id", intakeId)
        .eq("source_file", sourceFile);
    }
    const reviewDomains = domainReviewItems(materializeDomain);
    if (reviewDomains.length > 0) {
      await supabase
        .from("shop_boost_review_items")
        .delete()
        .eq("shop_id", shopId)
        .eq("intake_id", intakeId)
        .in("domain", reviewDomains);
    }
  }

  if (!materializeDomain) {
    await stageSupplementalUploads({ shopId, intakeId, uploadManifest });
  }
  const serviceCatalogCsv = !materializeDomain ? await downloadCsv(uploadManifest.serviceCatalog?.path ?? null) : null;
  const shopBuildSummary = !materializeDomain
    ? await bridgeOperatingLayerFromCsv({
        supabase,
        shopId,
        intakeId,
        serviceCatalogCsv,
        historyCsv,
      })
    : {
        menuItemsCreated: 0,
        inspectionTemplatesCreated: 0,
        linkedMenuToInspection: 0,
        menuSuggestions: 0,
        inspectionSuggestions: 0,
      };

  // Build caches (keep light: only key columns)
  const customersByEmail = new Map<string, string>();
  const customersByPhone = new Map<string, string>();
  const uniqueCustomersByEmail = new Map<string, string>();
  const uniqueCustomersByPhone = new Map<string, string>();
  const uniqueCustomersByName = new Map<string, string>();
  const conflictingCustomerEmails = new Set<string>();
  const conflictingCustomerPhones = new Set<string>();
  const conflictingCustomerNames = new Set<string>();
  const vehiclesByVin = new Map<string, string>();
  const vehiclesByPlate = new Map<string, string>();
  const vehiclesByUnit = new Map<string, string>();
  const uniqueVehiclesByCustomerUnit = new Map<string, string>();
  const conflictingVehiclesByCustomerUnit = new Set<string>();
  const uniqueVehiclesByCustomerPlate = new Map<string, string>();
  const conflictingVehiclesByCustomerPlate = new Set<string>();
  const customersBySourceId = new Map<string, string>();
  const vehiclesBySourceId = new Map<string, string>();
  const workOrdersBySourceId = new Map<string, string>();
  const staffByEmail = new Map<string, string>();
  const staffByName = new Map<string, string>();

  // Existing customers
  {
    const { data } = await supabase
      .from("customers")
      .select("id,email,phone,phone_number,name,first_name,last_name,external_id,shop_id")
      .eq("shop_id", shopId)
      .limit(5000);

    for (const r of data ?? []) {
      const rec = r as CacheCustomerRow;
      const externalId = String((r as Record<string, unknown>).external_id ?? "");
      const fullName = String((r as Record<string, unknown>).name ?? "").trim();
      const fallbackName = `${String((r as Record<string, unknown>).first_name ?? "").trim()} ${String((r as Record<string, unknown>).last_name ?? "").trim()}`.trim();
      const normalizedName = normalizeNameKey(fullName || fallbackName);
      const email = normalizeEmail(String(rec.email ?? ""));
      const phone = normalizePhone(String(rec.phone ?? rec.phone_number ?? ""));
      const id = String(rec.id ?? "");
      if (email && id) customersByEmail.set(email, id);
      if (phone && id) customersByPhone.set(phone, id);
      addUniqueMatch(uniqueCustomersByEmail, conflictingCustomerEmails, email, id);
      addUniqueMatch(uniqueCustomersByPhone, conflictingCustomerPhones, phone, id);
      addUniqueMatch(uniqueCustomersByName, conflictingCustomerNames, normalizedName, id);
      const sourceMatch = externalId.match(/^import:source:customer:([a-f0-9]{20})$/);
      if (sourceMatch?.[1] && id) customersBySourceId.set(sourceMatch[1], id);
    }
  }

  // Existing vehicles
  {
    const { data } = await supabase
      .from("vehicles")
      .select("id,vin,license_plate,unit_number,customer_id,external_id,shop_id")
      .eq("shop_id", shopId)
      .limit(5000);

    for (const r of data ?? []) {
      const rec = r as CacheVehicleRow;
      const vin = lower(String(rec.vin ?? ""));
      const plate = lower(String(rec.license_plate ?? ""));
      const unit = lower(String(rec.unit_number ?? ""));
      const id = String(rec.id ?? "");
      const customerId = String((r as Record<string, unknown>).customer_id ?? "");
      const externalId = String((r as Record<string, unknown>).external_id ?? "");
      if (vin && id) vehiclesByVin.set(vin, id);
      if (plate && id) vehiclesByPlate.set(plate, id);
      if (unit && id) vehiclesByUnit.set(unit, id);
      addUniqueMatch(
        uniqueVehiclesByCustomerUnit,
        conflictingVehiclesByCustomerUnit,
        compositeKey(customerId, unit),
        id,
      );
      addUniqueMatch(
        uniqueVehiclesByCustomerPlate,
        conflictingVehiclesByCustomerPlate,
        compositeKey(customerId, plate),
        id,
      );
      const sourceMatch = externalId.match(/^import:source:vehicle:([a-f0-9]{20})$/);
      if (sourceMatch?.[1] && id) vehiclesBySourceId.set(sourceMatch[1], id);
    }
  }

  // Existing work orders by source key
  {
    const { data } = await supabase
      .from("work_orders")
      .select("id,external_id")
      .eq("shop_id", shopId)
      .limit(5000);
    for (const row of data ?? []) {
      const id = String((row as Record<string, unknown>).id ?? "");
      const externalId = String((row as Record<string, unknown>).external_id ?? "");
      const sourceMatch = externalId.match(/^import:source:work_order:([a-f0-9]{20})$/);
      if (sourceMatch?.[1] && id) workOrdersBySourceId.set(sourceMatch[1], id);
    }
  }

  // Existing profiles (staff)
  {
    const { data } = await supabase
      .from("profiles")
      .select("id,email,full_name,shop_id")
      .eq("shop_id", shopId)
      .limit(5000);

    for (const r of data ?? []) {
      const rec = r as CacheProfileRow;
      const email = lower(String(rec.email ?? ""));
      const name = lower(String(rec.full_name ?? ""));
      const id = String(rec.id ?? "");
      if (email && id) staffByEmail.set(email, id);
      if (name && id) staffByName.set(name, id);
    }
  }

  const registerCustomerIndexes = (args: {
    customerId: string;
    sourceCustomerId?: string | null;
    email?: string | null;
    phone?: string | null;
    normalizedName?: string | null;
  }): void => {
    const id = args.customerId;
    if (!id) return;
    const email = normalizeEmail(args.email ?? "");
    const phone = normalizePhone(args.phone ?? "");
    const normalizedName = normalizeNameKey(args.normalizedName ?? "");
    if (email) {
      customersByEmail.set(email, id);
      addUniqueMatch(uniqueCustomersByEmail, conflictingCustomerEmails, email, id);
    }
    if (phone) {
      customersByPhone.set(phone, id);
      addUniqueMatch(uniqueCustomersByPhone, conflictingCustomerPhones, phone, id);
    }
    if (normalizedName) addUniqueMatch(uniqueCustomersByName, conflictingCustomerNames, normalizedName, id);
    rememberSourceLinkedId(customersBySourceId, args.sourceCustomerId, id);
  };

  let partsPipelineSummary: PartsPipelineSummary | undefined;

  // 1) Import customers
  if (runCustomers && parsedCustomers.length > 0) {
    for (let i = 0; i < parsedCustomers.length; i += 1) {
      const row = parsedCustomers[i];
      const sourceCustomerId = pickSourceId(row, [/^customer[_\s-]*id$/, /external customer id/, /^id$/]);
      const email = lower(pick(row, [/^email$/, /e-mail/, /customer email/, /mail/]) ?? "");
      const phone =
        normalizePhone(pick(row, [/^phone[_\s-]*primary$/, /^phone[_\s-]*secondary$/, /^phone$/, /phone number/, /mobile/, /cell/]) ?? "");

      const first = pick(row, [/^first/, /first name/]);
      const last = pick(row, [/^last/, /last name/]);
      const name =
        pick(row, [/^display[_\s-]*name$/, /^company[_\s-]*name$/, /^name$/, /customer name/]) ??
        [first ?? "", last ?? ""].filter(Boolean).join(" ");

      const customerType = lower(
        pick(row, [/^customer[_\s-]*type$/, /^type$/, /account type/, /customer class/, /segment/]) ?? "",
      );
      const business = pick(row, [/^company[_\s-]*name$/, /^business[_\s-]*name$/, /^company$/, /^business$/]);
      const address = pick(row, [/^address$/, /^address1$/, /^street$/, /^street address$/]);
      const city = pick(row, [/^city$/, /town/]);
      const province = pick(row, [/^province$/, /^state$/, /state\/province/, /region/]);
      const postalCode = pick(row, [/^postal[_\s-]*code$/, /^zip$/, /^zip[_\s-]*code$/]);
      const isFleet =
        customerType === "fleet" ||
        customerType === "commercial" ||
        lower(pick(row, [/^is[_\s-]*fleet$/, /^fleet\?$/, /^fleet$/]) ?? "") === "true";

      const external_id = sourceCustomerId
        ? sourceExternalId("customer", sourceCustomerId)
        : `import:${intakeId}:customers:${sha1(`${email}|${phone}|${name}|${business ?? ""}`).slice(0, 16)}`;

      const deterministicExternalId = resolveSourceLinkedId(customersBySourceId, sourceCustomerId);
      const deterministicEmailId = email && !conflictingCustomerEmails.has(email) ? uniqueCustomersByEmail.get(email) ?? null : null;
      const deterministicPhoneId = phone && !conflictingCustomerPhones.has(phone) ? uniqueCustomersByPhone.get(phone) ?? null : null;
      const decision = decideCustomerResolution({
        context: "import",
        resolutionAction: "created_new",
        deterministicMatch: deterministicExternalId
          ? { resolutionType: "matched_existing_by_external_id", customerId: deterministicExternalId }
          : deterministicEmailId
            ? { resolutionType: "matched_existing_by_email", customerId: deterministicEmailId }
            : deterministicPhoneId
              ? { resolutionType: "matched_existing_by_phone", customerId: deterministicPhoneId }
              : null,
      });

      if (decision.matchedRecordId) {
        const existingId = decision.matchedRecordId;
        await supabase
          .from("customers")
          .update({
            first_name: first ?? null,
            last_name: last ?? null,
            name: name || null,
            email: email || null,
            phone: phone || null,
            phone_number: phone || null,
            business_name: business ?? null,
            address: address ?? null,
            city: city ?? null,
            province: province ?? null,
            postal_code: postalCode ?? null,
            is_fleet: isFleet,
            shop_id: shopId,
            source_intake_id: intakeId,
            external_id,
            updated_at: new Date().toISOString(),
          } as DB["public"]["Tables"]["customers"]["Update"])
          .eq("id", existingId);

        rowOutcome.processedRows += 1;
        rowOutcome.successCount += 1;
        rowOutcome.byDomain.customers.success += 1;
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "customers",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: { email, phone, name, business, isFleet, customerType, sourceCustomerId },
          targetDomain: "customer",
          matchStatus: "matched_existing",
          matchConfidence: sourceCustomerId || email || phone ? "high" : "medium",
          matchDetails: {
            customerId: existingId,
            strategy:
              decision.resolutionType === "matched_existing_by_external_id"
                ? "customer_id"
                : decision.resolutionType === "matched_existing_by_email"
                  ? "email"
                  : "phone",
            sourceCustomerId,
            resolutionType: decision.resolutionType,
          },
          reviewRequired: false,
        });
        registerCustomerIndexes({
          customerId: existingId,
          sourceCustomerId,
          email,
          phone,
          normalizedName: name,
        });
        continue;
      }

      if (!email && !phone && !name) {
        rowOutcome.processedRows += 1;
        rowOutcome.reviewCount += 1;
        rowOutcome.byDomain.customers.review += 1;
        await createReviewItem({
          supabase,
          shopId,
          intakeId,
          domain: "customer",
          issueType: "invalid",
          summary: "Customer row is missing identity fields (name/email/phone).",
          rawPayload: row,
        });
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "customers",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: { email, phone, name, business, isFleet, customerType },
          targetDomain: "customer",
          matchStatus: "invalid",
          matchConfidence: "low",
          errorReason: "missing_identity_fields",
          reviewRequired: true,
        });
        continue;
      }

      const { data: inserted, error } = await supabase
        .from("customers")
        .insert({
          shop_id: shopId,
          first_name: first ?? null,
          last_name: last ?? null,
          name: name || null,
          email: email || null,
          phone: phone || null,
          phone_number: phone || null,
          business_name: business ?? null,
          address: address ?? null,
          city: city ?? null,
          province: province ?? null,
          postal_code: postalCode ?? null,
          is_fleet: isFleet,
          source_intake_id: intakeId,
          external_id,
          import_confidence: 0.75,
        } as DB["public"]["Tables"]["customers"]["Insert"])
        .select("id")
        .limit(1);

      if (!error) {
        const id = (inserted ?? [])[0]?.id as string | undefined;
        if (id) {
          registerCustomerIndexes({
            customerId: id,
            sourceCustomerId,
            email,
            phone,
            normalizedName: name,
          });
          await recordImportCreatedArtifact({
            supabase,
            shopId,
            intakeId,
            domain: "customer",
            recordId: id,
          });
        }
        rowOutcome.processedRows += 1;
        rowOutcome.successCount += 1;
        rowOutcome.byDomain.customers.success += 1;
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "customers",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: { email, phone, name, business, isFleet, customerType, sourceCustomerId },
          targetDomain: "customer",
          matchStatus: "created_new",
          matchConfidence: email || phone ? "high" : "medium",
          matchDetails: { customerId: id ?? null, resolutionType: "created_new_customer" },
          reviewRequired: false,
        });
      } else {
        const duplicateConflict = /customers_shop_email_uq|duplicate key value/i.test(error.message);
        const deterministicFallback = await (async () => {
          if (sourceCustomerId) {
            const { data } = await supabase
              .from("customers")
              .select("id")
              .eq("shop_id", shopId)
              .eq("external_id", sourceExternalId("customer", sourceCustomerId))
              .maybeSingle();
            if (data?.id) return { id: String(data.id), strategy: "customer_id" as const };
          }
          if (email) {
            const { data } = await supabase
              .from("customers")
              .select("id")
              .eq("shop_id", shopId)
              .eq("email", email)
              .maybeSingle();
            if (data?.id) return { id: String(data.id), strategy: "email" as const };
          }
          if (phone) {
            const { data } = await supabase.from("customers").select("id,phone,phone_number").eq("shop_id", shopId).limit(3000);
            const matched = (data ?? []).find((candidate) => normalizePhone((candidate as Record<string, unknown>).phone ?? (candidate as Record<string, unknown>).phone_number) === phone);
            if ((matched as Record<string, unknown> | undefined)?.id) return { id: String((matched as Record<string, unknown>).id), strategy: "phone" as const };
          }
          return null;
        })();
        if (deterministicFallback?.id) {
          await supabase
            .from("customers")
            .update({
              first_name: first ?? null,
              last_name: last ?? null,
              name: name || null,
              email: email || null,
              phone: phone || null,
              phone_number: phone || null,
              business_name: business ?? null,
              address: address ?? null,
              city: city ?? null,
              province: province ?? null,
              postal_code: postalCode ?? null,
              is_fleet: isFleet,
              shop_id: shopId,
              source_intake_id: intakeId,
              external_id,
              updated_at: new Date().toISOString(),
            } as DB["public"]["Tables"]["customers"]["Update"])
            .eq("id", deterministicFallback.id);
          registerCustomerIndexes({
            customerId: deterministicFallback.id,
            sourceCustomerId,
            email,
            phone,
            normalizedName: name,
          });
          rowOutcome.processedRows += 1;
          rowOutcome.successCount += 1;
          rowOutcome.byDomain.customers.success += 1;
          await insertRowResult({
            supabase,
            shopId,
            intakeId,
            sourceFile: "customers",
            sourceRowIndex: i + 1,
            rawPayload: row,
            normalizedPayload: { email, phone, name, business, isFleet, customerType, sourceCustomerId },
            targetDomain: "customer",
            matchStatus: "matched_existing",
            matchConfidence: "high",
            matchDetails: {
              customerId: deterministicFallback.id,
              strategy: deterministicFallback.strategy,
              resolutionType: deterministicFallback.strategy === "email" ? "matched_existing_by_email" : deterministicFallback.strategy === "phone" ? "matched_existing_by_phone" : "matched_existing_by_external_id",
              recoveredFromInsertConflict: true,
            },
            reviewRequired: false,
          });
          continue;
        }
        if (duplicateConflict) {
          const duplicateEvidenceFilter = [
            email ? `email.eq.${email}` : null,
            phone ? `phone.eq.${phone}` : null,
            phone ? `phone_number.eq.${phone}` : null,
            sourceCustomerId ? `external_id.eq.${sourceExternalId("customer", sourceCustomerId)}` : null,
          ]
            .filter(Boolean)
            .join(",");
          const { data: duplicateCandidates } = await supabase
            .from("customers")
            .select("id,email,phone,phone_number,external_id")
            .eq("shop_id", shopId)
            .or(duplicateEvidenceFilter || "id.is.null")
            .limit(25);
          const candidateIds = Array.from(
            new Set((duplicateCandidates ?? []).map((candidate) => String((candidate as Record<string, unknown>).id ?? "")).filter(Boolean)),
          );
          const hasSingleDeterministicCandidate = candidateIds.length === 1;
          rowOutcome.processedRows += 1;
          rowOutcome.reviewCount += 1;
          rowOutcome.byDomain.customers.review += 1;
          await createReviewItem({
            supabase,
            shopId,
            intakeId,
            domain: "customer",
            issueType: hasSingleDeterministicCandidate ? "conflict" : "duplicate_candidate",
            summary: hasSingleDeterministicCandidate
              ? "Customer create collided with an existing deterministic duplicate; link/update existing record."
              : "Customer create collided with multiple duplicate candidates; merge review is required before materialization.",
            rawPayload: row,
            normalizedPayload: { email, phone, name, business, isFleet, customerType, sourceCustomerId, candidateIds },
            blockingReason: hasSingleDeterministicCandidate ? "blocked_duplicate_conflict" : "merge_review_required",
            suggestedMatches: candidateIds.map((id) => ({ id })),
          });
          await insertRowResult({
            supabase,
            shopId,
            intakeId,
            sourceFile: "customers",
            sourceRowIndex: i + 1,
            rawPayload: row,
            normalizedPayload: { email, phone, name, business, isFleet, customerType, sourceCustomerId, candidateIds },
            targetDomain: "customer",
            matchStatus: "partial_match",
            matchConfidence: "medium",
            errorReason: hasSingleDeterministicCandidate ? "blocked_duplicate_conflict" : "merge_review_required",
            reviewRequired: true,
          });
          continue;
        }
        rowOutcome.processedRows += 1;
        rowOutcome.failedCount += 1;
        rowOutcome.byDomain.customers.failed += 1;
        await createReviewItem({
          supabase,
          shopId,
          intakeId,
          domain: "customer",
          issueType: "conflict",
          summary: `Customer materialization failed: ${error.message}`,
          rawPayload: row,
        });
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "customers",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: { email, phone, name, business, isFleet, customerType },
          targetDomain: "customer",
          matchStatus: "unmatched",
          matchConfidence: "low",
          errorReason: error.message,
          reviewRequired: true,
        });
      }
    }
  }

  // 2) Import vehicles (link to customer if possible)
  if (runVehicles && parsedVehicles.length > 0) {
    for (let i = 0; i < parsedVehicles.length; i += 1) {
      const row = parsedVehicles[i];
      const sourceVehicleId = pickSourceId(row, [/^vehicle[_\s-]*id$/, /external vehicle id/, /^unit id$/]);
      const sourceVehicleKeys = sourceIdentityHashes(sourceVehicleId);
      const sourceCustomerId = pickSourceId(row, [/^customer[_\s-]*id$/, /external customer id/]);

      const vin = lower(pick(row, [/^vin$/, /vehicle vin/]) ?? "");
      const plate = lower(pick(row, [/plate/, /license/, /licence/]) ?? "");
      const unit = pick(row, [/unit/, /unit number/, /truck number/]);
      const year = parseIntSafe(pick(row, [/^year$/, /model year/]));
      const make = pick(row, [/^make$/]);
      const model = pick(row, [/^model$/]);
      const mileage = pick(row, [/mileage/, /odometer/]);
      const engineHours = parseIntSafe(pick(row, [/engine hours/, /hours/]));

      const custEmail = normalizeEmail(pick(row, [/customer email/, /email/]));
      const custPhone = normalizePhone(pick(row, [/customer phone/, /phone/]));
      const customerNameKey = normalizeNameKey(pick(row, [/customer name/, /^name$/, /account name/]));
      const sourceMatchedCustomerId = resolveSourceLinkedId(customersBySourceId, sourceCustomerId);
      const fallbackCustomerId =
        (custEmail && !conflictingCustomerEmails.has(custEmail) && uniqueCustomersByEmail.get(custEmail)) ||
        (custPhone && !conflictingCustomerPhones.has(custPhone) && uniqueCustomersByPhone.get(custPhone)) ||
        (customerNameKey && !conflictingCustomerNames.has(customerNameKey) && uniqueCustomersByName.get(customerNameKey)) ||
        null;
      const customer_id = sourceMatchedCustomerId || fallbackCustomerId || null;
      const deterministicMissReason = classifyDeterministicCustomerMiss({
        sourceCustomerId,
        sourceMatchedCustomerId: sourceMatchedCustomerId ?? null,
        row,
        fallbackCustomerId: fallbackCustomerId ?? null,
      });

      if (!customer_id) {
        rowOutcome.processedRows += 1;
        rowOutcome.reviewCount += 1;
        rowOutcome.byDomain.vehicles.review += 1;
        await createReviewItem({
          supabase,
          shopId,
          intakeId,
          domain: "vehicle",
          issueType: "missing_dependency",
          summary: `Vehicle could not be imported because customer linkage failed (${deterministicMissReason}).`,
          rawPayload: row,
          normalizedPayload: {
            sourceCustomerId,
            sourceMatchedCustomerId,
            fallbackCustomerId,
            deterministicMissReason,
          },
          blockingReason: deterministicMissReason,
          suggestedMatches: [{
            customerEmail: custEmail || null,
            customerPhone: custPhone || null,
            sourceCustomerId: sourceCustomerId ?? null,
            sourceMatchedCustomerId: sourceMatchedCustomerId ?? null,
          }],
        });
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "vehicles",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: {
            vin,
            plate,
            unit,
            year,
            make,
            model,
            custEmail,
            custPhone,
            sourceCustomerId,
            sourceMatchedCustomerId,
            fallbackCustomerId,
            deterministicMissReason,
          },
          targetDomain: "vehicle",
          matchStatus: "unmatched",
          matchConfidence: "low",
          errorReason: deterministicMissReason,
          reviewRequired: true,
        });
        continue;
      }

      const external_id = sourceVehicleId
        ? sourceExternalId("vehicle", sourceVehicleId)
        : `import:${intakeId}:vehicles:${sha1(`${vin}|${plate}|${unit ?? ""}|${year ?? ""}`).slice(0, 16)}`;

      const existingId =
        sourceVehicleKeys.map((key) => vehiclesBySourceId.get(key)).find(Boolean) ||
        ((customer_id &&
          unit &&
          !conflictingVehiclesByCustomerUnit.has(compositeKey(customer_id, lower(unit))) &&
          uniqueVehiclesByCustomerUnit.get(compositeKey(customer_id, lower(unit)))) ||
          (vin && vehiclesByVin.get(vin)) ||
          (customer_id &&
            plate &&
            !conflictingVehiclesByCustomerPlate.has(compositeKey(customer_id, plate)) &&
            uniqueVehiclesByCustomerPlate.get(compositeKey(customer_id, plate))) ||
          (plate && vehiclesByPlate.get(plate)));

      if (existingId) {
        await supabase
          .from("vehicles")
          .update({
            shop_id: shopId,
            customer_id,
            vin: vin || null,
            license_plate: plate || null,
            unit_number: unit ?? null,
            year: year ?? null,
            make: make ?? null,
            model: model ?? null,
            mileage: mileage ?? null,
            engine_hours: engineHours ?? null,
            source_intake_id: intakeId,
            external_id,
            import_confidence: 0.75,
          } as DB["public"]["Tables"]["vehicles"]["Update"])
          .eq("id", existingId);

        rowOutcome.processedRows += 1;
        rowOutcome.successCount += 1;
        rowOutcome.byDomain.vehicles.success += 1;
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "vehicles",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: { vin, plate, unit, year, make, model, customer_id, sourceVehicleId, sourceCustomerId },
          targetDomain: "vehicle",
          matchStatus: "matched_existing",
          matchConfidence: vin ? "high" : "medium",
          matchDetails: {
            vehicleId: existingId,
            strategy: sourceVehicleId ? "vehicle_id" : vin ? "vin" : "plate",
            customerId: customer_id,
            sourceVehicleId,
            sourceCustomerId,
          },
          reviewRequired: false,
        });
        rememberSourceLinkedId(vehiclesBySourceId, sourceVehicleId, existingId);
        addUniqueMatch(
          uniqueVehiclesByCustomerUnit,
          conflictingVehiclesByCustomerUnit,
          compositeKey(customer_id, unit ? lower(unit) : ""),
          existingId,
        );
        addUniqueMatch(
          uniqueVehiclesByCustomerPlate,
          conflictingVehiclesByCustomerPlate,
          compositeKey(customer_id, plate),
          existingId,
        );
        continue;
      }

      const { data: inserted, error } = await supabase
        .from("vehicles")
        .insert({
          shop_id: shopId,
          customer_id,
          vin: vin || null,
          license_plate: plate || null,
          unit_number: unit ?? null,
          year: year ?? null,
          make: make ?? null,
          model: model ?? null,
          mileage: mileage ?? null,
          engine_hours: engineHours ?? null,
          source_intake_id: intakeId,
          external_id,
          import_confidence: 0.75,
        } as DB["public"]["Tables"]["vehicles"]["Insert"])
        .select("id")
        .limit(1);

      if (!error) {
        const id = (inserted ?? [])[0]?.id as string | undefined;
        if (id) {
          if (vin) vehiclesByVin.set(vin, id);
          if (plate) vehiclesByPlate.set(plate, id);
          if (unit) vehiclesByUnit.set(lower(unit), id);
          rememberSourceLinkedId(vehiclesBySourceId, sourceVehicleId, id);
          await recordImportCreatedArtifact({
            supabase,
            shopId,
            intakeId,
            domain: "vehicle",
            recordId: id,
          });
          addUniqueMatch(
            uniqueVehiclesByCustomerUnit,
            conflictingVehiclesByCustomerUnit,
            compositeKey(customer_id, unit ? lower(unit) : ""),
            id,
          );
          addUniqueMatch(
            uniqueVehiclesByCustomerPlate,
            conflictingVehiclesByCustomerPlate,
            compositeKey(customer_id, plate),
            id,
          );
        }
        rowOutcome.processedRows += 1;
        rowOutcome.successCount += 1;
        rowOutcome.byDomain.vehicles.success += 1;
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "vehicles",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: { vin, plate, unit, year, make, model, customer_id, sourceVehicleId, sourceCustomerId },
          targetDomain: "vehicle",
          matchStatus: "created_new",
          matchConfidence: vin ? "high" : plate ? "medium" : "low",
          matchDetails: { vehicleId: id ?? null, customerId: customer_id },
          reviewRequired: false,
        });
      } else {
        rowOutcome.processedRows += 1;
        rowOutcome.failedCount += 1;
        rowOutcome.byDomain.vehicles.failed += 1;
        await createReviewItem({
          supabase,
          shopId,
          intakeId,
          domain: "vehicle",
          issueType: "conflict",
          summary: `Vehicle materialization failed: ${error.message}`,
          rawPayload: row,
        });
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "vehicles",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: { vin, plate, unit, year, make, model, customer_id },
          targetDomain: "vehicle",
          matchStatus: "unmatched",
          matchConfidence: "low",
          errorReason: error.message,
          reviewRequired: true,
        });
      }
    }
  }

  // 3) Import parts (staged pipeline with review queue + safe promotion)
  if (runParts && partsCsv) {
    partsPipelineSummary = await runPartsImportPipeline({
      shopId,
      intakeId,
      partsCsv,
      partsFilePath: intakeRow.parts_file_path ?? null,
      sourceSystem: typeof intakeRow.source === "string" ? intakeRow.source : null,
    });
    if (partsPipelineSummary) {
      rowOutcome.processedRows += partsPipelineSummary.rawRows;
      rowOutcome.successCount += partsPipelineSummary.promotedRows;
      rowOutcome.reviewCount += partsPipelineSummary.ambiguousRows;
      rowOutcome.failedCount += partsPipelineSummary.rejectedRows;
      rowOutcome.byDomain.parts.success += partsPipelineSummary.promotedRows;
      rowOutcome.byDomain.parts.review += partsPipelineSummary.ambiguousRows;
      rowOutcome.byDomain.parts.failed += partsPipelineSummary.rejectedRows;
    }
  }

  // 4) Import staff -> staff_invite_suggestions (NO auth creation here)
  let staffRowsExpected = 0;
  if (runStaff && staffCsv) {
    const { rows } = parseCsv(staffCsv);
    staffRowsExpected = rows.length;
    await supabase.from("staff_invite_suggestions").delete().eq("shop_id", shopId).eq("intake_id", intakeId);
    await supabase
      .from("staff_invite_candidates")
      .delete()
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId)
      .eq("source", "shop_boost_import");

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];

      // Handles messy headers because pick() normalizes keys with lower(trim)
      const firstName = pick(row, [/^first[_\s-]*name$/, /^first$/]) ?? null;
      const lastName = pick(row, [/^last[_\s-]*name$/, /^last$/]) ?? null;
      const displayName = pick(row, [/^display[_\s-]*name$/, /^preferred[_\s-]*name$/]) ?? null;
      const usernameHint =
        pick(row, [/^username$/, /^user[_\s-]*name$/, /^login$/, /^employee[_\s-]*login$/, /^tech[_\s-]*code$/]) ??
        null;
      const fallbackJoinedName = [firstName ?? "", lastName ?? ""].filter(Boolean).join(" ").trim();
      const fullName =
        pick(row, [
          /^full[_\s-]*name$/, // Full_Name, full_name, full-name, full name
          /^name$/,
          /employee name/,
          /staff name/,
        ]) ??
        displayName ??
        (fallbackJoinedName || null) ??
        usernameHint;

      const emailRaw = pick(row, [/^email$/, /e-mail/, /mail/]);
      const email = emailRaw && emailRaw.includes("@") ? emailRaw.trim() : null;
      const phone = normalizePhone(pick(row, [/^phone$/, /mobile/, /cell/, /phone number/]));

      // ✅ ROLE PATCH (use schema enum + mapping, including accounting->admin)
      const roleRaw = pick(row, [/^role$/, /position/, /job/, /title/]);
      const role = normRole(roleRaw);

      // Skip totally empty rows
      if (!fullName && !email && !usernameHint) continue;

      const notes = pick(row, [/reason/, /note/, /notes/, /comment/]) ?? "Imported from staff CSV";
      const externalUserId = pickSourceId(row, [/^external[_\s-]*user[_\s-]*id$/, /^user[_\s-]*id$/, /^employee[_\s-]*id$/]);
      const normalizedIdentity = normalizeText(email ?? fullName ?? "").replace(/\s+/g, ".");
      const username = externalUserId ?? usernameHint ?? (normalizedIdentity || null);

      // Deterministic-ish external id to prevent duplicates on reruns
      const external_id = `import:${intakeId}:staff:${sha1(
        `${externalUserId ?? ""}|${fullName ?? ""}|${email ?? ""}|${role ?? ""}`,
      ).slice(0, 10)}`;

      const { error: staffInsErr } = await supabase.from("staff_invite_suggestions").insert(
        {
          shop_id: shopId,
          intake_id: intakeId,
          role,
          full_name: fullName,
          email,
          phone: phone || null,
          username,
          count_suggested: 1,
          notes,
          external_id,
        } as unknown as DB["public"]["Tables"]["staff_invite_suggestions"]["Insert"],
      );

      if (staffInsErr) {
        console.warn("[staff invite suggestions] upsert failed", staffInsErr);
      }

      const { error: candidateInsErr } = await supabase.from("staff_invite_candidates").insert(
        {
          shop_id: shopId,
          intake_id: intakeId,
          full_name: fullName,
          email,
          phone: phone || null,
          username,
          role,
          confidence: 0.75,
          notes,
          source: "shop_boost_import",
          status: "pending",
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Insert"],
      );
      if (candidateInsErr) {
        console.warn("[staff invite candidates] insert failed", candidateInsErr);
      }
    }
  }

  // 5) Import history → completed work orders + lines (+ invoices if totals exist)
  if (runHistory && parsedHistory.length > 0) {
    for (let i = 0; i < parsedHistory.length; i += 1) {
      const row = parsedHistory[i];
      const sourceWorkOrderId = pickSourceId(row, [/^work[_\s-]*order[_\s-]*id$/, /^wo[_\s-]*id$/, /^ro[_\s-]*id$/, /^invoice[_\s-]*id$/]);
      const sourceWorkOrderKeys = sourceIdentityHashes(sourceWorkOrderId);
      const sourceCustomerId = pickSourceId(row, [/^customer[_\s-]*id$/, /external customer id/]);
      const sourceVehicleId = pickSourceId(row, [/^vehicle[_\s-]*id$/, /external vehicle id/]);

      const ro =
        pick(row, [/^invoice[_\s-]*number$/, /^ro$/, /ro number/, /work order/, /order number/, /invoice number/]) ?? null;
      const invoiceNumber = pick(row, [/^invoice[_\s-]*number$/, /^invoice number$/, /^invoice #$/, /^invoice$/]);

      const dateIso =
        parseDateIso(pick(row, [/date/, /service date/, /closed/, /completed/])) ??
        new Date().toISOString();

      const complaint = pick(row, [/symptom/, /complaint/, /concern/]);
      const cause = pick(row, [/cause/]);
      const correction = pick(row, [/correction/, /work performed/, /description/]);

      const total = parseMoney(pick(row, [/total/, /grand total/, /invoice total/]));
      const labor = parseMoney(
        pick(row, [/^labor[_\s-]*sale$/, /^labor[_\s-]*total$/, /labor sale/, /labor amount/, /^labor$/]),
      );
      const parts = parseMoney(
        pick(row, [/^parts[_\s-]*sale$/, /^parts[_\s-]*total$/, /parts sale/, /parts amount/, /^parts$/]),
      );

      const vin = lower(pick(row, [/vin/]) ?? "");
      const plate = lower(pick(row, [/plate/, /license/]) ?? "");

      const customerEmail = normalizeEmail(pick(row, [/customer email/, /^email$/]));
      const customerPhone = normalizePhone(pick(row, [/customer phone/, /^phone$/]));
      const customerName = pick(row, [/customer name/, /^name$/]) ?? null;
      const normalizedCustomerName = normalizeNameKey(customerName);

      const sourceMatchedCustomerId = resolveSourceLinkedId(customersBySourceId, sourceCustomerId);
      const fallbackCustomerId =
        (customerEmail && !conflictingCustomerEmails.has(customerEmail) && uniqueCustomersByEmail.get(customerEmail)) ||
        (customerPhone && !conflictingCustomerPhones.has(customerPhone) && uniqueCustomersByPhone.get(customerPhone)) ||
        (normalizedCustomerName &&
          !conflictingCustomerNames.has(normalizedCustomerName) &&
          uniqueCustomersByName.get(normalizedCustomerName)) ||
        null;
      const customer_id = sourceMatchedCustomerId || fallbackCustomerId || null;
      const deterministicMissReason = classifyDeterministicCustomerMiss({
        sourceCustomerId,
        sourceMatchedCustomerId: sourceMatchedCustomerId ?? null,
        row,
        fallbackCustomerId: fallbackCustomerId ?? null,
      });

      const rowUnit = lower(pick(row, [/unit/, /unit number/, /truck number/]) ?? "");
      const sourceMatchedVehicleId = resolveSourceLinkedId(vehiclesBySourceId, sourceVehicleId);
      const fallbackVehicleId =
        (vin && vehiclesByVin.get(vin)) ||
        (plate && vehiclesByPlate.get(plate)) ||
        (rowUnit && vehiclesByUnit.get(rowUnit)) ||
        null;
      const vehicle_id = sourceMatchedVehicleId || fallbackVehicleId || null;

      if (!customer_id) {
        rowOutcome.processedRows += 1;
        rowOutcome.reviewCount += 1;
        rowOutcome.byDomain.history.review += 1;
        await createReviewItem({
          supabase,
          shopId,
          intakeId,
          domain: "work_order",
          issueType: "missing_dependency",
          summary: `History row skipped because customer linkage failed (${deterministicMissReason}).`,
          rawPayload: row,
          normalizedPayload: {
            sourceCustomerId,
            sourceMatchedCustomerId,
            fallbackCustomerId,
            deterministicMissReason,
          },
          blockingReason: deterministicMissReason,
          suggestedMatches: [{ customerEmail, customerPhone, vin, plate, sourceCustomerId }],
        });
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "history",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: {
            ro,
            dateIso,
            customer_id,
            vehicle_id,
            sourceWorkOrderId,
            sourceCustomerId,
            sourceVehicleId,
            vin,
            plate,
            total,
            labor,
            parts,
          },
          targetDomain: "work_order",
          matchStatus: "unmatched",
          matchConfidence: "low",
          errorReason: deterministicMissReason,
          reviewRequired: true,
        });
        continue;
      }

      const historyFingerprint = sha1([
        ro ?? "",
        dateOnly(dateIso),
        vehicle_id ?? "",
        vin,
        plate,
        String(total ?? ""),
        normalizeText(correction ?? complaint ?? ""),
      ].join("|")).slice(0, 20);
      const external_id = sourceWorkOrderId
        ? sourceExternalId("work_order", sourceWorkOrderId)
        : `import:${intakeId}:history:${historyFingerprint}`;

      const woByExternalId = sourceWorkOrderKeys.map((key) => workOrdersBySourceId.get(key)).find(Boolean) ?? null;
      const woByExternal = woByExternalId
        ? { id: woByExternalId }
        : (
            await supabase
              .from("work_orders")
              .select("id")
              .eq("shop_id", shopId)
              .eq("external_id", external_id)
              .maybeSingle<{ id: string }>()
          ).data;

      if (vehicle_id && customer_id) {
        await supabase
          .from("vehicles")
          .update({ customer_id } as DB["public"]["Tables"]["vehicles"]["Update"])
          .eq("id", vehicle_id)
          .eq("shop_id", shopId)
          .is("customer_id", null);
      }

      const woPayload: DB["public"]["Tables"]["work_orders"]["Insert"] = {
        shop_id: shopId,
        customer_id,
        vehicle_id,
        status: "completed",
        type: "repair",
        custom_id: ro,
        customer_name: customerName,
        labor_total: labor ?? null,
        parts_total: parts ?? null,
        invoice_total: total ?? null,
        created_at: dateIso,
        updated_at: dateIso,
        source_intake_id: intakeId,
        external_id,
        import_confidence: 0.78,
        import_notes: JSON.stringify({
          source: "shop_boost",
          source_intake_id: intakeId,
          history_fingerprint: historyFingerprint,
        }),
      };

      let woInserted: Array<{ id: string }> | null = null;
      let woErr: { message?: string } | null = null;

      if (woByExternal?.id) {
        const woUpdatePayload: DB["public"]["Tables"]["work_orders"]["Update"] = {
          ...woPayload,
          vehicle_id: vehicle_id ?? undefined,
        };
        await supabase
          .from("work_orders")
          .update(woUpdatePayload)
          .eq("id", woByExternal.id);
        woInserted = [{ id: woByExternal.id }];
      } else {
        const ins = await supabase.from("work_orders").insert(woPayload).select("id").limit(1);
        woInserted = (ins.data ?? null) as Array<{ id: string }> | null;
        woErr = ins.error;
      }

      if (woErr) {
        rowOutcome.processedRows += 1;
        rowOutcome.failedCount += 1;
        rowOutcome.byDomain.history.failed += 1;
        await createReviewItem({
          supabase,
          shopId,
          intakeId,
          domain: "work_order",
          issueType: "conflict",
          summary: `History work order materialization failed: ${woErr.message ?? "unknown error"}`,
          rawPayload: row,
        });
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "history",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: { ro, dateIso, customer_id, vehicle_id, total, labor, parts },
          targetDomain: "work_order",
          matchStatus: "invalid",
          matchConfidence: "low",
          errorReason: woErr.message ?? "unknown_error",
          reviewRequired: true,
        });
        if (ro) {
          const { data: existingWo } = await supabase
            .from("work_orders")
            .select("id")
            .eq("shop_id", shopId)
            .eq("custom_id", ro)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle<{ id: string }>();

          if (!existingWo?.id) continue;

          await upsertHistoryLine({
            supabase,
            shopId,
            intakeId,
            workOrderId: existingWo.id,
            rowIndex: i + 1,
            complaint,
            cause,
            correction,
            vehicle_id,
          });

          await upsertInvoiceIfNeeded({
            supabase,
            shopId,
            intakeId,
            workOrderId: existingWo.id,
            customer_id,
            total,
            labor,
            parts,
            issuedAt: dateIso,
            invoiceNumber: invoiceNumber ?? ro,
          });

          continue;
        }
        continue;
      }

      const workOrderId = (woInserted ?? [])[0]?.id as string | undefined;
      if (!workOrderId) {
        rowOutcome.processedRows += 1;
        rowOutcome.failedCount += 1;
        rowOutcome.byDomain.history.failed += 1;
        await createReviewItem({
          supabase,
          shopId,
          intakeId,
          domain: "work_order",
          issueType: "conflict",
          summary: "History row did not return a work order id after materialization attempt.",
          rawPayload: row,
          normalizedPayload: { ro, sourceWorkOrderId, external_id, customer_id, vehicle_id },
          blockingReason: "work_order_id_missing_after_write",
        });
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "history",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: { ro, sourceWorkOrderId, customer_id, vehicle_id, external_id },
          targetDomain: "work_order",
          matchStatus: "invalid",
          matchConfidence: "low",
          errorReason: "work_order_id_missing_after_write",
          reviewRequired: true,
        });
        continue;
      }
      if (!woByExternal?.id) {
        await recordImportCreatedArtifact({
          supabase,
          shopId,
          intakeId,
          domain: "work_order",
          recordId: workOrderId,
        });
      }
      rememberSourceLinkedId(workOrdersBySourceId, sourceWorkOrderId, workOrderId);

      if (!vehicle_id) {
        rowOutcome.reviewCount += 1;
        rowOutcome.byDomain.history.review += 1;
        await createReviewItem({
          supabase,
          shopId,
          intakeId,
          domain: "work_order",
          issueType: "missing_dependency",
          summary: "History row materialized without a matched vehicle. Customer linkage succeeded.",
          rawPayload: row,
          suggestedMatches: [{ customerEmail, customerPhone, vin, plate }],
        });
      }

      await upsertHistoryLine({
        supabase,
        shopId,
        intakeId,
        workOrderId,
        rowIndex: i + 1,
        complaint,
        cause,
        correction,
        vehicle_id,
      });

      const invoiceUpsert = await upsertInvoiceIfNeeded({
        supabase,
        shopId,
        intakeId,
        workOrderId,
        customer_id,
        total,
        labor,
        parts,
        issuedAt: dateIso,
        invoiceNumber: invoiceNumber ?? ro,
      });
      if (!invoiceUpsert.ok) {
        rowOutcome.processedRows += 1;
        rowOutcome.failedCount += 1;
        rowOutcome.byDomain.history.failed += 1;
        await createReviewItem({
          supabase,
          shopId,
          intakeId,
          domain: "invoice",
          issueType: "conflict",
          summary: `History invoice materialization failed: ${invoiceUpsert.errorReason ?? "unknown error"}`,
          rawPayload: row,
        });
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "history",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: { ro, dateIso, customer_id, vehicle_id, total, labor, parts },
          targetDomain: "invoice",
          matchStatus: "invalid",
          matchConfidence: "low",
          errorReason: "invoice_write_failed",
          reviewRequired: true,
        });
        continue;
      }
      rowOutcome.processedRows += 1;
      rowOutcome.successCount += 1;
      rowOutcome.byDomain.history.success += 1;
      await insertRowResult({
        supabase,
        shopId,
        intakeId,
        sourceFile: "history",
        sourceRowIndex: i + 1,
        rawPayload: row,
        normalizedPayload: {
          ro,
          dateIso,
          customer_id,
          vehicle_id,
          sourceWorkOrderId,
          sourceCustomerId,
          sourceVehicleId,
          total,
          labor,
          parts,
        },
        targetDomain: "work_order",
        matchStatus: !vehicle_id ? "partial_match" : woByExternal?.id ? "matched_existing" : "created_new",
        matchConfidence: !vehicle_id ? "medium" : "high",
        matchDetails: { workOrderId, customerId: customer_id, vehicleId: vehicle_id },
        errorReason: !vehicle_id ? "missing_vehicle_match" : undefined,
        reviewRequired: !vehicle_id,
      });
    }
  }

  // 6) Import invoice exports (canonical upsert when deterministic keys resolve)
  if (runInvoices && parsedInvoices.length > 0) {
    for (let i = 0; i < parsedInvoices.length; i += 1) {
      const row = parsedInvoices[i];
      const sourceInvoiceId = pickSourceId(row, [/^invoice[_\s-]*id$/, /^invoice[_\s-]*number$/, /external invoice id/]);
      const sourceWorkOrderId = pickSourceId(row, [/^work[_\s-]*order[_\s-]*id$/, /^wo[_\s-]*id$/, /^ro[_\s-]*id$/]);
      const sourceCustomerId = pickSourceId(row, [/^customer[_\s-]*id$/, /external customer id/]);
      const sourceWorkOrderKeys = sourceIdentityHashes(sourceWorkOrderId);
      const invoiceNumber = pick(row, [/^invoice[_\s-]*number$/, /^invoice number$/, /^invoice #$/, /^invoice$/, /inv number/]);
      const ro = pick(row, [/^ro$/, /ro number/, /work order/, /order number/]) ?? null;
      const issuedAt = parseDateIso(pick(row, [/date/, /issued/, /closed/, /completed/])) ?? new Date().toISOString();
      const total = parseMoney(pick(row, [/total/, /grand total/, /invoice total/, /amount due/]));
      const labor = parseMoney(
        pick(row, [/^labor[_\s-]*sale$/, /^labor[_\s-]*total$/, /labor sale/, /labor amount/, /^labor$/]),
      );
      const parts = parseMoney(
        pick(row, [/^parts[_\s-]*sale$/, /^parts[_\s-]*total$/, /parts sale/, /parts amount/, /^parts$/]),
      );
      const customerEmail = normalizeEmail(pick(row, [/customer email/, /^email$/]));
      const customerPhone = normalizePhone(pick(row, [/customer phone/, /^phone$/]));
      const customerName = normalizeNameKey(pick(row, [/customer name/, /^name$/, /account name/]));
      const resolvedCustomerId =
        resolveSourceLinkedId(customersBySourceId, sourceCustomerId) ||
        (customerEmail && !conflictingCustomerEmails.has(customerEmail) && uniqueCustomersByEmail.get(customerEmail)) ||
        (customerPhone && !conflictingCustomerPhones.has(customerPhone) && uniqueCustomersByPhone.get(customerPhone)) ||
        (customerName && !conflictingCustomerNames.has(customerName) && uniqueCustomersByName.get(customerName)) ||
        null;
      const deterministicCustomerMissReason = classifyDeterministicCustomerMiss({
        sourceCustomerId,
        sourceMatchedCustomerId: resolveSourceLinkedId(customersBySourceId, sourceCustomerId),
        row,
        fallbackCustomerId:
          (customerEmail && !conflictingCustomerEmails.has(customerEmail) && uniqueCustomersByEmail.get(customerEmail)) ||
          (customerPhone && !conflictingCustomerPhones.has(customerPhone) && uniqueCustomersByPhone.get(customerPhone)) ||
          (customerName && !conflictingCustomerNames.has(customerName) && uniqueCustomersByName.get(customerName)) ||
          null,
      });

      let workOrderId: string | null =
        sourceWorkOrderKeys.map((key) => workOrdersBySourceId.get(key)).find(Boolean) || null;
      if (!workOrderId && !sourceWorkOrderId && ro) {
        const { data: byCustomId } = await supabase
          .from("work_orders")
          .select("id")
          .eq("shop_id", shopId)
          .eq("custom_id", ro)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ id: string }>();
        workOrderId = byCustomId?.id ?? null;
      }

      if (!workOrderId || !resolvedCustomerId) {
        rowOutcome.processedRows += 1;
        rowOutcome.reviewCount += 1;
        rowOutcome.byDomain.invoices.review += 1;
        await createReviewItem({
          supabase,
          shopId,
          intakeId,
          domain: "invoice",
          issueType: "missing_dependency",
          summary: !workOrderId
            ? "Invoice row staged for review because work order linkage was unresolved."
            : `Invoice row staged for review because customer linkage failed (${deterministicCustomerMissReason}).`,
          rawPayload: row,
          blockingReason: !workOrderId ? "missing_work_order_match" : deterministicCustomerMissReason,
          suggestedMatches: [{ sourceInvoiceId, sourceWorkOrderId, sourceCustomerId, invoiceNumber, ro }],
        });
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "invoices",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: {
            sourceInvoiceId,
            sourceWorkOrderId,
            sourceCustomerId,
            invoiceNumber,
            ro,
            workOrderId,
            resolvedCustomerId,
            deterministicCustomerMissReason,
            total,
            labor,
            parts,
          },
          targetDomain: "invoice",
          matchStatus: "unmatched",
          matchConfidence: "low",
          errorReason: !workOrderId ? "missing_work_order_match" : deterministicCustomerMissReason,
          reviewRequired: true,
        });
        continue;
      }

      const derivedInvoiceExternalId = sourceInvoiceId
        ? sourceExternalId("invoice", sourceInvoiceId)
        : invoiceNumber
          ? sourceExternalId("invoice", invoiceNumber)
          : null;

      const invoiceUpsert = await upsertInvoiceIfNeeded({
        supabase,
        shopId,
        intakeId,
        workOrderId,
        customer_id: resolvedCustomerId,
        total,
        labor,
        parts,
        issuedAt,
        invoiceNumber: invoiceNumber ?? null,
        externalId: derivedInvoiceExternalId,
      });
      if (!invoiceUpsert.ok) {
        rowOutcome.processedRows += 1;
        rowOutcome.failedCount += 1;
        rowOutcome.byDomain.invoices.failed += 1;
        await createReviewItem({
          supabase,
          shopId,
          intakeId,
          domain: "invoice",
          issueType: "conflict",
          summary: `Invoice materialization failed: ${invoiceUpsert.errorReason ?? "unknown error"}`,
          rawPayload: row,
          normalizedPayload: { sourceInvoiceId, sourceWorkOrderId, sourceCustomerId, invoiceNumber, ro },
        });
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "invoices",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: {
            sourceInvoiceId,
            sourceWorkOrderId,
            sourceCustomerId,
            invoiceNumber,
            ro,
            workOrderId,
            resolvedCustomerId,
          },
          targetDomain: "invoice",
          matchStatus: "invalid",
          matchConfidence: "low",
          errorReason: "invoice_write_failed",
          reviewRequired: true,
        });
        continue;
      }

      rowOutcome.processedRows += 1;
      rowOutcome.successCount += 1;
      rowOutcome.byDomain.invoices.success += 1;
      await insertRowResult({
        supabase,
        shopId,
        intakeId,
        sourceFile: "invoices",
        sourceRowIndex: i + 1,
        rawPayload: row,
        normalizedPayload: {
          sourceInvoiceId,
          sourceWorkOrderId,
          sourceCustomerId,
          invoiceNumber,
          ro,
          workOrderId,
          resolvedCustomerId,
          total,
          labor,
          parts,
        },
        targetDomain: "invoice",
        matchStatus: "created_new",
        matchConfidence: sourceWorkOrderId || sourceCustomerId ? "high" : "medium",
        matchDetails: {
          workOrderId,
          customerId: resolvedCustomerId,
          strategy: sourceWorkOrderId || sourceCustomerId ? "stable_ids" : "fallback",
        },
        reviewRequired: false,
      });
    }
  }

  const linkageCounters = {
    vehiclesCustomerId: 0,
    workOrdersCustomerId: 0,
    workOrdersVehicleId: 0,
    invoicesCustomerId: 0,
  };

  // 7) Post-import linkage pass (safe, idempotent, shop-scoped)
  if (runLinkagePass && vehiclesCsv) {
    const { rows } = parseCsv(vehiclesCsv);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const sourceVehicleId = pickSourceId(row, [/^vehicle[_\s-]*id$/, /external vehicle id/, /^unit id$/]);
      const sourceCustomerId = pickSourceId(row, [/^customer[_\s-]*id$/, /external customer id/]);
      const email = normalizeEmail(pick(row, [/customer email/, /email/]));
      const phone = normalizePhone(pick(row, [/customer phone/, /phone/]));
      const customerName = normalizeNameKey(
        pick(row, [/customer name/, /^name$/, /^display[_\s-]*name$/, /^company[_\s-]*name$/]),
      );
      const matchedCustomerId =
        resolveSourceLinkedId(customersBySourceId, sourceCustomerId) ||
        (email && !conflictingCustomerEmails.has(email) && uniqueCustomersByEmail.get(email)) ||
        (phone && !conflictingCustomerPhones.has(phone) && uniqueCustomersByPhone.get(phone)) ||
        (customerName && !conflictingCustomerNames.has(customerName) && uniqueCustomersByName.get(customerName)) ||
        null;

      if (!matchedCustomerId) continue;

      const vin = lower(pick(row, [/^vin$/, /vehicle vin/]) ?? "");
      const plate = lower(pick(row, [/plate/, /license/, /licence/]) ?? "");
      const unit = pick(row, [/unit/, /unit number/, /truck number/]);
      const year = parseIntSafe(pick(row, [/^year$/, /model year/]));
      const external_id = sourceVehicleId
        ? sourceExternalId("vehicle", sourceVehicleId)
        : `import:${intakeId}:vehicles:${sha1(`${vin}|${plate}|${unit ?? ""}|${year ?? ""}`).slice(0, 16)}`;

      const { data: linkedVehicles } = await supabase
        .from("vehicles")
        .update({ customer_id: matchedCustomerId } as DB["public"]["Tables"]["vehicles"]["Update"])
        .eq("shop_id", shopId)
        .eq("external_id", external_id)
        .eq("source_intake_id", intakeId)
        .is("customer_id", null)
        .select("id");
      linkageCounters.vehiclesCustomerId += linkedVehicles?.length ?? 0;
    }
  }

  if (runLinkagePass && historyCsv) {
    const uniqueVehiclesByVin = new Map<string, string>();
    const uniqueVehiclesByPlate = new Map<string, string>();
    const uniqueVehiclesByUnit = new Map<string, string>();
    const conflictingVehicleVins = new Set<string>();
    const conflictingVehiclePlates = new Set<string>();
    const conflictingVehicleUnits = new Set<string>();
    const uniqueVehicleByCustomerId = new Map<string, string>();
    const conflictingVehicleCustomers = new Set<string>();

    const { data: vehiclesForLinkage } = await supabase
      .from("vehicles")
      .select("id,vin,license_plate,unit_number,customer_id")
      .eq("shop_id", shopId)
      .limit(5000);

    for (const vehicle of vehiclesForLinkage ?? []) {
      const vehicleId = String(vehicle.id ?? "");
      const vin = lower(String(vehicle.vin ?? ""));
      const plate = lower(String(vehicle.license_plate ?? ""));
      const unit = lower(String((vehicle as Record<string, unknown>).unit_number ?? ""));
      const customerId = String(vehicle.customer_id ?? "");

      addUniqueMatch(uniqueVehiclesByVin, conflictingVehicleVins, vin, vehicleId);
      addUniqueMatch(uniqueVehiclesByPlate, conflictingVehiclePlates, plate, vehicleId);
      addUniqueMatch(uniqueVehiclesByUnit, conflictingVehicleUnits, unit, vehicleId);
      addUniqueMatch(uniqueVehicleByCustomerId, conflictingVehicleCustomers, customerId, vehicleId);
    }

    const { rows } = parseCsv(historyCsv);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const sourceCustomerId = pickSourceId(row, [/^customer[_\s-]*id$/, /external customer id/]);
      const sourceVehicleId = pickSourceId(row, [/^vehicle[_\s-]*id$/, /external vehicle id/]);
      const sourceVehicleKeys = sourceIdentityHashes(sourceVehicleId);
      const sourceWorkOrderId = pickSourceId(row, [/^work[_\s-]*order[_\s-]*id$/, /^wo[_\s-]*id$/, /^ro[_\s-]*id$/]);
      const customerEmail = normalizeEmail(pick(row, [/customer email/, /^email$/]));
      const customerPhone = normalizePhone(pick(row, [/customer phone/, /^phone$/]));
      const customerName = normalizeNameKey(pick(row, [/customer name/, /^name$/, /account name/]));
      const matchedCustomerId =
        resolveSourceLinkedId(customersBySourceId, sourceCustomerId) ||
        (customerEmail &&
          !conflictingCustomerEmails.has(customerEmail) &&
          uniqueCustomersByEmail.get(customerEmail)) ||
        (customerPhone &&
          !conflictingCustomerPhones.has(customerPhone) &&
          uniqueCustomersByPhone.get(customerPhone)) ||
        (customerName &&
          !conflictingCustomerNames.has(customerName) &&
          uniqueCustomersByName.get(customerName)) ||
        null;

      if (!matchedCustomerId) continue;

      const ro =
        pick(row, [/^ro$/, /ro number/, /work order/, /order number/, /invoice number/]) ?? null;
      const dateIso =
        parseDateIso(pick(row, [/date/, /service date/, /closed/, /completed/])) ??
        new Date().toISOString();
      const total = parseMoney(pick(row, [/total/, /grand total/, /invoice total/]));
      const correction = pick(row, [/correction/, /work performed/, /description/]);
      const complaint = pick(row, [/complaint/, /concern/]);
      const vin = lower(pick(row, [/vin/]) ?? "");
      const plate = lower(pick(row, [/plate/, /license/]) ?? "");
      const unit = lower(pick(row, [/unit/, /unit number/, /truck number/]) ?? "");
      const vehicleIdFromVin =
        vin && !conflictingVehicleVins.has(vin) ? uniqueVehiclesByVin.get(vin) ?? null : null;
      const vehicleIdFromPlate =
        plate && !conflictingVehiclePlates.has(plate) ? uniqueVehiclesByPlate.get(plate) ?? null : null;
      const vehicleIdFromUnit =
        unit && !conflictingVehicleUnits.has(unit) ? uniqueVehiclesByUnit.get(unit) ?? null : null;
      const matchedVehicleId =
        sourceVehicleKeys.map((key) => vehiclesBySourceId.get(key)).find(Boolean) ||
        vehicleIdFromVin ||
        vehicleIdFromPlate ||
        vehicleIdFromUnit ||
        null;
      const historyFingerprint = sha1(
        [
          ro ?? "",
          dateOnly(dateIso),
          matchedVehicleId ?? "",
          vin,
          plate,
          String(total ?? ""),
          normalizeText(correction ?? complaint ?? ""),
        ].join("|"),
      ).slice(0, 20);
      const external_id = sourceWorkOrderId
        ? sourceExternalId("work_order", sourceWorkOrderId)
        : `import:${intakeId}:history:${historyFingerprint}`;

      const { data: workOrder } = await supabase
        .from("work_orders")
        .select("id")
        .eq("shop_id", shopId)
        .eq("external_id", external_id)
        .maybeSingle<{ id: string }>();

      if (!workOrder?.id) continue;

      const { data: linkedWorkOrdersByCustomer } = await supabase
        .from("work_orders")
        .update({ customer_id: matchedCustomerId } as DB["public"]["Tables"]["work_orders"]["Update"])
        .eq("shop_id", shopId)
        .eq("id", workOrder.id)
        .is("customer_id", null)
        .select("id");
      linkageCounters.workOrdersCustomerId += linkedWorkOrdersByCustomer?.length ?? 0;

      const { data: linkedInvoicesByCustomer } = await supabase
        .from("invoices")
        .update({ customer_id: matchedCustomerId } as DB["public"]["Tables"]["invoices"]["Update"])
        .eq("shop_id", shopId)
        .eq("work_order_id", workOrder.id)
        .is("customer_id", null)
        .select("id");
      linkageCounters.invoicesCustomerId += linkedInvoicesByCustomer?.length ?? 0;

      const customerScopedVehicleId =
        !conflictingVehicleCustomers.has(matchedCustomerId) &&
        uniqueVehicleByCustomerId.has(matchedCustomerId)
          ? uniqueVehicleByCustomerId.get(matchedCustomerId) ?? null
          : null;
      const safeVehicleId = matchedVehicleId || customerScopedVehicleId;

      if (!safeVehicleId) continue;

      const { data: linkedWorkOrdersByVehicle } = await supabase
        .from("work_orders")
        .update({ vehicle_id: safeVehicleId } as DB["public"]["Tables"]["work_orders"]["Update"])
        .eq("shop_id", shopId)
        .eq("id", workOrder.id)
        .is("vehicle_id", null)
        .or(`customer_id.is.null,customer_id.eq.${matchedCustomerId}`)
        .select("id");
      linkageCounters.workOrdersVehicleId += linkedWorkOrdersByVehicle?.length ?? 0;
    }
  }

  const prevBasics = isRecord(intakeRow.intake_basics)
    ? (intakeRow.intake_basics as IntakeBasics)
    : {};
  const reviewCounts = await Promise.all([
    supabase
      .from("shop_boost_review_items")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId)
      .eq("status", "pending"),
    supabase
      .from("shop_boost_review_items")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId)
      .eq("status", "failed_materialization"),
    supabase
      .from("shop_boost_review_items")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId)
      .eq("status", "ignored"),
    supabase
      .from("shop_boost_review_items")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId)
      .in("status", ["resolved", "materialized"]),
  ]);

  const pendingReviewCount = reviewCounts[0].count ?? 0;
  const failedReviewCount = reviewCounts[1].count ?? 0;
  const ignoredCount = reviewCounts[2].count ?? 0;
  const reviewResolvedCount = reviewCounts[3].count ?? 0;
  rowOutcome.ignoredCount = ignoredCount;
  const integrity = await runPostMigrationIntegrityValidation({ shopId, intakeId });
  const integrityErrors: string[] = integrity.integrityErrors;

  const sourceFileFilter = materializeDomain ? domainSourceFile(materializeDomain) : null;
  let totalCountQuery = supabase
    .from("shop_boost_row_results")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("intake_id", intakeId);
  let reviewCountQuery = supabase
    .from("shop_boost_row_results")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("intake_id", intakeId)
    .eq("review_required", true);
  let failedCountQuery = supabase
    .from("shop_boost_row_results")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("intake_id", intakeId)
    .eq("review_required", false)
    .or("error_reason.not.is.null,match_status.eq.invalid");
  let linkedCountQuery = supabase
    .from("shop_boost_row_results")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("intake_id", intakeId)
    .eq("review_required", false)
    .is("error_reason", null)
    .in("match_status", ["matched_existing", "partial_match"]);
  if (sourceFileFilter) {
    totalCountQuery = totalCountQuery.eq("source_file", sourceFileFilter);
    reviewCountQuery = reviewCountQuery.eq("source_file", sourceFileFilter);
    failedCountQuery = failedCountQuery.eq("source_file", sourceFileFilter);
    linkedCountQuery = linkedCountQuery.eq("source_file", sourceFileFilter);
  }
  const [totalRowCountResp, reviewRequiredResp, failedResp, linkedResp] = await Promise.all([
    totalCountQuery,
    reviewCountQuery,
    failedCountQuery,
    linkedCountQuery,
  ]);
  const totalRowCount = Number(totalRowCountResp.count ?? 0);
  const reviewRequiredCount = Number(reviewRequiredResp.count ?? 0);
  const failedBucketCount = Number(failedResp.count ?? 0);
  const linkedCount = Number(linkedResp.count ?? 0);
  const materializedCount = Math.max(0, totalRowCount - reviewRequiredCount - failedBucketCount - linkedCount);

  const outcomeBuckets = {
    materialized: 0,
    linked: 0,
    ignored: 0,
    review_required: reviewRequiredCount,
    failed: failedBucketCount,
    total_counted: 0,
    total_input: totalRowCount,
    mismatch: 0,
  };
  outcomeBuckets.materialized = materializedCount;
  outcomeBuckets.linked = linkedCount;
  outcomeBuckets.total_counted =
    outcomeBuckets.materialized +
    outcomeBuckets.linked +
    outcomeBuckets.ignored +
    outcomeBuckets.review_required +
    outcomeBuckets.failed;
  outcomeBuckets.mismatch = Math.abs(outcomeBuckets.total_input - outcomeBuckets.total_counted);
  if (outcomeBuckets.mismatch !== 0) {
    integrityErrors.push(
      `Row outcome mismatch detected: input=${outcomeBuckets.total_input}, bucketed=${outcomeBuckets.total_counted}, mismatch=${outcomeBuckets.mismatch}. Source file rows evaluated=${totalRows}.`,
    );
  }
  rowOutcome.integrityErrors = integrityErrors;
  rowOutcome.outcomeBuckets = outcomeBuckets;
  rowOutcome.domainDiagnostics = domainDiagnostics;

  const { data: lifecycleRows } = await supabase
    .from("shop_boost_row_results")
    .select("source_file,match_status,review_required,error_reason,match_details")
    .eq("shop_id", shopId)
    .eq("intake_id", intakeId)
    .limit(100000);

  const domainBySourceFile: Record<string, keyof DomainDiagnosticsMap> = {
    customers: "customers",
    vehicles: "vehicles",
    history: "history",
    invoices: "invoices",
    parts: "parts",
    vendors: "vendors",
  };

  for (const row of lifecycleRows ?? []) {
    const sourceFile = String((row as Record<string, unknown>).source_file ?? "");
    const mappedDomain = domainBySourceFile[sourceFile];
    if (!mappedDomain) continue;
    const diagnostics = domainDiagnostics[mappedDomain];
    diagnostics.normalized += 1;
    const matchStatus = String((row as Record<string, unknown>).match_status ?? "");
    const reviewRequired = Boolean((row as Record<string, unknown>).review_required);
    const errorReason = String((row as Record<string, unknown>).error_reason ?? "") || null;
    const matchDetails = (row as Record<string, unknown>).match_details;
    const hasDeterministicSignal =
      (isRecord(matchDetails) && typeof matchDetails.strategy === "string") ||
      (isRecord(matchDetails) && typeof matchDetails.resolutionType === "string");
    if (hasDeterministicSignal) diagnostics.deterministic_identity += 1;
    const stage = classifyLifecycleStage({
      matchStatus: matchStatus as MatchStatus,
      reviewRequired,
      errorReason,
    });
    markDomainOutcome(diagnostics, stage);
  }

  if (partsPipelineSummary) {
    const partsDiagnostics = domainDiagnostics.parts;
    partsDiagnostics.uploaded = partsPipelineSummary.rawRows;
    partsDiagnostics.parsed = partsPipelineSummary.rawRows;
    partsDiagnostics.normalized = Math.max(partsDiagnostics.normalized, partsPipelineSummary.normalizedRows);
    partsDiagnostics.deterministic_identity = Math.max(partsDiagnostics.deterministic_identity, partsPipelineSummary.matchedRows);
    partsDiagnostics.materialized_new = Math.max(partsDiagnostics.materialized_new, partsPipelineSummary.promotedRows);
    partsDiagnostics.review_required = Math.max(partsDiagnostics.review_required, partsPipelineSummary.ambiguousRows);
    partsDiagnostics.failed = Math.max(partsDiagnostics.failed, partsPipelineSummary.rejectedRows);
  }

  for (const diagnostics of Object.values(domainDiagnostics)) {
    const bucketed =
      diagnostics.linked_existing +
      diagnostics.materialized_new +
      diagnostics.review_required +
      diagnostics.failed +
      diagnostics.skipped;
    diagnostics.mismatch = Math.abs(diagnostics.parsed - bucketed);
  }

  const { data: keyFixRows } = await supabase
    .from("shop_boost_review_items")
    .select("domain,issue_type,status,resolution_action")
    .eq("shop_id", shopId)
    .eq("intake_id", intakeId)
    .limit(100000);

  const duplicateCustomersMerged = (keyFixRows ?? []).filter(
    (row: KeyFixRow) =>
      row.domain === "customer" &&
      (row.issue_type === "duplicate_candidate" || row.issue_type === "conflict") &&
      row.resolution_action === "linked_to_existing" &&
      (row.status === "resolved" || row.status === "materialized"),
  ).length;

  const autoMatchRatio = rowOutcome.totalRows > 0 ? (outcomeBuckets.materialized + outcomeBuckets.linked) / rowOutcome.totalRows : 0;
  const manualInterventionRatio = rowOutcome.totalRows > 0 ? (pendingReviewCount + ignoredCount) / rowOutcome.totalRows : 0;
  let trustScore = 0.5;
  trustScore += Math.min(0.35, autoMatchRatio * 0.35);
  trustScore += Math.min(0.15, (1 - manualInterventionRatio) * 0.15);
  trustScore -= Math.min(0.25, (rowOutcome.failedCount / Math.max(1, rowOutcome.totalRows)) * 0.25);
  trustScore -= Math.min(0.2, (pendingReviewCount / Math.max(1, rowOutcome.totalRows)) * 0.2);
  trustScore -= Math.min(0.2, integrityErrors.length * 0.05);
  if (integrityErrors.length > 0) trustScore = Math.min(trustScore, 0.84);
  trustScore = Math.max(0, Math.min(0.99, Number(trustScore.toFixed(2))));

  const completionState: ShopBoostImportSummary["completionState"] = computeCompletionState({
    failedCount: rowOutcome.failedCount,
    pendingReviewCount,
    failedReviewCount,
    integrityStatus: integrity.status,
    integrityErrorsCount: integrityErrors.length,
  });

  const [
    customersCount,
    vehiclesCount,
    workOrdersCount,
    workOrderLinesCount,
    invoicesCount,
    partsCount,
    unresolvedVehiclesMissingCustomer,
    unresolvedWorkOrdersMissingCustomer,
    unresolvedWorkOrdersMissingVehicle,
    unresolvedInvoicesMissingCustomer,
    staffSuggestionsCount,
    staffCandidatesCount,
  ] = await Promise.all([
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId),
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId),
      supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId),
      supabase
        .from("work_order_lines")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .contains("metadata", { source_intake_id: intakeId }),
      supabase
        .from("parts")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId),
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId)
        .is("customer_id", null),
      supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId)
        .is("customer_id", null),
      supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId)
        .is("vehicle_id", null),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .contains("metadata", { source_intake_id: intakeId })
        .is("customer_id", null),
      supabase
        .from("staff_invite_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("intake_id", intakeId),
      supabase
        .from("staff_invite_candidates")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("intake_id", intakeId)
        .eq("source", "shop_boost_import"),
    ]);

  const expectedVehicles = parsedVehicles.length;
  const expectedWorkOrders = parsedHistory.length;
  const expectedInvoices = parsedInvoices.length;
  const expectedStaff = staffRowsExpected;
  const canonicalMaterialization: ShopBoostImportSummary["canonicalMaterialization"] = {
    expected: {
      customers: parsedCustomers.length,
      vehicles: expectedVehicles,
      workOrders: expectedWorkOrders,
      invoices: expectedInvoices,
      staff: expectedStaff,
    },
    actual: {
      customers: customersCount.count ?? 0,
      vehicles: vehiclesCount.count ?? 0,
      workOrders: workOrdersCount.count ?? 0,
      invoices: invoicesCount.count ?? 0,
      staffSuggestions: staffSuggestionsCount.count ?? 0,
      staffCandidates: staffCandidatesCount.count ?? 0,
    },
    gaps: {
      missingVehicles: expectedVehicles > 0 && (vehiclesCount.count ?? 0) === 0,
      missingWorkOrders: expectedWorkOrders > 0 && (workOrdersCount.count ?? 0) === 0,
      missingInvoices: expectedInvoices > 0 && (invoicesCount.count ?? 0) === 0,
      missingStaff: expectedStaff > 0 && (staffSuggestionsCount.count ?? 0) === 0,
    },
    status: "ok",
  };
  canonicalMaterialization.status =
    canonicalMaterialization.gaps.missingVehicles ||
    canonicalMaterialization.gaps.missingWorkOrders ||
    canonicalMaterialization.gaps.missingInvoices ||
    canonicalMaterialization.gaps.missingStaff
      ? "partial"
      : "ok";

  const effectiveCompletionState: ShopBoostImportSummary["completionState"] =
    canonicalMaterialization.status === "partial" &&
    (completionState === "COMPLETED_CLEAN" ||
      completionState === "COMPLETED_WITH_REVIEW" ||
      completionState === "COMPLETED_WITH_WARNINGS" ||
      completionState === "READY_FOR_GO_LIVE")
      ? "NOT_READY"
      : completionState;

  const migrationStory = buildMigrationStory({
    totalRows: rowOutcome.totalRows,
    outcomeBuckets: {
      materialized: outcomeBuckets.materialized,
      linked: outcomeBuckets.linked,
      ignored: ignoredCount,
      failed: outcomeBuckets.failed,
    },
    reviewResolvedCount,
    pendingReviewCount,
    failedReviewCount,
    failedCount: rowOutcome.failedCount,
    integrityErrorsCount: integrityErrors.length,
    confidenceScore: trustScore,
    integrityChecks: integrity.checks as Record<string, unknown>,
    keyFixCounts: {
      duplicateCustomersMerged,
      vehiclesLinkedToCustomers: linkageCounters.vehiclesCustomerId,
      workOrdersRecoveredVehicleLinks: linkageCounters.workOrdersVehicleId,
    },
  });

  await supabase
    .from("shop_boost_intakes")
    .update(
      {
        processed_at: new Date().toISOString(),
        intake_basics: {
          ...prevBasics,
          importedAt: new Date().toISOString(),
          importSummary: {
            customersImported: customersCount.count ?? 0,
            vehiclesImported: vehiclesCount.count ?? 0,
            workOrdersImported: workOrdersCount.count ?? 0,
            workOrderLinesImported: workOrderLinesCount.count ?? 0,
            invoicesImported: invoicesCount.count ?? 0,
            partsImported: partsCount.count ?? 0,
            linkageSummary: {
              linked: {
                vehiclesCustomerId: linkageCounters.vehiclesCustomerId,
                workOrdersCustomerId: linkageCounters.workOrdersCustomerId,
                workOrdersVehicleId: linkageCounters.workOrdersVehicleId,
                invoicesCustomerId: linkageCounters.invoicesCustomerId,
              },
              unresolved: {
                vehiclesCustomerId: unresolvedVehiclesMissingCustomer.count ?? 0,
                workOrdersCustomerId: unresolvedWorkOrdersMissingCustomer.count ?? 0,
                workOrdersVehicleId: unresolvedWorkOrdersMissingVehicle.count ?? 0,
                invoicesCustomerId: unresolvedInvoicesMissingCustomer.count ?? 0,
              },
            },
            partsPipeline: partsPipelineSummary ?? null,
            shopBuildSummary,
            rowResults: rowOutcome,
            completionState: effectiveCompletionState,
            canonicalMaterialization,
            integrity: { ...integrity, integrity_errors: integrityErrors },
            ignoredCount,
            confidence_score: trustScore,
            migration_story: migrationStory,
          },
          migration_story: migrationStory,
          shopBuildSummary,
          migrationProgress: {
            ...(isRecord(prevBasics.migrationProgress) ? prevBasics.migrationProgress : {}),
            total_rows: rowOutcome.totalRows,
            processed_rows: rowOutcome.processedRows,
            success_count: rowOutcome.successCount,
            review_count: rowOutcome.reviewCount,
            failed_count: rowOutcome.failedCount,
            ignored_count: ignoredCount,
            domains: rowOutcome.byDomain,
            completionState: effectiveCompletionState,
            integrity: { ...integrity, integrity_errors: integrityErrors },
            integrity_errors: integrityErrors,
            row_outcome_buckets: outcomeBuckets,
            confidence_score: trustScore,
            confidence_tier: trustScore >= 0.85 ? "HIGH" : trustScore >= 0.6 ? "MEDIUM" : "LOW",
            migration_story: migrationStory,
            ready_for_go_live_gate:
              integrityErrors.length === 0 &&
              pendingReviewCount === 0 &&
              failedReviewCount === 0 &&
              rowOutcome.failedCount === 0 &&
              outcomeBuckets.mismatch === 0 &&
              canonicalMaterialization.status === "ok",
          },
        },
      } satisfies DB["public"]["Tables"]["shop_boost_intakes"]["Update"],
    )
    .eq("id", intakeId);

  return {
    customersImported: customersCount.count ?? 0,
    vehiclesImported: vehiclesCount.count ?? 0,
    workOrdersImported: workOrdersCount.count ?? 0,
    workOrderLinesImported: workOrderLinesCount.count ?? 0,
    invoicesImported: invoicesCount.count ?? 0,
    partsImported: partsCount.count ?? 0,
    linkageSummary: {
      linked: {
        vehiclesCustomerId: linkageCounters.vehiclesCustomerId,
        workOrdersCustomerId: linkageCounters.workOrdersCustomerId,
        workOrdersVehicleId: linkageCounters.workOrdersVehicleId,
        invoicesCustomerId: linkageCounters.invoicesCustomerId,
      },
      unresolved: {
        vehiclesCustomerId: unresolvedVehiclesMissingCustomer.count ?? 0,
        workOrdersCustomerId: unresolvedWorkOrdersMissingCustomer.count ?? 0,
        workOrdersVehicleId: unresolvedWorkOrdersMissingVehicle.count ?? 0,
        invoicesCustomerId: unresolvedInvoicesMissingCustomer.count ?? 0,
      },
    },
    partsPipeline: partsPipelineSummary,
    shopBuildSummary,
    canonicalMaterialization,
    rowResults: rowOutcome,
    completionState: effectiveCompletionState,
  };
}

async function upsertHistoryLine(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  intakeId: string;
  workOrderId: string;
  rowIndex: number;
  complaint: string | null;
  cause: string | null;
  correction: string | null;
  vehicle_id: string | null;
}): Promise<void> {
  const { supabase, shopId, intakeId, workOrderId, rowIndex, complaint, cause, correction, vehicle_id } =
    args;

  const external_id = `import:${intakeId}:wol:${workOrderId}:${rowIndex}`;

  const payload = {
    shop_id: shopId,
    work_order_id: workOrderId,
    vehicle_id,
    complaint: complaint ?? null,
    cause: cause ?? null,
    correction: correction ?? null,
    description: correction ?? complaint ?? "Imported history line",
    status: "completed",
    job_type: "repair",
    line_no: rowIndex,
    source_intake_id: intakeId,
    external_id,
    import_confidence: 0.78,
    import_notes: JSON.stringify({
      source: "shop_boost",
      source_intake_id: intakeId,
      external_id,
    }),
  } as DB["public"]["Tables"]["work_order_lines"]["Insert"];

  const { data: existing } = await supabase
    .from("work_order_lines")
    .select("id")
    .eq("shop_id", shopId)
    .eq("external_id", external_id)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    await supabase
      .from("work_order_lines")
      .update(payload as DB["public"]["Tables"]["work_order_lines"]["Update"])
      .eq("id", existing.id);
    return;
  }

  await supabase.from("work_order_lines").insert(payload);
  await recordImportCreatedArtifact({
    supabase,
    shopId,
    intakeId,
    domain: "work_order_line",
    recordId: payload.id,
  });
}

async function upsertInvoiceIfNeeded(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  intakeId: string;
  workOrderId: string;
  customer_id: string | null;
  total: number | null;
  labor: number | null;
  parts: number | null;
  issuedAt: string | null;
  invoiceNumber?: string | null;
  externalId?: string | null;
}): Promise<{ ok: boolean; invoiceId: string | null; errorReason: string | null }> {
  const { supabase, shopId, intakeId, workOrderId, customer_id, total, labor, parts, issuedAt, invoiceNumber, externalId } = args;

  const hasMoney = (total ?? 0) > 0 || (labor ?? 0) > 0 || (parts ?? 0) > 0;
  if (!hasMoney) return { ok: true, invoiceId: null, errorReason: null };

  const byExternal = externalId
    ? await supabase
        .from("invoices")
        .select("id")
        .eq("shop_id", shopId)
        .eq("external_id", externalId)
        .maybeSingle<{ id: string }>()
    : null;
  const byInvoiceNumber = invoiceNumber
    ? await supabase
        .from("invoices")
        .select("id")
        .eq("shop_id", shopId)
        .eq("invoice_number", invoiceNumber)
        .maybeSingle<{ id: string }>()
    : null;
  const byWorkOrder = await supabase
    .from("invoices")
    .select("id")
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .maybeSingle<{ id: string }>();

  const payload = {
    customer_id,
    status: "paid",
    subtotal: Math.max(0, (labor ?? 0) + (parts ?? 0)),
    labor_cost: labor ?? 0,
    parts_cost: parts ?? 0,
    total: total ?? Math.max(0, (labor ?? 0) + (parts ?? 0)),
    issued_at: issuedAt,
    paid_at: issuedAt,
    invoice_number: invoiceNumber ?? `IMP-${workOrderId.slice(0, 8)}`,
    currency: "USD",
    external_id: externalId ?? null,
    metadata: { imported: true, source_intake_id: intakeId },
  };

  const existingId = byExternal?.data?.id ?? byInvoiceNumber?.data?.id ?? byWorkOrder.data?.id ?? null;
  if (existingId) {
    const updateResult = await supabase
      .from("invoices")
      .update(payload as DB["public"]["Tables"]["invoices"]["Update"])
      .eq("shop_id", shopId)
      .eq("id", existingId);
    return {
      ok: !updateResult.error,
      invoiceId: existingId,
      errorReason: updateResult.error?.message ?? null,
    };
  }

  const inserted = await supabase
    .from("invoices")
    .insert({
      shop_id: shopId,
      work_order_id: workOrderId,
      ...payload,
    } as DB["public"]["Tables"]["invoices"]["Insert"])
    .select("id")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (inserted.error) {
    return { ok: false, invoiceId: null, errorReason: inserted.error.message ?? "invoice_insert_failed" };
  }

  await recordImportCreatedArtifact({
    supabase,
    shopId,
    intakeId,
    domain: "invoice",
    recordId: inserted.data?.id ?? null,
  });
  return { ok: true, invoiceId: inserted.data?.id ?? null, errorReason: null };
}
