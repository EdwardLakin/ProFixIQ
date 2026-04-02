import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { openai } from "lib/server/openai";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;

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

type PostBody = {
  jobId?: string;
  code?: string | null;
  userMessage?: string;
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
        content,
        createdAt,
      } satisfies PersistedMessage;
    })
    .filter((item): item is PersistedMessage => item !== null);
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

async function loadRouteContext(jobId: string): Promise<RouteContext | null> {
  const routeSupabase = createRouteHandlerClient<DB>({ cookies });
  const admin = await createAdminSupabase();

  const {
    data: { user },
    error: authErr,
  } = await routeSupabase.auth.getUser();

  if (authErr || !user) return null;

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.shop_id) return null;

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
    .maybeSingle();

  if (workOrderErr || !workOrder || workOrder.shop_id !== profile.shop_id) {
    return null;
  }

  const { data: vehicle } = workOrder.vehicle_id
    ? await admin
        .from("vehicles")
        .select(
          "year, make, model, engine, fuel_type, drivetrain, transmission, vin, unit_number, license_plate",
        )
        .eq("id", workOrder.vehicle_id)
        .maybeSingle()
    : { data: null };

  return {
    userId: user.id,
    shopId: profile.shop_id,
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
  context: RouteContext;
  dtcCode: string | null;
  messages: PersistedMessage[];
  summary: DtcAnalysisSummary | null;
}) {
  const admin = await createAdminSupabase();

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

  const { error } = await admin
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
    conversation: args.messages.map((message) => ({
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
}): Promise<DtcSuggestResponse> {
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
    response_format: { type: "json_object" },
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
  });

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

  return { reply, summary };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jobId = asNonEmptyString(url.searchParams.get("jobId"));

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 },
      );
    }

    const context = await loadRouteContext(jobId);
    if (!context) {
      return NextResponse.json(
        { error: "Unauthorized or job not found" },
        { status: 401 },
      );
    }

    const admin = await createAdminSupabase();

    const { data: thread, error } = await admin
      .from("work_order_line_dtc_threads")
      .select("dtc_code, messages, summary")
      .eq("work_order_line_id", jobId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    const typedThread = thread as Pick<
      DtcThreadRow,
      "dtc_code" | "messages" | "summary"
    > | null;

    return NextResponse.json({
      dtcCode: typedThread?.dtc_code ?? null,
      messages: parseMessages(typedThread?.messages ?? []),
      summary: parseSummary(typedThread?.summary ?? null),
    });
  } catch (error) {
    console.error("[dtc-suggest][GET]", error);
    return NextResponse.json(
      { error: "Failed to load DTC thread." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PostBody;

    const jobId = asNonEmptyString(body.jobId);
    const userMessage = asNonEmptyString(body.userMessage);
    const dtcCode = asNullableString(body.code)?.toUpperCase() ?? null;

    if (!jobId || !userMessage) {
      return NextResponse.json(
        { error: "jobId and userMessage are required" },
        { status: 400 },
      );
    }

    const context = await loadRouteContext(jobId);
    if (!context) {
      return NextResponse.json(
        { error: "Unauthorized or job not found" },
        { status: 401 },
      );
    }

    const admin = await createAdminSupabase();

    const { data: existingThread } = await admin
      .from("work_order_line_dtc_threads")
      .select("dtc_code, messages, summary")
      .eq("work_order_line_id", jobId)
      .maybeSingle();

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

    const ai = await generateDtcResponse({
      context,
      dtcCode: dtcCode ?? existingThread?.dtc_code ?? null,
      messages: nextMessages,
    });

    const finalMessages: PersistedMessage[] = [
      ...nextMessages,
      {
        role: "assistant",
        content: ai.reply,
        createdAt: new Date().toISOString(),
      },
    ];

    const finalSummary = ai.summary ?? persistedSummary;

    await upsertThread({
      context,
      dtcCode: dtcCode ?? existingThread?.dtc_code ?? null,
      messages: finalMessages,
      summary: finalSummary,
    });

    return NextResponse.json({
      reply: ai.reply,
      summary: finalSummary,
    } satisfies DtcSuggestResponse);
  } catch (error) {
    console.error("[dtc-suggest][POST]", error);
    return NextResponse.json(
      { error: "Failed to continue DTC diagnosis." },
      { status: 500 },
    );
  }
}
