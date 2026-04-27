import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCsvText } from "@/features/onboarding-agent/lib/csvParsing";
import { detectFileDomain } from "@/features/onboarding-agent/lib/fileDetection";
import { fingerprintForDomain } from "@/features/onboarding-agent/lib/fingerprints";
import { buildSimpleLinks } from "@/features/onboarding-agent/lib/graph";
import { normalizeRow } from "@/features/onboarding-agent/lib/normalization";
import { nextStatusFromCounts } from "@/features/onboarding-agent/lib/sessionStatus";
import { makeReviewItem } from "@/features/onboarding-agent/lib/staging";

export async function analyzeOnboardingSession(params: { supabase: SupabaseClient; shopId: string; sessionId: string }) {
  const sb = params.supabase as any;

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
      reviewItems.push(makeReviewItem({ shopId: params.shopId, sessionId: params.sessionId, severity: "blocking", domain: "unknown", issueType: "parse_error", summary: `Failed to read ${file.original_filename ?? file.storage_path}` }));
      await sb.from("onboarding_files").update({ parse_status: "failed", parse_error: dl.error?.message ?? "download failed" }).eq("id", file.id).eq("shop_id", params.shopId);
      continue;
    }

    const text = await dl.data.text();
    const parsed = parseCsvText(text);
    const detectedDomain = detectFileDomain({ filename: file.original_filename ?? file.storage_path, headers: parsed.headers, declaredDomain: file.declared_domain });
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

    const { data: rawRows } = await sb.from("onboarding_raw_rows").insert(rawRowsPayload).select("id, source_row_index");

    for (const row of parsed.rows) {
      const normalized = normalizeRow(detectedDomain as any, row);
      const fingerprint = fingerprintForDomain(detectedDomain as any, normalized.normalized);
      stagedEntities.push({
        shop_id: params.shopId,
        session_id: params.sessionId,
        entity_type: normalized.entityType,
        source_file_id: file.id,
        source_row_index: 0,
        source_external_id: String((normalized.normalized as any).sourceCustomerId ?? (normalized.normalized as any).sourceWorkOrderId ?? "") || null,
        canonical_fingerprint: fingerprint,
        display_name: normalized.displayName,
        normalized: normalized.normalized,
        confidence: 0.7,
        status: "staged",
      });
    }

    await sb.from("onboarding_files").update({ parse_status: "parsed", row_count: parsed.rows.length, detected_domain: detectedDomain, header_row: parsed.headers }).eq("id", file.id).eq("shop_id", params.shopId);

    if (detectedDomain === "unknown") {
      reviewItems.push(makeReviewItem({ shopId: params.shopId, sessionId: params.sessionId, severity: "blocking", domain: "unknown", issueType: "unsupported_file", summary: `Unsupported file type for ${file.original_filename ?? file.storage_path}` }));
    }

    void rawRows;
  }

  const { data: entities } = await sb.from("onboarding_entities").insert(stagedEntities).select("id, entity_type, normalized");

  const links = buildSimpleLinks((entities ?? []).map((entity: any) => ({ ...entity, normalized: entity.normalized ?? {} })));
  if (links.length) {
    await sb.from("onboarding_entity_links").insert(links.map((link) => ({ ...link, shop_id: params.shopId, session_id: params.sessionId, status: "staged" })));
  }

  for (const entity of entities ?? []) {
    if (entity.entity_type === "customer") {
      const normalized = entity.normalized ?? {};
      if (!normalized.name && !normalized.email && !normalized.phone && !normalized.businessName && !normalized.sourceCustomerId) {
        reviewItems.push(makeReviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, severity: "blocking", domain: "customers", issueType: "missing_identity", summary: "Customer row missing identity fields" }));
      }
    }
  }

  if (reviewItems.length) await sb.from("onboarding_review_items").insert(reviewItems);

  const blockingCount = reviewItems.filter((item) => item.severity === "blocking").length;
  const status = nextStatusFromCounts({ fileCount: (files ?? []).length, blockingReviewCount: blockingCount });

  const summary = {
    fileCount: (files ?? []).length,
    rowsParsed: totalRows,
    entitiesDiscovered: (entities ?? []).length,
    linksFound: links.length,
    reviewExceptions: reviewItems.length,
    liveRecordsCreated: 0,
  };

  await sb.from("onboarding_sessions").update({ status, analyzed_at: new Date().toISOString(), summary, stats: summary }).eq("id", params.sessionId).eq("shop_id", params.shopId);

  return summary;
}
