import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OnboardingAgentDomainSummary,
  OnboardingAgentFinding,
  OnboardingAgentInput,
  OnboardingAgentRecommendation,
  OnboardingAgentReport,
} from "@/features/onboarding-agent/lib/agentTypes";
import { ONBOARDING_DOMAINS, type OnboardingDomain } from "@/features/onboarding-agent/lib/domains";
import { buildOnboardingAgentSystemPrompt, buildOnboardingAgentUserPrompt } from "@/features/onboarding-agent/server/prompts";
import { getOnboardingAgentEnabled, getOnboardingAgentModel } from "@/features/onboarding-agent/server/model";

type RunParams = {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
  sampleRowsPerFile?: number;
};

const VALID_SEVERITY = new Set(["info", "low", "medium", "high", "blocking"]);
const VALID_ACTION_TYPES = new Set([
  "accept_high_confidence",
  "review_exception",
  "upload_better_file",
  "map_column",
  "merge_duplicate",
  "ignore_row",
  "prepare_activation",
]);
const VALID_READINESS = new Set(["not_ready", "review_required", "ready_for_dry_run", "ready_for_activation_later"]);
const VALID_DOMAINS = new Set<string>([...ONBOARDING_DOMAINS, "all"]);

function stripJsonFences(raw: string) {
  return raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
}

function parseModelJson(raw: string): unknown {
  return JSON.parse(stripJsonFences(raw));
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toDomain(value: unknown, fallback: OnboardingDomain | "all" = "all"): OnboardingDomain | "all" {
  const maybe = typeof value === "string" ? value : "";
  return VALID_DOMAINS.has(maybe) ? (maybe as OnboardingDomain | "all") : fallback;
}

function boundedConfidence(value: unknown, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function sanitizeIds(ids: unknown, allow: Set<string>) {
  return asArray<unknown>(ids)
    .map((v) => (typeof v === "string" ? v : ""))
    .filter((id) => id && allow.has(id));
}

function buildActivationReadiness(input: OnboardingAgentInput) {
  const blockingItems = input.deterministicReviewItems.filter((item) => item.severity === "blocking");
  const warningItems = input.deterministicReviewItems.filter((item) => item.severity !== "blocking");

  if (blockingItems.length > 0) {
    return {
      status: "not_ready" as const,
      blockers: blockingItems.map((item) => item.summary),
      warnings: warningItems.map((item) => item.summary),
      safeToProceed: false,
    };
  }

  if (warningItems.length > 0) {
    return {
      status: "review_required" as const,
      blockers: [],
      warnings: warningItems.map((item) => item.summary),
      safeToProceed: true,
    };
  }

  return {
    status: "ready_for_dry_run" as const,
    blockers: [],
    warnings: ["Activation remains disabled in this phase; dry-run only."],
    safeToProceed: true,
  };
}

export function buildDeterministicFallbackReport(input: OnboardingAgentInput): OnboardingAgentReport {
  const rowsParsed = input.files.reduce((sum, file) => sum + file.rowCount, 0);
  const entitiesTotal = Object.values(input.deterministicStagedEntityCounts).reduce((sum, count) => sum + Number(count ?? 0), 0);
  const blockingCount = input.deterministicReviewItems.filter((item) => item.severity === "blocking").length;
  const readiness = buildActivationReadiness(input);

  const domainSummaries: OnboardingAgentDomainSummary[] = ONBOARDING_DOMAINS.map((domain) => {
    const fileRows = input.files.filter((file) => (file.detectedDomain ?? "unknown") === domain).reduce((sum, file) => sum + file.rowCount, 0);
    const reviewCount = input.deterministicReviewItems.filter((item) => (item.domain ?? "unknown") === domain).length;
    const entitiesDetected = Object.entries(input.deterministicStagedEntityCounts)
      .filter(([entityType]) => entityType.includes(domain.slice(0, -1)) || (domain === "history" && entityType === "historical_work_order") || (domain === "invoices" && entityType === "historical_invoice"))
      .reduce((sum, [, count]) => sum + Number(count ?? 0), 0);
    const readyCount = Math.max(0, entitiesDetected - reviewCount);

    return {
      domain,
      confidence: fileRows > 0 ? 0.8 : 0,
      rowsSeen: fileRows,
      entitiesDetected,
      readyCount,
      reviewCount,
      notes: fileRows > 0 ? ["Deterministic domain detection and normalization completed."] : [],
    };
  }).filter((item) => item.rowsSeen > 0 || item.entitiesDetected > 0 || item.reviewCount > 0);

  const findings: OnboardingAgentFinding[] = [
    {
      severity: "info",
      domain: "all",
      title: "Staged analysis completed",
      explanation: `${input.files.length} files registered, ${rowsParsed} rows parsed, ${entitiesTotal} staged entities detected.`,
      evidence: [
        `Files: ${input.files.length}`,
        `Rows parsed: ${rowsParsed}`,
        `Staged entities: ${entitiesTotal}`,
      ],
      recommendedAction: "Review exceptions and proceed with dry-run planning.",
    },
    {
      severity: blockingCount > 0 ? "blocking" : "low",
      domain: "all",
      title: blockingCount > 0 ? "Blocking review items found" : "No blocking review items found",
      explanation: blockingCount > 0
        ? `${blockingCount} blocking review items must be resolved before activation later.`
        : "No blocking review items remain; dry-run planning can proceed.",
      evidence: [`Blocking review count: ${blockingCount}`],
      recommendedAction: blockingCount > 0 ? "Resolve blocking review exceptions." : "Prepare activation dry-run summary.",
    },
  ];

  if (input.deterministicReviewItems.length > 0) {
    const topReview = input.deterministicReviewItems[0];
    findings.push({
      severity: topReview.severity === "blocking" ? "high" : "medium",
      domain: toDomain(topReview.domain, "all"),
      title: "Review exceptions require operator attention",
      explanation: `${input.deterministicReviewItems.length} review exceptions are pending.`,
      evidence: input.deterministicReviewItems.slice(0, 3).map((item) => item.summary),
      recommendedAction: "Review exception list and confirm data mappings.",
    });
  }

  const recommendations: OnboardingAgentRecommendation[] = [
    {
      actionType: blockingCount > 0 ? "review_exception" : "prepare_activation",
      domain: "all",
      confidence: 0.9,
      title: blockingCount > 0 ? "Resolve blocking exceptions" : "Prepare dry-run activation",
      explanation: blockingCount > 0
        ? "Blocking staged issues are preventing readiness. Resolve exceptions first."
        : "Data is ready for dry-run planning. Activation stays disabled in this phase.",
      riskLevel: blockingCount > 0 ? "high" : "low",
      affectedRowIds: input.deterministicReviewItems.map((item) => item.id),
    },
  ];

  return {
    model: getOnboardingAgentModel(),
    mode: "deterministic_fallback",
    summary: `Staged onboarding analysis completed. ${input.files.length} files, ${rowsParsed} rows, ${entitiesTotal} staged entities. No live records have been created.`,
    domainSummaries,
    findings,
    recommendations,
    activationReadiness: readiness,
    generatedAt: new Date().toISOString(),
    liveRecordsCreated: 0,
  };
}

export function sanitizeAgentReport(params: {
  candidate: unknown;
  fallback: OnboardingAgentReport;
  validEntityIds: Set<string>;
  validRowIds: Set<string>;
}): OnboardingAgentReport {
  const root = asRecord(params.candidate);
  const fallback = params.fallback;

  const readinessRoot = asRecord(root.activationReadiness);
  const readinessStatus = typeof readinessRoot.status === "string" && VALID_READINESS.has(readinessRoot.status)
    ? readinessRoot.status
    : fallback.activationReadiness.status;

  return {
    model: typeof root.model === "string" && root.model ? root.model : fallback.model,
    mode: root.mode === "ai" ? "ai" : fallback.mode,
    summary: typeof root.summary === "string" && root.summary ? root.summary : fallback.summary,
    domainSummaries: asArray<unknown>(root.domainSummaries).map((raw) => {
      const item = asRecord(raw);
      return {
        domain: toDomain(item.domain, "unknown") as OnboardingDomain,
        confidence: boundedConfidence(item.confidence, 0.5),
        rowsSeen: Number(item.rowsSeen ?? 0) || 0,
        entitiesDetected: Number(item.entitiesDetected ?? 0) || 0,
        readyCount: Number(item.readyCount ?? 0) || 0,
        reviewCount: Number(item.reviewCount ?? 0) || 0,
        notes: asArray<unknown>(item.notes).map((v) => String(v)),
      };
    }).filter((item) => ONBOARDING_DOMAINS.includes(item.domain)),
    findings: asArray<unknown>(root.findings).map((raw) => {
      const item = asRecord(raw);
      const severity = typeof item.severity === "string" && VALID_SEVERITY.has(item.severity) ? item.severity : "low";
      return {
        severity: severity as OnboardingAgentFinding["severity"],
        domain: toDomain(item.domain, "all"),
        title: String(item.title ?? "Untitled finding"),
        explanation: String(item.explanation ?? ""),
        evidence: asArray<unknown>(item.evidence).map((v) => String(v)),
        recommendedAction: String(item.recommendedAction ?? "Review staged data."),
      };
    }),
    recommendations: asArray<unknown>(root.recommendations).map((raw) => {
      const item = asRecord(raw);
      const actionType = typeof item.actionType === "string" && VALID_ACTION_TYPES.has(item.actionType)
        ? item.actionType
        : "review_exception";
      const risk = item.riskLevel === "high" || item.riskLevel === "medium" || item.riskLevel === "low" ? item.riskLevel : "medium";
      return {
        actionType: actionType as OnboardingAgentRecommendation["actionType"],
        domain: toDomain(item.domain, "all"),
        confidence: boundedConfidence(item.confidence, 0.5),
        title: String(item.title ?? "Untitled recommendation"),
        explanation: String(item.explanation ?? ""),
        affectedEntityIds: sanitizeIds(item.affectedEntityIds, params.validEntityIds),
        affectedRowIds: sanitizeIds(item.affectedRowIds, params.validRowIds),
        riskLevel: risk,
      };
    }),
    activationReadiness: {
      status: readinessStatus as OnboardingAgentReport["activationReadiness"]["status"],
      blockers: asArray<unknown>(readinessRoot.blockers).map((v) => String(v)),
      warnings: asArray<unknown>(readinessRoot.warnings).map((v) => String(v)),
      safeToProceed: Boolean(readinessRoot.safeToProceed),
    },
    generatedAt: typeof root.generatedAt === "string" && root.generatedAt ? root.generatedAt : fallback.generatedAt,
    liveRecordsCreated: 0,
  };
}

export async function callOnboardingAgentModel(input: OnboardingAgentInput): Promise<OnboardingAgentReport | null> {
  if (!getOnboardingAgentEnabled()) return null;
  const { openai } = await import("../../../lib/server/openai");

  const model = getOnboardingAgentModel();
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      { role: "system", content: buildOnboardingAgentSystemPrompt() },
      { role: "user", content: buildOnboardingAgentUserPrompt(input) },
    ],
    response_format: { type: "json_object" },
  });

  const text = completion.choices?.[0]?.message?.content;
  if (!text) return null;

  const parsed = parseModelJson(text);
  return parsed as OnboardingAgentReport;
}

export async function runOnboardingAgentAnalysis(params: RunParams): Promise<OnboardingAgentReport> {
  const sb = params.supabase as any;
  const configuredSampleSize = params.sampleRowsPerFile ?? Number(process.env.ONBOARDING_AGENT_SAMPLE_ROWS ?? 20);
  const sampleRowsPerFile = Math.max(1, Math.min(50, configuredSampleSize || 20));

  const { data: session } = await sb
    .from("onboarding_sessions")
    .select("id, shop_id, summary")
    .eq("shop_id", params.shopId)
    .eq("id", params.sessionId)
    .maybeSingle();

  if (!session) {
    throw new Error("Session not found");
  }

  const [{ data: files }, { data: entities }, { data: links }, { data: reviews }, { data: latestPlan }] = await Promise.all([
    sb.from("onboarding_files").select("id, original_filename, storage_path, declared_domain, detected_domain, parse_status, row_count, header_row").eq("shop_id", params.shopId).eq("session_id", params.sessionId).order("created_at", { ascending: true }),
    sb.from("onboarding_entities").select("id, entity_type, source_file_id").eq("shop_id", params.shopId).eq("session_id", params.sessionId),
    sb.from("onboarding_entity_links").select("id, link_type").eq("shop_id", params.shopId).eq("session_id", params.sessionId),
    sb.from("onboarding_review_items").select("id, severity, domain, summary, issue_type, entity_id, details").eq("shop_id", params.shopId).eq("session_id", params.sessionId).eq("status", "pending"),
    sb.from("onboarding_activation_plans").select("summary").eq("shop_id", params.shopId).eq("session_id", params.sessionId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const fileIds = (files ?? []).map((file: any) => file.id);
  const rowsByFileId = new Map<string, Record<string, unknown>[]>();

  if (fileIds.length > 0) {
    const { data: rawRows } = await sb
      .from("onboarding_raw_rows")
      .select("id, file_id, source_row_index, raw")
      .eq("shop_id", params.shopId)
      .eq("session_id", params.sessionId)
      .in("file_id", fileIds)
      .order("source_row_index", { ascending: true });

    for (const row of rawRows ?? []) {
      const list = rowsByFileId.get(row.file_id) ?? [];
      if (list.length < sampleRowsPerFile) {
        list.push({ id: row.id, sourceRowIndex: row.source_row_index, ...(row.raw ?? {}) });
        rowsByFileId.set(row.file_id, list);
      }
    }
  }

  const deterministicStagedEntityCounts = (entities ?? []).reduce((acc: Record<string, number>, entity: any) => {
    acc[entity.entity_type] = (acc[entity.entity_type] ?? 0) + 1;
    return acc;
  }, {});

  const deterministicLinkCounts = (links ?? []).reduce((acc: Record<string, number>, link: any) => {
    acc[link.link_type] = (acc[link.link_type] ?? 0) + 1;
    return acc;
  }, {});

  const deterministicDomainDetections = (files ?? []).reduce((acc: Record<string, number>, file: any) => {
    const key = file.detected_domain ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const input: OnboardingAgentInput = {
    sessionId: params.sessionId,
    shopId: params.shopId,
    files: (files ?? []).map((file: any) => ({
      id: file.id,
      filename: file.original_filename ?? file.storage_path,
      declaredDomain: file.declared_domain,
      detectedDomain: file.detected_domain,
      parseStatus: file.parse_status,
      headers: Array.isArray(file.header_row) ? file.header_row : [],
      rowCount: Number(file.row_count ?? 0),
      sampleRows: rowsByFileId.get(file.id) ?? [],
    })),
    deterministicDomainDetections,
    deterministicStagedEntityCounts,
    deterministicLinkCounts,
    deterministicReviewItems: (reviews ?? []).map((review: any) => ({
      id: review.id,
      severity: review.severity,
      domain: review.domain,
      summary: review.summary,
      issueType: review.issue_type,
      entityId: review.entity_id,
      details: review.details ?? {},
    })),
    activationPlanSummary: latestPlan?.summary ?? null,
  };

  const fallback = buildDeterministicFallbackReport(input);
  const validEntityIds = new Set<string>(
    (entities ?? [])
      .map((entity: any) => (typeof entity.id === "string" ? entity.id : ""))
      .filter((id: string): id is string => Boolean(id)),
  );
  const validRowIds = new Set<string>(
    input.files
      .flatMap((file) => file.sampleRows.map((row) => String(row.id ?? "")))
      .filter((id: string): id is string => Boolean(id)),
  );

  let report: OnboardingAgentReport = fallback;
  try {
    const modelReport = await callOnboardingAgentModel(input);
    if (modelReport) {
      report = sanitizeAgentReport({ candidate: modelReport, fallback, validEntityIds, validRowIds });
      report.mode = "ai";
    }
  } catch (error) {
    console.warn("[onboarding-agent] AI analysis fallback", {
      sessionId: params.sessionId,
      shopId: params.shopId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  const existingSummary = asRecord(session.summary);
  const nextSummary = { ...existingSummary, agentReport: report, liveRecordsCreated: 0 };

  await sb
    .from("onboarding_sessions")
    .update({ summary: nextSummary, stats: nextSummary })
    .eq("shop_id", params.shopId)
    .eq("id", params.sessionId);

  return report;
}
