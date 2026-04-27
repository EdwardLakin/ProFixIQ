import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCsvText } from "@/features/onboarding-agent/lib/csvParsing";
import { detectFileDomain } from "@/features/onboarding-agent/lib/fileDetection";
import { fingerprintForDomain } from "@/features/onboarding-agent/lib/fingerprints";
import { buildStagedLinks } from "@/features/onboarding-agent/lib/graph";
import { normalizeRow } from "@/features/onboarding-agent/lib/normalization";
import { nextStatusFromCounts } from "@/features/onboarding-agent/lib/sessionStatus";
import { markDuplicateEntities, stageEntityFromNormalized } from "@/features/onboarding-agent/lib/staging";
import { buildOnboardingSummary, groupReviewItems } from "@/features/onboarding-agent/lib/summaries";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";

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
  await sb.from("onboarding_entities").delete().eq("shop_id", params.shopId).eq("session_id", params.sessionId);
  await sb.from("onboarding_entity_links").delete().eq("shop_id", params.shopId).eq("session_id", params.sessionId);
  await sb.from("onboarding_review_items").delete().eq("shop_id", params.shopId).eq("session_id", params.sessionId);

  const stagedEntities: any[] = [];
  const reviewItems: any[] = [];
  let totalRows = 0;

  for (const file of files ?? []) {
    const dl = await sb.storage.from(file.storage_bucket).download(file.storage_path);
    if (dl.error || !dl.data) {
      reviewItems.push({
        severity: "blocking",
        domain: "unknown",
        issue_type: "parse_error",
        summary: `Failed to read ${file.original_filename ?? file.storage_path}`,
        details: {},
      });
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
    totalRows += parsed.rows.length;

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

    const rawRows = await insertInChunks(sb, "onboarding_raw_rows", rawRowsPayload, "id, source_row_index");
    const rawRowsByIndex = new Map<number, string>((rawRows ?? []).map((row: any) => [Number(row.source_row_index), row.id]));

    parsed.rows.forEach((row, index) => {
      const normalized = normalizeRow(detectedDomain as any, row);
      const fingerprint = fingerprintForDomain(detectedDomain as any, normalized.normalized);
      const staged = stageEntityFromNormalized({
        domain: detectedDomain as any,
        normalized: normalized.normalized,
        displayName: normalized.displayName,
        sourceFileId: file.id,
        sourceRowId: rawRowsByIndex.get(index) ?? null,
        sourceRowIndex: index,
        shopId: params.shopId,
        sessionId: params.sessionId,
        canonicalFingerprint: fingerprint,
      });

      if (staged.entity) stagedEntities.push(staged.entity);
      reviewItems.push(...staged.reviewItems.map((item) => ({ severity: item.severity, domain: item.domain, issue_type: item.issue_type, summary: item.summary, details: item.details })));
    });

    const { error: fileUpdateError } = await sb
      .from("onboarding_files")
      .update({ parse_status: "parsed", row_count: parsed.rows.length, detected_domain: detectedDomain, header_row: parsed.headers })
      .eq("id", file.id)
      .eq("shop_id", params.shopId);
    if (fileUpdateError) throw new Error(fileUpdateError.message);
  }

  reviewItems.push(...markDuplicateEntities(stagedEntities, { shopId: params.shopId, sessionId: params.sessionId }).map((item) => ({
    severity: item.severity,
    domain: item.domain,
    issue_type: item.issue_type,
    summary: item.summary,
    details: item.details,
  })));

  const entities = await insertInChunks(sb, "onboarding_entities", stagedEntities, "id, entity_type, status, normalized, display_name, source_external_id");

  const graph = buildStagedLinks({ entities: entities.map((e: any) => ({ ...e, normalized: e.normalized ?? {} })), shopId: params.shopId, sessionId: params.sessionId });
  reviewItems.push(...graph.reviewItems.map((item) => ({ severity: item.severity, domain: item.domain, issue_type: item.issue_type, summary: item.summary, details: item.details })));

  const linksToInsert = graph.links.map((link) => ({ ...link, shop_id: params.shopId, session_id: params.sessionId }));
  const insertedLinks = await insertInChunks(sb, "onboarding_entity_links", linksToInsert, "id, link_type, status");

  const groupedReviewItems = groupReviewItems(reviewItems as any).map((item) => ({
    shop_id: params.shopId,
    session_id: params.sessionId,
    entity_id: null,
    severity: item.severity,
    domain: item.domain,
    issue_type: item.issue_type,
    summary: item.summary,
    details: {
      count: item.count,
      sampleRowIndexes: item.sampleRowIndexes,
      sampleNormalizedValues: item.sampleNormalizedValues,
      recommendedAction: item.recommended_action,
      ...item.details,
    },
    status: "pending",
  }));
  await insertInChunks(sb, "onboarding_review_items", groupedReviewItems);

  const canonical = buildOnboardingSummary({
    filesCount: (files ?? []).length,
    rowsParsed: totalRows,
    entityRows: (entities ?? []).map((e: any) => ({ entity_type: e.entity_type, status: e.status })),
    linkRows: (insertedLinks ?? []).map((l: any) => ({ link_type: l.link_type, status: l.status })),
    reviewRows: groupedReviewItems.map((item) => ({ severity: item.severity, domain: item.domain, issue_type: item.issue_type, summary: item.summary, details: item.details, status: item.status })),
    groupedExceptionCount: groupedReviewItems.length,
    analysisCompleted: true,
  });

  const blockingCount = (canonical.review_counts_by_severity.blocking ?? 0) + (canonical.review_counts_by_severity.high ?? 0);
  const status = nextStatusFromCounts({ fileCount: (files ?? []).length, blockingReviewCount: blockingCount });

  const summary = {
    ...canonical.summaryCounts,
    activationReadiness: canonical.activation_readiness,
    activationPlanSummary: canonical.activation_plan_summary,
    liveRecordsCreated: 0 as const,
  };

  await sb
    .from("onboarding_sessions")
    .update({ status, analyzed_at: new Date().toISOString(), summary, stats: canonical })
    .eq("id", params.sessionId)
    .eq("shop_id", params.shopId);

  return summary;
}
