import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!url || !key || !openaiKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY",
  );
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function clean(v) {
  return typeof v === "string" ? v.trim() : "";
}

function normalized(row) {
  return [
    clean(row.job_category),
    clean(row.complaint),
    clean(row.symptom),
    clean(row.cause),
    clean(row.correction),
    row.vehicle_year ? String(row.vehicle_year) : "",
    clean(row.vehicle_make),
    clean(row.vehicle_model),
  ]
    .filter(Boolean)
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toVectorLiteral(values) {
  return `[${values.join(",")}]`;
}

async function createEmbedding(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Embedding request failed: ${res.status} ${body}`);
  }

  const json = await res.json();
  return json.data?.[0]?.embedding ?? null;
}

const { data: rows, error } = await supabase
  .from("work_order_intelligence")
  .select(
    "id, complaint, symptom, cause, correction, job_category, vehicle_make, vehicle_model, vehicle_year, normalized_text, embedding",
  )
  .limit(500);

if (error) throw error;

let updated = 0;

for (const row of rows ?? []) {
  if (row.embedding) continue;

  const text = normalized(row);
  if (!text) continue;

  const vector = await createEmbedding(text);
  if (!vector) continue;

  const { error: updateError } = await supabase
    .from("work_order_intelligence")
    .update({
      normalized_text: text,
      embedding: toVectorLiteral(vector),
    })
    .eq("id", row.id);

  if (updateError) {
    console.error("Failed:", row.id, updateError.message);
    continue;
  }

  updated += 1;
  console.log("Embedded:", row.id);
}

console.log(`Done. Updated ${updated} work_order_intelligence rows.`);
