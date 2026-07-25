import { NextResponse } from "next/server";
import { z } from "zod";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { readBoundedJson } from "@/features/shared/lib/server/bounded-json";
import {
  claimDurableAIRouteQuota,
  completeDurableAIRouteQuota,
} from "@/features/shared/lib/server/durable-ai-guard";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import { estimateAICostUsd, registerAIUsageEvent } from "@/features/shared/lib/server/ai-ops-guard";
import { recordAITelemetry } from "@/features/shared/lib/server/ai-telemetry";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";
import { runWithProviderTimeout } from "@/features/shared/lib/server/provider-timeout";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEATURE = "dtc_suggest" as const;
const ENDPOINT = "/api/work-orders/dtc-suggest";
const REQUEST_MAX_BYTES = 32 * 1024;
const DTC_ALLOWED_ROLES = [...ROLE_GROUPS.workOrderManagers, "mechanic"] as const;

const jobIdSchema = z.string().uuid();
const postBodySchema = z.object({
  jobId: jobIdSchema,
  code: z.string().trim().max(32).nullable().optional(),
  userMessage: z.string().trim().min(1).max(4000),
});

type ChatRole = "user" | "assistant";

type PersistedMessage = {
  role: ChatRole;
  content: string;
  createdAt: string;
};

type DtcAnalysisSummary = {
  dtc: string | null;
  title: string | null;
  description: string | null;
  diagnosis: string | null;
  commonRepairs: string[];
  recommendedTests: string[];
  confidence: "low" | "medium" | "high" | null;
  applyCause: string | null;
  applyCorrection: string | null;
  laborHours: number | null;
};

type DtcSuggestResponse = {
  reply: string;
  summary: DtcAnalysisSummary;
};

type DtcThreadRow = DB["public"]["Tables"]["work_order_line_dtc_threads"]["Row"];

type VehicleContext = {
  year: string | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  fuelType: string | null;
  drivetrain: string | null;
  transmission: string | null;
  vin: string | null;
  unitNumber: string | null;
  plate: string | null;
};

type RouteContext = {
  userId: string;
  shopId: string;
  line: Pick<
    DB["public"]["Tables"]["work_order_lines"]["Row"],
    | "id"
    | "work_order_id"
    | "job_type"
    | "complaint"
    | "description"
    | "cause"
    | "correction"
    | "labor_time"
    | "notes"
  >;
  workOrder: Pick<
    DB["public"]["Tables"]["work_orders"]["Row"],
    | "id"
    | "custom_id"
    | "shop_id"
    | "vehicle_id"
    | "notes"
  >;
  vehicle: VehicleContext | null;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isChatRole(value: unknown): value is ChatRole {
  return value === "user" || value === "assistant";
}

function isConfidence(
  value: unknown,
): value is "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high";
}

function parseMessages(value: unknown): PersistedMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const row = item as Record<string, unknown>;
      const role = row.role;
      const content = asNonEmptyString(row.content);
      const createdAt =
        asNonEmptyString(row.createdAt) ?? new Date().toISOString();

      if (!isChatRole(role) || !content) return null;

      return {
        role,
        content: content.slice(0, 4000),
        createdAt,
      } satisfies PersistedMessage;
    })
    .filter((item): item is PersistedMessage => item !== null)
    .slice(-40);
}

function parseSummary(value: unknown): DtcAnalysisSummary | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;

  const commonRepairs = Array.isArray(row.commonRepairs)
    ? row.commonRepairs
        .map((item) => asNonEmptyString(item))
        .filter((item): item is string => Boolean(item))
    : [];

  const recommendedTests = Array.isArray(row.recommendedTests)
    ? row.recommendedTests
        .map((item) => asNonEmptyString(item))
        .filter((item): item is string => Boolean(item))
    : [];

  const laborHoursRaw = row.laborHours;
  const laborHours =
    typeof laborHoursRaw === "number" && Number.isFinite(laborHoursRaw)
      ? laborHoursRaw
      : null;

  return {
    dtc: asNullableString(row.dtc),
    title: asNullableString(row.title),
    description: asNullableString(row.description),
    diagnosis: asNullableString(row.diagnosis),
    commonRepairs,
    recommendedTests,
    confidence: isConfidence(row.confidence) ? row.confidence : null,
    applyCause: asNullableString(row.applyCause),
    applyCorrection: asNullableString(row.applyCorrection),
    laborHours,
  };
}

async function loadRouteContext(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  jobId: string;
  shopId: string;
  userId: string;
}): Promise<RouteContext | null> {
  const { admin, jobId, shopId, userId } = input;
  const { data: line, error: lineErr } = await admin
    .from("work_order_lines")
    .select(
      "id, work_order_id, job_type, complaint, description, cause, correction, labor_time, notes",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (lineErr || !line?.work_order_id) return null;

  const { data: workOrder, error: workOrderErr } = await admin
    .from("work_orders")
    .select("id, custom_id, shop_id, vehicle_id, notes")
    .eq("id", line.work_order_id)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (workOrderErr || !workOrder) {
    return null;
  }

  const { data: vehicle } = workOrder.vehicle_id
    ? await admin
        .from("vehicles")
        .select(
          "year, make, model, engine, fuel_type, drivetrain, transmission, vin, unit_number, license_plate",
         )
        .eq("id", workOrder.vehicle_id)
        .eq("shop_id", shopId)
        .maybeSingle()
    : { data: null };

  return {
    userId,
    shopId,
    line,
    workOrder,
    vehicle: vehicle
      ? {
          year: vehicle.year ? String(vehicle.year) : null,
          make: vehicle.make ?? null,
          model: vehicle.model ?? null,
          engine: vehicle.engine ?? null,
          fuelType: vehicle.fuel_type ?? null,
          drivetrain: vehicle.drivetrain ?? null,
          transmission: vehicle.transmission ?? null,
          vin: vehicle.vin ?? null,
          unitNumber: vehicle.unit_number ?? null,
          plate: vehicle.license_plate ?? null,
        }
      : null,
  };
}

async function upsertThread(args: {
  admin: ReturnType<typeof createAdminSupabase>;
  context: RouteContext;
  dtcCode: string | null;
  messages: PersistedMessage[];
  summary: DtcAnalysisSummary | null;
}) {
  const payload: DB["public"]["Tables"]["work_order_line_dtc_threads"]["Insert"] = {
    shop_id: args.context.shopId,
    work_order_id: args.context.workOrder.id,
    work_order_line_id: args.context.line.id,
    vehicle_id: args.context.workOrder.vehicle_id ?? null,
    created_by: args.context.userId,
    updated_by: args.context.userId,
    dtc_code: args.dtcCode,
    messages: args.messages as unknown as Json,
    summary: (args.summary ?? null) as unknown as Json,
    updated_at: new Date().toISOString(),
  };

  const { error } = await args.admin
    .from("work_order_line_dtc_threads")
    .upsert(payload, { onConflict: "work_order_line_id" });

  if (error) throw error;
}

function buildSystemPrompt() {
  return [
    "You are an expert automotive and heavy-duty diagnostic assistant for a professional repair shop.",
    "You help a technician diagnose a fault code using vehicle context, shop context, and the technician's live test results.",
    "Be practical, accurate, and shop-usable.",
    "Do not guess a confirmed repair when evidence is incomplete.",
    "Prefer test-driven guidance over parts-cannon recommendations.",
    "Support light-duty automotive, medium-duty, and heavy-duty vehicles.",
    "Return ONLY valid JSON.",
    "JSON schema:",
    "{",
    '  "reply": "string",',
    '  "summary": {',
    '    "dtc": "string | null",',
    '    "title": "string | null",',
    '    "description": "string | null",',
    '    "diagnosis": "string | null",',
    '    "commonRepairs": ["string"],',
    '    "recommendedTests": ["string"],',
    '    "confidence": "low | medium | high | null",',
    '    "applyCause": "string | null",',
    '    "applyCorrection": "string | null",',
    '    "laborHours": "number | null"',
    "  }",
    "}",
    "The reply should be conversational and detailed, like a strong diagnostic coach.",
    "The applyCause should be a clean cause summary that can go into the Cause field.",
    "The applyCorrection should be a clean repair / next-step summary that can go into the Correction field.",
  ].join(" ");
}

function buildUserPrompt(args: {
  context: RouteContext;
  dtcCode: string | null;
  messages: PersistedMessage[];
}) {
  return JSON.stringify({
    vehicle: args.context.vehicle,
    workOrder: {
      id: args.context.workOrder.id,
      customId: args.context.workOrder.custom_id ?? null,
      notes: args.context.workOrder.notes ?? null,
    },
    line: {
      id: args.context.line.id,
      jobType: args.context.line.job_type ?? null,
      complaint: args.context.line.complaint ?? null,
      description: args.context.line.description ?? null,
      existingCause: args.context.line.cause ?? null,
      existingCorrection: args.context.line.correction ?? null,
      existingLaborTime: args.context.line.labor_time ?? null,
      notes: args.context.line.notes ?? null,
    },
    dtcCode: args.dtcCode,
    conversation: args.messages.slice(-20).map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })),
  });
}

async function generateDtcResponse(args: {
  context: RouteContext;
  dtcCode: string | null;
  messages: PersistedMessage[];
}) {
  const policy = getAIPolicy(FEATURE);
  const model = getOpenAIModelForPurpose(policy.modelPurpose);
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
            content: buildSystemPrompt(),
          },
          {
            role: "user",
            content: buildUserPrompt(args),
          },
        ],
      },
      { signal },
    ),
  );

  const raw = completion.choices[0]?.message?.content ?? "{}";

  const parsed = JSON.parse(raw) as {
    reply?: unknown;
    summary?: unknown;
  };

  const reply =
    asNonEmptyString(parsed.reply) ??
    "I need a little more information to continue diagnosis.";

  const summary =
    parseSummary(parsed.summary) ??
    ({
      dtc: args.dtcCode,
      title: null,
      description: null,
      diagnosis: null,
      commonRepairs: [],
      recommendedTests: [],
      confidence: null,
      applyCause: null,
      applyCorrection: null,
      laborHours: null,
    } satisfies DtcAnalysisSummary);

  return { reply, summary, usage: completion.usage, model };
}

export async function GET(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      allowRoles: DTC_ALLOWED_ROLES,
    });
    if (!access.ok) return access.response;

    const url = new URL(req.url);
    const parsedJobId = jobIdSchema.safeParse(url.searchParams.get("jobId"));

    if (!parsedJobId.success) {
      return NextResponse.json(
        { error: "A valid jobId is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const admin = createAdminSupabase();
    const context = await loadRouteContext({
      admin,
      jobId: parsedJobId.data,
      shopId: access.profile.shop_id,
      userId: access.profile.id,
    });
    if (!context) {
      return NextResponse.json(
        { error: "Job not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data: thread, error } = await admin
      .from("work_order_line_dtc_threads")
      .select("dtc_code, messages, summary")
      .eq("work_order_line_id", parsedJobId.data)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle();

    if (error) {
      console.error("dtc_suggest_thread_lookup_failed", { code: error.code });
      return NextResponse.json(
        { error: "Failed to load DTC thread." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const typedThread = thread as Pick<
      DtcThreadRow,
      "dtc_code" | "messages" | "summary"
    > | null;

    return NextResponse.json(
      {
        dtcCode: typedThread?.dtc_code ?? null,
        messages: parseMessages(typedThread?.messages ?? []),
        summary: parseSummary(typedThread?.summary ?? null),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[dtc-suggest][GET]", error);
    return NextResponse.json(
      { error: "Failed to load DTC thread." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const access = await requireShopScopedApiAccess({
      allowRoles: DTC_ALLOWED_ROLES,
    });
    if (!access.ok) return access.response;

    const boundedBody = await readBoundedJson(req, REQUEST_MAX_BYTES);
    if (!boundedBody.ok) {
      return NextResponse.json(
        {
          error:
            boundedBody.reason === "too_large"
              ? "Request is too large."
              : "A valid job and message are required.",
        },
        {
          status: boundedBody.reason === "too_large" ? 413 : 400,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const parsedBody = postBodySchema.safeParse(boundedBody.value);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "A valid job and message are required." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const jobId = parsedBody.data.jobId;
    const userMessage = parsedBody.data.userMessage;
    const dtcCode = asNullableString(parsedBody.data.code)?.toUpperCase() ?? null;
    const admin = createAdminSupabase();
    const context = await loadRouteContext({
      admin,
      jobId,
      shopId: access.profile.shop_id,
      userId: access.profile.id,
    });
    if (!context) {
      return NextResponse.json(
        { error: "Job not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data: existingThread, error: threadError } = await admin
      .from("work_order_line_dtc_threads")
      .select("dtc_code, messages, summary")
      .eq("work_order_line_id", jobId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle();

    if (threadError) {
      console.error("dtc_suggest_thread_lookup_failed", { code: threadError.code });
      return NextResponse.json(
        { error: "Failed to load DTC thread." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const persistedMessages = parseMessages(existingThread?.messages ?? []);
    const persistedSummary = parseSummary(existingThread?.summary ?? null);

    const nextMessages: PersistedMessage[] = [
      ...persistedMessages,
      {
        role: "user",
        content: userMessage,
        createdAt: new Date().toISOString(),
      },
    ];

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
      return NextResponse.json(
        { error: "AI diagnosis is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!claim.allowed) {
      return NextResponse.json(
        {
          error: "AI diagnosis is temporarily limited. Please try again later.",
          code:
            claim.reason === "hard_budget_exceeded"
              ? "ai_budget_limit"
              : "ai_rate_limit",
        },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(claim.retryAfterSeconds),
          },
        },
      );
    }

    let ai: Awaited<ReturnType<typeof generateDtcResponse>>;
    try {
      ai = await generateDtcResponse({
        context,
        dtcCode: dtcCode ?? existingThread?.dtc_code ?? null,
        messages: nextMessages,
      });
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
      const model = getOpenAIModelForPurpose(getAIPolicy(FEATURE).modelPurpose);
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
        kind:
          error instanceof Error && error.message.includes("timed out")
            ? "timeout"
            : "provider",
      });
      return NextResponse.json(
        { error: "Failed to continue DTC diagnosis. Try again or continue manually." },
        {
          status:
            error instanceof Error && error.message.includes("timed out")
              ? 504
              : 502,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const totalTokens = ai.usage?.total_tokens ?? null;
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
      model: ai.model,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: ai.usage?.prompt_tokens ?? null,
      completion_tokens: ai.usage?.completion_tokens ?? null,
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
      model: ai.model,
      totalTokens,
      estimatedCostUsd,
      status: "success",
      errorCode: null,
    });

    const assistantMessage: PersistedMessage = {
      role: "assistant",
      content: ai.reply,
      createdAt: new Date().toISOString(),
    };
    const finalMessages = [...nextMessages, assistantMessage].slice(-40);

    const finalSummary = ai.summary ?? persistedSummary;

    await upsertThread({
      admin,
      context,
      dtcCode: dtcCode ?? existingThread?.dtc_code ?? null,
      messages: finalMessages,
      summary: finalSummary,
    });

    return NextResponse.json(
      {
        reply: ai.reply,
        summary: finalSummary,
      } satisfies DtcSuggestResponse,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[dtc-suggest][POST]", error);
    return NextResponse.json(
      { error: "Failed to continue DTC diagnosis." },
      { status: 500 },
    );
  }
}
