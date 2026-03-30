import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type MatchBody = {
  item?: string;
  notes?: string;
  section?: string;
  status?: string;
  vehicle?: {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
    engine?: string | null;
    drivetrain?: string | null;
    transmission?: string | null;
  } | null;
};

type SmartHistoryRow = {
  id: string;
  note: string | null;
  item_label: string | null;
  matched_label: string | null;
  correction: string | null;
  labor_hours: number | null;
  parts: unknown;
  confidence: number | null;
  menu_repair_item_id: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  engine: string | null;
  drivetrain: string | null;
  transmission: string | null;
  created_at: string | null;
};

type MenuRepairItemRow = {
  id: string;
  name: string | null;
  complaint: string | null;
  correction: string | null;
  labor_hours: number | null;
  parts: unknown;
  confidence_score: number | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  engine: string | null;
  drivetrain: string | null;
  transmission: string | null;
};

type WorkOrderIntelRow = {
  id: string;
  complaint: string | null;
  correction: string | null;
  labor_time: number | null;
  parts: unknown;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
};

export type SmartInspectionMatch = {
  id: string;
  label: string;
  complaint?: string | null;
  correction?: string | null;
  laborHours?: number | null;
  parts?: Array<{ name: string; qty?: number }>;
  score?: number | null;
  confidence?: number | null;
  menuItemId?: string | null;
  menuRepairItemId?: string | null;
};

function txt(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function normalizeParts(raw: unknown): Array<{ name: string; qty?: number }> {
  if (!Array.isArray(raw)) return [];

  const out: Array<{ name: string; qty?: number }> = [];

  for (const p of raw) {
    const obj = (p ?? {}) as Record<string, unknown>;
    const name =
      typeof obj.name === "string"
        ? obj.name
        : typeof obj.description === "string"
          ? obj.description
          : "";

    const trimmed = name.trim();
    if (!trimmed) continue;

    const qty =
      typeof obj.qty === "number"
        ? obj.qty
        : typeof obj.quantity === "number"
          ? obj.quantity
          : 1;

    out.push({ name: trimmed, qty });
  }

  return out;
}

function tokenScore(input: string, candidate: string): number {
  const a = new Set(
    input.toLowerCase().split(/\s+/).map((s) => s.trim()).filter(Boolean),
  );
  const b = new Set(
    candidate.toLowerCase().split(/\s+/).map((s) => s.trim()).filter(Boolean),
  );

  let overlap = 0;
  for (const tok of a) {
    if (b.has(tok)) overlap += 1;
  }

  if (overlap === 0) return 0;
  return overlap / Math.max(a.size, 1);
}

function addVehicleScore(
  score: number,
  row: {
    vehicle_year?: number | null;
    vehicle_make?: string | null;
    vehicle_model?: string | null;
    engine?: string | null;
    drivetrain?: string | null;
    transmission?: string | null;
  },
  body: MatchBody,
): number {
  let next = score;

  const reqYear =
    typeof body?.vehicle?.year === "number"
      ? body.vehicle.year
      : Number(body?.vehicle?.year ?? 0) || null;
  const reqMake = txt(body?.vehicle?.make);
  const reqModel = txt(body?.vehicle?.model);
  const reqEngine = txt(body?.vehicle?.engine);
  const reqDrivetrain = txt(body?.vehicle?.drivetrain);
  const reqTransmission = txt(body?.vehicle?.transmission);

  if (reqYear && row.vehicle_year === reqYear) next += 0.22;
  if (reqMake && txt(row.vehicle_make) === reqMake) next += 0.24;
  if (reqModel && txt(row.vehicle_model) === reqModel) next += 0.24;
  if (reqEngine && txt(row.engine) === reqEngine) next += 0.08;
  if (reqDrivetrain && txt(row.drivetrain) === reqDrivetrain) next += 0.06;
  if (reqTransmission && txt(row.transmission) === reqTransmission) next += 0.06;

  return next;
}

export async function findSmartInspectionMatch(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  body: MatchBody;
}): Promise<SmartInspectionMatch | null> {
  const { supabase, shopId, body } = args;

  const noteText = [txt(body?.item), txt(body?.notes), txt(body?.section)]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!noteText) return null;

  const { data: repairItems } = await supabase
    .from("menu_repair_items")
    .select(
      "id, name, complaint, correction, labor_hours, parts, confidence_score, vehicle_year, vehicle_make, vehicle_model, engine, drivetrain, transmission",
    )
    .eq("shop_id", shopId)
    .order("updated_at", { ascending: false })
    .limit(60);

  const rankedRepairItems = ((repairItems ?? []) as MenuRepairItemRow[])
    .map((row) => {
      const haystack = [row.name ?? "", row.complaint ?? "", row.correction ?? ""]
        .join(" ")
        .trim();

      let score = tokenScore(noteText, haystack);
      score = addVehicleScore(score, row, body);

      return { row, score };
    })
    .filter((x) => x.score >= 0.45)
    .sort((a, b) => b.score - a.score);

  const bestRepairItem = rankedRepairItems[0];
  if (bestRepairItem?.row?.id && (bestRepairItem.row.name || bestRepairItem.row.complaint)) {
    return {
      id: bestRepairItem.row.id,
      label:
        bestRepairItem.row.name ??
        bestRepairItem.row.complaint ??
        "Matched repair",
      complaint: bestRepairItem.row.complaint ?? null,
      correction: bestRepairItem.row.correction ?? null,
      laborHours: bestRepairItem.row.labor_hours ?? null,
      parts: normalizeParts(bestRepairItem.row.parts),
      score: bestRepairItem.score,
      confidence:
        typeof bestRepairItem.row.confidence_score === "number"
          ? bestRepairItem.row.confidence_score
          : Math.min(0.97, 0.6 + bestRepairItem.score * 0.3),
      menuRepairItemId: bestRepairItem.row.id,
      menuItemId: null,
    };
  }

  const { data: smartHistory } = await supabase
    .from("inspection_smart_match_history")
    .select(
      "id, note, item_label, matched_label, correction, labor_hours, parts, confidence, menu_repair_item_id, vehicle_year, vehicle_make, vehicle_model, engine, drivetrain, transmission, created_at",
    )
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(40);

  const rankedHistory = ((smartHistory ?? []) as SmartHistoryRow[])
    .map((row) => {
      const haystack = [
        row.note ?? "",
        row.item_label ?? "",
        row.matched_label ?? "",
        row.correction ?? "",
      ]
        .join(" ")
        .trim();

      let score = tokenScore(noteText, haystack);
      score = addVehicleScore(score, row, body);

      return { row, score };
    })
    .filter((x) => x.score >= 0.35)
    .sort((a, b) => b.score - a.score);

  const bestHistory = rankedHistory[0];
  if (bestHistory?.row?.matched_label) {
    return {
      id: bestHistory.row.id,
      label: bestHistory.row.matched_label,
      complaint: bestHistory.row.note ?? bestHistory.row.item_label ?? null,
      correction: bestHistory.row.correction ?? null,
      laborHours: bestHistory.row.labor_hours ?? null,
      parts: normalizeParts(bestHistory.row.parts),
      score: bestHistory.score,
      confidence:
        typeof bestHistory.row.confidence === "number"
          ? bestHistory.row.confidence
          : Math.min(0.95, 0.55 + bestHistory.score * 0.35),
      menuRepairItemId: bestHistory.row.menu_repair_item_id ?? null,
      menuItemId: null,
    };
  }

  const { data: intelRows } = await supabase
    .from("work_order_intelligence")
    .select(
      "id, complaint, correction, labor_time, parts, vehicle_year, vehicle_make, vehicle_model",
    )
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rankedIntel = ((intelRows ?? []) as WorkOrderIntelRow[])
    .map((row) => {
      const haystack = [row.complaint ?? "", row.correction ?? ""].join(" ").trim();
      let score = tokenScore(noteText, haystack);
      score = addVehicleScore(score, row, body);
      return { row, score };
    })
    .filter((x) => x.score >= 0.3)
    .sort((a, b) => b.score - a.score);

  const bestIntel = rankedIntel[0];
  if (bestIntel?.row?.id) {
    return {
      id: bestIntel.row.id,
      label: bestIntel.row.complaint ?? "Learned repair",
      complaint: bestIntel.row.complaint ?? null,
      correction: bestIntel.row.correction ?? null,
      laborHours: bestIntel.row.labor_time ?? null,
      parts: normalizeParts(bestIntel.row.parts),
      score: bestIntel.score,
      confidence: Math.min(0.88, 0.5 + bestIntel.score * 0.3),
      menuRepairItemId: null,
      menuItemId: null,
    };
  }

  return null;
}
