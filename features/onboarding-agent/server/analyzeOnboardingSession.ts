import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCsvText } from "@/features/onboarding-agent/lib/csvParsing";
import { detectFileDomain } from "@/features/onboarding-agent/lib/fileDetection";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import { applyOnboardingAgentPlan } from "@/features/onboarding-agent/server/applyOnboardingAgentPlan";
import { buildOnboardingAgentInput } from "@/features/onboarding-agent/server/buildOnboardingAgentInput";
import { runOpenAIOnboardingPlan } from "@/features/onboarding-agent/server/runOpenAIOnboardingPlan";

const INSERT_CHUNK_SIZE = 1000;

async function insertInChunks(sb: any, table: string, rows: any[], returning?: string) {
  if (!rows.length) return [];
  const output: any[] = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    let query = sb.from(table).insert(chunk);
    if (returning) query = query.select(returning);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (Array.isArray(data)) output.push(...data);
  }
  return output;
}

export async function analyzeOnboardingSession(params: { supabase: SupabaseClient; shopId: string; sessionId: string }) {
  const sb = params.supabase as any;
  await assertOnboardingSessionOwnership({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  const { data: files, error: filesError } = await sb
    .from("onboarding_files")
    .select("id, storage_bucket, storage_path, original_filename, declared_domain")
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId)
    .order("created_at", { ascending: true });
  if (filesError) throw new Error(filesError.message);

  await sb.from("onboarding_sessions").update({ status: "analyzing" }).eq("id", params.sessionId).eq("shop_id", params.shopId);

  await sb.from("onboarding_raw_rows").delete().eq("shop_id", params.shopId).eq("session_id", params.sessionId);

  for (const file of files ?? []) {
    const dl = await sb.storage.from(file.storage_bucket).download(file.storage_path);
    if (dl.error || !dl.data) {
      const { error: updateError } = await sb
        .from("onboarding_files")
        .update({ parse_status: "failed", parse_error: dl.error?.message ?? "download failed" })
        .eq("id", file.id)
        .eq("shop_id", params.shopId);
      if (updateError) throw new Error(updateError.message);
      continue;
    }

    const text = await dl.data.text();
    const parsed = parseCsvText(text);
    const detectedDomain = detectFileDomain({
      filename: file.original_filename ?? file.storage_path,
      headers: parsed.headers,
      declaredDomain: file.declared_domain,
    });

    const rawRowsPayload = parsed.rows.map((row, index) => ({
      shop_id: params.shopId,
      session_id: params.sessionId,
      file_id: file.id,
      source_row_index: index,
      raw: row,
      normalized_preview: {},
      detected_domain: detectedDomain,
      row_hash: `${file.id}:${index}`,
      parse_status: "parsed",
    }));

    await insertInChunks(sb, "onboarding_raw_rows", rawRowsPayload);

    const { error: fileUpdateError } = await sb
      .from("onboarding_files")
      .update({ parse_status: "parsed", row_count: parsed.rows.length, detected_domain: detectedDomain, header_row: parsed.headers })
      .eq("id", file.id)
      .eq("shop_id", params.shopId);
    if (fileUpdateError) throw new Error(fileUpdateError.message);
  }

  const input = await buildOnboardingAgentInput({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  const requireAi = process.env.ONBOARDING_AGENT_REQUIRE_AI === "true";
  const { plan, warning } = await runOpenAIOnboardingPlan({ input, requireAi });
  const applied = await applyOnboardingAgentPlan({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
    plan,
  });

  return {
    mode: plan.mode,
    warning,
    planSummary: {
      summary: plan.summary,
      confidence: plan.confidence,
      activationReadiness: plan.activationReadiness,
      model: plan.model ?? null,
      files: plan.files.length,
    },
    sessionSummary: applied.summary,
    liveRecordsCreated: 0 as const,
  };
}
