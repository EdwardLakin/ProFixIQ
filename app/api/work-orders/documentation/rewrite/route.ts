import { NextResponse } from "next/server";
import { z } from "zod";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import {
  getOpenAIModelForPurpose,
  openAITemperatureParam,
} from "@/features/shared/lib/server/openai-models";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import { recordAITelemetry } from "@/features/shared/lib/server/ai-telemetry";
import {
  enforceAIOperationalPolicy,
  estimateAICostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";

export const runtime = "nodejs";

const FEATURE = "work_order_documentation_rewrite" as const;
const ENDPOINT = "/api/work-orders/documentation/rewrite";

const requestSchema = z.object({
  jobId: z.string().uuid(),
  transcript: z.string().trim().min(3).max(12000),
  existingCause: z.string().max(12000).optional().default(""),
  existingCorrection: z.string().max(12000).optional().default(""),
});

const responseSchema = z.object({
  cause: z.string().trim().min(1).max(12000),
  correction: z.string().trim().min(1).max(12000),
});

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const policy = getAIPolicy(FEATURE);
  const model = getOpenAIModelForPurpose(policy.modelPurpose);
  const access = await requireShopScopedApiAccess();

  if (!access.ok) return access.response;

  const parsedBody = requestSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsedBody.success) {
    return errorResponse("A valid job and dictated story are required.", 400);
  }

  const admin = await createAdminSupabase();
  const { data: line, error: lineError } = await admin
    .from("work_order_lines")
    .select("id, work_order_id, complaint, description, cause, correction")
    .eq("id", parsedBody.data.jobId)
    .maybeSingle();

  if (lineError) {
    console.error("[documentation-rewrite] line lookup failed", lineError);
    return errorResponse("Unable to load this job.", 500);
  }
  if (!line?.work_order_id) {
    return errorResponse("Job not found.", 404);
  }

  const { data: workOrder, error: workOrderError } = await admin
    .from("work_orders")
    .select("id, shop_id")
    .eq("id", line.work_order_id)
    .maybeSingle();

  if (
    workOrderError ||
    !workOrder ||
    workOrder.shop_id !== access.profile.shop_id
  ) {
    return errorResponse("Job not found.", 404);
  }

  const enforcement = enforceAIOperationalPolicy({
    feature: FEATURE,
    endpoint: ENDPOINT,
    shopId: access.profile.shop_id,
  });
  if (!enforcement.allowed) {
    return NextResponse.json(
      {
        error: "AI documentation rewrite is temporarily limited.",
        code: enforcement.code,
      },
      { status: 429 },
    );
  }

  try {
    const openai = getOpenAIClient();
    const completion = await Promise.race([
      openai.chat.completions.create({
        model,
        ...openAITemperatureParam(model, 0.1),
        response_format: { type: "json_object" },
        max_completion_tokens: policy.maxTokens,
        messages: [
          {
            role: "system",
            content: [
              "You rewrite automotive technician dictation into a professional cause and correction story.",
              "Return only a JSON object with string fields cause and correction.",
              "Preserve every measurement, test result, part, procedure, qualifier, and uncertainty exactly as supplied.",
              "Never invent a diagnosis, test, measurement, part, repair, verification step, or result.",
              "Cause explains the verified condition or source of the concern.",
              "Correction explains only what the technician actually performed or verified.",
              "Use concise professional shop language and correct obvious transcription errors.",
              "If the dictation does not establish a confirmed cause or correction, state that clearly instead of guessing.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              complaint: line.complaint ?? line.description ?? null,
              currentDraft: {
                cause: parsedBody.data.existingCause || line.cause || null,
                correction:
                  parsedBody.data.existingCorrection || line.correction || null,
              },
              technicianDictation: parsedBody.data.transcript,
            }),
          },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("AI documentation rewrite timed out")),
          policy.timeoutMs,
        ),
      ),
    ]);

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = responseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error("AI returned an invalid documentation rewrite");
    }

    const usage = completion.usage;
    const totalTokens = usage?.total_tokens ?? null;
    const estimatedCost = estimateAICostUsd(FEATURE, totalTokens);

    recordAITelemetry({
      feature: FEATURE,
      endpoint: ENDPOINT,
      shop_id: access.profile.shop_id,
      user_id: access.profile.id,
      model,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
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
      estimatedCostUsd: estimatedCost,
      status: "success",
      errorCode: null,
    });

    return NextResponse.json(parsed.data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Documentation rewrite failed";

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
      error_code: "documentation_rewrite_failed",
      error_message: message,
    });
    registerAIUsageEvent({
      feature: FEATURE,
      endpoint: ENDPOINT,
      shopId: access.profile.shop_id,
      model,
      totalTokens: null,
      estimatedCostUsd: 0,
      status: "error",
      errorCode: "documentation_rewrite_failed",
    });

    console.error("[documentation-rewrite]", error);
    return errorResponse(
      "Could not rewrite the job story. Your original dictation is unchanged.",
      502,
    );
  }
}
