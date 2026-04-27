import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCsvText } from "@/features/onboarding-agent/lib/csvParsing";
import { detectFileDomain } from "@/features/onboarding-agent/lib/fileDetection";
import { fingerprintForDomain } from "@/features/onboarding-agent/lib/fingerprints";
import { buildStagedLinks } from "@/features/onboarding-agent/lib/graph";
import { normalizeRow } from "@/features/onboarding-agent/lib/normalization";
import { nextStatusFromCounts } from "@/features/onboarding-agent/lib/sessionStatus";
import { makeReviewItem, markDuplicateEntities, stageEntityFromNormalized } from "@/features/onboarding-agent/lib/staging";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";

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

  // Analyze is intentionally repeatable. We clear only staged analysis artifacts and recreate them.
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
      reviewItems.push(
        makeReviewItem({
          shopId: params.shopId,
          sessionId: params.sessionId,
          severity: "blocking",
          domain: "unknown",
          issueType: "parse_error",
          summary: `Failed to read ${file.original_filename ?? file.storage_path}`,
        }),
      );
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

    const { data: rawRows, error: rawRowsError } = await sb
      .from("onboarding_raw_rows")
      .insert(rawRowsPayload)
      .select("id, source_row_index");
    if (rawRowsError) throw new Error(rawRowsError.message);

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
      reviewItems.push(...staged.reviewItems);
    });

    const { error: fileUpdateError } = await sb
      .from("onboarding_files")
      .update({ parse_status: "parsed", row_count: parsed.rows.length, detected_domain: detectedDomain, header_row: parsed.headers })
      .eq("id", file.id)
      .eq("shop_id", params.shopId);
    if (fileUpdateError) throw new Error(fileUpdateError.message);

    if (detectedDomain === "unknown") {
      reviewItems.push(
        makeReviewItem({
          shopId: params.shopId,
          sessionId: params.sessionId,
          severity: "medium",
          domain: "unknown",
          issueType: "unsupported_file",
          summary: `Unsupported file type for ${file.original_filename ?? file.storage_path}`,
        }),
      );
    }
  }

  reviewItems.push(...markDuplicateEntities(stagedEntities, { shopId: params.shopId, sessionId: params.sessionId }));

  let entities: Array<{ id: string; entity_type: string; normalized: Record<string, unknown>; display_name?: string | null; source_external_id?: string | null }> = [];
  if (stagedEntities.length) {
    const { data: insertedEntities, error: entitiesError } = await sb
      .from("onboarding_entities")
      .insert(stagedEntities)
      .select("id, entity_type, normalized, display_name, source_external_id");
    if (entitiesError) throw new Error(entitiesError.message);
    entities = insertedEntities ?? [];
  }

  const graph = buildStagedLinks({ entities: entities.map((e) => ({ ...e, normalized: e.normalized ?? {} })), shopId: params.shopId, sessionId: params.sessionId });
  reviewItems.push(...graph.reviewItems);

  if (graph.links.length) {
    const { error: linksError } = await sb
      .from("onboarding_entity_links")
      .insert(graph.links.map((link) => ({ ...link, shop_id: params.shopId, session_id: params.sessionId })));
    if (linksError) throw new Error(linksError.message);
  }

  if (reviewItems.length) {
    const { error: reviewError } = await sb.from("onboarding_review_items").insert(reviewItems);
    if (reviewError) throw new Error(reviewError.message);
  }

  const blockingCount = reviewItems.filter((item) => item.severity === "blocking").length;
  const status = nextStatusFromCounts({ fileCount: (files ?? []).length, blockingReviewCount: blockingCount });

  const summary = {
    fileCount: (files ?? []).length,
    rowsParsed: totalRows,
    entitiesDiscovered: entities.length,
    linksFound: graph.links.length,
    reviewExceptions: reviewItems.length,
    liveRecordsCreated: 0 as const,
  };

  await sb
    .from("onboarding_sessions")
    .update({ status, analyzed_at: new Date().toISOString(), summary, stats: summary })
    .eq("id", params.sessionId)
    .eq("shop_id", params.shopId);

  return summary;
}
