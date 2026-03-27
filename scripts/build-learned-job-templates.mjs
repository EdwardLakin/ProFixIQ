import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function clean(v) {
  return typeof v === "string" ? v.trim() : "";
}

function clusterKey(row) {
  return [
    clean(row.shop_id),
    clean(row.job_category).toLowerCase(),
    clean(row.vehicle_make).toLowerCase(),
    clean(row.vehicle_model).toLowerCase(),
    clean(row.correction || row.complaint).toLowerCase().slice(0, 80),
  ].join("::");
}

function avg(nums) {
  const values = nums.filter((n) => Number.isFinite(n));
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function collectTags(items) {
  const set = new Set();
  for (const item of items) {
    for (const v of [
      item.job_category,
      item.vehicle_make,
      item.vehicle_model,
      ...(Array.isArray(item.tags) ? item.tags : []),
    ]) {
      const s = clean(v);
      if (s) set.add(s);
    }
  }
  return Array.from(set).slice(0, 12);
}

function collectParts(items) {
  const map = new Map();
  for (const item of items) {
    const parts = Array.isArray(item.parts) ? item.parts : [];
    for (const p of parts) {
      if (!p || typeof p !== "object") continue;
      const name = clean(p.name || p.description || p.item);
      const qty = Number(p.qty || p.quantity || 1);
      if (!name) continue;
      const key = name.toLowerCase();
      const current = map.get(key) || { name, qtyTotal: 0, count: 0 };
      current.qtyTotal += Number.isFinite(qty) && qty > 0 ? qty : 1;
      current.count += 1;
      map.set(key, current);
    }
  }
  return Array.from(map.values())
    .map((x) => ({
      name: x.name,
      qty: Math.max(1, Math.round(x.qtyTotal / x.count)),
    }))
    .slice(0, 10);
}

const { data: rows, error } = await supabase
  .from("work_order_intelligence")
  .select(
    "id, shop_id, complaint, correction, labor_time, parts, tags, job_category, vehicle_make, vehicle_model, normalized_text, embedding, work_order_id, work_order_line_id, created_at",
  )
  .order("created_at", { ascending: false })
  .limit(5000);

if (error) throw error;

const groups = new Map();

for (const row of rows ?? []) {
  const key = clusterKey(row);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

let upserts = 0;

for (const [key, items] of groups.entries()) {
  if (!items.length) continue;

  const first = items[0];
  const usageCount = items.length;
  if (usageCount < 2) continue;

  const payload = {
    shop_id: first.shop_id,
    template_key: key,
    label:
      clean(first.job_category) ||
      clean(first.correction) ||
      clean(first.complaint) ||
      "Learned template",
    job_category: clean(first.job_category) || null,
    default_labor_hours: avg(items.map((x) => Number(x.labor_time ?? 0))),
    default_parts: collectParts(items),
    tags: collectTags(items),
    usage_count: usageCount,
    confidence_score: Math.min(0.98, 0.45 + usageCount * 0.05),
    normalized_text: first.normalized_text || null,
    embedding: first.embedding || null,
    source_work_order_id: first.work_order_id || null,
    source_work_order_line_id: first.work_order_line_id || null,
    last_seen_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from("learned_job_templates")
    .upsert(payload, { onConflict: "shop_id,template_key" });

  if (upsertError) {
    console.error("Template upsert failed:", key, upsertError.message);
    continue;
  }

  upserts += 1;
  console.log("Template upserted:", key);
}

console.log(`Done. Upserted ${upserts} learned_job_templates rows.`);
