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
    fuel_type?: string | null;
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


type FeedbackRow = {
  suggested_match_id: string | null;
  suggested_label: string | null;
  menu_repair_item_id: string | null;
  action: "accepted" | "dismissed";
};


type MatchStatRow = {
  shop_id: string;
  menu_repair_item_id: string;
  accepted_count: number | null;
  dismissed_count: number | null;
  feedback_count: number | null;
  acceptance_rate: number | null;
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
  fuel_type: string | null;
};

type MenuItemRow = {
  id: string;
  name: string | null;
  description: string | null;
  complaint: string | null;
  cause: string | null;
  correction: string | null;
  labor_hours: number | null;
  total_price: number | null;
  category: string | null;
  service_key: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  drivetrain: string | null;
  engine_type: string | null;
  transmission_type: string | null;
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
  sourceType?: "history_repair" | "catalog_menu";
  sourceLabel?: string;
  whyShown?: string | null;
  compatibilitySummary?: string | null;
  compatibilityStatus?: "compatible";
  complaint?: string | null;
  correction?: string | null;
  laborHours?: number | null;
  parts?: Array<{ name: string; qty?: number }>;
  score?: number | null;
  confidence?: number | null;
  menuItemId?: string | null;
  menuRepairItemId?: string | null;
  acceptedCount?: number | null;
  acceptanceRate?: number | null;
  pricingStatus?: "fresh" | "stale" | "expired";
  pricingValidUntil?: string | null;
};

function txt(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function isBroadComplaint(noteText: string): boolean {
  const text = txt(noteText);
  return includesAny(text, [
    "check engine",
    "cel",
    "no start",
    "no-start",
    "won't start",
    "wont start",
    "vibration",
    "noise",
    "front end noise",
    "front-end noise",
    "diagnose",
    "diagnostic",
  ]);
}

function isGenericCatalogCandidate(row: MenuItemRow): boolean {
  const text = txt(
    [
      row.name ?? "",
      row.description ?? "",
      row.complaint ?? "",
      row.category ?? "",
      row.service_key ?? "",
    ].join(" "),
  );

  return includesAny(text, [
    "diag",
    "diagnostic",
    "inspection",
    "investigate",
    "troubleshoot",
    "check engine",
    "noise diagnosis",
    "vibration diagnosis",
  ]);
}

function getFuelFamily(value: unknown): "gasoline" | "diesel" | "other" | null {
  const v = txt(value);
  if (!v) return null;
  if (v.includes("diesel")) return "diesel";
  if (includesAny(v, ["gas", "gasoline", "petrol", "flex", "e85"])) return "gasoline";
  return "other";
}

function compatibilityReasonParts(row: {
  vehicle_year?: number | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
  fuel_type?: string | null;
}, body: MatchBody): string[] {
  const reqYear =
    typeof body?.vehicle?.year === "number"
      ? body.vehicle.year
      : Number(body?.vehicle?.year ?? 0) || null;
  const reqMake = txt(body?.vehicle?.make);
  const reqModel = txt(body?.vehicle?.model);
  const reqEngine = txt(body?.vehicle?.engine);
  const reqDrive = txt(body?.vehicle?.drivetrain);
  const reqTrans = txt(body?.vehicle?.transmission);
  const reqFuel = getFuelFamily(body?.vehicle?.fuel_type);

  const reasons: string[] = [];
  if (reqYear && row.vehicle_year === reqYear) reasons.push("year");
  if (reqMake && txt(row.vehicle_make) === reqMake) reasons.push("make");
  if (reqModel && txt(row.vehicle_model) === reqModel) reasons.push("model");
  if (reqEngine && txt(row.engine) === reqEngine) reasons.push("engine");
  if (reqDrive && txt(row.drivetrain) === reqDrive) reasons.push("drivetrain");
  if (reqTrans && txt(row.transmission) === reqTrans) reasons.push("transmission");
  if (reqFuel && getFuelFamily(row.fuel_type) === reqFuel) reasons.push("fuel type");
  return reasons;
}

function computePricingStatusFromDate(validUntil: string | null | undefined): "fresh" | "stale" | "expired" {
  if (!validUntil) return "expired";

  const ts = new Date(validUntil).getTime();
  if (!Number.isFinite(ts)) return "expired";

  const now = Date.now();
  if (ts < now) return "expired";
  if (ts < now + 3 * 24 * 60 * 60 * 1000) return "stale";
  return "fresh";
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
    fuel_type?: string | null;
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
  const reqFuel = getFuelFamily(body?.vehicle?.fuel_type);

  if (reqYear && row.vehicle_year === reqYear) next += 0.22;
  if (reqMake && txt(row.vehicle_make) === reqMake) next += 0.24;
  if (reqModel && txt(row.vehicle_model) === reqModel) next += 0.24;
  if (reqEngine && txt(row.engine) === reqEngine) next += 0.08;
  if (reqDrivetrain && txt(row.drivetrain) === reqDrivetrain) next += 0.06;
  if (reqTransmission && txt(row.transmission) === reqTransmission) next += 0.06;
  if (reqFuel && getFuelFamily(row.fuel_type) === reqFuel) next += 0.08;

  return next;
}

function isCompatibleCandidate(args: {
  body: MatchBody;
  noteText: string;
  candidateText: string;
  row: {
    vehicle_year?: number | null;
    vehicle_make?: string | null;
    vehicle_model?: string | null;
    engine?: string | null;
    drivetrain?: string | null;
    transmission?: string | null;
    fuel_type?: string | null;
  };
}): boolean {
  const { body, noteText, candidateText, row } = args;

  const requestedFuel = getFuelFamily(body?.vehicle?.fuel_type);
  const candidateFuel = getFuelFamily(row.fuel_type);
  const fullText = `${txt(noteText)} ${txt(candidateText)}`;

  // Hard block: DEF/diesel terms must not be shown to known non-diesel vehicles.
  const hasDefSignal = includesAny(fullText, [
    "def",
    "diesel exhaust fluid",
    "urea",
    "scr",
    "dpf",
    "regen",
  ]);
  if (requestedFuel === "gasoline" && (hasDefSignal || candidateFuel === "diesel")) {
    return false;
  }

  // Hard block: explicit fuel mismatch when both sides are known.
  if (requestedFuel && candidateFuel && requestedFuel !== candidateFuel) {
    return false;
  }

  const reqMake = txt(body?.vehicle?.make);
  const reqModel = txt(body?.vehicle?.model);
  const reqYear =
    typeof body?.vehicle?.year === "number"
      ? body.vehicle.year
      : Number(body?.vehicle?.year ?? 0) || null;

  // Hard block: if candidate has explicit YMM tags that conflict.
  if (reqMake && txt(row.vehicle_make) && txt(row.vehicle_make) !== reqMake) return false;
  if (reqModel && txt(row.vehicle_model) && txt(row.vehicle_model) !== reqModel) return false;
  if (reqYear && row.vehicle_year && row.vehicle_year !== reqYear) return false;

  return true;
}

export async function findSmartInspectionMatch(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  body: MatchBody;
}): Promise<SmartInspectionMatch | null> {
  // NOTE: This matcher powers complaint-stage manual line-entry suggestions.
  // It uses separate lanes:
  // - menu_repair_items / match history (learned specific repairs)
  // - menu_items (authored catalog, diagnostic, generic services)
  // and then applies safety-first ranking.
  const { supabase, shopId, body } = args;

  const noteText = [txt(body?.item), txt(body?.notes), txt(body?.section)]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!noteText) return null;

  const { data: feedbackRows } = await supabase
    .from("inspection_smart_match_feedback")
    .select("suggested_match_id, suggested_label, menu_repair_item_id, action")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: statRows } = await supabase
    .from("v_menu_repair_item_match_stats")
    .select("shop_id, menu_repair_item_id, accepted_count, dismissed_count, feedback_count, acceptance_rate")
    .eq("shop_id", shopId);

  const feedback = (feedbackRows ?? []) as FeedbackRow[];
  const statsByRepairId = new Map(
    ((statRows ?? []) as MatchStatRow[]).map((row) => [row.menu_repair_item_id, row]),
  );

  const dismissedIds = new Set(
    feedback
      .filter((r) => r.action === "dismissed")
      .map((r) => r.menu_repair_item_id ?? r.suggested_match_id ?? "")
      .filter(Boolean),
  );

  const dismissedLabels = new Set(
    feedback
      .filter((r) => r.action === "dismissed")
      .map((r) => txt(r.suggested_label))
      .filter(Boolean),
  );

  const acceptedIds = new Set(
    feedback
      .filter((r) => r.action === "accepted")
      .map((r) => r.menu_repair_item_id ?? r.suggested_match_id ?? "")
      .filter(Boolean),
  );

  const acceptedLabels = new Set(
    feedback
      .filter((r) => r.action === "accepted")
      .map((r) => txt(r.suggested_label))
      .filter(Boolean),
  );

  const { data: repairItems } = await supabase
    .from("menu_repair_items")
    .select(
      "id, name, complaint, correction, labor_hours, parts, confidence_score, vehicle_year, vehicle_make, vehicle_model, engine, drivetrain, transmission, fuel_type",
    )
    .eq("shop_id", shopId)
    .order("updated_at", { ascending: false })
    .limit(60);


  // 🔥 Load active pricing snapshots
  const { data: pricingSnapshots } = await supabase
    .from("menu_repair_item_pricing_snapshots")
    .select("menu_repair_item_id, valid_until, total_sell")
    .eq("shop_id", shopId)
    .eq("status", "fresh");

  const pricingMap = new Map(
    (pricingSnapshots ?? []).map((p) => [
      p.menu_repair_item_id,
      {
        validUntil: p.valid_until,
        totalSell: p.total_sell,
      },
    ]),
  );

  const rankedRepairItems = ((repairItems ?? []) as MenuRepairItemRow[])
    .map((row) => {
      const haystack = [row.name ?? "", row.complaint ?? "", row.correction ?? ""]
        .join(" ")
        .trim();

      if (
        !isCompatibleCandidate({
          body,
          noteText,
          candidateText: haystack,
          row,
        })
      ) {
        return null;
      }

      let score = tokenScore(noteText, haystack);
      score = addVehicleScore(score, row, body);

      if (dismissedIds.has(row.id) || dismissedLabels.has(txt(row.name))) {
        score -= 0.35;
      }

      if (acceptedIds.has(row.id) || acceptedLabels.has(txt(row.name))) {
        score += 0.2;
      }

      const stat = statsByRepairId.get(row.id);
      const acceptanceRate =
        stat && typeof stat.acceptance_rate === "number" ? stat.acceptance_rate : 0;
      const acceptedCount =
        stat && typeof stat.accepted_count === "number" ? stat.accepted_count : 0;

      score += Math.min(acceptanceRate * 0.25, 0.25);
      score += Math.min(acceptedCount * 0.03, 0.15);

      return { row, score };
    })
    .filter((x): x is { row: MenuRepairItemRow; score: number } => Boolean(x))
    .filter((x) => x.score >= 0.45)
    .sort((a, b) => b.score - a.score);

  const bestRepairItem = rankedRepairItems[0];

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
      if (
        !isCompatibleCandidate({
          body,
          noteText,
          candidateText: haystack,
          row: {
            ...row,
            fuel_type: null,
          },
        })
      ) {
        return null;
      }
      score = addVehicleScore(score, row, body);

      if (
        dismissedIds.has(row.menu_repair_item_id ?? row.id) ||
        dismissedLabels.has(txt(row.matched_label))
      ) {
        score -= 0.35;
      }

      if (
        acceptedIds.has(row.menu_repair_item_id ?? row.id) ||
        acceptedLabels.has(txt(row.matched_label))
      ) {
        score += 0.2;
      }

      const stat =
        row.menu_repair_item_id ? statsByRepairId.get(row.menu_repair_item_id) : undefined;
      const acceptanceRate =
        stat && typeof stat.acceptance_rate === "number" ? stat.acceptance_rate : 0;
      const acceptedCount =
        stat && typeof stat.accepted_count === "number" ? stat.accepted_count : 0;

      score += Math.min(acceptanceRate * 0.2, 0.2);
      score += Math.min(acceptedCount * 0.02, 0.12);

      return { row, score };
    })
    .filter((x): x is { row: SmartHistoryRow; score: number } => Boolean(x))
    .filter((x) => x.score >= 0.35)
    .sort((a, b) => b.score - a.score);

  const bestHistory = rankedHistory[0];

  const { data: menuItems } = await supabase
    .from("menu_items")
    .select(
      "id, name, description, complaint, cause, correction, labor_hours, total_price, category, service_key, vehicle_year, vehicle_make, vehicle_model, drivetrain, engine_type, transmission_type",
    )
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(80);

  const broadComplaint = isBroadComplaint(noteText);
  const rankedCatalogItems = ((menuItems ?? []) as MenuItemRow[])
    .map((row) => {
      const haystack = [
        row.name ?? "",
        row.description ?? "",
        row.complaint ?? "",
        row.correction ?? "",
        row.category ?? "",
        row.service_key ?? "",
      ]
        .join(" ")
        .trim();

      if (
        !isCompatibleCandidate({
          body,
          noteText,
          candidateText: haystack,
          row: {
            vehicle_year: row.vehicle_year,
            vehicle_make: row.vehicle_make,
            vehicle_model: row.vehicle_model,
            engine: row.engine_type,
            drivetrain: row.drivetrain,
            transmission: row.transmission_type,
            fuel_type: null,
          },
        })
      ) {
        return null;
      }

      let score = tokenScore(noteText, haystack);
      score = addVehicleScore(
        score,
        {
          vehicle_year: row.vehicle_year,
          vehicle_make: row.vehicle_make,
          vehicle_model: row.vehicle_model,
          engine: row.engine_type,
          drivetrain: row.drivetrain,
          transmission: row.transmission_type,
          fuel_type: null,
        },
        body,
      );

      if (isGenericCatalogCandidate(row)) {
        score += broadComplaint ? 0.2 : 0.1;
      }

      return { row, score };
    })
    .filter((x): x is { row: MenuItemRow; score: number } => Boolean(x))
    .filter((x) => x.score >= 0.34)
    .sort((a, b) => b.score - a.score);

  const bestCatalogItem = rankedCatalogItems[0];
  const topSpecificConfidence =
    typeof bestRepairItem?.row?.confidence_score === "number"
      ? bestRepairItem.row.confidence_score
      : typeof bestHistory?.row?.confidence === "number"
        ? bestHistory.row.confidence
        : 0;

  const hasStrongSpecificMatch =
    Boolean(bestRepairItem && bestRepairItem.score >= 0.72 && topSpecificConfidence >= 0.82) ||
    Boolean(bestHistory && bestHistory.score >= 0.68 && topSpecificConfidence >= 0.8);

  if (bestRepairItem?.row?.id && (bestRepairItem.row.name || bestRepairItem.row.complaint) && hasStrongSpecificMatch) {
    const pricing = pricingMap.get(bestRepairItem.row.id);
    const reasons = compatibilityReasonParts(bestRepairItem.row, body);

    return {
      id: bestRepairItem.row.id,
      label:
        bestRepairItem.row.name ??
        bestRepairItem.row.complaint ??
        "Matched repair",
      sourceType: "history_repair",
      sourceLabel: "repair history",
      whyShown: "Strong compatible historical repair match.",
      compatibilityStatus: "compatible",
      compatibilitySummary:
        reasons.length > 0 ? `Matched on ${reasons.join(", ")}.` : "Passed compatibility safety filters.",
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
      pricingStatus: computePricingStatusFromDate(pricing?.validUntil ?? null),
      pricingValidUntil: pricing?.validUntil ?? null,
    };
  }

  if (bestCatalogItem?.row?.id) {
    const reasons = compatibilityReasonParts(
      {
        vehicle_year: bestCatalogItem.row.vehicle_year,
        vehicle_make: bestCatalogItem.row.vehicle_make,
        vehicle_model: bestCatalogItem.row.vehicle_model,
        drivetrain: bestCatalogItem.row.drivetrain,
        engine: bestCatalogItem.row.engine_type,
        transmission: bestCatalogItem.row.transmission_type,
      },
      body,
    );
    const genericCandidate = isGenericCatalogCandidate(bestCatalogItem.row);

    return {
      id: bestCatalogItem.row.id,
      label:
        bestCatalogItem.row.name ??
        bestCatalogItem.row.description ??
        "Catalog service",
      sourceType: "catalog_menu",
      sourceLabel: "menu catalog",
      whyShown: genericCandidate && broadComplaint
        ? "Broad complaint detected; safer generic diagnostic catalog item prioritized."
        : "Compatible authored menu item suggestion.",
      compatibilityStatus: "compatible",
      compatibilitySummary:
        reasons.length > 0 ? `Matched on ${reasons.join(", ")}.` : "Passed compatibility safety filters.",
      complaint: bestCatalogItem.row.complaint ?? bestCatalogItem.row.description ?? null,
      correction: bestCatalogItem.row.correction ?? null,
      laborHours: bestCatalogItem.row.labor_hours ?? null,
      score: bestCatalogItem.score,
      confidence: Math.min(0.89, 0.5 + bestCatalogItem.score * 0.33),
      menuRepairItemId: null,
      menuItemId: bestCatalogItem.row.id,
      pricingStatus: "expired",
      pricingValidUntil: null,
    };
  }

  if (bestHistory?.row?.matched_label) {
    const reasons = compatibilityReasonParts(
      {
        vehicle_year: bestHistory.row.vehicle_year,
        vehicle_make: bestHistory.row.vehicle_make,
        vehicle_model: bestHistory.row.vehicle_model,
        engine: bestHistory.row.engine,
        drivetrain: bestHistory.row.drivetrain,
        transmission: bestHistory.row.transmission,
      },
      body,
    );

    return {
      id: bestHistory.row.id,
      label: bestHistory.row.matched_label,
      sourceType: "history_repair",
      sourceLabel: "repair history",
      whyShown: "Compatible historical candidate found (lower confidence).",
      compatibilityStatus: "compatible",
      compatibilitySummary:
        reasons.length > 0 ? `Matched on ${reasons.join(", ")}.` : "Passed compatibility safety filters.",
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
