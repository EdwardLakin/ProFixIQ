// /features/integrations/ai/shopBoost.ts
import { randomUUID, createHash } from "crypto";

import { openai } from "lib/server/openai";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import type {
  ShopHealthSnapshot,
  ShopHealthTopRepair,
  ShopHealthComebackRisk,
  ShopHealthFleetMetric,
  ShopHealthTopTech,
  ShopHealthIssue,
  ShopHealthRecommendation,
  ShopHealthIssueSeverity,
} from "@/features/integrations/ai/shopBoostType";

type DB = Database;
type ShopBoostIntakeRow = DB["public"]["Tables"]["shop_boost_intakes"]["Row"];

const SHOP_IMPORT_BUCKET = "shop-imports";

// Batch size for inserting shop_import_rows (Supabase payload-safe)
const IMPORT_ROW_BATCH = 500;

type BuildShopBoostProfileOptions = {
  shopId: string;
  intakeId?: string;
};

export async function buildShopBoostProfile(
  opts: BuildShopBoostProfileOptions,
): Promise<ShopHealthSnapshot | null> {
  const supabase = createAdminSupabase();
  const { shopId, intakeId } = opts;

  const intakeQuery = supabase
    .from("shop_boost_intakes")
    .select("*")
    .eq("shop_id", shopId);

  const { data: intakeRow, error: intakeErr } = intakeId
    ? await intakeQuery.eq("id", intakeId).maybeSingle()
    : await intakeQuery
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .maybeSingle();

  if (intakeErr) {
    console.error("Error fetching intake", intakeErr);
    return null;
  }
  if (!intakeRow) {
    console.warn("No matching shop_boost_intakes found", { shopId, intakeId });
    return null;
  }
  if (intakeId && intakeRow.id !== intakeId) return null;

  const [customersCsv, vehiclesCsv, partsCsv] = await Promise.all([
    downloadCsvFile(supabase, intakeRow.customers_file_path),
    downloadCsvFile(supabase, intakeRow.vehicles_file_path),
    downloadCsvFile(supabase, intakeRow.parts_file_path),
  ]);

  // ✅ 1) Record import artifacts (files + rows) for overview view.
  // This is what powers v_shop_boost_overview import_file_count / import_row_count.
  const importStats = await recordImportArtifacts({
    supabase,
    intakeId: intakeRow.id,
    files: [
      { kind: "customers", storagePath: intakeRow.customers_file_path, csvText: customersCsv },
      { kind: "vehicles", storagePath: intakeRow.vehicles_file_path, csvText: vehiclesCsv },
      { kind: "parts", storagePath: intakeRow.parts_file_path, csvText: partsCsv },
    ],
  });

  const baseStats = await deriveStatsFromCsvs({ customersCsv, vehiclesCsv, partsCsv });
  const dbStats = await deriveStatsFromDatabase(supabase, shopId);
  const mergedStats = mergeStats(baseStats, dbStats);

  // ✅ 2) tech aggregation
  const topTechs = await deriveTopTechsFromDatabase(supabase, shopId);

  // AI snapshot (menus/inspections/narrative + repairs)
  const aiSnapshot = await generateSnapshotWithAI({
    shopId,
    intakeRow,
    mergedStats,
    topTechs,
  });

  if (!aiSnapshot) return null;

  // ✅ 3) issue heuristics
  const issuesDetected = detectIssues({
    intakeRow,
    mergedStats,
    topTechs,
    comebackRisks: aiSnapshot.comebackRisks,
  });

  // ✅ 4) actionable recommendations (tied to menus/inspections)
  const recommendations = buildRecommendations({
    intakeRow,
    mergedStats,
    issuesDetected,
    menuSuggestions: aiSnapshot.menuSuggestions,
    inspectionSuggestions: aiSnapshot.inspectionSuggestions,
  });

  // ✅ 5) deterministic scoring shape (matches ReportShopHealthPanel normalizeScores())
  const scoring = computeScores({
    intakeRow,
    mergedStats,
    aiSnapshot,
    issuesDetected,
    importStats,
  });

  // ✅ 6) Persist snapshot to DB (what v_shop_health_latest reads)
  const snapshotId = randomUUID();
  const snapshotCreatedAt = new Date().toISOString();

  const metrics = buildMetrics({
    intakeRow,
    mergedStats,
    topTechs,
    importStats,
  });

  const { error: snapErr } = await supabase.from("shop_health_snapshots").insert({
    id: snapshotId,
    shop_id: shopId,
    intake_id: intakeRow.id,
    period_start: null,
    period_end: null,
    metrics,
    scores: scoring,
    narrative_summary: aiSnapshot.narrativeSummary ?? null,
    created_at: snapshotCreatedAt,
  } as DB["public"]["Tables"]["shop_health_snapshots"]["Insert"]);

  if (snapErr) {
    console.error("[shopBoost] failed to insert shop_health_snapshots", snapErr);
    return null;
  }

  // ✅ 7) Persist suggestions (what v_shop_boost_suggestions reads)
  await persistSuggestions({
    supabase,
    shopId,
    intakeId: intakeRow.id,
    aiSnapshot,
    issuesDetected,
    mergedStats,
  });

  const snapshot: ShopHealthSnapshot = {
    ...aiSnapshot,
    topTechs,
    issuesDetected,
    recommendations,
  };

  // Upsert shop_ai_profiles (summary)
  const { error: aiProfileErr } = await supabase
    .from("shop_ai_profiles")
    .upsert(
      {
        shop_id: shopId,
        summary: snapshot.narrativeSummary,
        last_refreshed_at: new Date().toISOString(),
      } as DB["public"]["Tables"]["shop_ai_profiles"]["Insert"],
      { onConflict: "shop_id" },
    );

  if (aiProfileErr) console.error("Failed to upsert shop_ai_profiles", aiProfileErr);

  await logTrainingEvents(supabase, snapshot);

  const { error: updateIntakeErr } = await supabase
    .from("shop_boost_intakes")
    .update({ status: "completed", processed_at: new Date().toISOString() })
    .eq("id", intakeRow.id);

  if (updateIntakeErr) console.error("Failed to update intake status", updateIntakeErr);

  return snapshot;
}

/* -------------------------------------------------------------------------- */
/* Import artifacts: shop_import_files + shop_import_rows                      */
/* -------------------------------------------------------------------------- */

type ImportFileKind = "customers" | "vehicles" | "parts";

type ImportFileInput = {
  kind: ImportFileKind;
  storagePath: string | null;
  csvText: string | null;
};

type ImportStats = {
  fileCount: number;
  rowCount: number;
  byKind: Record<ImportFileKind, { rows: number; fileId: string | null }>;
};

async function recordImportArtifacts(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  intakeId: string;
  files: ImportFileInput[];
}): Promise<ImportStats> {
  const { supabase, intakeId, files } = args;

  const empty: ImportStats = {
    fileCount: 0,
    rowCount: 0,
    byKind: {
      customers: { rows: 0, fileId: null },
      vehicles: { rows: 0, fileId: null },
      parts: { rows: 0, fileId: null },
    },
  };

  const present = files.filter((f) => f.storagePath && f.csvText);
  if (present.length === 0) return empty;

  let fileCount = 0;
  let rowCount = 0;

  for (const f of present) {
    const csv = f.csvText ?? "";
    const rows = countCsvDataRows(csv);

    const fileId = randomUUID();
    const sha256 = hashSha256(csv);
    const originalFilename = f.storagePath ? basename(f.storagePath) : null;

    const { error: fileErr } = await supabase.from("shop_import_files").insert({
      id: fileId,
      intake_id: intakeId,
      kind: f.kind,
      storage_path: f.storagePath!,
      original_filename: originalFilename,
      sha256,
      parsed_row_count: rows,
      status: "completed",
    } as DB["public"]["Tables"]["shop_import_files"]["Insert"]);

    if (fileErr) {
      console.error("[shopBoost] failed to insert shop_import_files", f.kind, fileErr);
      // keep going; we still want snapshot
      continue;
    }

    fileCount += 1;
    rowCount += rows;
    empty.byKind[f.kind] = { rows, fileId };

    // Insert row-level raw data for row_counts aggregate + later parsing/ML.
    // We store raw row mapping: { <header>: <value>, ... }
    // normalized is left {} for now.
    const inserted = await insertImportRows({
      supabase,
      intakeId,
      fileId,
      entityType: f.kind,
      csv,
    });

    // If row insert failed, counts will be off — log and continue
    if (!inserted) {
      console.warn("[shopBoost] insertImportRows failed", { kind: f.kind, intakeId, fileId });
    }
  }

  return {
    fileCount,
    rowCount,
    byKind: empty.byKind,
  };
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function hashSha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function countCsvDataRows(csv: string): number {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length);

  // 0 or 1 line = header only
  if (lines.length < 2) return 0;
  return Math.max(0, lines.length - 1);
}

async function insertImportRows(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  intakeId: string;
  fileId: string;
  entityType: string;
  csv: string;
}): Promise<boolean> {
  const { supabase, intakeId, fileId, entityType, csv } = args;

  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length);

  if (lines.length < 2) return true;

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: DB["public"]["Tables"]["shop_import_rows"]["Insert"][] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const raw: Record<string, unknown> = {};
    for (let c = 0; c < header.length; c += 1) {
      const key = header[c] || `col_${c + 1}`;
      raw[key] = cols[c] ?? "";
    }

    rows.push({
      intake_id: intakeId,
      file_id: fileId,
      row_number: i,
      entity_type: entityType,
      raw,
      normalized: {},
      errors: [],
    } as DB["public"]["Tables"]["shop_import_rows"]["Insert"]);
  }

  // Batch insert
  for (let i = 0; i < rows.length; i += IMPORT_ROW_BATCH) {
    const batch = rows.slice(i, i + IMPORT_ROW_BATCH);
    const { error } = await supabase.from("shop_import_rows").insert(batch);
    if (error) {
      console.error("[shopBoost] failed inserting shop_import_rows batch", error);
      return false;
    }
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

async function downloadCsvFile(
  supabase: ReturnType<typeof createAdminSupabase>,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;

  const { data, error } = await supabase.storage.from(SHOP_IMPORT_BUCKET).download(path);

  if (error || !data) {
    console.error("Failed to download CSV", path, error);
    return null;
  }

  return data.text();
}

type CsvStatsInput = {
  customersCsv: string | null;
  vehiclesCsv: string | null;
  partsCsv: string | null;
};

type DerivedStats = {
  totalRepairOrders: number;
  totalRevenue: number;
  averageRo: number;
  mostCommonRepairs: ShopHealthTopRepair[];
  highValueRepairs: ShopHealthTopRepair[];
  comebackRisks: ShopHealthComebackRisk[];
  fleetMetrics: ShopHealthFleetMetric[];
};

function splitCsvLine(line: string): string[] {
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
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function headerLooksLikePersonField(h: string): boolean {
  return /(tech|technician|advisor|writer|service writer|employee|staff|name|customer|driver)/i.test(
    h,
  );
}

function headerLooksLikeRepairTextField(h: string): boolean {
  return /(complaint|concern|cause|correction|operation|op|job|service|work performed|work_performed|description|line)/i.test(
    h,
  );
}

function headerLooksLikeBadTextField(h: string): boolean {
  return /(phone|email|address|vin|plate|license|unit|stock|fleet|company|location|city|state|zip)/i.test(
    h,
  );
}

function chooseBestDescriptionColumn(headers: string[]): number {
  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < headers.length; i += 1) {
    const h = normHeader(headers[i]);
    if (!h) continue;

    if (headerLooksLikePersonField(h)) continue;
    if (headerLooksLikeBadTextField(h)) continue;

    let score = 0;

    if (/(line description|job description|work performed|description)/i.test(h)) score += 7;
    if (/(complaint|concern|cause|correction)/i.test(h)) score += 6;
    if (/(service|job|operation|op)/i.test(h)) score += 4;
    if (headerLooksLikeRepairTextField(h)) score += 2;

    if (/(note|notes|memo|comment)/i.test(h)) score -= 1;
    if (/(id|number|no\.|ro|invoice)/i.test(h)) score -= 2;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx === -1) {
    const loose = headers.findIndex((h) => /description|job|service/i.test(h));
    if (loose >= 0 && !headerLooksLikePersonField(headers[loose])) return loose;
    return headers.findIndex((h) => /description|job|service/i.test(h));
  }

  return bestIdx;
}

function chooseBestTotalColumn(headers: string[]): number {
  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < headers.length; i += 1) {
    const h = normHeader(headers[i]);
    if (!h) continue;

    let score = 0;
    if (/(grand total|invoice total|total)/i.test(h)) score += 6;
    if (/(line_total|line total|amount|price|extended)/i.test(h)) score += 4;
    if (/(labor|parts)/i.test(h)) score += 1;

    if (/(rate|tax|qty|quantity|cost)/i.test(h)) score -= 3;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function cleanDesc(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  const tokens = s.split(" ").filter(Boolean);
  if (tokens.length <= 2 && /^[a-zA-Z.'-]+$/.test(s)) return "General Repair";

  const stripped = s.replace(/^(tech|technician|advisor|writer)\s*[:\-]\s*/i, "").trim();
  if (!stripped) return "General Repair";

  return stripped.slice(0, 90);
}

async function deriveStatsFromCsvs(input: CsvStatsInput): Promise<DerivedStats> {
  const empty: DerivedStats = {
    totalRepairOrders: 0,
    totalRevenue: 0,
    averageRo: 0,
    mostCommonRepairs: [],
    highValueRepairs: [],
    comebackRisks: [],
    fleetMetrics: [],
  };

  if (!input.vehiclesCsv) return empty;

  const lines = input.vehiclesCsv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((line) => line.length);

  if (lines.length < 2) return empty;

  const header = splitCsvLine(lines[0]);
  const idxDescription = chooseBestDescriptionColumn(header);
  const idxTotal = chooseBestTotalColumn(header);

  const repairMap = new Map<string, { count: number; revenue: number }>();

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);

    const rawDesc = idxDescription >= 0 ? (cols[idxDescription] ?? "").trim() : "";
    const desc = cleanDesc(rawDesc || "General Repair");

    const rawTotal = idxTotal >= 0 ? (cols[idxTotal] ?? "0") : "0";
    const total = Number(String(rawTotal).replace(/[^0-9.]/g, "")) || 0;

    const existing = repairMap.get(desc) ?? { count: 0, revenue: 0 };
    existing.count += 1;
    existing.revenue += total;
    repairMap.set(desc, existing);
  }

  const mostCommonRepairs: ShopHealthTopRepair[] = Array.from(repairMap.entries())
    .map(([label, value]) => ({ label, count: value.count, revenue: value.revenue }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const highValueRepairs: ShopHealthTopRepair[] = [...mostCommonRepairs]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const totalRepairOrders = mostCommonRepairs.reduce((sum, r) => sum + r.count, 0);
  const totalRevenue = mostCommonRepairs.reduce((sum, r) => sum + r.revenue, 0);
  const averageRo = totalRepairOrders > 0 ? totalRevenue / totalRepairOrders : 0;

  return {
    totalRepairOrders,
    totalRevenue,
    averageRo,
    mostCommonRepairs,
    highValueRepairs,
    comebackRisks: [],
    fleetMetrics: [],
  };
}

async function deriveStatsFromDatabase(
  supabase: ReturnType<typeof createAdminSupabase>,
  shopId: string,
): Promise<DerivedStats> {
  void supabase;
  void shopId;

  return {
    totalRepairOrders: 0,
    totalRevenue: 0,
    averageRo: 0,
    mostCommonRepairs: [],
    highValueRepairs: [],
    comebackRisks: [],
    fleetMetrics: [],
  };
}

function mergeStats(a: DerivedStats, b: DerivedStats): DerivedStats {
  const totalRepairOrders = a.totalRepairOrders + b.totalRepairOrders;
  const totalRevenue = a.totalRevenue + b.totalRevenue;
  const averageRo = totalRepairOrders > 0 ? totalRevenue / totalRepairOrders : 0;

  return {
    totalRepairOrders,
    totalRevenue,
    averageRo,
    mostCommonRepairs: mergeRepairLists(a.mostCommonRepairs, b.mostCommonRepairs),
    highValueRepairs: mergeRepairLists(a.highValueRepairs, b.highValueRepairs),
    comebackRisks: [...a.comebackRisks, ...b.comebackRisks],
    fleetMetrics: [...a.fleetMetrics, ...b.fleetMetrics],
  };
}

function mergeRepairLists(a: ShopHealthTopRepair[], b: ShopHealthTopRepair[]): ShopHealthTopRepair[] {
  const map = new Map<string, ShopHealthTopRepair>();

  for (const item of [...a, ...b]) {
    const existing = map.get(item.label);
    if (!existing) map.set(item.label, { ...item });
    else {
      existing.count += item.count;
      existing.revenue += item.revenue;
    }
  }

  return Array.from(map.values())
    .sort((x, y) => y.count - x.count)
    .slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* ✅ Tech aggregation                                                         */
/* -------------------------------------------------------------------------- */

type SlimProfile = {
  id: string;
  full_name: string | null;
  role: string | null;
};

type InvoiceSlim = {
  id: string;
  tech_id: string | null;
  shop_id: string | null;
  total: number | null;
  created_at: string | null;
};

type TimecardSlim = {
  id: string;
  user_id: string | null;
  shop_id: string | null;
  hours_worked: number | null;
  clock_in: string | null;
};

function isTechRole(role: string | null): boolean {
  const r = (role ?? "").trim().toLowerCase();
  if (!r) return false;
  if (r === "tech" || r === "technician" || r === "mechanic") return true;
  if (r.includes("tech")) return true;
  if (r.includes("mechanic")) return true;
  return false;
}

async function deriveTopTechsFromDatabase(
  supabase: ReturnType<typeof createAdminSupabase>,
  shopId: string,
): Promise<ShopHealthTopTech[]> {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startIso = start.toISOString();
  const endIso = now.toISOString();

  const { data: profilesRes, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, shop_id")
    .eq("shop_id", shopId);

  if (profErr) {
    console.warn("[shopBoost] profiles error", profErr);
    return [];
  }

  const techProfiles: SlimProfile[] = (profilesRes ?? [])
    .map((p) => ({
      id: String(p.id),
      full_name: p.full_name ?? null,
      role: p.role ?? null,
    }))
    .filter((p) => isTechRole(p.role));

  const techIds = techProfiles.map((p) => p.id);
  if (techIds.length === 0) return [];

  const [invoicesRes, timecardsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, tech_id, shop_id, total, created_at")
      .eq("shop_id", shopId)
      .in("tech_id", techIds)
      .gte("created_at", startIso)
      .lt("created_at", endIso),

    supabase
      .from("payroll_timecards")
      .select("id, user_id, shop_id, hours_worked, clock_in")
      .eq("shop_id", shopId)
      .in("user_id", techIds)
      .gte("clock_in", startIso)
      .lt("clock_in", endIso),
  ]);

  if (invoicesRes.error) {
    console.warn("[shopBoost] invoices error", invoicesRes.error);
    return [];
  }
  if (timecardsRes.error) {
    console.warn("[shopBoost] timecards error", timecardsRes.error);
    return [];
  }

  const invoices = (invoicesRes.data ?? []) as unknown as InvoiceSlim[];
  const timecards = (timecardsRes.data ?? []) as unknown as TimecardSlim[];

  const byTech = new Map<string, ShopHealthTopTech>();

  for (const p of techProfiles) {
    byTech.set(p.id, {
      techId: p.id,
      name: p.full_name || "Unnamed tech",
      role: p.role,
      jobs: 0,
      revenue: 0,
      clockedHours: 0,
      revenuePerHour: 0,
    });
  }

  for (const inv of invoices) {
    if (!inv.tech_id) continue;
    const row = byTech.get(inv.tech_id);
    if (!row) continue;

    const total = Number(inv.total ?? 0);
    row.jobs += 1;
    row.revenue += Number.isFinite(total) ? total : 0;
  }

  for (const tc of timecards) {
    if (!tc.user_id) continue;
    const row = byTech.get(tc.user_id);
    if (!row) continue;

    const hours = Number(tc.hours_worked ?? 0);
    row.clockedHours += Number.isFinite(hours) ? hours : 0;
  }

  for (const row of byTech.values()) {
    row.revenuePerHour = row.clockedHours > 0 ? row.revenue / row.clockedHours : 0;
  }

  return Array.from(byTech.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

/* -------------------------------------------------------------------------- */
/* ✅ Issue heuristics                                                         */
/* -------------------------------------------------------------------------- */

function severityFromScore(n: number): ShopHealthIssueSeverity {
  if (n >= 80) return "high";
  if (n >= 50) return "medium";
  return "low";
}

function readQuestionnaireNumber(q: unknown, key: string): number | null {
  if (!q || typeof q !== "object") return null;
  const rec = q as Record<string, unknown>;
  const v = rec[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function detectIssues(args: {
  intakeRow: ShopBoostIntakeRow;
  mergedStats: DerivedStats;
  topTechs: ShopHealthTopTech[];
  comebackRisks: ShopHealthComebackRisk[];
}): ShopHealthIssue[] {
  const { intakeRow, mergedStats, comebackRisks } = args;

  const issues: ShopHealthIssue[] = [];
  const totalRos = mergedStats.totalRepairOrders || 0;
  const aro = mergedStats.averageRo || 0;

  // 1) Comebacks
  const comebackCount = (comebackRisks ?? []).reduce((sum, r) => sum + (r.count || 0), 0);
  const comebackRate = totalRos > 0 ? comebackCount / totalRos : 0;

  if (comebackCount >= 3 || comebackRate >= 0.05) {
    const score = Math.min(100, Math.round(comebackRate * 1000 + comebackCount * 6));
    issues.push({
      key: "comebacks",
      title: "Repeat issues / comeback risk",
      severity: severityFromScore(score),
      detail:
        "We’re seeing repeat patterns that can create comebacks and wasted bay time. Add a QC step + targeted inspections to catch it before delivery.",
      evidence:
        totalRos > 0
          ? `${comebackCount} repeat signals across ${totalRos} ROs (~${Math.round(comebackRate * 100)}%).`
          : `${comebackCount} repeat signals detected.`,
    });
  }

  // 2) Low ARO
  const specialty = (() => {
    const q = intakeRow.questionnaire as unknown;
    if (!q || typeof q !== "object") return "general";
    const rec = q as Record<string, unknown>;
    return typeof rec["specialty"] === "string" ? rec["specialty"] : "general";
  })();

  const targetAro =
    specialty === "hd" || specialty === "diesel" ? 700 : specialty === "mixed" ? 550 : 450;

  if (totalRos >= 15 && aro > 0 && aro < targetAro) {
    const gap = targetAro - aro;
    const score = Math.min(100, Math.round((gap / targetAro) * 120));
    issues.push({
      key: "low_aro",
      title: "Average RO looks low",
      severity: severityFromScore(score),
      detail:
        "Your average RO suggests missed packaged services. Build 2–3 menu packages around your most common repairs and attach an upsell inspection to lift ARO.",
      evidence: `ARO ${Math.round(aro)} vs target ~${targetAro} for ${specialty}.`,
    });
  }

  // 3) Bay imbalance
  const techCount = readQuestionnaireNumber(intakeRow.questionnaire, "techCount");
  const bayCount = readQuestionnaireNumber(intakeRow.questionnaire, "bayCount");

  if (techCount && bayCount && bayCount > 0) {
    const ratio = techCount / bayCount; // tech per bay
    if (ratio < 0.6 || ratio > 1.25) {
      const distance = ratio < 0.6 ? 0.6 - ratio : ratio - 1.25;
      const score = Math.min(100, Math.round(distance * 160));
      issues.push({
        key: "bay_imbalance",
        title: "Tech-to-bay imbalance",
        severity: severityFromScore(score),
        detail:
          "Your staffing ratio suggests either bays sitting idle or techs waiting on bays. Tighten dispatch rules and add a simple WIP board to keep bays loaded.",
        evidence: `${techCount} techs / ${bayCount} bays = ${ratio.toFixed(2)} tech per bay.`,
      });
    }
  }

  return issues;
}

/* -------------------------------------------------------------------------- */
/* ✅ Recommendations tied to menus + inspections                              */
/* -------------------------------------------------------------------------- */

function buildRecommendations(args: {
  intakeRow: ShopBoostIntakeRow;
  mergedStats: DerivedStats;
  issuesDetected: ShopHealthIssue[];
  menuSuggestions: ShopHealthSnapshot["menuSuggestions"];
  inspectionSuggestions: ShopHealthSnapshot["inspectionSuggestions"];
}): ShopHealthRecommendation[] {
  const { issuesDetected, menuSuggestions, inspectionSuggestions, mergedStats } = args;

  const recs: ShopHealthRecommendation[] = [];

  if ((menuSuggestions ?? []).length > 0) {
    recs.push({
      key: "publish_menus",
      title: "Publish your suggested menu packages",
      why: "These packages are the fastest way to standardize pricing, increase consistency, and lift ARO.",
      actionSteps: [
        "Review the top 3 suggested menus and adjust pricing/labor time to match your shop.",
        "Enable them as public/available services.",
        "Train advisors to attach one package per matching complaint.",
      ],
      expectedImpact: "Higher ARO + faster estimating + more consistent quoting.",
    });
  }

  if ((inspectionSuggestions ?? []).length > 0) {
    recs.push({
      key: "publish_inspections",
      title: "Attach an inspection to every RO type",
      why: "Inspections catch upsells early and reduce comebacks with consistent checks.",
      actionSteps: [
        "Pick 1–2 suggested inspections and make them default by vehicle/work type.",
        "Require a photo + note on any FAIL item to support approvals.",
        "Use the inspection results to auto-generate recommended services.",
      ],
      expectedImpact: "More approved work + fewer missed items + stronger documentation.",
    });
  }

  const hasComebacks = issuesDetected.some((i) => i.key === "comebacks");
  if (hasComebacks) {
    recs.push({
      key: "reduce_comebacks_qc",
      title: "Add a QC step to reduce comebacks",
      why: "Repeat issues waste bay time and destroy shop momentum. A lightweight QC step catches the misses.",
      actionSteps: [
        "Add a “Post-repair QC” mini inspection template (10–15 items).",
        "Require QC sign-off before invoice creation on high-risk jobs.",
        "Track repeat issues by category and tune the QC checklist monthly.",
      ],
      expectedImpact: "Lower comeback rate + fewer rechecks + better customer trust.",
    });
  }

  const hasLowAro = issuesDetected.some((i) => i.key === "low_aro");
  if (hasLowAro) {
    const topRepair = mergedStats.mostCommonRepairs?.[0]?.label ?? "your most common repairs";
    recs.push({
      key: "raise_aro_packages",
      title: "Lift ARO with 2–3 bundled packages",
      why: "Bundles turn frequent complaints into predictable, higher-value tickets without feeling pushy.",
      actionSteps: [
        `Create a package built around: ${topRepair}.`,
        "Add 1 complementary add-on (flush/diag/inspection) as a default suggestion.",
        "Make advisors pick: Basic / Standard / Premium options.",
      ],
      expectedImpact: "Higher ARO + clearer options for customers + easier approvals.",
    });
  }

  const hasImbalance = issuesDetected.some((i) => i.key === "bay_imbalance");
  if (hasImbalance) {
    recs.push({
      key: "dispatch_balance",
      title: "Tighten dispatch rules to keep bays loaded",
      why: "When bays and tech capacity don’t match, work gets stuck in WIP and cycle time explodes.",
      actionSteps: [
        "Add a simple WIP board: Waiting, In Progress, Waiting Parts, Waiting Approval, Done.",
        "Set a rule: no job sits in Waiting Approval more than 2 hours (advisor follow-up).",
        "Use tech punch + job status to auto-surface blocked work.",
      ],
      expectedImpact: "Shorter cycle time + better utilization + less idle time.",
    });
  }

  return recs.slice(0, 6);
}

/* -------------------------------------------------------------------------- */
/* ✅ Metrics + scoring (DB writes)                                            */
/* -------------------------------------------------------------------------- */

function buildMetrics(args: {
  intakeRow: ShopBoostIntakeRow;
  mergedStats: DerivedStats;
  topTechs: ShopHealthTopTech[];
  importStats: ImportStats;
}): Record<string, unknown> {
  const { intakeRow, mergedStats, topTechs, importStats } = args;

  const specialty = (() => {
    const q = intakeRow.questionnaire as unknown;
    if (!q || typeof q !== "object") return "general";
    const rec = q as Record<string, unknown>;
    return typeof rec["specialty"] === "string" ? rec["specialty"] : "general";
  })();

  return {
    specialty,
    import: {
      fileCount: importStats.fileCount,
      rowCount: importStats.rowCount,
      byKind: importStats.byKind,
    },
    history: {
      totalRepairOrders: mergedStats.totalRepairOrders,
      totalRevenue: mergedStats.totalRevenue,
      averageRo: mergedStats.averageRo,
      mostCommonRepairs: mergedStats.mostCommonRepairs,
      highValueRepairs: mergedStats.highValueRepairs,
    },
    topTechs,
    generatedAt: new Date().toISOString(),
  };
}

function computeScores(args: {
  intakeRow: ShopBoostIntakeRow;
  mergedStats: DerivedStats;
  aiSnapshot: ShopHealthSnapshot;
  issuesDetected: ShopHealthIssue[];
  importStats: ImportStats;
}): Record<string, unknown> {
  const { intakeRow, mergedStats, aiSnapshot, issuesDetected, importStats } = args;

  const hasVehicles = importStats.byKind.vehicles.rows > 0;
  const hasCustomers = importStats.byKind.customers.rows > 0;
  const hasParts = importStats.byKind.parts.rows > 0;

  // Completeness: vehicles history is the backbone; customers/parts improve confidence
  const completenessBase = hasVehicles ? 0.6 : 0;
  const completenessBonus = (hasCustomers ? 0.2 : 0) + (hasParts ? 0.2 : 0);
  const completeness = clamp01(completenessBase + completenessBonus);

  // History volume: scale by number of ROs (cap at 1)
  // 0..200 ROs -> 0..1
  const hv = clamp01((mergedStats.totalRepairOrders || 0) / 200);

  // Classification: if AI returned menuSuggestions + inspectionSuggestions, treat as higher confidence
  const menuCount = (aiSnapshot.menuSuggestions ?? []).length;
  const inspCount = (aiSnapshot.inspectionSuggestions ?? []).length;
  const classification = clamp01(hasVehicles ? 0.35 + Math.min(0.65, (menuCount + inspCount) * 0.08) : 0);

  // Risk: higher is worse in your UI (invertTone for risk bar)
  // We map detected issues into a 0..1 "risk" where comebacks + low_aro + imbalance raise it.
  const riskSignals = issuesDetected.reduce((sum, i) => {
    if (i.key === "comebacks") return sum + 0.5;
    if (i.key === "low_aro") return sum + 0.3;
    if (i.key === "bay_imbalance") return sum + 0.2;
    return sum + 0.1;
  }, 0);
  const risk = clamp01(riskSignals);

  // Overall: weighted, risk subtracts
  const overall = clamp01(
    completeness * 0.35 + hv * 0.25 + classification * 0.25 + (1 - risk) * 0.15,
  );

  const specialty = (() => {
    const q = intakeRow.questionnaire as unknown;
    if (!q || typeof q !== "object") return "general";
    const rec = q as Record<string, unknown>;
    return typeof rec["specialty"] === "string" ? rec["specialty"] : "general";
  })();

  return {
    overall: round2(overall),
    risk: round2(risk),
    components: {
      completeness: {
        score: round2(completeness),
        note: hasVehicles
          ? `Vehicles history present${hasCustomers ? ", customers present" : ""}${hasParts ? ", parts present" : ""}.`
          : "No vehicles history detected.",
      },
      historyVolume: {
        score: round2(hv),
        note: `Based on ${mergedStats.totalRepairOrders || 0} repair orders.`,
      },
      classification: {
        score: round2(classification),
        note: `Derived from suggestions generated (menus: ${menuCount}, inspections: ${inspCount}).`,
      },
    },
    meta: {
      specialty,
      import_row_count: importStats.rowCount,
      import_file_count: importStats.fileCount,
    },
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* ✅ Persist suggestions                                                       */
/* -------------------------------------------------------------------------- */

async function persistSuggestions(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  intakeId: string;
  aiSnapshot: ShopHealthSnapshot;
  issuesDetected: ShopHealthIssue[];
  mergedStats: DerivedStats;
}): Promise<void> {
  const { supabase, shopId, intakeId, aiSnapshot } = args;

  // Menu suggestions -> menu_item_suggestions (title column)
  const menuInserts: DB["public"]["Tables"]["menu_item_suggestions"]["Insert"][] = (
    aiSnapshot.menuSuggestions ?? []
  ).map((m) => ({
    shop_id: shopId,
    intake_id: intakeId,
    title: m.name ?? "Suggested menu item",
    category: null,
    price_suggestion: Number.isFinite(Number(m.recommendedPrice)) ? Number(m.recommendedPrice) : null,
    labor_hours_suggestion: Number.isFinite(Number(m.estimatedLaborHours))
      ? Number(m.estimatedLaborHours)
      : null,
    confidence: 0.75,
    reason: m.description ?? null,
  })) as DB["public"]["Tables"]["menu_item_suggestions"]["Insert"][];

  if (menuInserts.length > 0) {
    const { error } = await supabase.from("menu_item_suggestions").insert(menuInserts);
    if (error) console.error("[shopBoost] failed inserting menu_item_suggestions", error);
  }

  // Inspection suggestions -> inspection_template_suggestions
  const inspInserts: DB["public"]["Tables"]["inspection_template_suggestions"]["Insert"][] = (
    aiSnapshot.inspectionSuggestions ?? []
  ).map((i) => ({
    shop_id: shopId,
    intake_id: intakeId,
    template_key: null,
    name: i.name ?? "Suggested inspection",
    items: { note: i.note ?? null, usageContext: i.usageContext ?? null },
    applies_to:
      i.usageContext === "fleet" ? "fleet" : i.usageContext === "retail" ? "retail" : "both",
    confidence: 0.8,
  })) as DB["public"]["Tables"]["inspection_template_suggestions"]["Insert"][];

  if (inspInserts.length > 0) {
    const { error } = await supabase.from("inspection_template_suggestions").insert(inspInserts);
    if (error) console.error("[shopBoost] failed inserting inspection_template_suggestions", error);
  }

  // Staff suggestions: keep deterministic + small. (You can upgrade this later.)
  // We propose at least 1 advisor + 1 tech if none exist, based on questionnaire counts if present.
  const staffSuggested: Array<{ role: string; count: number; notes: string | null }> = [];

  const q = aiSnapshot ? (aiSnapshot as unknown) : null;
  void q;

  staffSuggested.push({
    role: "advisor",
    count: 1,
    notes: "Recommended to assign an advisor to own approvals + dispatch.",
  });
  staffSuggested.push({
    role: "tech",
    count: 1,
    notes: "Recommended to add at least one technician account for timecards and attribution.",
  });

  const staffInserts: DB["public"]["Tables"]["staff_invite_suggestions"]["Insert"][] =
    staffSuggested.map((s) => ({
      shop_id: shopId,
      intake_id: intakeId,
      role: s.role,
      count_suggested: s.count,
      notes: s.notes,
    })) as DB["public"]["Tables"]["staff_invite_suggestions"]["Insert"][];

  const { error: staffErr } = await supabase.from("staff_invite_suggestions").insert(staffInserts);
  if (staffErr) console.error("[shopBoost] failed inserting staff_invite_suggestions", staffErr);
}

/* -------------------------------------------------------------------------- */
/* AI snapshot generation                                                      */
/* -------------------------------------------------------------------------- */

type GenerateSnapshotArgs = {
  shopId: string;
  intakeRow: ShopBoostIntakeRow;
  mergedStats: DerivedStats;
  topTechs: ShopHealthTopTech[];
};

async function generateSnapshotWithAI(
  args: GenerateSnapshotArgs,
): Promise<ShopHealthSnapshot | null> {
  const { shopId, intakeRow, mergedStats, topTechs } = args;

  const systemPrompt =
    "You are an assistant that helps configure an auto and heavy-duty repair shop management system. " +
    "Return ONLY valid JSON, no markdown, no commentary.";

  const shapeExample = {
    shopId: "<string>",
    timeRangeDescription: "<string>",
    totalRepairOrders: 0,
    totalRevenue: 0,
    averageRo: 0,
    mostCommonRepairs: [{ label: "<string>", count: 0, revenue: 0, averageLaborHours: 0 }],
    highValueRepairs: [{ label: "<string>", count: 0, revenue: 0, averageLaborHours: 0 }],
    comebackRisks: [{ label: "<string>", count: 0, estimatedLostHours: 0, note: "<string>" }],
    fleetMetrics: [{ label: "<string>", value: 0, unit: "<string|null>", note: "<string|null>" }],
    menuSuggestions: [
      {
        id: "<uuid-string>",
        name: "<string>",
        description: "<string>",
        targetVehicleYmm: "<string|null>",
        estimatedLaborHours: 0,
        recommendedPrice: 0,
        basedOnJobs: ["<string>"],
      },
    ],
    inspectionSuggestions: [
      { id: "<uuid-string>", name: "<string>", usageContext: "retail", note: "<string>" },
    ],
    narrativeSummary:
      "<short paragraph summarizing what this shop is good at, and 2–3 clear next steps>",
  };

  const userPrompt = [
    "Return ONLY valid JSON with this exact shape (keys and types):",
    JSON.stringify(shapeExample, null, 2),
    "",
    "Questionnaire answers:",
    JSON.stringify(intakeRow.questionnaire ?? {}, null, 2),
    "",
    "Aggregate stats (from history):",
    JSON.stringify(mergedStats, null, 2),
    "",
    "Top techs (from invoices/timecards):",
    JSON.stringify(topTechs, null, 2),
    "",
    "Rules:",
    "- Repair labels should be customer-friendly and not person names.",
    "- Menus and inspections should reflect the most common repairs.",
  ].join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<ShopHealthSnapshot>;

    const menuSuggestions = (parsed.menuSuggestions ?? []).map((m) => ({
      ...m,
      id: m.id && m.id !== "<uuid-string>" ? m.id : randomUUID(),
    }));

    const inspectionSuggestions = (parsed.inspectionSuggestions ?? []).map((i) => ({
      ...i,
      id: i.id && i.id !== "<uuid-string>" ? i.id : randomUUID(),
    }));

    const snapshotBase: ShopHealthSnapshot = {
      shopId,
      timeRangeDescription: parsed.timeRangeDescription ?? "Recent history",
      totalRepairOrders: parsed.totalRepairOrders ?? mergedStats.totalRepairOrders,
      totalRevenue: parsed.totalRevenue ?? mergedStats.totalRevenue,
      averageRo: parsed.averageRo ?? mergedStats.averageRo,
      mostCommonRepairs: parsed.mostCommonRepairs ?? mergedStats.mostCommonRepairs,
      highValueRepairs: parsed.highValueRepairs ?? mergedStats.highValueRepairs,
      comebackRisks: parsed.comebackRisks ?? [],
      fleetMetrics: parsed.fleetMetrics ?? [],
      menuSuggestions,
      inspectionSuggestions,
      narrativeSummary: parsed.narrativeSummary ?? "No summary yet.",

      topTechs: [],
      issuesDetected: [],
      recommendations: [],
    };

    return snapshotBase;
  } catch (err) {
    console.error("Error generating snapshot", err);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Training logs                                                               */
/* -------------------------------------------------------------------------- */

async function logTrainingEvents(
  supabase: ReturnType<typeof createAdminSupabase>,
  snapshot: ShopHealthSnapshot,
): Promise<void> {
  const content = ["Shop Health Snapshot:", JSON.stringify(snapshot, null, 2)].join("\n");

  const { data: eventRows, error: eventErr } = await supabase
    .from("ai_training_events")
    .insert({
      source: "shop_boost",
      shop_id: snapshot.shopId,
      vehicle_ymm: null,
      payload: snapshot,
    })
    .select("id")
    .limit(1);

  if (eventErr) {
    console.error("Failed to insert ai_training_events", eventErr);
    return;
  }

  const first = (eventRows ?? [])[0] as { id?: string } | undefined;
  const sourceEventId = first?.id;
  if (!sourceEventId) return;

  const { error: trainingErr } = await supabase.from("ai_training_data").insert({
    shop_id: snapshot.shopId,
    source_event_id: sourceEventId,
    content,
    embedding: null,
  });

  if (trainingErr) {
    console.error("Failed to insert ai_training_data", trainingErr);
  }
}