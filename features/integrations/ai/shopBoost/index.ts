// features/integrations/ai/shopBoost/index.ts
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { parseCsvText } from "./csv";
import {
  classifyJobTypeScopeBatch,
  type JobClassificationInput,
  type JobClassificationResult,
} from "./classifyJobTypeScope";
import { computeShopHealthScores, type ShopHealthScoringInput } from "./healthScoring";
import type { ShopHealthSnapshot } from "@/features/integrations/ai/shopBoostType";

type DB = Database;

const SHOP_IMPORT_BUCKET = "shop-imports";

type BuildArgs = {
  shopId: string;
  intakeId: string;
  // Optional from intake or passed from route
  questionnaire?: unknown;
};

type IntakeRow = DB["public"]["Tables"]["shop_boost_intakes"]["Row"];

function nowIso() {
  return new Date().toISOString();
}

function safeNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function pickFirstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    const s = normStr(v);
    if (s) return s;
  }
  return "";
}

function toLowerKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.trim().toLowerCase()] = v;
  }
  return out;
}

function getTextColumns(row: Record<string, unknown>) {
  const complaint = pickFirstNonEmpty(
    row["complaint"],
    row["customer_complaint"],
    row["concern"],
    row["symptom"],
  );
  const cause = pickFirstNonEmpty(row["cause"], row["root_cause"]);
  const correction = pickFirstNonEmpty(
    row["correction"],
    row["repair"],
    row["fix"],
    row["resolution"],
  );
  const description = pickFirstNonEmpty(
    row["description"],
    row["job_description"],
    row["line_description"],
    row["service"],
    row["op_description"],
  );

  return { complaint, cause, correction, description };
}

function guessDate(row: Record<string, unknown>): string | null {
  const raw = pickFirstNonEmpty(
    row["date"],
    row["ro_date"],
    row["repair_order_date"],
    row["created_at"],
    row["opened_at"],
    row["invoice_date"],
  );
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function guessTotals(row: Record<string, unknown>) {
  const laborHours =
    safeNum(row["labor_hours"]) ??
    safeNum(row["hours"]) ??
    safeNum(row["billed_hours"]) ??
    null;

  const laborTotal =
    safeNum(row["labor_total"]) ??
    safeNum(row["labor_amount"]) ??
    safeNum(row["labor"]) ??
    null;

  const partsTotal =
    safeNum(row["parts_total"]) ??
    safeNum(row["parts_amount"]) ??
    safeNum(row["parts"]) ??
    null;

  const total =
    safeNum(row["total"]) ??
    safeNum(row["grand_total"]) ??
    safeNum(row["invoice_total"]) ??
    (laborTotal !== null || partsTotal !== null ? (laborTotal ?? 0) + (partsTotal ?? 0) : null);

  const techName = pickFirstNonEmpty(
    row["technician"],
    row["tech"],
    row["tech_name"],
    row["advisor"],
    row["writer"],
  );

  return { laborHours, laborTotal, partsTotal, total, techName };
}

async function downloadCsvIfPresent(path: string | null) {
  if (!path) return null;
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.storage.from(SHOP_IMPORT_BUCKET).download(path);

  if (error || !data) {
    throw new Error(`Failed to download CSV: ${path} (${error?.message ?? "no data"})`);
  }
  const text = await data.text();
  return text;
}

async function loadIntake(shopId: string, intakeId: string): Promise<IntakeRow> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("shop_boost_intakes")
    .select("*")
    .eq("shop_id", shopId)
    .eq("id", intakeId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`shop_boost_intakes not found (${shopId}/${intakeId}) ${error?.message ?? ""}`);
  }
  return data as IntakeRow;
}

async function updateIntakeStatus(
  shopId: string,
  intakeId: string,
  status: "pending" | "processing" | "complete" | "failed",
  extra?: { processed_at?: string | null; error?: string | null },
) {
  const supabase = createAdminSupabase();
  await supabase
    .from("shop_boost_intakes")
    .update({
      status,
      processed_at: extra?.processed_at ?? (status === "complete" ? nowIso() : null),
      error: extra?.error ?? null,
    } as Partial<DB["public"]["Tables"]["shop_boost_intakes"]["Update"]>)
    .eq("shop_id", shopId)
    .eq("id", intakeId);
}

/**
 * MAIN PIPELINE
 * - Reads intake + CSVs
 * - Stores import rows
 * - Classifies job type/scope for RO-like rows
 * - Computes health scoring
 * - Writes shop_health_snapshots + suggestions + work_order_line_ai
 * - Returns a ShopHealthSnapshot-compatible object for the demo UI
 */
export async function buildShopBoostProfile(args: BuildArgs): Promise<ShopHealthSnapshot> {
  const { shopId, intakeId } = args;
  const supabase = createAdminSupabase();

  await updateIntakeStatus(shopId, intakeId, "processing");

  try {
    const intake = await loadIntake(shopId, intakeId);

    const questionnaire = args.questionnaire ?? intake.questionnaire ?? {};
    const customersText = await downloadCsvIfPresent(intake.customers_file_path ?? null);
    const vehiclesText = await downloadCsvIfPresent(intake.vehicles_file_path ?? null);
    const partsText = await downloadCsvIfPresent(intake.parts_file_path ?? null);

    const customersRows = customersText ? parseCsvText(customersText) : [];
    const vehiclesRows = vehiclesText ? parseCsvText(vehiclesText) : [];
    const partsRows = partsText ? parseCsvText(partsText) : [];

    // ---------------------------------------------------------------------
    // 1) STORE IMPORT FILE METADATA
    // ---------------------------------------------------------------------
    const filesToInsert: Array<DB["public"]["Tables"]["shop_import_files"]["Insert"]> = [];

    if (intake.customers_file_path) {
      filesToInsert.push({
        shop_id: shopId,
        intake_id: intakeId,
        kind: "customers",
        storage_path: intake.customers_file_path,
        row_count: customersRows.length,
      } as unknown as DB["public"]["Tables"]["shop_import_files"]["Insert"]);
    }
    if (intake.vehicles_file_path) {
      filesToInsert.push({
        shop_id: shopId,
        intake_id: intakeId,
        kind: "vehicles",
        storage_path: intake.vehicles_file_path,
        row_count: vehiclesRows.length,
      } as unknown as DB["public"]["Tables"]["shop_import_files"]["Insert"]);
    }
    if (intake.parts_file_path) {
      filesToInsert.push({
        shop_id: shopId,
        intake_id: intakeId,
        kind: "parts",
        storage_path: intake.parts_file_path,
        row_count: partsRows.length,
      } as unknown as DB["public"]["Tables"]["shop_import_files"]["Insert"]);
    }

    if (filesToInsert.length) {
      await supabase.from("shop_import_files").insert(filesToInsert);
    }

    // ---------------------------------------------------------------------
    // 2) STORE IMPORT ROWS (sampled to avoid huge payloads in demo)
    // ---------------------------------------------------------------------
    const MAX_STORE = 800;

    const makeImportRows = (kind: "customers" | "vehicles" | "parts", rows: Record<string, unknown>[]) => {
      return rows.slice(0, MAX_STORE).map((raw, idx) => ({
        shop_id: shopId,
        intake_id: intakeId,
        kind,
        row_index: idx,
        raw,
      }));
    };

    const importRowsToInsert: Array<DB["public"]["Tables"]["shop_import_rows"]["Insert"]> = [
      ...makeImportRows("customers", customersRows),
      ...makeImportRows("vehicles", vehiclesRows),
      ...makeImportRows("parts", partsRows),
    ] as unknown as Array<DB["public"]["Tables"]["shop_import_rows"]["Insert"]>;

    if (importRowsToInsert.length) {
      await supabase.from("shop_import_rows").insert(importRowsToInsert);
    }

    // ---------------------------------------------------------------------
    // 3) BUILD “WORK ORDER LINE CANDIDATES” from vehiclesRows (RO history)
    // ---------------------------------------------------------------------
    const lineCandidates: JobClassificationInput[] = vehiclesRows
      .slice(0, 1200)
      .map((r, idx) => {
        const row = toLowerKeys(r);
        const { complaint, cause, correction, description } = getTextColumns(row);
        const { laborHours, laborTotal, partsTotal, total, techName } = guessTotals(row);
        const dt = guessDate(row);

        const joinedText = [complaint, cause, correction, description].filter(Boolean).join(" | ");

        return {
          key: `row:${idx}`,
          occurredAt: dt,
          vehicle: {
            year: safeNum(row["year"]) ?? safeNum(row["vehicle_year"]) ?? null,
            make: normStr(row["make"] ?? row["vehicle_make"]),
            model: normStr(row["model"] ?? row["vehicle_model"]),
            vin: normStr(row["vin"] ?? row["vehicle_vin"]),
          },
          text: {
            complaint,
            cause,
            correction,
            description,
            joined: joinedText,
          },
          totals: {
            laborHours,
            laborTotal,
            partsTotal,
            total,
          },
          techName: techName || null,
          raw: row,
        };
      })
      .filter((x) => x.text.joined.length > 0);

    // ---------------------------------------------------------------------
    // 4) CLASSIFY JOB TYPE + SCOPE
    // ---------------------------------------------------------------------
    const specialty =
      typeof questionnaire === "object" &&
      questionnaire !== null &&
      "specialty" in questionnaire &&
      typeof (questionnaire as Record<string, unknown>).specialty === "string"
        ? String((questionnaire as Record<string, unknown>).specialty)
        : "general";

    const classifications: JobClassificationResult[] = await classifyJobTypeScopeBatch(lineCandidates, {
      shopSpecialty: specialty,
    });

    // Persist top N classifications for the demo (keeps DB lean)
    const MAX_AI_LINES = 600;
    const aiLinesToInsert = classifications
      .slice(0, MAX_AI_LINES)
      .map((c) => {
        return {
          shop_id: shopId,
          intake_id: intakeId,
          work_order_id: null,
          work_order_line_id: null,
          source_key: c.key,
          job_type: c.jobType,
          job_scope: c.jobScope,
          confidence: c.confidence,
          signals: c.signals,
          occurred_at: c.occurredAt,
          totals: c.totals,
        };
      }) as unknown as Array<DB["public"]["Tables"]["work_order_line_ai"]["Insert"]>;

    if (aiLinesToInsert.length) {
      await supabase.from("work_order_line_ai").insert(aiLinesToInsert);
    }

    // ---------------------------------------------------------------------
    // 5) HEALTH SCORING + SNAPSHOT METRICS
    // ---------------------------------------------------------------------
    const scoringInput: ShopHealthScoringInput = {
      shopId,
      intakeId,
      questionnaire,
      customersRows,
      vehiclesRows,
      partsRows,
      classifiedLines: classifications,
    };

    const scored = computeShopHealthScores(scoringInput);

    const snapshotInsert = {
      shop_id: shopId,
      intake_id: intakeId,
      period_start: scored.periodStart,
      period_end: scored.periodEnd,
      metrics: scored.metrics,
      scores: scored.scores,
      narrative_summary: scored.narrativeSummary,
    } as unknown as DB["public"]["Tables"]["shop_health_snapshots"]["Insert"];

    const { data: snapshotRow, error: snapErr } = await supabase
      .from("shop_health_snapshots")
      .insert(snapshotInsert)
      .select("id")
      .single();

    if (snapErr) {
      throw new Error(`Failed to write shop_health_snapshots: ${snapErr.message}`);
    }

    // ---------------------------------------------------------------------
    // 6) SUGGESTIONS (menu + inspections + staff invites)
    // ---------------------------------------------------------------------
    const menu = scored.suggestions.menuItems.map((m) => ({
      shop_id: shopId,
      intake_id: intakeId,
      title: m.name,
      category: m.category ?? null,
      price_suggestion: m.recommendedPrice,
      labor_hours_suggestion: m.estimatedLaborHours,
      confidence: m.confidence,
      reason: m.reason ?? null,
      based_on: m.basedOnJobs,
    }));

    const inspections = scored.suggestions.inspections.map((i) => ({
      shop_id: shopId,
      intake_id: intakeId,
      name: i.name,
      usage_context: i.usageContext,
      confidence: i.confidence,
      note: i.note ?? null,
    }));

    const staffInvites = scored.suggestions.staffInvites.map((s) => ({
      shop_id: shopId,
      intake_id: intakeId,
      role: s.role,
      email: s.email ?? null,
      notes: s.notes ?? null,
    }));

    if (menu.length) {
      await supabase.from("menu_item_suggestions").insert(
        menu as unknown as Array<DB["public"]["Tables"]["menu_item_suggestions"]["Insert"]>,
      );
    }
    if (inspections.length) {
      await supabase.from("inspection_template_suggestions").insert(
        inspections as unknown as Array<DB["public"]["Tables"]["inspection_template_suggestions"]["Insert"]>,
      );
    }
    if (staffInvites.length) {
      await supabase.from("staff_invite_suggestions").insert(
        staffInvites as unknown as Array<DB["public"]["Tables"]["staff_invite_suggestions"]["Insert"]>,
      );
    }

    await updateIntakeStatus(shopId, intakeId, "complete", { processed_at: nowIso() });

    // ---------------------------------------------------------------------
    // 7) RETURN API SNAPSHOT (for demo UI)
    // ---------------------------------------------------------------------
    const apiSnapshot: ShopHealthSnapshot = {
      shopId,
      timeRangeDescription: scored.timeRangeDescription,
      totalRepairOrders: scored.kpis.totalRepairOrders,
      totalRevenue: scored.kpis.totalRevenue,
      averageRo: scored.kpis.averageRo,
      mostCommonRepairs: scored.mostCommonRepairs,
      highValueRepairs: scored.highValueRepairs,
      comebackRisks: scored.comebackRisks,
      fleetMetrics: scored.fleetMetrics,
      menuSuggestions: scored.suggestions.menuItems.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        targetVehicleYmm: m.targetVehicleYmm ?? null,
        estimatedLaborHours: m.estimatedLaborHours,
        recommendedPrice: m.recommendedPrice,
        basedOnJobs: m.basedOnJobs,
      })),
      inspectionSuggestions: scored.suggestions.inspections.map((i) => ({
        id: i.id,
        name: i.name,
        usageContext: i.usageContext,
        note: i.note ?? null,
      })),
      narrativeSummary: scored.narrativeSummary,
    };

    void snapshotRow?.id;
    return apiSnapshot;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await updateIntakeStatus(shopId, intakeId, "failed", { error: msg });
    throw e;
  }
}