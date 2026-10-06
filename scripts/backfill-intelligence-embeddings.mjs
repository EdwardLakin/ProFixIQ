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

const EMBEDDING_MODEL = "text-embedding-3-small";
const RATE_CARD_VERSION = "openai-2026-10-06-v3";

// Operator script, outside the app runtime: it writes the same private usage
// ledger row the app's ledgerOpenAICall writes, through the service-role RPC.
async function ledgerEmbedding({ shopId, usage, status, startedAt, errorMessage }) {
  const promptTokens = Number.isFinite(usage?.prompt_tokens) ? usage.prompt_tokens : null;
  const { error: ledgerError } = await supabase.rpc("record_ai_usage_ledger", {
    p_shop_id: shopId ?? null,
    p_user_id: null,
    p_payload: {
      event_key: crypto.randomUUID(),
      feature: "intelligence_embedding_backfill",
      endpoint: "scripts/backfill-intelligence-embeddings",
      provider: "openai",
      model: EMBEDDING_MODEL,
      modality: "other",
      rate_card_version: RATE_CARD_VERSION,
      prompt_tokens: promptTokens,
      total_tokens: Number.isFinite(usage?.total_tokens) ? usage.total_tokens : promptTokens,
      estimated_cost_usd:
        promptTokens == null ? null : Number(((promptTokens / 1_000_000) * 0.02).toFixed(8)),
      latency_ms: Math.max(0, Date.now() - startedAt),
      status,
      error_code: status === "error" ? "provider_error" : null,
      error_message: errorMessage ? errorMessage.slice(0, 200) : null,
      operation: "embedding",
    },
  });
  if (ledgerError) console.error("Ledger write failed:", ledgerError.message);
}

async function createEmbedding(text, shopId) {
  const startedAt = Date.now();
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    await ledgerEmbedding({
      shopId,
      usage: null,
      status: "error",
      startedAt,
      errorMessage: `Embedding request failed: ${res.status}`,
    });
    throw new Error(`Embedding request failed: ${res.status} ${body}`);
  }

  const json = await res.json();
  await ledgerEmbedding({ shopId, usage: json.usage, status: "success", startedAt });
  return json.data?.[0]?.embedding ?? null;
}

const { data: rows, error } = await supabase
  .from("work_order_intelligence")
  .select(
    "id, shop_id, complaint, symptom, cause, correction, job_category, vehicle_make, vehicle_model, vehicle_year, normalized_text, embedding",
  )
  .limit(500);

if (error) throw error;

let updated = 0;

for (const row of rows ?? []) {
  if (row.embedding) continue;

  const text = normalized(row);
  if (!text) continue;

  const vector = await createEmbedding(text, row.shop_id);
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
