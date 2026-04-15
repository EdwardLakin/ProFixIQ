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
  rowResults: {
    totalRows: number;
    processedRows: number;
    successCount: number;
    reviewCount: number;
    failedCount: number;
    byDomain: Record<string, { success: number; review: number; failed: number }>;
  };
  completionState: "COMPLETED_CLEAN" | "COMPLETED_WITH_REVIEW" | "PARTIAL_FAILURE";
};

type CsvRow = Record<string, string>;
type RowDomain = "customer" | "vehicle" | "part" | "work_order" | "invoice" | "history";
type MatchStatus = "matched_existing" | "created_new" | "partial_match" | "unmatched" | "invalid";
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

function norm(s: string): string {
  return (s ?? "").trim();
}

function lower(s: string): string {
  return norm(s).toLowerCase();
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
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

function toTokens(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = toTokens(a ?? "");
  const tb = toTokens(b ?? "");
  if (ta.size === 0 || tb.size === 0) return 0;
  return jaccardSimilarity(ta, tb);
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
    .map((l) => l.trim())
    .filter((l) => l.length);

  if (lines.length < 2) return { header: [], rows: [] };

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];

      if (ch === '"') {
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

  const header = splitLine(lines[0]).map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitLine(lines[i]);
    const rec: CsvRow = {};
    for (let c = 0; c < header.length; c += 1) {
      const key = header[c] || `col_${c + 1}`;
      rec[key] = cols[c] ?? "";
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
    const serviceName = pick(row, [/service/, /job name/, /operation/, /^name$/, /menu/]);
    const serviceDescription = pick(row, [/description/, /details/, /op description/, /note/]);
    const laborHours = parseLaborHours(pick(row, [/labor hours/, /hours/, /labor time/, /flat rate/]));
    const price = parseMoney(pick(row, [/price/, /retail/, /sell/, /menu price/]));

    if (serviceName) {
      const hasStructuredPricing = price !== null || laborHours !== null;
      const confidence = hasStructuredPricing ? 0.9 : 0.68;
      menu.push({
        title: serviceName,
        description: serviceDescription,
        price,
        laborHours,
        confidence,
        source: "service_catalog",
        uniqueKey: sha1(
          `svc|${normalizeText(serviceName)}|${String(price ?? "")}|${String(laborHours ?? "")}`,
        ).slice(0, 20),
      });
    }

    const templateName =
      pick(row, [/template/, /inspection name/, /checklist/, /form name/]) ??
      (pick(row, [/inspection type/, /inspection category/]) || null);
    const sectionName = pick(row, [/section/, /group/, /category/]) ?? "General";
    const itemName = pick(row, [/item/, /checkpoint/, /check item/, /question/, /point/]) ?? null;
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
}): Promise<void> {
  await (args.supabase as any).from("shop_boost_row_results").insert({
    shop_id: args.shopId,
    intake_id: args.intakeId,
    source_file: args.sourceFile,
    source_row_index: args.sourceRowIndex,
    raw_payload: args.rawPayload,
    normalized_payload: args.normalizedPayload,
    target_domain: args.targetDomain,
    match_status: args.matchStatus,
    match_confidence: confidenceScore(args.matchConfidence),
    match_details: args.matchDetails ?? {},
    error_reason: args.errorReason ?? null,
    review_required: args.reviewRequired,
  });
}

async function createReviewItem(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  intakeId: string;
  domain: RowDomain;
  issueType: "unmatched" | "conflict" | "invalid" | "missing_dependency";
  summary: string;
  rawPayload: Record<string, unknown>;
  suggestedMatches?: unknown;
}): Promise<void> {
  await (args.supabase as any).from("shop_boost_review_items").insert({
    shop_id: args.shopId,
    intake_id: args.intakeId,
    domain: args.domain,
    issue_type: args.issueType,
    summary: args.summary,
    raw_payload: args.rawPayload,
    suggested_matches: args.suggestedMatches ?? [],
    status: "pending",
  });
}

export async function runShopBoostImport(args: RunArgs): Promise<ShopBoostImportSummary> {
  const { shopId, intakeId } = args;
  const supabase = createAdminSupabase();

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
  const intakeBasics = isRecord((intakeRow as unknown as Record<string, unknown>).intake_basics)
    ? ((intakeRow as unknown as Record<string, unknown>).intake_basics as Record<string, unknown>)
    : {};
  const uploadManifest = isRecord(intakeBasics.uploadManifest)
    ? (intakeBasics.uploadManifest as UploadManifestRecord)
    : {};

  const [customersCsv, vehiclesCsv, partsCsv, historyCsv, staffCsv] = await Promise.all([
    downloadCsv(intakeRow.customers_file_path ?? null),
    downloadCsv(intakeRow.vehicles_file_path ?? null),
    downloadCsv(intakeRow.parts_file_path ?? null),
    downloadCsv(intakeRow.history_file_path ?? null),
    downloadCsv(intakeRow.staff_file_path ?? null),
  ]);

  const parsedCustomers = customersCsv ? parseCsv(customersCsv).rows : [];
  const parsedVehicles = vehiclesCsv ? parseCsv(vehiclesCsv).rows : [];
  const parsedParts = partsCsv ? parseCsv(partsCsv).rows : [];
  const parsedHistory = historyCsv ? parseCsv(historyCsv).rows : [];
  const totalRows = parsedCustomers.length + parsedVehicles.length + parsedParts.length + parsedHistory.length;

  const rowOutcome = {
    totalRows,
    processedRows: 0,
    successCount: 0,
    reviewCount: 0,
    failedCount: 0,
    byDomain: {
      customers: { success: 0, review: 0, failed: 0 },
      vehicles: { success: 0, review: 0, failed: 0 },
      parts: { success: 0, review: 0, failed: 0 },
      history: { success: 0, review: 0, failed: 0 },
    },
  };

  await Promise.all([
    (supabase as any).from("shop_boost_row_results").delete().eq("shop_id", shopId).eq("intake_id", intakeId),
    (supabase as any).from("shop_boost_review_items").delete().eq("shop_id", shopId).eq("intake_id", intakeId),
  ]);

  await stageSupplementalUploads({ shopId, intakeId, uploadManifest });
  const serviceCatalogCsv = await downloadCsv(uploadManifest.serviceCatalog?.path ?? null);
  const shopBuildSummary = await bridgeOperatingLayerFromCsv({
    supabase,
    shopId,
    intakeId,
    serviceCatalogCsv,
    historyCsv,
  });

  // Build caches (keep light: only key columns)
  const customersByEmail = new Map<string, string>();
  const customersByPhone = new Map<string, string>();
  const uniqueCustomersByEmail = new Map<string, string>();
  const uniqueCustomersByPhone = new Map<string, string>();
  const conflictingCustomerEmails = new Set<string>();
  const conflictingCustomerPhones = new Set<string>();
  const vehiclesByVin = new Map<string, string>();
  const vehiclesByPlate = new Map<string, string>();
  const staffByEmail = new Map<string, string>();
  const staffByName = new Map<string, string>();

  // Existing customers
  {
    const { data } = await supabase
      .from("customers")
      .select("id,email,phone,phone_number,shop_id")
      .eq("shop_id", shopId)
      .limit(5000);

    for (const r of data ?? []) {
      const rec = r as unknown as Record<string, unknown>;
      const email = normalizeEmail(String(rec.email ?? ""));
      const phone = normalizePhone(String(rec.phone ?? rec.phone_number ?? ""));
      const id = String(rec.id ?? "");
      if (email && id) customersByEmail.set(email, id);
      if (phone && id) customersByPhone.set(phone, id);
      addUniqueMatch(uniqueCustomersByEmail, conflictingCustomerEmails, email, id);
      addUniqueMatch(uniqueCustomersByPhone, conflictingCustomerPhones, phone, id);
    }
  }

  // Existing vehicles
  {
    const { data } = await supabase
      .from("vehicles")
      .select("id,vin,license_plate,shop_id")
      .eq("shop_id", shopId)
      .limit(5000);

    for (const r of data ?? []) {
      const rec = r as unknown as Record<string, unknown>;
      const vin = lower(String(rec.vin ?? ""));
      const plate = lower(String(rec.license_plate ?? ""));
      const id = String(rec.id ?? "");
      if (vin && id) vehiclesByVin.set(vin, id);
      if (plate && id) vehiclesByPlate.set(plate, id);
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
      const rec = r as unknown as Record<string, unknown>;
      const email = lower(String(rec.email ?? ""));
      const name = lower(String(rec.full_name ?? ""));
      const id = String(rec.id ?? "");
      if (email && id) staffByEmail.set(email, id);
      if (name && id) staffByName.set(name, id);
    }
  }

  let partsPipelineSummary: PartsPipelineSummary | undefined;

  // 1) Import customers
  if (parsedCustomers.length > 0) {
    const customerNames: Array<{ id: string; name: string }> = [];
    {
      const { data } = await supabase
        .from("customers")
        .select("id,name,first_name,last_name")
        .eq("shop_id", shopId)
        .limit(5000);
      for (const item of data ?? []) {
        const candidateName =
          String((item as Record<string, unknown>).name ?? "") ||
          `${String((item as Record<string, unknown>).first_name ?? "")} ${String((item as Record<string, unknown>).last_name ?? "")}`.trim();
        if (candidateName) customerNames.push({ id: String((item as Record<string, unknown>).id ?? ""), name: candidateName });
      }
    }

    for (let i = 0; i < parsedCustomers.length; i += 1) {
      const row = parsedCustomers[i];

      const email = lower(pick(row, [/^email$/, /e-mail/, /customer email/, /mail/]) ?? "");
      const phone = lower(pick(row, [/^phone$/, /phone number/, /mobile/, /cell/]) ?? "");

      const first = pick(row, [/^first/, /first name/]);
      const last = pick(row, [/^last/, /last name/]);
      const name =
        pick(row, [/^name$/, /customer name/]) ??
        [first ?? "", last ?? ""].filter(Boolean).join(" ");

      const business = pick(row, [/business/, /company/, /fleet/]);

      const isFleet = !!business || lower(pick(row, [/is fleet/, /fleet\?/]) ?? "") === "true";

      const external_id = `import:${intakeId}:customers:${sha1(
        `${email}|${phone}|${name}|${business ?? ""}`,
      ).slice(0, 16)}`;

      const existingId = (email && customersByEmail.get(email)) || (phone && customersByPhone.get(phone));
      const bestNameMatch = name
        ? customerNames
            .map((candidate) => ({ id: candidate.id, similarity: nameSimilarity(name, candidate.name) }))
            .sort((a, b) => b.similarity - a.similarity)[0]
        : null;

      if (!existingId && bestNameMatch && bestNameMatch.similarity >= 0.85) {
        await supabase
          .from("customers")
          .update({
            first_name: first ?? null,
            last_name: last ?? null,
            name: name || null,
            business_name: business ?? null,
            source_intake_id: intakeId,
            updated_at: new Date().toISOString(),
          } as DB["public"]["Tables"]["customers"]["Update"])
          .eq("id", bestNameMatch.id);

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
          normalizedPayload: { email, phone, name, business, isFleet },
          targetDomain: "customer",
          matchStatus: "matched_existing",
          matchConfidence: "medium",
          matchDetails: { customerId: bestNameMatch.id, strategy: "name_similarity", similarity: bestNameMatch.similarity },
          reviewRequired: false,
        });
        continue;
      }

      if (existingId) {
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
          normalizedPayload: { email, phone, name, business, isFleet },
          targetDomain: "customer",
          matchStatus: "matched_existing",
          matchConfidence: email || phone ? "high" : "medium",
          matchDetails: { customerId: existingId, strategy: email ? "email" : "phone" },
          reviewRequired: false,
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
          normalizedPayload: { email, phone, name, business, isFleet },
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
          if (email) customersByEmail.set(email, id);
          if (phone) customersByPhone.set(phone, id);
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
          normalizedPayload: { email, phone, name, business, isFleet },
          targetDomain: "customer",
          matchStatus: "created_new",
          matchConfidence: email || phone ? "high" : "medium",
          matchDetails: { customerId: id ?? null },
          reviewRequired: false,
        });
      } else {
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
          normalizedPayload: { email, phone, name, business, isFleet },
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
  if (parsedVehicles.length > 0) {
    for (let i = 0; i < parsedVehicles.length; i += 1) {
      const row = parsedVehicles[i];

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
      const customer_id =
        (custEmail && customersByEmail.get(custEmail)) ||
        (custPhone && customersByPhone.get(custPhone)) ||
        null;

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
          summary: "Vehicle could not be imported because customer was not confidently matched.",
          rawPayload: row,
          suggestedMatches: [{ customerEmail: custEmail || null, customerPhone: custPhone || null }],
        });
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "vehicles",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: { vin, plate, unit, year, make, model, custEmail, custPhone },
          targetDomain: "vehicle",
          matchStatus: "unmatched",
          matchConfidence: "low",
          errorReason: "missing_customer_match",
          reviewRequired: true,
        });
        continue;
      }

      const external_id = `import:${intakeId}:vehicles:${sha1(
        `${vin}|${plate}|${unit ?? ""}|${year ?? ""}`,
      ).slice(0, 16)}`;

      const existingId = (vin && vehiclesByVin.get(vin)) || (plate && vehiclesByPlate.get(plate));

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
          normalizedPayload: { vin, plate, unit, year, make, model, customer_id },
          targetDomain: "vehicle",
          matchStatus: "matched_existing",
          matchConfidence: vin ? "high" : "medium",
          matchDetails: { vehicleId: existingId, strategy: vin ? "vin" : "plate", customerId: customer_id },
          reviewRequired: false,
        });
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
          normalizedPayload: { vin, plate, unit, year, make, model, customer_id },
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
  if (partsCsv) {
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
  if (staffCsv) {
    const { rows } = parseCsv(staffCsv);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];

      // Handles messy headers because pick() normalizes keys with lower(trim)
      const fullName =
        pick(row, [
          /^full[_\s-]*name$/, // Full_Name, full_name, full-name, full name
          /^name$/,
          /employee name/,
          /staff name/,
        ]) ?? null;

      const emailRaw = pick(row, [/^email$/, /e-mail/, /mail/]);
      const email = emailRaw && emailRaw.includes("@") ? emailRaw.trim() : null;

      // ✅ ROLE PATCH (use schema enum + mapping, including accounting->admin)
      const roleRaw = pick(row, [/^role$/, /position/, /job/, /title/]);
      const role = normRole(roleRaw);

      // Skip totally empty rows
      if (!fullName && !email) continue;

      const notes = pick(row, [/reason/, /note/, /notes/, /comment/]) ?? "Imported from staff CSV";

      // Deterministic-ish external id to prevent duplicates on reruns
      const external_id = `import:${intakeId}:staff:${i + 1}:${sha1(
        `${fullName ?? ""}|${email ?? ""}|${role ?? ""}`,
      ).slice(0, 10)}`;

      const { error: staffInsErr } = await supabase.from("staff_invite_suggestions").upsert(
        {
          shop_id: shopId,
          intake_id: intakeId,
          role,
          full_name: fullName,
          email,
          count_suggested: 1,
          notes,
          external_id,
        } as unknown as DB["public"]["Tables"]["staff_invite_suggestions"]["Insert"],
        {
          onConflict: "shop_id,external_id",
        },
      );

      if (staffInsErr) {
        console.warn("[staff invite suggestions] upsert failed", staffInsErr);
      }
    }
  }

  // 5) Import history → completed work orders + lines (+ invoices if totals exist)
  if (parsedHistory.length > 0) {
    for (let i = 0; i < parsedHistory.length; i += 1) {
      const row = parsedHistory[i];

      const ro =
        pick(row, [/^ro$/, /ro number/, /work order/, /order number/, /invoice number/]) ?? null;

      const dateIso =
        parseDateIso(pick(row, [/date/, /service date/, /closed/, /completed/])) ??
        new Date().toISOString();

      const complaint = pick(row, [/complaint/, /concern/]);
      const cause = pick(row, [/cause/]);
      const correction = pick(row, [/correction/, /work performed/, /description/]);

      const total = parseMoney(pick(row, [/total/, /grand total/, /invoice total/]));
      const labor = parseMoney(pick(row, [/labor/, /labour/]));
      const parts = parseMoney(pick(row, [/parts/]));

      const vin = lower(pick(row, [/vin/]) ?? "");
      const plate = lower(pick(row, [/plate/, /license/]) ?? "");

      const customerEmail = normalizeEmail(pick(row, [/customer email/, /^email$/]));
      const customerPhone = normalizePhone(pick(row, [/customer phone/, /^phone$/]));
      const customerName = pick(row, [/customer name/, /^name$/]) ?? null;

      const customer_id =
        (customerEmail && customersByEmail.get(customerEmail)) ||
        (customerPhone && customersByPhone.get(customerPhone)) ||
        null;

      const vehicle_id =
        (vin && vehiclesByVin.get(vin)) || (plate && vehiclesByPlate.get(plate)) || null;

      if (!customer_id || !vehicle_id) {
        rowOutcome.processedRows += 1;
        rowOutcome.reviewCount += 1;
        rowOutcome.byDomain.history.review += 1;
        await createReviewItem({
          supabase,
          shopId,
          intakeId,
          domain: "work_order",
          issueType: "missing_dependency",
          summary: !customer_id
            ? "History row skipped because customer could not be matched."
            : "History row skipped because vehicle could not be matched.",
          rawPayload: row,
          suggestedMatches: [{ customerEmail, customerPhone, vin, plate }],
        });
        await insertRowResult({
          supabase,
          shopId,
          intakeId,
          sourceFile: "history",
          sourceRowIndex: i + 1,
          rawPayload: row,
          normalizedPayload: { ro, dateIso, customer_id, vehicle_id, vin, plate, total, labor, parts },
          targetDomain: "work_order",
          matchStatus: "unmatched",
          matchConfidence: "low",
          errorReason: !customer_id ? "missing_customer_match" : "missing_vehicle_match",
          reviewRequired: true,
        });
        continue;
      }

      const historyFingerprint = sha1(
        [
          ro ?? "",
          dateOnly(dateIso),
          vehicle_id ?? "",
          vin,
          plate,
          String(total ?? ""),
          normalizeText(correction ?? complaint ?? ""),
        ].join("|"),
      ).slice(0, 20);
      const external_id = `import:${intakeId}:history:${historyFingerprint}`;

      const { data: woByExternal } = await supabase
        .from("work_orders")
        .select("id")
        .eq("shop_id", shopId)
        .eq("external_id", external_id)
        .maybeSingle<{ id: string }>();

      if (!woByExternal?.id && vehicle_id && customer_id) {
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
        await supabase
          .from("work_orders")
          .update(woPayload as DB["public"]["Tables"]["work_orders"]["Update"])
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
          });

          continue;
        }
        continue;
      }

      const workOrderId = (woInserted ?? [])[0]?.id as string | undefined;
      if (!workOrderId) continue;

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

      await upsertInvoiceIfNeeded({
        supabase,
        shopId,
        intakeId,
        workOrderId,
        customer_id,
        total,
        labor,
        parts,
        issuedAt: dateIso,
      });
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
        normalizedPayload: { ro, dateIso, customer_id, vehicle_id, total, labor, parts },
        targetDomain: "work_order",
        matchStatus: woByExternal?.id ? "matched_existing" : "created_new",
        matchConfidence: "high",
        matchDetails: { workOrderId, customerId: customer_id, vehicleId: vehicle_id },
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

  // 6) Post-import linkage pass (safe, idempotent, shop-scoped)
  if (vehiclesCsv) {
    const { rows } = parseCsv(vehiclesCsv);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const email = normalizeEmail(pick(row, [/customer email/, /email/]));
      const phone = normalizePhone(pick(row, [/customer phone/, /phone/]));
      const matchedCustomerId =
        (email && !conflictingCustomerEmails.has(email) && uniqueCustomersByEmail.get(email)) ||
        (phone && !conflictingCustomerPhones.has(phone) && uniqueCustomersByPhone.get(phone)) ||
        null;

      if (!matchedCustomerId) continue;

      const vin = lower(pick(row, [/^vin$/, /vehicle vin/]) ?? "");
      const plate = lower(pick(row, [/plate/, /license/, /licence/]) ?? "");
      const unit = pick(row, [/unit/, /unit number/, /truck number/]);
      const year = parseIntSafe(pick(row, [/^year$/, /model year/]));
      const external_id = `import:${intakeId}:vehicles:${sha1(
        `${vin}|${plate}|${unit ?? ""}|${year ?? ""}`,
      ).slice(0, 16)}`;

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

  if (historyCsv) {
    const uniqueVehiclesByVin = new Map<string, string>();
    const uniqueVehiclesByPlate = new Map<string, string>();
    const conflictingVehicleVins = new Set<string>();
    const conflictingVehiclePlates = new Set<string>();
    const uniqueVehicleByCustomerId = new Map<string, string>();
    const conflictingVehicleCustomers = new Set<string>();

    const { data: vehiclesForLinkage } = await supabase
      .from("vehicles")
      .select("id,vin,license_plate,customer_id")
      .eq("shop_id", shopId)
      .limit(5000);

    for (const vehicle of vehiclesForLinkage ?? []) {
      const vehicleId = String(vehicle.id ?? "");
      const vin = lower(String(vehicle.vin ?? ""));
      const plate = lower(String(vehicle.license_plate ?? ""));
      const customerId = String(vehicle.customer_id ?? "");

      addUniqueMatch(uniqueVehiclesByVin, conflictingVehicleVins, vin, vehicleId);
      addUniqueMatch(uniqueVehiclesByPlate, conflictingVehiclePlates, plate, vehicleId);
      addUniqueMatch(uniqueVehicleByCustomerId, conflictingVehicleCustomers, customerId, vehicleId);
    }

    const { rows } = parseCsv(historyCsv);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const customerEmail = normalizeEmail(pick(row, [/customer email/, /^email$/]));
      const customerPhone = normalizePhone(pick(row, [/customer phone/, /^phone$/]));
      const matchedCustomerId =
        (customerEmail &&
          !conflictingCustomerEmails.has(customerEmail) &&
          uniqueCustomersByEmail.get(customerEmail)) ||
        (customerPhone &&
          !conflictingCustomerPhones.has(customerPhone) &&
          uniqueCustomersByPhone.get(customerPhone)) ||
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
      const vehicleIdFromVin =
        vin && !conflictingVehicleVins.has(vin) ? uniqueVehiclesByVin.get(vin) ?? null : null;
      const vehicleIdFromPlate =
        plate && !conflictingVehiclePlates.has(plate) ? uniqueVehiclesByPlate.get(plate) ?? null : null;
      const matchedVehicleId = vehicleIdFromVin || vehicleIdFromPlate || null;
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
      const external_id = `import:${intakeId}:history:${historyFingerprint}`;

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

  const prevBasics = isRecord((intakeRow as unknown as Record<string, unknown>).intake_basics)
    ? ((intakeRow as unknown as Record<string, unknown>).intake_basics as Record<string, unknown>)
    : {};
  const completionState: ShopBoostImportSummary["completionState"] =
    rowOutcome.failedCount > 0
      ? "PARTIAL_FAILURE"
      : rowOutcome.reviewCount > 0
        ? "COMPLETED_WITH_REVIEW"
        : "COMPLETED_CLEAN";

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
    ]);

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
            completionState,
          },
          shopBuildSummary,
          migrationProgress: {
            ...(isRecord(prevBasics.migrationProgress) ? prevBasics.migrationProgress : {}),
            total_rows: rowOutcome.totalRows,
            processed_rows: rowOutcome.processedRows,
            success_count: rowOutcome.successCount,
            review_count: rowOutcome.reviewCount,
            failed_count: rowOutcome.failedCount,
            domains: rowOutcome.byDomain,
            completionState,
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
    rowResults: rowOutcome,
    completionState,
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
}): Promise<void> {
  const { supabase, shopId, intakeId, workOrderId, customer_id, total, labor, parts, issuedAt } = args;

  const hasMoney = (total ?? 0) > 0 || (labor ?? 0) > 0 || (parts ?? 0) > 0;
  if (!hasMoney) return;

  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .maybeSingle<{ id: string }>();

  if (existing?.id) return;

  await supabase.from("invoices").insert({
    shop_id: shopId,
    work_order_id: workOrderId,
    customer_id,
    status: "paid",
    subtotal: Math.max(0, (labor ?? 0) + (parts ?? 0)),
    labor_cost: labor ?? 0,
    parts_cost: parts ?? 0,
    total: total ?? Math.max(0, (labor ?? 0) + (parts ?? 0)),
    issued_at: issuedAt,
    paid_at: issuedAt,
    invoice_number: `IMP-${workOrderId.slice(0, 8)}`,
    currency: "USD",
    metadata: { imported: true, source_intake_id: intakeId },
  } as DB["public"]["Tables"]["invoices"]["Insert"]);
}
