import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCsvText } from "@/features/onboarding-agent/lib/csvParsing";
import { detectFileDomain } from "@/features/onboarding-agent/lib/fileDetection";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import { applyOnboardingAgentPlan } from "@/features/onboarding-agent/server/applyOnboardingAgentPlan";
import { buildOnboardingAgentInput } from "@/features/onboarding-agent/server/buildOnboardingAgentInput";
import { runOpenAIOnboardingPlan } from "@/features/onboarding-agent/server/runOpenAIOnboardingPlan";
import { resetOnboardingAnalysisArtifacts } from "@/features/onboarding-agent/server/resetOnboardingAnalysisArtifacts";

const INSERT_CHUNK_SIZE = 1000;

export class OnboardingAnalysisConflictError extends Error {
  status = 409 as const;
}

function isDuplicateRawRowConstraintError(message: string) {
  return message.includes("onboarding_raw_rows_shop_id_file_id_source_row_index_key");
}

async function upsertInChunks(
  sb: any,
  table: string,
  rows: any[],
  options: {
    onConflict: string;
    returning?: string;
  },
) {
  if (!rows.length) return [];
  const output: any[] = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    let query = sb.from(table).upsert(chunk, { onConflict: options.onConflict });
    if (options.returning) query = query.select(options.returning);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (Array.isArray(data)) output.push(...data);
  }
  return output;
}

async function acquireAnalysisRunGuard(params: { sb: any; shopId: string; sessionId: string }) {
  const { data, error } = await params.sb
    .from("onboarding_sessions")
    .update({ status: "analyzing_started" })
    .eq("id", params.sessionId)
    .eq("shop_id", params.shopId)
    .neq("status", "analyzing")
    .neq("status", "analyzing_started")
    .neq("status", "clearing_previous_analysis")
    .neq("status", "applying_analysis")
    .select("id,status");

  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length < 1) {
    throw new OnboardingAnalysisConflictError("Analysis is already running for this session.");
  }
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

  await acquireAnalysisRunGuard({ sb, shopId: params.shopId, sessionId: params.sessionId });

  try {
    await resetOnboardingAnalysisArtifacts({
      supabase: params.supabase,
      shopId: params.shopId,
      sessionId: params.sessionId,
    });
    await sb.from("onboarding_sessions").update({ status: "applying_analysis" }).eq("id", params.sessionId).eq("shop_id", params.shopId);

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
        error_reason: null,
      }));

      await upsertInChunks(sb, "onboarding_raw_rows", rawRowsPayload, {
        onConflict: "shop_id,file_id,source_row_index",
      });

      const { error: fileUpdateError } = await sb
        .from("onboarding_files")
        .update({ parse_status: "parsed", parse_error: null, row_count: parsed.rows.length, detected_domain: detectedDomain, header_row: parsed.headers })
        .eq("id", file.id)
        .eq("shop_id", params.shopId);
      if (fileUpdateError) throw new Error(fileUpdateError.message);
    }

    const input = await buildOnboardingAgentInput({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

    const aiRowsSampled = input.files.reduce((sum, file) => sum + (Array.isArray(file.sampleRows) ? file.sampleRows.length : 0), 0);
    const aiFilesSampled = input.files.filter((file) => Array.isArray(file.sampleRows) && file.sampleRows.length > 0).length;

    const { data: sessionForAiSummary } = await sb
    .from("onboarding_sessions")
    .select("summary")
    .eq("id", params.sessionId)
    .eq("shop_id", params.shopId)
    .maybeSingle();
    const existingAiSummary = (sessionForAiSummary?.summary && typeof sessionForAiSummary.summary === "object") ? sessionForAiSummary.summary : {};
    await sb.from("onboarding_sessions").update({
      summary: {
        ...existingAiSummary,
        aiRowsSampled,
        aiFilesSampled,
        liveRecordsCreated: 0,
      },
    }).eq("id", params.sessionId).eq("shop_id", params.shopId);

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
  } catch (error) {
    if (error instanceof OnboardingAnalysisConflictError) {
      throw error;
    }

    const rawMessage = error instanceof Error ? error.message : "Analysis failed";
    const message = isDuplicateRawRowConstraintError(rawMessage)
      ? "Raw row rebuild was not idempotent; rerun aborted before staged activation."
      : rawMessage;
    const { data: failedSession } = await sb.from("onboarding_sessions").select("summary").eq("id", params.sessionId).eq("shop_id", params.shopId).maybeSingle();
    const failedSummary = (failedSession?.summary && typeof failedSession.summary === "object") ? failedSession.summary : {};
    await sb.from("onboarding_sessions").update({
      status: "analysis_failed",
      summary: {
        ...failedSummary,
        analysisError: message,
        analysisFailedAt: new Date().toISOString(),
        liveRecordsCreated: 0,
      },
    }).eq("id", params.sessionId).eq("shop_id", params.shopId);
    throw error;
  }
}
