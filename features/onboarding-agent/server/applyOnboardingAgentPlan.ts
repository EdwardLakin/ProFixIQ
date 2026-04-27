import type { SupabaseClient } from "@supabase/supabase-js";
import { fingerprintForDomain } from "@/features/onboarding-agent/lib/fingerprints";
import { buildStagedLinks } from "@/features/onboarding-agent/lib/graph";
import { normalizeRow } from "@/features/onboarding-agent/lib/normalization";
import { nextStatusFromCounts } from "@/features/onboarding-agent/lib/sessionStatus";
import { stageEntityFromNormalized } from "@/features/onboarding-agent/lib/staging";
import { buildOnboardingSummary, groupReviewItems } from "@/features/onboarding-agent/lib/summaries";
import type { OnboardingDomain } from "@/features/onboarding-agent/lib/domains";
import type { OnboardingAgentPlan } from "@/features/onboarding-agent/lib/agentPlanTypes";
import { detectFileDomain } from "@/features/onboarding-agent/lib/fileDetection";
import { buildEffectiveHeaderMap } from "@/features/onboarding-agent/lib/headerMapping";
import { fetchOnboardingRawRows } from "@/features/onboarding-agent/server/fetchOnboardingRawRows";
import { countOnboardingRawRows } from "@/features/onboarding-agent/server/rawRowCounts";

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

const DOMAIN_TO_ENTITY: Record<string, OnboardingDomain> = {
  customers: "customers",
  vehicles: "vehicles",
  history: "history",
  invoices: "invoices",
  parts: "parts",
  vendors: "vendors",
  staff: "staff",
  menu: "menu",
  inspections: "inspections",
  unknown: "unknown",
};

function remapHeaders(raw: Record<string, unknown>, map: Record<string, string>) {
  const out: Record<string, string> = {};
  const normalizeKey = (value: string) => value.toLowerCase().replace(/[_-\s]+/g, " ").trim();
  const normalizedMap = Object.fromEntries(Object.entries(map).map(([source, target]) => [normalizeKey(source), target]));

  for (const [k, v] of Object.entries(raw)) {
    const key = map[k] ?? map[k.toLowerCase()] ?? normalizedMap[normalizeKey(k)] ?? k;
    const stringValue = typeof v === "string" ? v : String(v ?? "");
    if (!(key in out) || !out[key]) out[key] = stringValue;
    if (!(k in out)) out[k] = stringValue;
  }
  return out;
}

export async function applyOnboardingAgentPlan(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
  plan: OnboardingAgentPlan;
}) {
  const sb = params.supabase as any;
  await sb.from("onboarding_entities").delete().eq("shop_id", params.shopId).eq("session_id", params.sessionId);
  await sb.from("onboarding_entity_links").delete().eq("shop_id", params.shopId).eq("session_id", params.sessionId);
  await sb.from("onboarding_review_items").delete().eq("shop_id", params.shopId).eq("session_id", params.sessionId);

  const fileMap = new Map(params.plan.files.map((file) => [file.fileId, file]));
  const { data: filesData } = await sb
    .from("onboarding_files")
    .select("id, original_filename, declared_domain, detected_domain, header_row")
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId);
  const fileMetadataById = new Map((filesData ?? []).map((file: any) => [file.id, file]));
  const rawRowsByFile = new Map<string, any[]>();
  const rows = await fetchOnboardingRawRows({
    sb,
    shopId: params.shopId,
    sessionId: params.sessionId,
    select: "id, file_id, source_row_index, raw",
  });

  for (const row of rows) {
    const list = rawRowsByFile.get(row.file_id) ?? [];
    list.push(row);
    rawRowsByFile.set(row.file_id, list);
  }

  const stagedEntities: any[] = [];
  const reviewItems: any[] = [];
  const stagedByDomain: Record<string, number> = {};
  const reviewByDomain: Record<string, number> = {};

  for (const [fileId, fileRows] of rawRowsByFile.entries()) {
    const planFile = fileMap.get(fileId);
    const fileMeta = (fileMetadataById.get(fileId) ?? null) as any;
    const deterministicDomain = detectFileDomain({
      filename: fileMeta?.original_filename,
      headers: Array.isArray(fileMeta?.header_row) ? fileMeta.header_row : [],
      declaredDomain: fileMeta?.declared_domain ?? null,
    });
    const effectiveDomain = planFile?.inferredDomain && planFile.inferredDomain !== "unknown"
      ? planFile.inferredDomain
      : (fileMeta?.detected_domain && fileMeta.detected_domain !== "unknown"
          ? fileMeta.detected_domain
          : (fileMeta?.declared_domain && fileMeta.declared_domain !== "unknown"
              ? fileMeta.declared_domain
              : deterministicDomain));
    const domain = DOMAIN_TO_ENTITY[effectiveDomain] ?? "unknown";
    const fileHeaders = Array.isArray(fileMeta?.header_row) ? fileMeta.header_row : [];
    const { headerMap, mappingSource } = buildEffectiveHeaderMap({ domain, headers: fileHeaders, aiHeaderMap: planFile?.headerMap ?? {} });
    const parserMode = planFile?.recommendedParserMode ?? (domain === "unknown" ? "stage_review_only" : "stage_entities");
    let stagedForFile = 0;
    let reviewForFile = 0;
    let missingIdentity = 0;
    let didTraceRow = false;

    if (parserMode === "ignore" || parserMode === "unsupported") {
      reviewItems.push({ severity: "medium", domain, issue_type: "ignored_file", summary: `File ${planFile?.filename ?? fileId} ignored by plan`, details: { fileId } });
      continue;
    }

    for (const row of fileRows) {
      const mappedRow = remapHeaders((row.raw ?? {}) as Record<string, unknown>, headerMap);
      const normalized = normalizeRow(domain, mappedRow);
      const fingerprint = fingerprintForDomain(domain, normalized.normalized);
      const staged = stageEntityFromNormalized({
        domain,
        normalized: normalized.normalized,
        displayName: normalized.displayName,
        sourceFileId: fileId,
        sourceRowId: row.id,
        sourceRowIndex: Number(row.source_row_index ?? 0),
        shopId: params.shopId,
        sessionId: params.sessionId,
        canonicalFingerprint: fingerprint,
      });
      if (staged.entity && parserMode === "stage_entities") {
        stagedEntities.push(staged.entity);
        stagedForFile += 1;
        stagedByDomain[domain] = (stagedByDomain[domain] ?? 0) + 1;
      }
      if (staged.reviewItems.length) {
        missingIdentity += staged.reviewItems.filter((item) => item.issue_type === "missing_identity").length;
        reviewForFile += staged.reviewItems.length;
        reviewByDomain[domain] = (reviewByDomain[domain] ?? 0) + staged.reviewItems.length;
        reviewItems.push(...staged.reviewItems.map((item) => ({ severity: item.severity, domain: item.domain, issue_type: item.issue_type, summary: item.summary, details: item.details })));
      }

      if (!didTraceRow) {
        didTraceRow = true;
        console.info("[onboarding-agent] row trace", {
          sessionId: params.sessionId,
          shopId: params.shopId,
          fileId,
          filename: planFile?.filename ?? fileMeta?.original_filename ?? fileId,
          inferredDomain: effectiveDomain,
          rowIndex: Number(row.source_row_index ?? 0),
          rawHeaderKeys: Object.keys((row.raw ?? {}) as Record<string, unknown>),
          effectiveMappedKeys: Object.keys(mappedRow).filter((key) => key in normalized.normalized),
          normalizedKeysPresent: Object.entries(normalized.normalized).filter(([, value]) => {
            if (typeof value === "string") return value.trim().length > 0;
            if (typeof value === "number") return Number.isFinite(value);
            return Boolean(value);
          }).map(([key]) => key),
          entityStaged: Boolean(staged.entity && parserMode === "stage_entities"),
          reviewIssueTypes: staged.reviewItems.map((item) => item.issue_type),
          fingerprint: fingerprint ?? null,
        });
      }
    }
    console.info("[onboarding-agent] file staging details", {
      sessionId: params.sessionId,
      shopId: params.shopId,
      fileId,
      filename: planFile?.filename ?? fileMeta?.original_filename ?? fileId,
      domain,
      parserMode,
      rawRowsProcessed: fileRows.length,
      rowsStaged: stagedForFile,
      rowsReview: reviewForFile,
      mappedColumns: Object.keys(headerMap).length,
      mappingSource,
      missingIdentity,
    });

    await sb.from("onboarding_files").update({
      detected_domain: effectiveDomain,
      parse_status: "parsed",
    }).eq("shop_id", params.shopId).eq("id", fileId);
  }

  for (const group of params.plan.reviewGroups) {
    const normalizedDomain = DOMAIN_TO_ENTITY[group.domain] ? group.domain : "unknown";
    reviewItems.push({
      severity: group.severity,
      domain: normalizedDomain,
      issue_type: group.issueType,
      summary: group.summary,
      details: { sampleRows: group.sampleRows, affectedRowCount: group.affectedRowCount, recommendedAction: group.recommendedAction },
    });
  }

  const entities = await insertInChunks(sb, "onboarding_entities", stagedEntities, "id, entity_type, status, normalized");
  const graph = buildStagedLinks({ entities: (entities ?? []).map((e: any) => ({ ...e, normalized: e.normalized ?? {} })), shopId: params.shopId, sessionId: params.sessionId });
  const linksToInsert = graph.links.map((link) => ({ ...link, shop_id: params.shopId, session_id: params.sessionId }));
  const insertedLinks = await insertInChunks(sb, "onboarding_entity_links", linksToInsert, "id, link_type, status");

  reviewItems.push(...graph.reviewItems);

  const groupedReviewItems = groupReviewItems(reviewItems as any).map((item) => ({
    shop_id: params.shopId,
    session_id: params.sessionId,
    entity_id: null,
    severity: item.severity,
    domain: item.domain,
    issue_type: item.issue_type,
    summary: item.summary,
    details: item.details,
    status: "pending",
  }));
  await insertInChunks(sb, "onboarding_review_items", groupedReviewItems);

  const { data: files } = await sb.from("onboarding_files").select("id").eq("shop_id", params.shopId).eq("session_id", params.sessionId);
  const rowsParsedTotal = await countOnboardingRawRows({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  const canonical = buildOnboardingSummary({
    filesCount: (files ?? []).length,
    rowsParsed: rowsParsedTotal,
    entityRows: (entities ?? []).map((e: any) => ({ entity_type: e.entity_type, status: e.status })),
    linkRows: (insertedLinks ?? []).map((l: any) => ({ link_type: l.link_type, status: l.status })),
    reviewRows: groupedReviewItems.map((item) => ({ severity: item.severity, domain: item.domain, issue_type: item.issue_type, summary: item.summary, details: item.details, status: item.status })),
    groupedExceptionCount: groupedReviewItems.length,
    analysisCompleted: true,
  });

  const blockingCount = (canonical.review_counts_by_severity.blocking ?? 0) + (canonical.review_counts_by_severity.high ?? 0);
  let status = nextStatusFromCounts({ fileCount: (files ?? []).length, blockingReviewCount: blockingCount });
  if (params.plan.activationReadiness === "blocked") status = "blocked";
  if (params.plan.reviewGroups.length > 0 && status === "analysis_ready") status = "review_required";

  const { data: session } = await sb.from("onboarding_sessions").select("summary").eq("id", params.sessionId).eq("shop_id", params.shopId).maybeSingle();
  const existingSummary = (session?.summary && typeof session.summary === "object") ? session.summary : {};
  const summary = {
    ...existingSummary,
    ...canonical.summaryCounts,
    aiRowsSampled: Number(existingSummary.aiRowsSampled ?? 0),
    aiFilesSampled: Number(existingSummary.aiFilesSampled ?? 0),
    activationReadiness: canonical.activation_readiness,
    activationPlanSummary: canonical.activation_plan_summary,
    liveRecordsCreated: 0,
    agentPlan: params.plan,
    agentReport: {
      mode: params.plan.mode,
      model: params.plan.model ?? null,
      summary: params.plan.summary,
      activationReadiness: { status: params.plan.activationReadiness },
      liveRecordsCreated: 0,
    },
  };

  await sb.from("onboarding_sessions").update({
    status,
    analyzed_at: new Date().toISOString(),
    stats: canonical,
    summary,
  }).eq("id", params.sessionId).eq("shop_id", params.shopId);

  console.info("[onboarding-agent] persisted staging counts by domain", {
    sessionId: params.sessionId,
    shopId: params.shopId,
    stagedByDomain,
    reviewByDomain,
  });

  return { canonical, status, summary };
}
