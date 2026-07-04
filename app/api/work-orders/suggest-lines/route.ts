// app/api/work-orders/suggest-lines/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { openai } from "lib/server/openai";
import { getOpenAIModelForPurpose, openAITemperatureParam } from "@/features/shared/lib/server/openai-models";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import { recordAITelemetry } from "@/features/shared/lib/server/ai-telemetry";
import {
  enforceAIOperationalPolicy,
  estimateAICostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";

export const runtime = "nodejs";


type VehicleLite = {
  id: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
};

type ReqBody =
  | { jobId: string; vehicleId?: VehicleLite | string | null }
  | { workOrderId: string; vehicleId?: VehicleLite | string | null };

type Suggestion = {
  name: string;
  laborHours: number;
  jobType: "diagnosis" | "repair" | "maintenance" | "tech-suggested";
  notes: string;
  aiComplaint?: string;
  aiCause?: string;
  aiCorrection?: string;
};

function isVehicleLite(v: unknown): v is VehicleLite {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    "id" in o &&
    "year" in o &&
    "make" in o &&
    "model" in o &&
    (o.id === null || typeof o.id === "string") &&
    (o.year === null || typeof o.year === "string") &&
    (o.make === null || typeof o.make === "string") &&
    (o.model === null || typeof o.model === "string")
  );
}

function coerceSuggestion(u: unknown): Suggestion | null {
  if (typeof u !== "object" || u === null) return null;
  const o = u as Record<string, unknown>;

  const name = typeof o.name === "string" ? o.name : null;
  const laborHours =
    typeof o.laborHours === "number" && Number.isFinite(o.laborHours)
      ? o.laborHours
      : null;
  const jobType =
    o.jobType === "diagnosis" ||
    o.jobType === "repair" ||
    o.jobType === "maintenance" ||
    o.jobType === "tech-suggested"
      ? o.jobType
      : null;
  const notes = typeof o.notes === "string" ? o.notes : "";

  if (!name || laborHours === null || !jobType) return null;

  const aiComplaint =
    typeof o.aiComplaint === "string" ? o.aiComplaint : undefined;
  const aiCause = typeof o.aiCause === "string" ? o.aiCause : undefined;
  const aiCorrection =
    typeof o.aiCorrection === "string" ? o.aiCorrection : undefined;

  return { name, laborHours, jobType, notes, aiComplaint, aiCause, aiCorrection };
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const policy = getAIPolicy("work_orders_suggest_lines");
  const model = getOpenAIModelForPurpose(policy.modelPurpose);
  const supabase = createServerSupabaseRSC();
  let userId: string | null = null;
  let shopIdForContext: string | null = null;

  try {
    const body = (await req.json()) as ReqBody;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    userId = user.id;

    // Gather context
    let complaint: string | null = null;
    let vehicle: VehicleLite | null = null;

    if ("jobId" in body) {
      // Get WO shop_id for context
      const { data: woJoin, error: woJoinErr } = await supabase
        .from("work_order_lines")
        .select("work_order_id, work_orders:work_order_id ( shop_id )")
        .eq("id", body.jobId)
        .maybeSingle();

      if (woJoinErr) {
        return NextResponse.json({ error: woJoinErr.message }, { status: 500 });
      }

      shopIdForContext =
        (woJoin?.work_orders as unknown as { shop_id?: string | null })?.shop_id ??
        null;

      if (shopIdForContext) {
        // If profile.shop_id is NULL, try to self-heal (same logic as add-suggested-lines)
        const { data: prof } = await supabase
          .from("profiles")
          .select("shop_id")
          .or(`id.eq.${user.id},user_id.eq.${user.id}`)
          .maybeSingle();

        if (!prof?.shop_id) {
          await supabase
            .from("profiles")
            .update({ shop_id: shopIdForContext })
            .or(`id.eq.${user.id},user_id.eq.${user.id}`);
        }

        // Set session context (may still fail if user truly isn’t in that shop)
        await supabase.rpc("set_current_shop_id", { p_shop_id: shopIdForContext });
      }

      const { data: line, error: lineErr } = await supabase
        .from("work_order_lines")
        .select("complaint, vehicle_id, vehicles:vehicle_id ( year, make, model )")
        .eq("id", body.jobId)
        .maybeSingle();

      if (lineErr) {
        return NextResponse.json({ error: lineErr.message }, { status: 500 });
      }

      if (line?.complaint) complaint = line.complaint;

      // Prefer explicit vehicleId passed in the request, else derive from joined record
      if (isVehicleLite(body.vehicleId)) {
        vehicle = body.vehicleId;
      } else if (line?.vehicles) {
        const v = line.vehicles as unknown as {
          year: number | null;
          make: string | null;
          model: string | null;
        };
        vehicle = {
          id: (line as unknown as { vehicle_id: string | null }).vehicle_id ?? null,
          year: v?.year != null ? String(v.year) : null,
          make: v?.make ?? null,
          model: v?.model ?? null,
        };
      }
    } else if ("workOrderId" in body) {
      // Fetch WO shop_id for context first
      const { data: wo, error: woErr } = await supabase
        .from("work_orders")
        .select("id, shop_id")
        .eq("id", body.workOrderId)
        .maybeSingle();

      if (woErr) {
        return NextResponse.json({ error: woErr.message }, { status: 500 });
      }
      if (!wo?.id) {
        return NextResponse.json({ error: "Work order not found" }, { status: 404 });
      }

      shopIdForContext = (wo.shop_id as string | null) ?? null;

      if (shopIdForContext) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("shop_id")
          .or(`id.eq.${user.id},user_id.eq.${user.id}`)
          .maybeSingle();

        if (!prof?.shop_id) {
          await supabase
            .from("profiles")
            .update({ shop_id: shopIdForContext })
            .or(`id.eq.${user.id},user_id.eq.${user.id}`);
        }

        await supabase.rpc("set_current_shop_id", { p_shop_id: shopIdForContext });
      }

      // Pull minimal context from first line
      const { data: lines, error: linesErr } = await supabase
        .from("work_order_lines")
        .select("complaint, vehicle_id")
        .eq("work_order_id", body.workOrderId)
        .order("created_at", { ascending: true })
        .limit(1);

      if (linesErr) {
        return NextResponse.json({ error: linesErr.message }, { status: 500 });
      }

      if (lines && lines.length > 0) {
        complaint = lines[0]?.complaint ?? null;
      }

      if (isVehicleLite(body.vehicleId)) {
        vehicle = body.vehicleId;
      }
    }

    const vStr =
      vehicle && (vehicle.make || vehicle.model || vehicle.year)
        ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()
        : "Unknown vehicle";

    const userContext =
      [complaint ? `Complaint: ${complaint}` : null, `Vehicle: ${vStr}`]
        .filter(Boolean)
        .join("\n") || "No complaint provided. Vehicle unknown.";

    const system = [
      "You are a service advisor assistant for an auto shop.",
      "Return a JSON array of 3-6 suggested jobs related to the complaint and vehicle.",
      "Each item must have fields: name (string), laborHours (number), jobType ('diagnosis'|'repair'|'maintenance'|'tech-suggested'), notes (string).",
      "When helpful, include aiComplaint, aiCause, aiCorrection to pre-fill story text.",
      "Keep laborHours realistic; do not exceed 8 hours for a single item.",
      "Only output raw JSON (no markdown).",
    ].join(" ");

    const enforcement = enforceAIOperationalPolicy({
      feature: "work_orders_suggest_lines",
      endpoint: "/api/work-orders/suggest-lines",
      shopId: shopIdForContext,
    });
    if (!enforcement.allowed) {
      return NextResponse.json({
        suggestions: [],
        message: "AI suggestions are temporarily limited for this shop. Please retry shortly.",
      });
    }

    const completion = await Promise.race([
      openai.chat.completions.create({
        model,
        ...openAITemperatureParam(model, 0.4),
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContext },
        ],
        max_tokens: policy.maxTokens,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI request timed out")), policy.timeoutMs),
      ),
    ]);

    const raw = completion.choices[0]?.message?.content ?? "[]";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }

    const suggestions: Suggestion[] = Array.isArray(parsed)
      ? parsed
          .map(coerceSuggestion)
          .filter((s): s is Suggestion => s !== null)
          .slice(0, 6)
      : [];

    recordAITelemetry({
      feature: "work_orders_suggest_lines",
      endpoint: "/api/work-orders/suggest-lines",
      shop_id: shopIdForContext,
      user_id: userId,
      model,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: completion.usage?.prompt_tokens ?? null,
      completion_tokens: completion.usage?.completion_tokens ?? null,
      total_tokens: completion.usage?.total_tokens ?? null,
      estimated_cost_usd: estimateAICostUsd("work_orders_suggest_lines", completion.usage?.total_tokens ?? null),
      status: "success",
      error_code: null,
      error_message: null,
    });
    registerAIUsageEvent({
      feature: "work_orders_suggest_lines",
      endpoint: "/api/work-orders/suggest-lines",
      shopId: shopIdForContext,
      model,
      totalTokens: completion.usage?.total_tokens ?? null,
      estimatedCostUsd: estimateAICostUsd("work_orders_suggest_lines", completion.usage?.total_tokens ?? null),
      status: "success",
      errorCode: null,
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate suggestions";
    recordAITelemetry({
      feature: "work_orders_suggest_lines",
      endpoint: "/api/work-orders/suggest-lines",
      shop_id: shopIdForContext,
      user_id: userId,
      model,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      estimated_cost_usd: 0,
      status: "error",
      error_code: "suggest_lines_error",
      error_message: message,
    });
    registerAIUsageEvent({
      feature: "work_orders_suggest_lines",
      endpoint: "/api/work-orders/suggest-lines",
      shopId: shopIdForContext,
      model,
      totalTokens: null,
      estimatedCostUsd: 0,
      status: "error",
      errorCode: "suggest_lines_error",
    });
    if (policy.fallbackMode === "graceful_empty") {
      return NextResponse.json({ suggestions: [] });
    }
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 },
    );
  }
}
