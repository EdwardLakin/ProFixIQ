import { NextResponse } from "next/server";
import { z } from "zod";

import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import {
  estimateAICostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";
import { recordAITelemetry } from "@/features/shared/lib/server/ai-telemetry";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { readBoundedJson } from "@/features/shared/lib/server/bounded-json";
import {
  claimDurableAIRouteQuota,
  completeDurableAIRouteQuota,
} from "@/features/shared/lib/server/durable-ai-guard";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";
import { runWithProviderTimeout } from "@/features/shared/lib/server/provider-timeout";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEATURE = "dtc_suggest" as const;
const ENDPOINT = "/api/dtc-suggest";
const REQUEST_MAX_BYTES = 8 * 1024;
const DTC_ALLOWED_ROLES = [...ROLE_GROUPS.workOrderManagers, "mechanic"] as const;

const requestSchema = z.object({
  jobId: z.string().uuid(),
});

const suggestionSchema = z.object({
  cause: z.string().trim().min(1).max(6000),
  correction: z.string().trim().min(1).max(6000),
  laborTime: z.number().finite().min(0).max(1000).nullable().optional(),
});

type VehicleContext = {
  year: number | null;
  make: string | null;
  model: string | null;
};

function json(body: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const access = await requireShopScopedApiAccess({
    allowRoles: DTC_ALLOWED_ROLES,
  });
  if (!access.ok) return access.response;

  const boundedBody = await readBoundedJson(request, REQUEST_MAX_BYTES);
  if (!boundedBody.ok) {
    return json(
      { error: boundedBody.reason === "too_large" ? "Request is too large." : "A valid jobId is required." },
      boundedBody.reason === "too_large" ? 413 : 400,
    );
  }

  const parsedBody = requestSchema.safeParse(boundedBody.value);
  if (!parsedBody.success) {
    return json({ error: "A valid jobId is required." }, 400);
  }

  const admin = createAdminSupabase();
  const { data: job, error: jobError } = await admin
    .from("work_order_lines")
    .select("id, complaint, cause, correction, labor_time, work_order_id")
    .eq("id", parsedBody.data.jobId)
    .maybeSingle();

  if (jobError) {
    console.error("dtc_suggest_job_lookup_failed", { code: jobError.code });
    return json({ error: "Unable to load this job." }, 503);
  }
  if (!job?.work_order_id) return json({ error: "Job not found." }, 404);

  const { data: workOrder, error: workOrderError } = await admin
    .from("work_orders")
    .select("id, vehicle_id")
    .eq("id", job.work_order_id)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();

  if (workOrderError) {
    console.error("dtc_suggest_work_order_lookup_failed", {
      code: workOrderError.code,
      shopId: access.profile.shop_id,
    });
    return json({ error: "Unable to load this job." }, 503);
  }
  if (!workOrder) return json({ error: "Job not found." }, 404);

  let vehicle: VehicleContext | null = null;
  if (workOrder.vehicle_id) {
    const { data: vehicleRow, error: vehicleError } = await admin
      .from("vehicles")
      .select("year, make, model")
      .eq("id", workOrder.vehicle_id)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle();

    if (vehicleError) {
      console.error("dtc_suggest_vehicle_lookup_failed", {
        code: vehicleError.code,
        shopId: access.profile.shop_id,
      });
      return json({ error: "Unable to load this job." }, 503);
    }
    vehicle = vehicleRow ?? null;
  }

  let claim: Awaited<ReturnType<typeof claimDurableAIRouteQuota>>;
  try {
    claim = await claimDurableAIRouteQuota({
      admin,
      actorId: access.profile.id,
      feature: FEATURE,
      shopId: access.profile.shop_id,
    });
  } catch (error) {
    console.error("dtc_suggest_quota_failed", {
      shopId: access.profile.shop_id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return json({ error: "AI suggestions are temporarily unavailable." }, 503);
  }

  if (!claim.allowed) {
    return json(
      {
        error: "AI suggestions are temporarily limited. Please try again later.",
        code: claim.reason === "hard_budget_exceeded" ? "ai_budget_limit" : "ai_rate_limit",
      },
      429,
      { "Retry-After": String(claim.retryAfterSeconds) },
    );
  }

  const policy = getAIPolicy(FEATURE);
  const model = getOpenAIModelForPurpose(policy.modelPurpose);

  try {
    const openai = getOpenAIClient();
    const completion = await runWithProviderTimeout(policy.timeoutMs, (signal) =>
      openai.chat.completions.create(
        {
          model,
          response_format: { type: "json_object" },
          max_completion_tokens: policy.maxTokens,
          messages: [
            {
              role: "system",
              content: [
                "You are an expert automotive diagnostician writing clear, shop-friendly job notes.",
                "Generate a concise cause, correction, and reasonable flat-rate labor estimate from only the supplied vehicle and job facts.",
                "Never invent a completed test, measurement, repair, or verification result.",
                "Respond only as JSON with keys cause, correction, and laborTime.",
              ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({
                vehicle,
                complaint: job.complaint ?? "No explicit complaint recorded.",
                existingCause: job.cause,
                existingCorrection: job.correction,
                existingLaborTime: job.labor_time,
              }),
            },
          ],
        },
        { signal },
      ),
    );

    const suggestion = suggestionSchema.parse(
      JSON.parse(completion.choices[0]?.message?.content ?? "{}") as unknown,
    );
    const totalTokens = completion.usage?.total_tokens ?? null;
    const estimatedCostUsd = estimateAICostUsd(FEATURE, totalTokens);

    await completeDurableAIRouteQuota({
      admin,
      actorId: access.profile.id,
      actualCostUsd: estimatedCostUsd,
      feature: FEATURE,
      receiptId: claim.receiptId,
      shopId: access.profile.shop_id,
      succeeded: true,
    });
    recordAITelemetry({
      feature: FEATURE,
      endpoint: ENDPOINT,
      shop_id: access.profile.shop_id,
      user_id: access.profile.id,
      model,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: completion.usage?.prompt_tokens ?? null,
      completion_tokens: completion.usage?.completion_tokens ?? null,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCostUsd,
      status: "success",
      error_code: null,
      error_message: null,
    });
    registerAIUsageEvent({
      feature: FEATURE,
      endpoint: ENDPOINT,
      shopId: access.profile.shop_id,
      model,
      totalTokens,
      estimatedCostUsd,
      status: "success",
      errorCode: null,
    });

    return json({ suggestion: { ...suggestion, laborTime: suggestion.laborTime ?? null } });
  } catch (error) {
    await completeDurableAIRouteQuota({
      admin,
      actorId: access.profile.id,
      actualCostUsd: 0,
      feature: FEATURE,
      receiptId: claim.receiptId,
      shopId: access.profile.shop_id,
      succeeded: false,
    });
    recordAITelemetry({
      feature: FEATURE,
      endpoint: ENDPOINT,
      shop_id: access.profile.shop_id,
      user_id: access.profile.id,
      model,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      estimated_cost_usd: 0,
      status: "error",
      error_code: "dtc_suggest_failed",
      error_message:
        error instanceof Error && error.message.includes("timed out")
          ? "provider_timeout"
          : "provider_error",
    });
    registerAIUsageEvent({
      feature: FEATURE,
      endpoint: ENDPOINT,
      shopId: access.profile.shop_id,
      model,
      totalTokens: null,
      estimatedCostUsd: 0,
      status: "error",
      errorCode: "dtc_suggest_failed",
    });
    console.error("dtc_suggest_provider_failed", {
      shopId: access.profile.shop_id,
      kind: error instanceof Error && error.message.includes("timed out") ? "timeout" : "provider",
    });
    return json(
      { error: "AI could not prepare a suggestion. Try again or edit manually." },
      error instanceof Error && error.message.includes("timed out") ? 504 : 502,
    );
  }
}
