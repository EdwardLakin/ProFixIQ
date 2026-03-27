import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function safeText(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function detectJobCategory(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("brake") || t.includes("rotor") || t.includes("pad")) return "brakes";
  if (t.includes("tie rod") || t.includes("ball joint") || t.includes("shock") || t.includes("strut")) return "suspension";
  if (t.includes("oil") || t.includes("filter") || t.includes("maintenance")) return "maintenance";
  if (t.includes("battery") || t.includes("alternator") || t.includes("starter")) return "electrical";
  return "general";
}

function extractTags(text) {
  const t = String(text || "").toLowerCase();
  const tags = [];
  if (t.includes("metal on metal")) tags.push("metal_on_metal");
  if (t.includes("1mm") || t.includes("1 mm")) tags.push("low_measurement");
  if (t.includes("grooved")) tags.push("grooved");
  if (t.includes("leak")) tags.push("leak");
  if (t.includes("worn")) tags.push("worn");
  return tags;
}

const { data: lines, error } = await supabase
  .from("work_order_lines")
  .select("id, work_order_id, description, complaint, cause, correction, labor_time, status")
  .in("status", ["completed", "ready_to_invoice", "invoiced"])
  .not("work_order_id", "is", null)
  .limit(500);

if (error) throw error;

let count = 0;

for (const line of lines || []) {
  const { data: wo } = await supabase
    .from("work_orders")
    .select("id, shop_id, vehicle_id, customer_id")
    .eq("id", line.work_order_id)
    .maybeSingle();

  if (!wo?.shop_id) continue;

  let vehicle = null;
  if (wo.vehicle_id) {
    const { data } = await supabase
      .from("vehicles")
      .select("id, year, make, model")
      .eq("id", wo.vehicle_id)
      .maybeSingle();
    vehicle = data || null;
  }

  const complaint = safeText(line.complaint);
  const symptom = safeText(line.description) || complaint;
  const cause = safeText(line.cause);
  const correction = safeText(line.correction);
  const tagText = [complaint, symptom, cause, correction].filter(Boolean).join(" ");
  const job_category = detectJobCategory(tagText);
  const tags = extractTags(tagText);

  const payload = {
    shop_id: wo.shop_id,
    work_order_id: wo.id,
    work_order_line_id: line.id,
    vehicle_id: wo.vehicle_id,
    customer_id: wo.customer_id,
    vehicle_year: vehicle?.year ?? null,
    vehicle_make: vehicle?.make ?? null,
    vehicle_model: vehicle?.model ?? null,
    complaint,
    symptom,
    cause,
    correction,
    line_status: line.status ?? null,
    labor_time: typeof line.labor_time === "number" ? line.labor_time : null,
    parts: [],
    job_category,
    tags,
    source: "backfill",
    confidence_score: 0.9,
  };

  const { error: upsertErr } = await supabase
    .from("work_order_intelligence")
    .upsert(payload, { onConflict: "work_order_line_id" });

  if (!upsertErr) count += 1;
}

console.log(`Backfilled ${count} work_order_intelligence rows.`);
