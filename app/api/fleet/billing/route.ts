import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  canManageFleetForActor,
  manageableFleetIdsForActor,
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Body = {
  action?: "list" | "decide";
  workOrderId?: string;
  quoteLineIds?: string[];
  decision?: "approve" | "decline" | "defer";
  operationKey?: string;
  contactMethod?: "phone" | "in_person" | "email" | "other";
  note?: string;
};

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function canApprove(
  actor: Awaited<ReturnType<typeof resolveFleetActorContext>>,
  fleetId?: string,
) {
  return fleetId
    ? canManageFleetForActor(actor, fleetId)
    : actor.isInternal || manageableFleetIdsForActor(actor).length > 0;
}

async function accessibleVehicleContext(
  actor: Awaited<ReturnType<typeof resolveFleetActorContext>>,
  options?: { financialOnly?: boolean },
) {
  const scope = resolveFleetActorScope(actor);
  if (!scope?.shopId) throw new Error("Fleet scope is unavailable");

  const admin = createAdminSupabase();
  let query = admin
    .from("fleet_vehicles")
    .select("fleet_id,vehicle_id,nickname,active")
    .eq("shop_id", scope.shopId)
    .or("active.is.null,active.eq.true");
  const allowedFleetIds = actor.isInternal
    ? scope.fleetIds
    : options?.financialOnly
      ? manageableFleetIdsForActor(actor)
      : scope.fleetIds;
  if (!actor.isInternal && options?.financialOnly && !allowedFleetIds?.length) {
    throw new Error("Fleet billing access required");
  }
  if (allowedFleetIds?.length) query = query.in("fleet_id", allowedFleetIds);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { admin, scope, enrollments: rows(data) };
}

async function listBilling(
  actor: Awaited<ReturnType<typeof resolveFleetActorContext>>,
) {
  const { admin, scope, enrollments } = await accessibleVehicleContext(actor, {
    financialOnly: true,
  });
  const vehicleIds = Array.from(
    new Set(enrollments.map((row) => String(row.vehicle_id))),
  );
  if (!vehicleIds.length) {
    return {
      canApprove: canApprove(actor),
      canPay: canApprove(actor),
      decisionMode: actor.isInternal ? "shop_recorded" : "fleet_self_service",
      summary: {
        approvals: 0,
        invoices: 0,
        byCurrency: {
          CAD: { outstanding: 0, paid: 0 },
          USD: { outstanding: 0, paid: 0 },
        },
      },
      items: [],
    };
  }

  const [vehicleResult, workOrderResult] = await Promise.all([
    admin
      .from("vehicles")
      .select("id,unit_number,license_plate,vin,year,make,model")
      .eq("shop_id", scope.shopId)
      .in("id", vehicleIds),
    admin
      .from("work_orders")
      .select(
        "id,vehicle_id,custom_id,status,approval_state,created_at,updated_at,invoice_total,payment_status,outstanding_balance,paid_at",
      )
      .eq("shop_id", scope.shopId)
      .in("vehicle_id", vehicleIds)
      .order("created_at", { ascending: false })
      .limit(400),
  ]);
  const firstError = [vehicleResult.error, workOrderResult.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const workOrders = rows(workOrderResult.data);
  const workOrderIds = workOrders.map((row) => String(row.id));
  const [quoteResult, invoiceResult, paymentResult] = workOrderIds.length
    ? await Promise.all([
        admin
          .from("work_order_quote_lines")
          .select(
            "id,work_order_id,description,status,stage,grand_total,subtotal,sent_to_customer_at,approved_at,declined_at,created_at",
          )
          .eq("shop_id", scope.shopId)
          .in("work_order_id", workOrderIds)
          .or(
            "sent_to_customer_at.not.is.null,approved_at.not.is.null,declined_at.not.is.null,status.in.(sent,approved,converted,declined,deferred)",
          )
          .order("created_at", { ascending: true }),
        admin
          .from("invoice_versions")
          .select(
            "id,work_order_id,version_number,lifecycle_status,currency,total,paid_total,refunded_total,outstanding_total,issued_at",
          )
          .eq("shop_id", scope.shopId)
          .in("work_order_id", workOrderIds)
          .in("lifecycle_status", ["issued", "partially_paid", "paid"])
          .order("version_number", { ascending: false }),
        admin
          .from("payments")
          .select(
            "id,work_order_id,amount_cents,currency,status,created_at,stripe_payment_intent_id",
          )
          .eq("shop_id", scope.shopId)
          .in("work_order_id", workOrderIds)
          .order("created_at", { ascending: false }),
      ])
    : [
        { data: [] as unknown[], error: null },
        { data: [] as unknown[], error: null },
        { data: [] as unknown[], error: null },
      ];
  const detailError = [
    quoteResult.error,
    invoiceResult.error,
    paymentResult.error,
  ].find(Boolean);
  if (detailError) throw new Error(detailError.message);

  const vehicles = new Map(
    rows(vehicleResult.data).map((row) => [String(row.id), row]),
  );
  const enrollmentByVehicle = new Map(
    enrollments.map((row) => [String(row.vehicle_id), row]),
  );
  const quotesByWorkOrder = new Map<string, Row[]>();
  for (const quote of rows(quoteResult.data)) {
    const key = String(quote.work_order_id);
    quotesByWorkOrder.set(key, [...(quotesByWorkOrder.get(key) ?? []), quote]);
  }
  const invoicesByWorkOrder = new Map<string, Row>();
  for (const invoice of rows(invoiceResult.data)) {
    const key = String(invoice.work_order_id);
    if (!invoicesByWorkOrder.has(key)) invoicesByWorkOrder.set(key, invoice);
  }
  const paymentsByWorkOrder = new Map<string, Row[]>();
  for (const payment of rows(paymentResult.data)) {
    const key = String(payment.work_order_id);
    paymentsByWorkOrder.set(key, [...(paymentsByWorkOrder.get(key) ?? []), payment]);
  }

  const items = workOrders.map((workOrder) => {
    const id = String(workOrder.id);
    const vehicleId = String(workOrder.vehicle_id);
    const vehicle = vehicles.get(vehicleId) ?? {};
    const enrollment = enrollmentByVehicle.get(vehicleId) ?? {};
    const quoteLines = (quotesByWorkOrder.get(id) ?? []).map((quote) => {
      const status = clean(quote.status) ?? "pending";
      const sentAt = iso(quote.sent_to_customer_at);
      return {
        id: String(quote.id),
        description: clean(quote.description) ?? "Estimate line",
        status,
        stage: clean(quote.stage) ?? "advisor_pending",
        total: numeric(quote.grand_total) || numeric(quote.subtotal),
        sentAt,
        approvedAt: iso(quote.approved_at),
        declinedAt: iso(quote.declined_at),
        needsDecision:
          Boolean(sentAt) &&
          !quote.approved_at &&
          !quote.declined_at &&
          !["approved", "converted", "declined", "deferred"].includes(status),
      };
    });
    const invoice = invoicesByWorkOrder.get(id);
    return {
      id,
      vehicleId,
      unitLabel:
        clean(enrollment.nickname) ??
        clean(vehicle.unit_number) ??
        clean(vehicle.license_plate) ??
        clean(vehicle.vin) ??
        "Unit",
      vehicleDescription: [vehicle.year, clean(vehicle.make), clean(vehicle.model)]
        .filter(Boolean)
        .join(" "),
      reference:
        clean(workOrder.custom_id) ?? `#${id.slice(0, 8).toUpperCase()}`,
      status: clean(workOrder.status) ?? "open",
      approvalState: clean(workOrder.approval_state),
      createdAt: iso(workOrder.created_at),
      updatedAt: iso(workOrder.updated_at),
      quoteLines,
      invoice: invoice
        ? {
            id: String(invoice.id),
            versionNumber: numeric(invoice.version_number),
            lifecycleStatus: clean(invoice.lifecycle_status) ?? "draft",
            currency: clean(invoice.currency)?.toUpperCase() === "USD" ? "USD" : "CAD",
            total: numeric(invoice.total),
            paidTotal: numeric(invoice.paid_total),
            refundedTotal: numeric(invoice.refunded_total),
            outstandingTotal: numeric(invoice.outstanding_total),
            issuedAt: iso(invoice.issued_at),
          }
        : null,
      payments: (paymentsByWorkOrder.get(id) ?? []).map((payment) => ({
        id: String(payment.id),
        amountCents: numeric(payment.amount_cents),
        currency: clean(payment.currency)?.toUpperCase() === "USD" ? "USD" : "CAD",
        status: clean(payment.status) ?? "pending",
        createdAt: iso(payment.created_at),
      })),
    };
  });

  const byCurrency = {
    CAD: { outstanding: 0, paid: 0 },
    USD: { outstanding: 0, paid: 0 },
  };
  for (const item of items) {
    if (!item.invoice) continue;
    const totals = byCurrency[item.invoice.currency];
    totals.outstanding += item.invoice.outstandingTotal;
    totals.paid += item.invoice.paidTotal;
  }

  return {
    canApprove: canApprove(actor),
    canPay: canApprove(actor),
    decisionMode: actor.isInternal ? "shop_recorded" : "fleet_self_service",
    summary: {
      approvals: items.reduce(
        (total, item) =>
          total + item.quoteLines.filter((line) => line.needsDecision).length,
        0,
      ),
      invoices: items.filter((item) => Boolean(item.invoice)).length,
      byCurrency,
    },
    items,
  };
}

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase);
    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (actor.actorType === "none") {
      return NextResponse.json({ error: "Fleet access required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Body;
    if (!body.action || body.action === "list") {
      if (!canApprove(actor)) {
        return NextResponse.json(
          { error: "Fleet billing access required" },
          { status: 403 },
        );
      }
      return NextResponse.json(await listBilling(actor));
    }
    if (!canApprove(actor)) {
      return NextResponse.json({ error: "Approval access required" }, { status: 403 });
    }

    const workOrderId = clean(body.workOrderId);
    const decision = body.decision;
    const quoteLineIds = Array.from(
      new Set((body.quoteLineIds ?? []).map((value) => value.trim()).filter(Boolean)),
    );
    const operationKey = clean(body.operationKey);
    const contactMethod = clean(body.contactMethod);
    const note = clean(body.note);
    if (
      !workOrderId ||
      !decision ||
      !["approve", "decline", "defer"].includes(decision) ||
      !quoteLineIds.length ||
      !operationKey
    ) {
      return NextResponse.json({ error: "Invalid approval decision" }, { status: 400 });
    }
    if (
      actor.isInternal &&
      (!contactMethod ||
        !["phone", "in_person", "email", "other"].includes(contactMethod) ||
        !note)
    ) {
      return NextResponse.json(
        { error: "Contact method and decision note are required" },
        { status: 400 },
      );
    }

    const { admin, scope, enrollments } = await accessibleVehicleContext(actor, {
      financialOnly: true,
    });
    const accessibleVehicleIds = enrollments.map((row) => String(row.vehicle_id));
    const { data: workOrder, error: workOrderError } = await admin
      .from("work_orders")
      .select("id,shop_id,vehicle_id")
      .eq("id", workOrderId)
      .eq("shop_id", scope.shopId)
      .in("vehicle_id", accessibleVehicleIds)
      .maybeSingle();
    if (workOrderError) throw new Error(workOrderError.message);
    if (!workOrder) {
      return NextResponse.json({ error: "Fleet work order not found" }, { status: 404 });
    }

    const { data: quotes, error: quoteError } = await admin
      .from("work_order_quote_lines")
      .select("id")
      .eq("shop_id", scope.shopId)
      .eq("work_order_id", workOrderId)
      .in("id", quoteLineIds);
    if (quoteError) throw new Error(quoteError.message);
    if ((quotes ?? []).length !== quoteLineIds.length) {
      return NextResponse.json({ error: "Estimate line not found" }, { status: 404 });
    }

    const rpcResult = actor.isInternal
      ? await supabase.rpc("apply_shop_quote_decision_atomic", {
          p_shop_id: scope.shopId,
          p_work_order_id: workOrderId,
          p_quote_line_ids: quoteLineIds,
          p_decision: decision,
          p_actor_user_id: actor.userId,
          p_contact_method: contactMethod ?? "other",
          p_note: note ?? "",
          p_operation_key: `fleet-staff:${operationKey}`,
          p_at: new Date().toISOString(),
        })
      : await supabase.rpc("apply_customer_quote_decision_atomic", {
          p_shop_id: scope.shopId,
          p_work_order_id: workOrderId,
          p_quote_line_ids: quoteLineIds,
          p_decision: decision,
          p_decline_remaining: false,
          // The SQL contract permits NULL; generated RPC args model it as string.
          p_customer_id: null as unknown as string,
          p_actor_user_id: actor.userId,
          p_operation_key: `fleet:${operationKey}`,
          p_at: new Date().toISOString(),
        });
    const { data, error } = rpcResult;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    console.error("[fleet/billing] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load fleet billing" },
      { status: 500 },
    );
  }
}
