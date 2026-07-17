import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { runOpenAIStructuredJson } from "@/features/shared/lib/server/openai-structured";
import {
  findRelevantHistoryCandidates,
  type QuoteHistoryCandidate,
  type QuoteHistoryMatch,
} from "@/features/work-orders/quote-review/quoteHistoryRelevance";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];

function workOrderIdFromUrl(url: string): string | null {
  return new URL(url).pathname.split("/").filter(Boolean)[2] ?? null;
}

function numericMileage(
  row: Pick<WorkOrder, "odometer_km" | "vehicle_mileage">,
): number | null {
  const value = row.odometer_km ?? row.vehicle_mileage;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validateSelections(
  candidate: unknown,
  allowed: Set<string>,
): { selections: Array<{ quoteLineId: string; historyLineId: string }> } {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !("selections" in candidate)
  )
    return { selections: [] };
  const raw = (candidate as { selections?: unknown }).selections;
  if (!Array.isArray(raw)) return { selections: [] };

  const seen = new Set<string>();
  const selections: Array<{ quoteLineId: string; historyLineId: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const quoteLineId = String(
      (item as { quoteLineId?: unknown }).quoteLineId ?? "",
    ).trim();
    const historyLineId = String(
      (item as { historyLineId?: unknown }).historyLineId ?? "",
    ).trim();
    const pair = `${quoteLineId}:${historyLineId}`;
    if (
      !quoteLineId ||
      !historyLineId ||
      seen.has(quoteLineId) ||
      !allowed.has(pair)
    )
      continue;
    seen.add(quoteLineId);
    selections.push({ quoteLineId, historyLineId });
  }
  return { selections };
}

export async function GET(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canAuthorizeQuotes",
  });
  if (!access.ok) return access.response;

  const workOrderId = workOrderIdFromUrl(req.url);
  if (!workOrderId)
    return NextResponse.json(
      { error: "Missing work order id" },
      { status: 400 },
    );

  const shopId = access.profile.shop_id;
  const { data: current, error: currentError } = await access.supabase
    .from("work_orders")
    .select("id,shop_id,vehicle_id,odometer_km,vehicle_mileage,created_at")
    .eq("id", workOrderId)
    .eq("shop_id", shopId)
    .maybeSingle<WorkOrder>();

  if (currentError)
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  if (!current)
    return NextResponse.json(
      { error: "Work order not found" },
      { status: 404 },
    );
  if (!current.vehicle_id)
    return NextResponse.json({ ok: true, insights: [], mode: "deterministic" });

  const [
    { data: quoteRows, error: quoteError },
    { data: priorRows, error: priorError },
  ] = await Promise.all([
    access.supabase
      .from("work_order_quote_lines")
      .select("id,description,ai_complaint,notes")
      .eq("shop_id", shopId)
      .eq("work_order_id", workOrderId),
    access.supabase
      .from("work_orders")
      .select(
        "id,custom_id,odometer_km,vehicle_mileage,created_at,updated_at,status",
      )
      .eq("shop_id", shopId)
      .eq("vehicle_id", current.vehicle_id)
      .neq("id", workOrderId)
      .in("status", ["completed", "ready_to_invoice", "invoiced"])
      .order("updated_at", { ascending: false })
      .limit(60),
  ]);

  if (quoteError || priorError) {
    return NextResponse.json(
      {
        error:
          quoteError?.message ?? priorError?.message ?? "History query failed",
      },
      { status: 500 },
    );
  }

  const quoteLines = (quoteRows ?? []) as Pick<
    QuoteLine,
    "id" | "description" | "ai_complaint" | "notes"
  >[];
  const priorWorkOrders = (priorRows ?? []) as WorkOrder[];
  if (quoteLines.length === 0 || priorWorkOrders.length === 0) {
    return NextResponse.json({ ok: true, insights: [], mode: "deterministic" });
  }

  const priorIds = priorWorkOrders.map((row) => row.id);
  const { data: lineRows, error: lineError } = await access.supabase
    .from("work_order_lines")
    .select(
      "id,work_order_id,description,complaint,correction,notes,odometer_km,punched_out_at,updated_at,status,line_status",
    )
    .eq("shop_id", shopId)
    .in("work_order_id", priorIds)
    .or(
      "status.in.(completed,ready_to_invoice,invoiced),line_status.in.(completed,ready_to_invoice,invoiced)",
    );

  if (lineError)
    return NextResponse.json({ error: lineError.message }, { status: 500 });

  const priorById = new Map(priorWorkOrders.map((row) => [row.id, row]));
  const currentMileage = numericMileage(current);
  const now = Date.now();
  const candidates: QuoteHistoryCandidate[] = (
    (lineRows ?? []) as WorkOrderLine[]
  ).flatMap((line) => {
    if (!line.work_order_id) return [];
    const prior = priorById.get(line.work_order_id);
    if (!prior) return [];
    const completedAt =
      line.punched_out_at ??
      line.updated_at ??
      prior.updated_at ??
      prior.created_at;
    if (!completedAt) return [];
    const priorMileage = line.odometer_km ?? numericMileage(prior);
    const mileageDeltaKm =
      currentMileage != null && priorMileage != null
        ? currentMileage - priorMileage
        : null;
    const description = [
      line.description,
      line.complaint,
      line.correction,
      line.notes,
    ]
      .filter(Boolean)
      .join(" — ");
    if (!description.trim()) return [];
    return [
      {
        historyLineId: line.id,
        workOrderId: prior.id,
        workOrderNumber: prior.custom_id,
        description,
        completedAt,
        mileageDeltaKm,
        ageDays: Math.max(
          0,
          Math.floor((now - new Date(completedAt).getTime()) / 86_400_000),
        ),
      },
    ];
  });

  const eligible = quoteLines.flatMap((line) =>
    findRelevantHistoryCandidates({
      quoteLineId: line.id,
      quoteDescription: [line.description, line.ai_complaint, line.notes]
        .filter(Boolean)
        .join(" — "),
      candidates,
    }),
  );
  if (eligible.length === 0)
    return NextResponse.json({ ok: true, insights: [], mode: "deterministic" });

  const fallbackSelections = eligible.reduce<
    Array<{ quoteLineId: string; historyLineId: string }>
  >((items, match) => {
    if (!items.some((item) => item.quoteLineId === match.quoteLineId)) {
      items.push({
        quoteLineId: match.quoteLineId,
        historyLineId: match.historyLineId,
      });
    }
    return items;
  }, []);
  const allowed = new Set(
    eligible.map((match) => `${match.quoteLineId}:${match.historyLineId}`),
  );
  const ranking = await runOpenAIStructuredJson({
    purpose: "fast",
    feature: "quote-history-insights",
    schemaName: "quote_history_selections",
    system:
      "Select at most one genuinely useful prior service record for each quote line. Never select a pair outside the supplied candidates. Prefer recent same-service work that could prevent duplication or change the advisor conversation.",
    user: { candidates: eligible },
    validate: (value) => validateSelections(value, allowed),
    fallback: () => ({ selections: fallbackSelections }),
    maxOutputTokens: 500,
  });

  const byPair = new Map(
    eligible.map((match) => [
      `${match.quoteLineId}:${match.historyLineId}`,
      match,
    ]),
  );
  const insights = ranking.output.selections
    .map((selection) =>
      byPair.get(`${selection.quoteLineId}:${selection.historyLineId}`),
    )
    .filter((match): match is QuoteHistoryMatch => Boolean(match));

  return NextResponse.json({ ok: true, insights, mode: ranking.mode });
}
