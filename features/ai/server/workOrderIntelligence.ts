import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type VehicleLite = {
  id?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
};

type IntelligenceLine = WorkOrderLineRow & {
  parts?: Json | null;
};

function safeText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function toPartsJson(value: unknown): Json {
  if (Array.isArray(value)) return value as Json;
  if (value && typeof value === "object") return value as Json;
  return [] as Json;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function detectJobCategory(text: string | null): string | null {
  const t = (text ?? "").toLowerCase();

  if (!t) return null;
  if (t.includes("brake") || t.includes("rotor") || t.includes("pad")) return "brakes";
  if (t.includes("tie rod") || t.includes("ball joint") || t.includes("shock") || t.includes("strut")) return "suspension";
  if (t.includes("oil") || t.includes("filter") || t.includes("maintenance")) return "maintenance";
  if (t.includes("battery") || t.includes("alternator") || t.includes("starter")) return "electrical";
  if (t.includes("coolant") || t.includes("radiator") || t.includes("thermostat")) return "cooling";
  if (t.includes("tire") || t.includes("tyre") || t.includes("alignment")) return "tires";
  return "general";
}

export function extractTags(text: string | null): string[] {
  const t = (text ?? "").toLowerCase();
  const tags = new Set<string>();

  if (!t) return [];

  if (t.includes("metal on metal")) tags.add("metal_on_metal");
  if (t.includes("1mm") || t.includes("1 mm")) tags.add("low_measurement");
  if (t.includes("grooved")) tags.add("grooved");
  if (t.includes("leak")) tags.add("leak");
  if (t.includes("noise")) tags.add("noise");
  if (t.includes("pull")) tags.add("pull");
  if (t.includes("vibration")) tags.add("vibration");
  if (t.includes("overheat")) tags.add("overheat");
  if (t.includes("worn")) tags.add("worn");
  if (t.includes("crack")) tags.add("cracked");

  return Array.from(tags);
}

function buildTemplateKey(input: {
  complaint: string | null;
  symptom: string | null;
  category: string | null;
}): string {
  const seed = [input.category, input.complaint, input.symptom]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const words = Array.from(new Set(tokenize(seed))).slice(0, 8);
  return words.join("_") || "general_job";
}

export function nextLearnedTemplateUsageCount(
  current: number | null | undefined,
  incrementUsage: boolean,
): number {
  return Math.max(0, current ?? 0) + (incrementUsage ? 1 : 0);
}

async function upsertLearnedTemplate(
  supabase: SupabaseClient<DB>,
  row: DB["public"]["Tables"]["work_order_intelligence"]["Insert"],
  incrementUsage: boolean,
): Promise<void> {
  const category = row.job_category ?? null;
  const complaint = safeText(row.complaint);
  const symptom = safeText(row.symptom);
  const templateKey = buildTemplateKey({
    complaint,
    symptom,
    category,
  });

  const label =
    complaint ??
    symptom ??
    safeText(row.correction) ??
    safeText(row.cause) ??
    "Learned job";

  const { data: existing, error: existingErr } = await supabase
    .from("learned_job_templates")
    .select("id, usage_count")
    .eq("shop_id", row.shop_id)
    .eq("template_key", templateKey)
    .maybeSingle();

  if (existingErr) throw existingErr;

  const defaultParts = toPartsJson(row.parts);
  const defaultLaborHours =
    typeof row.labor_time === "number" ? row.labor_time : null;

  if (!existing?.id) {
    const { error: insertErr } = await supabase.from("learned_job_templates").insert({
      shop_id: row.shop_id,
      template_key: templateKey,
      label,
      job_category: category,
      default_labor_hours: defaultLaborHours,
      default_parts: defaultParts,
      source_work_order_id: row.work_order_id,
      source_work_order_line_id: row.work_order_line_id,
      usage_count: 1,
      confidence_score: row.confidence_score ?? 1,
      tags: row.tags ?? [],
      last_seen_at: new Date().toISOString(),
    });

    if (insertErr) throw insertErr;
    return;
  }

  const { error: updateErr } = await supabase
    .from("learned_job_templates")
    .update({
      label,
      job_category: category,
      default_labor_hours: defaultLaborHours,
      default_parts: defaultParts,
      source_work_order_id: row.work_order_id,
      source_work_order_line_id: row.work_order_line_id,
      usage_count: nextLearnedTemplateUsageCount(existing.usage_count, incrementUsage),
      confidence_score: row.confidence_score ?? 1,
      tags: row.tags ?? [],
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (updateErr) throw updateErr;
}

async function maybeQueueStorySignal(
  supabase: SupabaseClient<DB>,
  row: DB["public"]["Tables"]["work_order_intelligence"]["Insert"],
): Promise<void> {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const important = ["metal_on_metal", "grooved", "leak", "overheat", "cracked", "worn"];
  const match = important.find((tag) => tags.includes(tag));

  if (!match) return;

  const { error } = await supabase
    .from("intelligence_story_signals")
    .upsert(
      {
        shop_id: row.shop_id,
        work_order_id: row.work_order_id,
        work_order_line_id: row.work_order_line_id,
        signal_type: match,
        payload: {
          complaint: row.complaint ?? null,
          symptom: row.symptom ?? null,
          cause: row.cause ?? null,
          correction: row.correction ?? null,
          category: row.job_category ?? null,
          tags,
        } as Json,
      },
      { onConflict: "work_order_line_id,signal_type" },
    );

  if (error) throw error;
}

export async function seedWorkOrderIntelligenceFromReview(args: {
  supabase: SupabaseClient<DB>;
  workOrder: WorkOrderRow;
  lines: WorkOrderLineRow[];
  vehicle?: VehicleLite | null;
  source?: string | null;
}): Promise<{ inserted: number; skippedReason?: string }> {
  const { supabase, workOrder, lines, vehicle, source } = args;

  if (!workOrder.shop_id) return { inserted: 0 };
  if (!isCompletedLearningStatus(workOrder.status)) {
    return { inserted: 0, skippedReason: "work_order_not_completed" };
  }

  const candidates = lines.filter((line) => {
    if (!isCompletedLearningStatus(line.status)) return false;
    const complaint = safeText(line.complaint) ?? safeText(line.description);
    const cause = safeText(line.cause);
    const correction = safeText(line.correction);
    const labor = typeof line.labor_time === "number" && line.labor_time > 0;
    return Boolean(complaint || cause || correction || labor);
  });

  let inserted = 0;

  for (const rawLine of candidates) {
    const line = rawLine as IntelligenceLine;

    const complaint = safeText(line.complaint);
    const symptom = safeText(line.description) ?? complaint;
    const cause = safeText(line.cause);
    const correction = safeText(line.correction);

    const tagText = [complaint, symptom, cause, correction].filter(Boolean).join(" ");
    const category = detectJobCategory(tagText);
    const tags = extractTags(tagText);

    const row: DB["public"]["Tables"]["work_order_intelligence"]["Insert"] = {
      shop_id: workOrder.shop_id,
      work_order_id: workOrder.id,
      work_order_line_id: line.id,
      vehicle_id: workOrder.vehicle_id,
      customer_id: workOrder.customer_id,
      vehicle_year: typeof vehicle?.year === "number" ? vehicle.year : null,
      vehicle_make: safeText(vehicle?.make),
      vehicle_model: safeText(vehicle?.model),
      complaint,
      symptom,
      cause,
      correction,
      line_status: safeText(line.status),
      labor_time: typeof line.labor_time === "number" ? line.labor_time : null,
      parts: toPartsJson(line.parts),
      job_category: category,
      tags,
      source: source ?? "invoice_review",
      confidence_score: 1,
    };

    const { data: existingIntelligence, error: existingIntelligenceError } = await supabase
      .from("work_order_intelligence")
      .select("id")
      .eq("shop_id", workOrder.shop_id)
      .eq("work_order_line_id", line.id)
      .maybeSingle();
    if (existingIntelligenceError) throw existingIntelligenceError;

    const { error } = await supabase
      .from("work_order_intelligence")
      .upsert(row, { onConflict: "work_order_line_id" });

    if (error) throw error;

    await upsertLearnedTemplate(supabase, row, !existingIntelligence?.id);
    await maybeQueueStorySignal(supabase, row);
    if (!existingIntelligence?.id) inserted += 1;
  }

  return { inserted };
}

export function isCompletedLearningStatus(value: string | null | undefined): boolean {
  const status = (value ?? "").trim().toLowerCase();
  return status === "completed" || status === "ready_to_invoice" || status === "invoiced";
}

export async function seedCompletedWorkOrderIntelligence(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  source: string;
}): Promise<{ inserted: number; skippedReason?: string }> {
  const { supabase, shopId, workOrderId, source } = args;
  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders").select("*").eq("id", workOrderId).eq("shop_id", shopId).maybeSingle();
  if (workOrderError) throw workOrderError;
  if (!workOrder) return { inserted: 0, skippedReason: "work_order_not_found" };
  if (!isCompletedLearningStatus(workOrder.status)) {
    return { inserted: 0, skippedReason: "work_order_not_completed" };
  }

  const { data: lines, error: linesError } = await supabase
    .from("work_order_lines").select("*").eq("work_order_id", workOrderId).eq("shop_id", shopId);
  if (linesError) throw linesError;
  const completedLines = (lines ?? []).filter((line) => isCompletedLearningStatus(line.status));
  if (completedLines.length === 0) return { inserted: 0, skippedReason: "no_completed_lines" };

  let vehicle: VehicleLite | null = null;
  if (workOrder.vehicle_id) {
    const { data, error } = await supabase.from("vehicles").select("id,year,make,model")
      .eq("id", workOrder.vehicle_id).eq("shop_id", shopId).maybeSingle();
    if (error) throw error;
    vehicle = data ?? null;
  }
  return seedWorkOrderIntelligenceFromReview({ supabase, workOrder, lines: completedLines, vehicle, source });
}
