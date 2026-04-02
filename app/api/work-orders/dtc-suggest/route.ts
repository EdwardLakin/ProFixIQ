import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { openai } from "lib/server/openai";

type DB = Database;

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  jobId?: string;
  code?: string | null;
  userMessage?: string;
  history?: ChatTurn[];
};

type LineLookup = {
  id: string;
  work_order_id: string | null;
  job_type: string | null;
  complaint: string | null;
  description: string | null;
  cause: string | null;
  correction: string | null;
  labor_time: number | null;
};

type WorkOrderLookup = {
  id: string;
  shop_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  custom_id: string | null;
  notes: string | null;
};

type VehicleLookup = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  fuel_type: string | null;
  drivetrain: string | null;
  transmission: string | null;
  vin: string | null;
  unit_number: string | null;
  license_plate: string | null;
};

type StoredThreadRow = {
  dtc_code: string | null;
  messages: unknown;
  summary: unknown;
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

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function asConfidence(
  value: unknown,
): "low" | "medium" | "high" | null {
  if (value === "low" || value === "medium" || value === "high") return value;
  return null;
}

function asLaborHours(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const role =
        (item as { role?: unknown }).role === "assistant" ? "assistant" : "user";
      const content = asNonEmptyString((item as { content?: unknown }).content);
      if (!content) return null;
      return { role, content } satisfies ChatTurn;
    })
    .filter((item): item is ChatTurn => item !== null)
    .slice(-16);
}

function normalizeSummary(value: unknown): DtcAnalysisSummary | null {
  if (!value || typeof value !== "object") return null;

  const summary = value as Record<string, unknown>;

  return {
    dtc: asNonEmptyString(summary.dtc),
    title: asNonEmptyString(summary.title),
    description: asNonEmptyString(summary.description),
    diagnosis: asNonEmptyString(summary.diagnosis),
    commonRepairs: asStringArray(summary.commonRepairs),
    recommendedTests: asStringArray(summary.recommendedTests),
    confidence: asConfidence(summary.confidence),
    applyCause: asNonEmptyString(summary.applyCause),
    applyCorrection: asNonEmptyString(summary.applyCorrection),
    laborHours: asLaborHours(summary.laborHours),
  };
}

async function loadContext(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  jobId: string,
) {
  const { data: lineData, error: lineError } = await supabase
    .from("work_order_lines")
    .select(
      "id, work_order_id, job_type, complaint, description, cause, correction, labor_time",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (lineError) throw new Error(lineError.message);

  const line = (lineData as LineLookup | null) ?? null;
  if (!line) throw new Error("Diagnosis line not found");

  const { data: workOrderData, error: workOrderError } = await supabase
    .from("work_orders")
    .select("id, shop_id, customer_id, vehicle_id, custom_id, notes")
    .eq("id", line.work_order_id)
    .maybeSingle();

  if (workOrderError) throw new Error(workOrderError.message);

  const workOrder = (workOrderData as WorkOrderLookup | null) ?? null;
  if (!workOrder) throw new Error("Work order not found");

  let vehicle: VehicleLookup | null = null;

  if (workOrder.vehicle_id) {
    const { data: vehicleData, error: vehicleError } = await supabase
      .from("vehicles")
      .select(
        "id, year, make, model, engine, fuel_type, drivetrain, transmission, vin, unit_number, license_plate",
      )
      .eq("id", workOrder.vehicle_id)
      .maybeSingle();

    if (vehicleError) throw new Error(vehicleError.message);
    vehicle = (vehicleData as VehicleLookup | null) ?? null;
  }

  return { line, workOrder, vehicle };
}

export async function GET(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });
    const url = new URL(req.url);
    const jobId = asNonEmptyString(url.searchParams.get("jobId"));

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dtcTable = "work_order_line_dtc_threads" as never;

    const { data, error } = await supabase
      .from(dtcTable)
      .select("dtc_code, messages, summary")
      .eq("work_order_line_id", jobId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = (data as StoredThreadRow | null) ?? null;

    return NextResponse.json({
      dtcCode: row?.dtc_code ?? null,
      messages: normalizeHistory(row?.messages),
      summary: normalizeSummary(row?.summary),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load DTC thread.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });
    const body = (await req.json()) as RequestBody;

    const jobId = asNonEmptyString(body.jobId);
    const code = asNonEmptyString(body.code)?.toUpperCase() ?? null;
    const userMessage = asNonEmptyString(body.userMessage);
    const history = normalizeHistory(body.history);

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    if (!userMessage) {
      return NextResponse.json(
        { error: "userMessage is required" },
        { status: 400 },
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { line, workOrder, vehicle } = await loadContext(supabase, jobId);

    if ((line.job_type ?? "").trim() !== "diagnosis") {
      return NextResponse.json(
        { error: "DTC assist is only available on diagnosis lines" },
        { status: 400 },
      );
    }

    const systemPrompt = [
      "You are ProFixIQ Diagnostic Assist, an expert diagnostic copilot for automotive and heavy-duty repair shops.",
      "Your job is to help a technician diagnose a DTC using vehicle context, work-order context, and live follow-up test results.",
      "Be highly practical, specific, and shop-usable.",
      "Support both automotive and heavy-duty/commercial vehicles.",
      "Explain the code, likely causes, likely affected systems, best next tests, and common repairs for this vehicle context when possible.",
      "Treat the conversation as ongoing diagnostic reasoning, not a single answer.",
      "When the user gives new tests or measurements, update the likely fault path and next best step.",
      "Do not overstate certainty. Use confidence realistically.",
      "Return JSON only with keys: reply, summary.",
      "reply must be conversational and detailed, like a live diagnostic assistant helping a technician.",
      "summary must include keys: dtc, title, description, diagnosis, commonRepairs, recommendedTests, confidence, applyCause, applyCorrection, laborHours.",
      "applyCause should be a concise shop-ready cause statement.",
      "applyCorrection should be a concise shop-ready correction / diagnostic next-step statement that can be dropped into a cause/correction workflow.",
      "laborHours should be a realistic estimate when possible, otherwise null.",
    ].join(" ");

    const userContext = {
      dtc: code,
      workOrder: {
        id: workOrder.id,
        customId: workOrder.custom_id ?? null,
        notes: workOrder.notes ?? null,
      },
      diagnosisLine: {
        complaint: line.complaint ?? null,
        description: line.description ?? null,
        existingCause: line.cause ?? null,
        existingCorrection: line.correction ?? null,
        existingLaborTime: line.labor_time ?? null,
      },
      vehicle: vehicle
        ? {
            year: vehicle.year ?? null,
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
      conversation: history,
      latestUserMessage: userMessage,
    };

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5.1",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userContext) },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: { reply?: unknown; summary?: unknown } = {};
    try {
      parsed = JSON.parse(raw) as { reply?: unknown; summary?: unknown };
    } catch {
      return NextResponse.json(
        { error: "AI returned an invalid diagnostic response." },
        { status: 500 },
      );
    }

    const summary =
      normalizeSummary(parsed.summary) ??
      ({
        dtc: code,
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

    const response: DtcSuggestResponse = {
      reply:
        asNonEmptyString(parsed.reply) ??
        "I could not produce a diagnostic response from the available context.",
      summary,
    };

    const dtcTable = "work_order_line_dtc_threads" as never;

    await supabase.from(dtcTable).upsert(
      {
        work_order_line_id: line.id,
        work_order_id: workOrder.id,
        shop_id: workOrder.shop_id,
        vehicle_id: workOrder.vehicle_id,
        created_by: user.id,
        dtc_code: code,
        messages: history.concat([{ role: "assistant", content: response.reply }]),
        summary: response.summary,
      } as never,
      { onConflict: "work_order_line_id" },
    );

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while preparing DTC guidance.";
    console.error("[work-orders/dtc-suggest] error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
