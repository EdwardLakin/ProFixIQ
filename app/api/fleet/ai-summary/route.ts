import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";
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

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Body = {
  fleetId?: string | null;
  routePrefix?: string;
};

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const supabase = createServerSupabaseRoute();
    const body = (await request.json().catch(() => ({}))) as Body;
    const actor = await resolveFleetActorContext(supabase, {
      requestedFleetId: body.fleetId ?? null,
    });
    const scope = resolveFleetActorScope(actor, {
      explicitFleetId: body.fleetId ?? null,
    });
    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!scope?.shopId) {
      return NextResponse.json({ error: "Fleet access required" }, { status: 403 });
    }

    const admin = createAdminSupabase();
    let enrollmentQuery = admin
      .from("fleet_vehicles")
      .select("fleet_id,vehicle_id,active")
      .eq("shop_id", scope.shopId)
      .or("active.is.null,active.eq.true");
    if (scope.fleetIds?.length) enrollmentQuery = enrollmentQuery.in("fleet_id", scope.fleetIds);
    const { data: enrollmentData, error: enrollmentError } = await enrollmentQuery;
    if (enrollmentError) throw new Error(enrollmentError.message);

    const enrollments = rows(enrollmentData);
    const fleetIds = Array.from(new Set(enrollments.map((row) => String(row.fleet_id))));
    const vehicleIds = Array.from(new Set(enrollments.map((row) => String(row.vehicle_id))));
    const routePrefix =
      body.routePrefix === "/fleet" ? "/fleet" : "/portal/fleet";

    if (!fleetIds.length || !vehicleIds.length) {
      return NextResponse.json({
        headline: "No active fleet units are enrolled yet.",
        aiGenerated: false,
        points: [
          {
            id: "units",
            priority: "info",
            label: "Add your first fleet unit",
            detail: "Units become the home for PM, requests, history, and invoices.",
            href: `${routePrefix}/units`,
          },
        ],
        lastUpdated: new Date().toISOString(),
      });
    }

    const [requestResult, pmResult, pretripResult, workOrderResult] =
      await Promise.all([
        admin
          .from("fleet_service_requests")
          .select("id,severity,status")
          .eq("shop_id", scope.shopId)
          .in("fleet_id", fleetIds)
          .in("status", ["open", "scheduled"]),
        admin
          .from("fleet_pm_due_events")
          .select("id,status")
          .eq("shop_id", scope.shopId)
          .in("fleet_id", fleetIds)
          .in("status", ["pending", "deferred", "converted"]),
        admin
          .from("fleet_pretrip_reports")
          .select("id,has_defects,inspection_date")
          .eq("shop_id", scope.shopId)
          .in("fleet_id", fleetIds)
          .gte(
            "inspection_date",
            new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10),
          ),
        admin
          .from("work_orders")
          .select("id,approval_state,outstanding_balance,payment_status")
          .eq("shop_id", scope.shopId)
          .in("vehicle_id", vehicleIds)
          .limit(500),
      ]);
    const firstError = [
      requestResult.error,
      pmResult.error,
      pretripResult.error,
      workOrderResult.error,
    ].find(Boolean);
    if (firstError) throw new Error(firstError.message);

    const requests = rows(requestResult.data);
    const pmItems = rows(pmResult.data);
    const pretrips = rows(pretripResult.data);
    const workOrders = rows(workOrderResult.data);
    const workOrderIds = workOrders.map((row) => String(row.id));
    const { data: quoteData, error: quoteError } = workOrderIds.length
      ? await admin
          .from("work_order_quote_lines")
          .select("id,work_order_id,status,sent_to_customer_at,approved_at,declined_at")
          .eq("shop_id", scope.shopId)
          .in("work_order_id", workOrderIds)
      : { data: [] as unknown[], error: null };
    if (quoteError) throw new Error(quoteError.message);

    const quoteLines = rows(quoteData);
    const approvals = quoteLines.filter(
      (row) =>
        Boolean(row.sent_to_customer_at) &&
        !row.approved_at &&
        !row.declined_at &&
        !["approved", "converted", "declined", "deferred"].includes(
          String(row.status ?? ""),
        ),
    ).length;
    const safety = requests.filter((row) =>
      ["safety", "compliance"].includes(String(row.severity ?? "")),
    ).length;
    const defects = pretrips.filter((row) => row.has_defects === true).length;
    const outstanding = workOrders.reduce(
      (total, row) => total + numeric(row.outstanding_balance),
      0,
    );
    const snapshot = {
      activeUnits: vehicleIds.length,
      openRequests: requests.length,
      safetyOrComplianceRequests: safety,
      pmItems: pmItems.length,
      approvals,
      outstandingBalance: outstanding,
      recentPretrips: pretrips.length,
      pretripDefects: defects,
    };

    const points = [
      {
        id: "requests",
        priority: safety > 0 ? "critical" : requests.length > 0 ? "attention" : "good",
        label:
          safety > 0
            ? `${safety} safety or compliance request${safety === 1 ? "" : "s"} need attention`
            : requests.length > 0
              ? `${requests.length} service request${requests.length === 1 ? "" : "s"} active`
              : "No active service requests",
        detail: "Open Requests for the current shop status and schedule.",
        href: `${routePrefix}/service-requests`,
      },
      {
        id: "maintenance",
        priority: pmItems.length > 0 ? "attention" : "good",
        label:
          pmItems.length > 0
            ? `${pmItems.length} PM item${pmItems.length === 1 ? "" : "s"} need review`
            : "Preventive maintenance is clear",
        detail: "Open Maintenance to schedule, defer, or create work.",
        href: `${routePrefix}/maintenance`,
      },
      {
        id: "billing",
        priority: approvals > 0 || outstanding > 0 ? "attention" : "good",
        label:
          approvals > 0
            ? `${approvals} estimate line${approvals === 1 ? "" : "s"} await approval`
            : outstanding > 0
              ? "Fleet invoices have an outstanding balance"
              : "Approvals and invoices are clear",
        detail: "Open Billing for exact estimate lines, invoices, and payment.",
        href: `${routePrefix}/billing`,
      },
      {
        id: "units",
        priority: defects > 0 ? "attention" : "info",
        label:
          defects > 0
            ? `${defects} recent pre-trip${defects === 1 ? "" : "s"} reported defects`
            : `${vehicleIds.length} active unit${vehicleIds.length === 1 ? "" : "s"} in view`,
        detail: "Open Units for live readings, history, pre-trips, and evidence.",
        href: `${routePrefix}/units`,
      },
    ];

    let headline = "Fleet activity is summarized below from live operational data.";
    let aiGenerated = false;
    const feature = "fleet_operations_summary" as const;
    const endpoint = "/api/fleet/ai-summary";
    const policy = getAIPolicy(feature);
    const enforcement = enforceAIOperationalPolicy({
      feature,
      endpoint,
      shopId: scope.shopId,
    });
    if (isOpenAIConfigured() && enforcement.allowed) {
      const model = getOpenAIModelForPurpose(policy.modelPurpose);
      try {
        const completion = await Promise.race([
          getOpenAIClient().chat.completions.create({
            model,
            max_tokens: policy.maxTokens,
            messages: [
              {
                role: "system",
                content:
                  "You are an automotive fleet operations copilot. Return one plain-language sentence, under 28 words, naming the first operational priority. Never invent facts or repeat every metric.",
              },
              { role: "user", content: JSON.stringify(snapshot) },
            ],
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("AI request timed out")),
              policy.timeoutMs,
            ),
          ),
        ]);
        const generated = completion.choices[0]?.message?.content?.trim() ?? "";
        if (generated) {
          headline = generated;
          aiGenerated = true;
        }
        const totalTokens = completion.usage?.total_tokens ?? null;
        const estimatedCost = estimateAICostUsd(feature, totalTokens);
        recordAITelemetry({
          feature,
          endpoint,
          shop_id: scope.shopId,
          user_id: actor.userId,
          model,
          latency_ms: Date.now() - startedAt,
          prompt_tokens: completion.usage?.prompt_tokens ?? null,
          completion_tokens: completion.usage?.completion_tokens ?? null,
          total_tokens: totalTokens,
          estimated_cost_usd: estimatedCost,
          status: "success",
          error_code: null,
          error_message: null,
        });
        registerAIUsageEvent({
          feature,
          endpoint,
          shopId: scope.shopId,
          model,
          totalTokens,
          estimatedCostUsd: estimatedCost,
          status: "success",
          errorCode: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI summary failed";
        recordAITelemetry({
          feature,
          endpoint,
          shop_id: scope.shopId,
          user_id: actor.userId,
          model,
          latency_ms: Date.now() - startedAt,
          prompt_tokens: null,
          completion_tokens: null,
          total_tokens: null,
          estimated_cost_usd: 0,
          status: "error",
          error_code: "fleet_summary_error",
          error_message: message,
        });
        registerAIUsageEvent({
          feature,
          endpoint,
          shopId: scope.shopId,
          model,
          totalTokens: null,
          estimatedCostUsd: 0,
          status: "error",
          errorCode: "fleet_summary_error",
        });
        console.warn("[fleet/ai-summary] deterministic fallback used", message);
      }
    }

    return NextResponse.json({
      headline,
      aiGenerated,
      points,
      snapshot,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[fleet/ai-summary] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build fleet summary" },
      { status: 500 },
    );
  }
}
