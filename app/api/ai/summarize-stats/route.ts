import { NextResponse } from "next/server";

import {
  buildOwnerIntelligenceReport,
  deterministicExecutiveSummary,
} from "@/features/owner/reports/server/buildOwnerIntelligenceReport";
import type {
  OwnerIntelligenceReport,
  OwnerReportRange,
  OwnerReportSummaryResponse,
} from "@/features/owner/reports/ownerIntelligenceTypes";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import {
  enforceAIOperationalPolicy,
  estimateAICostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";
import { recordAITelemetry } from "@/features/shared/lib/server/ai-telemetry";
import {
  getOpenAIClient,
  isOpenAIConfigured,
} from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";

const REPORT_RANGES = new Set<OwnerReportRange>([
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
]);

type SummaryInsert = {
  shop_id: string;
  period_kind: OwnerReportRange;
  period_start: string;
  period_end: string;
  metric_version: string;
  snapshot_hash: string;
  summary_text: string;
  summary_source: "ai" | "deterministic";
  model: string | null;
  generated_by: string;
  generated_at: string;
};

type DynamicInsertQuery = {
  upsert(
    values: SummaryInsert,
    options: { onConflict: string; ignoreDuplicates: boolean },
  ): PromiseLike<{ error: { message: string } | null }>;
};

type DynamicClient = {
  from(table: string): DynamicInsertQuery;
};

function dynamicClient(value: unknown): DynamicClient {
  return value as DynamicClient;
}

function summaryPrompt(report: OwnerIntelligenceReport): string {
  return `
You are ProFixIQ's executive reporting assistant for an automotive repair shop.

Write a concise plain-language executive summary (140-220 words) using only the
authoritative JSON snapshot below. Do not calculate replacement metrics, invent
causes, call known contribution "profit", or call generic risk flags comebacks.

Cover:
- overall performance compared with the equivalent prior period;
- where measured open delay time is concentrated;
- technician efficiency, productivity, and proficiency only when present;
- the most important operational focus areas;
- the most important data-confidence limitation.

Use direct operational language. Make clear that open stage hours are a current
snapshot and are not additive employee idle time. Do not use markdown headings.

AUTHORITATIVE SNAPSHOT:
${JSON.stringify({
    metricVersion: report.metricVersion,
    shop: { name: report.shop.name, timezone: report.shop.timezone },
    period: report.period,
    financial: report.financial,
    workflow: report.workflow,
    workforce: {
      billedHours: report.workforce.billedHours,
      jobClockHours: report.workforce.jobClockHours,
      attendanceHours: report.workforce.attendanceHours,
      efficiencyPct: report.workforce.efficiencyPct,
      productivityPct: report.workforce.productivityPct,
      proficiencyPct: report.workforce.proficiencyPct,
      completedLines: report.workforce.completedLines,
    },
    quality: report.quality,
    focus: report.focus,
    confidence: report.confidence,
  })}
`.trim();
}

async function saveSummary(args: {
  supabase: unknown;
  report: OwnerIntelligenceReport;
  summary: string;
  source: "ai" | "deterministic";
  model: string | null;
  userId: string;
  generatedAt: string;
}): Promise<void> {
  const { error } = await dynamicClient(args.supabase)
    .from("owner_report_summaries")
    .upsert(
      {
        shop_id: args.report.shop.id,
        period_kind: args.report.period.range,
        period_start: args.report.period.start,
        period_end: args.report.period.end,
        metric_version: args.report.metricVersion,
        snapshot_hash: args.report.snapshotHash,
        summary_text: args.summary,
        summary_source: args.source,
        model: args.model,
        generated_by: args.userId,
        generated_at: args.generatedAt,
      },
      {
        onConflict:
          "shop_id,period_kind,period_start,period_end,metric_version,snapshot_hash",
        ignoreDuplicates: false,
      },
    );
  if (error) throw new Error(error.message);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canViewFinancials",
    allowRoles: ["owner", "admin", "manager"],
  });
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as {
    range?: unknown;
    force?: unknown;
  } | null;
  const range =
    typeof body?.range === "string" && REPORT_RANGES.has(body.range as OwnerReportRange)
      ? (body.range as OwnerReportRange)
      : null;
  if (!range) {
    return NextResponse.json({ error: "Invalid report range" }, { status: 400 });
  }

  try {
    const report = await buildOwnerIntelligenceReport({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      range,
    });

    if (body?.force !== true && report.executiveSummary.text) {
      const cached: OwnerReportSummaryResponse = {
        summary: report.executiveSummary.text,
        source: report.executiveSummary.source ?? "cached_deterministic",
        generatedAt: report.executiveSummary.generatedAt ?? report.generatedAt,
        snapshotHash: report.snapshotHash,
      };
      return NextResponse.json(cached);
    }

    const fallback = deterministicExecutiveSummary(report);
    const generatedAt = new Date().toISOString();
    const policy = getAIPolicy("ai_summarize_stats");
    const enforcement = enforceAIOperationalPolicy({
      feature: "ai_summarize_stats",
      endpoint: "/api/ai/summarize-stats",
      shopId: access.profile.shop_id,
    });

    if (!isOpenAIConfigured() || !enforcement.allowed) {
      await saveSummary({
        supabase: access.supabase,
        report,
        summary: fallback,
        source: "deterministic",
        model: null,
        userId: access.profile.id,
        generatedAt,
      });
      return NextResponse.json({
        summary: fallback,
        source: "deterministic",
        generatedAt,
        snapshotHash: report.snapshotHash,
      } satisfies OwnerReportSummaryResponse);
    }

    const openai = getOpenAIClient();
    const model = getOpenAIModelForPurpose(policy.modelPurpose);
    try {
      const completion = await Promise.race([
        openai.chat.completions.create({
          model,
          max_tokens: policy.maxTokens,
          messages: [{ role: "user", content: summaryPrompt(report) }],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("AI request timed out")),
            policy.timeoutMs,
          ),
        ),
      ]);
      const generated = completion.choices[0]?.message?.content?.trim() ?? "";
      const summary =
        generated.length >= 40 && generated.length <= 4_000 ? generated : fallback;
      const source = summary === fallback ? "deterministic" : "ai";
      await saveSummary({
        supabase: access.supabase,
        report,
        summary,
        source,
        model: source === "ai" ? model : null,
        userId: access.profile.id,
        generatedAt,
      });

      const estimatedCost = estimateAICostUsd(
        "ai_summarize_stats",
        completion.usage?.total_tokens ?? null,
      );
      recordAITelemetry({
        feature: "ai_summarize_stats",
        endpoint: "/api/ai/summarize-stats",
        shop_id: access.profile.shop_id,
        user_id: access.profile.id,
        model,
        latency_ms: Date.now() - startedAt,
        prompt_tokens: completion.usage?.prompt_tokens ?? null,
        completion_tokens: completion.usage?.completion_tokens ?? null,
        total_tokens: completion.usage?.total_tokens ?? null,
        estimated_cost_usd: estimatedCost,
        status: "success",
        error_code: null,
        error_message: null,
      });
      registerAIUsageEvent({
        feature: "ai_summarize_stats",
        endpoint: "/api/ai/summarize-stats",
        shopId: access.profile.shop_id,
        model,
        totalTokens: completion.usage?.total_tokens ?? null,
        estimatedCostUsd: estimatedCost,
        status: "success",
        errorCode: null,
      });

      return NextResponse.json({
        summary,
        source,
        generatedAt,
        snapshotHash: report.snapshotHash,
      } satisfies OwnerReportSummaryResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "AI summary failed";
      recordAITelemetry({
        feature: "ai_summarize_stats",
        endpoint: "/api/ai/summarize-stats",
        shop_id: access.profile.shop_id,
        user_id: access.profile.id,
        model,
        latency_ms: Date.now() - startedAt,
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        estimated_cost_usd: 0,
        status: "error",
        error_code: "ai_summary_error",
        error_message: message,
      });
      registerAIUsageEvent({
        feature: "ai_summarize_stats",
        endpoint: "/api/ai/summarize-stats",
        shopId: access.profile.shop_id,
        model,
        totalTokens: null,
        estimatedCostUsd: 0,
        status: "error",
        errorCode: "ai_summary_error",
      });
      await saveSummary({
        supabase: access.supabase,
        report,
        summary: fallback,
        source: "deterministic",
        model: null,
        userId: access.profile.id,
        generatedAt,
      });
      return NextResponse.json({
        summary: fallback,
        source: "deterministic",
        generatedAt,
        snapshotHash: report.snapshotHash,
      } satisfies OwnerReportSummaryResponse);
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unable to generate report summary";
    // eslint-disable-next-line no-console
    console.error("[owner-report-summary] Failed to build summary:", message);
    return NextResponse.json(
      { error: "Unable to generate the owner report summary" },
      { status: 500 },
    );
  }
}
