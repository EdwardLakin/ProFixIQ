//features/integrations/ai/shopBoost.ts
import { randomUUID } from "crypto";

import { openai } from "lib/server/openai";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import {
  type ShopHealthSnapshot,
  type ShopHealthTopRepair,
  type ShopHealthComebackRisk,
  type ShopHealthFleetMetric,
} from "@/features/integrations/ai/shopBoostType";

type DB = Database;
type ShopBoostIntakeRow = DB["public"]["Tables"]["shop_boost_intakes"]["Row"];

const SHOP_IMPORT_BUCKET = "shop-imports";

type BuildShopBoostProfileOptions = {
  shopId: string;
  intakeId?: string;
};

/**
 * Entry point: take an intake row for a shop, parse files,
 * build a ShopHealthSnapshot, store it, and emit AI events.
 */
export async function buildShopBoostProfile(
  opts: BuildShopBoostProfileOptions,
): Promise<ShopHealthSnapshot | null> {
  const supabase = createAdminSupabase();
  const { shopId, intakeId } = opts;

  // 1) Find intake row
  const { data: intakeRow, error: intakeErr } = await supabase
    .from("shop_boost_intakes")
    .select("*")
    .eq("shop_id", shopId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (intakeErr) {
    console.error("Error fetching intake", intakeErr);
    return null;
  }

  if (!intakeRow) {
    console.warn("No pending shop_boost_intakes found for shop", shopId);
    return null;
  }

  // If intakeId was given, ensure it matches
  if (intakeId && intakeRow.id !== intakeId) {
    console.warn("Intake ID mismatch; skipping", { shopId, intakeId });
    return null;
  }

  // 2) Download CSV files (if present)
  const [customersCsv, vehiclesCsv, partsCsv] = await Promise.all([
    downloadCsvFile(supabase, intakeRow.customers_file_path),
    downloadCsvFile(supabase, intakeRow.vehicles_file_path),
    downloadCsvFile(supabase, intakeRow.parts_file_path),
  ]);

  // 3) Calculate structured aggregates from CSVs
  const baseStats = await deriveStatsFromCsvs({
    customersCsv,
    vehiclesCsv,
    partsCsv,
  });

  // 4) Pull any existing stats from DB (if you already have some WOs, etc.)
  const dbStats = await deriveStatsFromDatabase(supabase, shopId);

  // Merge CSV-derived stats and DB-derived stats
  const mergedStats = mergeStats(baseStats, dbStats);

  // 5) Call OpenAI to turn stats into final snapshot + suggestions + narrative
  const snapshot = await generateSnapshotWithAI({
    shopId,
    intakeRow,
    mergedStats,
  });

  if (!snapshot) {
    console.error("Failed to generate ShopHealthSnapshot");
    return null;
  }

  // 6) Upsert into shop_ai_profiles
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

  if (aiProfileErr) {
    console.error("Failed to upsert shop_ai_profiles", aiProfileErr);
  }

  // 7) Log AI event + training data
  await logTrainingEvents(supabase, snapshot);

  // 8) Mark intake as processed
  const { error: updateIntakeErr } = await supabase
    .from("shop_boost_intakes")
    .update({
      status: "completed",
      processed_at: new Date().toISOString(),
    })
    .eq("id", intakeRow.id);

  if (updateIntakeErr) {
    console.error("Failed to update intake status", updateIntakeErr);
  }

  return snapshot;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function downloadCsvFile(
  supabase: ReturnType<typeof createAdminSupabase>,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(SHOP_IMPORT_BUCKET)
    .download(path);

  if (error || !data) {
    console.error("Failed to download CSV", path, error);
    return null;
  }

  const text = await data.text();
  return text;
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
  // Minimal CSV splitter that respects simple quoted commas
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      // toggle quotes (handles doubled quotes poorly but better than raw split)
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
  // These fields commonly contain staff/customer names, not repair descriptions
  return /(tech|technician|advisor|writer|service writer|employee|staff|name|customer|driver)/i.test(
    h,
  );
}

function headerLooksLikeRepairTextField(h: string): boolean {
  // Favor true job/line text fields
  return /(complaint|concern|cause|correction|operation|op|job|service|work performed|work_performed|description|line)/i.test(
    h,
  );
}

function headerLooksLikeBadTextField(h: string): boolean {
  // Explicitly avoid columns that are “notes” but actually names/metadata
  return /(phone|email|address|vin|plate|license|unit|stock|fleet|company|location|city|state|zip)/i.test(
    h,
  );
}

function chooseBestDescriptionColumn(headers: string[]): number {
  // Score each header; pick highest score; avoid person-name columns.
  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < headers.length; i += 1) {
    const h = normHeader(headers[i]);
    if (!h) continue;

    // hard rejects
    if (headerLooksLikePersonField(h)) continue;
    if (headerLooksLikeBadTextField(h)) continue;

    let score = 0;

    // strong positives
    if (/(line description|job description|work performed|description)/i.test(h)) score += 7;
    if (/(complaint|concern|cause|correction)/i.test(h)) score += 6;
    if (/(service|job|operation|op)/i.test(h)) score += 4;
    if (headerLooksLikeRepairTextField(h)) score += 2;

    // mild negatives
    if (/(note|notes|memo|comment)/i.test(h)) score -= 1;
    if (/(id|number|no\.|ro|invoice)/i.test(h)) score -= 2;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // fallback: original behavior, but still avoid person fields if possible
  if (bestIdx === -1) {
    const loose = headers.findIndex((h) => /description|job|service/i.test(h));
    if (loose >= 0 && !headerLooksLikePersonField(headers[loose])) return loose;
    return headers.findIndex((h) => /description|job|service/i.test(h));
  }

  return bestIdx;
}

function chooseBestTotalColumn(headers: string[]): number {
  // prefer totals that represent invoice/grand/line totals
  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < headers.length; i += 1) {
    const h = normHeader(headers[i]);
    if (!h) continue;

    let score = 0;
    if (/(grand total|invoice total|total)/i.test(h)) score += 6;
    if (/(line_total|line total|amount|price|extended)/i.test(h)) score += 4;
    if (/(labor|parts)/i.test(h)) score += 1;

    // avoid misleading fields
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

  // If it’s basically “a name” (single token / two tokens), treat as low quality.
  // Not perfect, but helps stop “Lucas” from becoming top repair.
  const tokens = s.split(" ").filter(Boolean);
  if (tokens.length <= 2 && /^[a-zA-Z.'-]+$/.test(s)) return "General Repair";

  // strip leading tech labels like "Tech: Bob"
  const stripped = s.replace(/^(tech|technician|advisor|writer)\s*[:\-]\s*/i, "").trim();
  if (!stripped) return "General Repair";

  // cap length
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

    const rawDesc =
      idxDescription >= 0 ? (cols[idxDescription] ?? "").trim() : "";
    const desc = cleanDesc(rawDesc || "General Repair");

    const rawTotal = idxTotal >= 0 ? (cols[idxTotal] ?? "0") : "0";
    const total = Number(String(rawTotal).replace(/[^0-9.]/g, "")) || 0;

    const existing = repairMap.get(desc) ?? { count: 0, revenue: 0 };
    existing.count += 1;
    existing.revenue += total;
    repairMap.set(desc, existing);
  }

  const mostCommonRepairs: ShopHealthTopRepair[] = Array.from(repairMap.entries())
    .map(([label, value]) => ({
      label,
      count: value.count,
      revenue: value.revenue,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const highValueRepairs: ShopHealthTopRepair[] = [...mostCommonRepairs]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const totalRepairOrders = mostCommonRepairs.reduce(
    (sum, repair) => sum + repair.count,
    0,
  );
  const totalRevenue = mostCommonRepairs.reduce(
    (sum, repair) => sum + repair.revenue,
    0,
  );
  const averageRo =
    totalRepairOrders > 0 ? totalRevenue / totalRepairOrders : 0;

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
  // TODO: enrich from work_orders + work_order_lines if desired.
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

function mergeRepairLists(
  a: ShopHealthTopRepair[],
  b: ShopHealthTopRepair[],
): ShopHealthTopRepair[] {
  const map = new Map<string, ShopHealthTopRepair>();

  for (const item of [...a, ...b]) {
    const existing = map.get(item.label);
    if (!existing) {
      map.set(item.label, { ...item });
    } else {
      existing.count += item.count;
      existing.revenue += item.revenue;
    }
  }

  return Array.from(map.values())
    .sort((x, y) => y.count - x.count)
    .slice(0, 10);
}

type GenerateSnapshotArgs = {
  shopId: string;
  intakeRow: ShopBoostIntakeRow;
  mergedStats: DerivedStats;
};

async function generateSnapshotWithAI(
  args: GenerateSnapshotArgs,
): Promise<ShopHealthSnapshot | null> {
  const { shopId, intakeRow, mergedStats } = args;

  const systemPrompt =
    "You are an assistant that helps configure an auto and heavy-duty repair shop management system.";

  const shapeExample = {
    shopId: "<string>",
    timeRangeDescription: "<string>",
    totalRepairOrders: 0,
    totalRevenue: 0,
    averageRo: 0,
    mostCommonRepairs: [
      { label: "<string>", count: 0, revenue: 0, averageLaborHours: 0 },
    ],
    highValueRepairs: [
      { label: "<string>", count: 0, revenue: 0, averageLaborHours: 0 },
    ],
    comebackRisks: [
      { label: "<string>", count: 0, estimatedLostHours: 0, note: "<string>" },
    ],
    fleetMetrics: [{ label: "<string>", value: 0, unit: "<string>", note: "<string>" }],
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
    "You are given:",
    "- High-level questionnaire answers",
    "- Aggregate repair statistics",
    "",
    "Your job: build a compact JSON object describing the shop health and concrete suggestions.",
    "",
    "Return ONLY valid JSON with this exact shape (keys and types):",
    JSON.stringify(shapeExample, null, 2),
    "",
    "Questionnaire answers:",
    JSON.stringify(intakeRow.questionnaire ?? {}, null, 2),
    "",
    "Aggregate stats (from history):",
    JSON.stringify(mergedStats, null, 2),
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

    const message = completion.choices[0]?.message;
    const raw = message?.content ?? "{}";

    const parsed = JSON.parse(raw) as ShopHealthSnapshot;

    parsed.shopId = shopId;

    parsed.menuSuggestions =
      parsed.menuSuggestions?.map((menu) => ({
        ...menu,
        id: menu.id && menu.id !== "<uuid-string>" ? menu.id : randomUUID(),
      })) ?? [];

    parsed.inspectionSuggestions =
      parsed.inspectionSuggestions?.map((inspection) => ({
        ...inspection,
        id:
          inspection.id && inspection.id !== "<uuid-string>"
            ? inspection.id
            : randomUUID(),
      })) ?? [];

    return parsed;
  } catch (err) {
    console.error("Error generating snapshot", err);
    return null;
  }
}

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

  const sourceEventId = eventRows?.[0]?.id;
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