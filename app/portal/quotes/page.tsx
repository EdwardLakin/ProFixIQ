import Link from "next/link";
import { CheckCircle2, Clock3, PackageOpen, Plus, Wrench } from "lucide-react";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import {
  PortalPageHeader,
  PortalEmptyState,
} from "@/features/portal/components/PortalUi";
import { runBoundedRouteLoad } from "@/features/shared/lib/route-load";

export const dynamic = "force-dynamic";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isCustomerVisibleEstimateLine(line: {
  status: unknown;
  stage: unknown;
  sent_to_customer_at: unknown;
  approved_at: unknown;
  work_order_line_id: unknown;
}): boolean {
  const status = clean(line.status).toLowerCase();
  const stage = clean(line.stage).toLowerCase();
  if (["cancelled", "rejected", "superseded"].includes(status)) return false;
  return (
    Boolean(
      line.sent_to_customer_at || line.approved_at || line.work_order_line_id,
    ) ||
    ["sent", "approved", "converted", "declined", "deferred"].includes(
      status,
    ) ||
    [
      "sent",
      "customer_review",
      "customer_approved",
      "customer_declined",
      "customer_deferred",
    ].includes(stage)
  );
}

export default async function PortalQuotesPage() {
  const supabase = createServerSupabaseRSC();
  const actor = await requirePortalCustomerActor(supabase);
  const shopId = actor.customer.shop_id;

  const { data: workOrders, error } = await runBoundedRouteLoad(
    {
      route: "/portal/quotes",
      operation: "load customer quotes",
      tenantId: shopId,
      actorId: actor.userId,
      role: "customer",
    },
    async ({ signal }) =>
      shopId
        ? await supabase
            .from("work_orders")
            .select(
              "id,vehicle_id,created_at,scheduled_at,invoice_sent_at,estimate_number,work_order_quote_lines(id,description,status,stage,approved_at,work_order_line_id,sent_to_customer_at,metadata)",
            )
            .eq("shop_id", shopId)
            .eq("customer_id", actor.customer.id)
            .or("external_id.like.portal_quote:%,estimate_number.not.is.null")
            .order("created_at", { ascending: false })
            .abortSignal(signal)
        : { data: [], error: null },
  );

  if (error) throw new Error(error.message);
  const rows = (workOrders ?? [])
    .map((workOrder) => ({
      ...workOrder,
      work_order_quote_lines: workOrder.estimate_number
        ? (workOrder.work_order_quote_lines ?? []).filter(
            isCustomerVisibleEstimateLine,
          )
        : (workOrder.work_order_quote_lines ?? []),
    }))
    .filter(
      (workOrder) =>
        !workOrder.estimate_number ||
        workOrder.work_order_quote_lines.length > 0,
    );
  const cards = rows.flatMap((workOrder) => {
    const quoteLines = workOrder.work_order_quote_lines ?? [];
    if (workOrder.estimate_number) {
      const sent = quoteLines.some(
        (line) =>
          Boolean(line.sent_to_customer_at) ||
          [
            "sent",
            "customer_review",
            "customer_approved",
            "customer_declined",
            "customer_deferred",
          ].includes(clean(line.stage).toLowerCase()),
      );
      const approvedCount = quoteLines.filter((line) =>
        Boolean(line.approved_at || line.work_order_line_id),
      ).length;
      const approved =
        quoteLines.length > 0 && approvedCount === quoteLines.length;
      const descriptions = quoteLines
        .map((line) => clean(line.description))
        .filter(Boolean);
      return [
        {
          key: `estimate:${workOrder.id}`,
          workOrderId: workOrder.id,
          title: workOrder.estimate_number,
          detail: `${quoteLines.length} repair ${quoteLines.length === 1 ? "line" : "lines"}${
            descriptions.length > 0
              ? ` • ${descriptions.slice(0, 2).join(", ")}`
              : ""
          }`,
          partsOnly: false,
          sent,
          approved,
          status: approved
            ? workOrder.scheduled_at
              ? "Appointment requested"
              : "Approved — book when ready"
            : approvedCount > 0
              ? "Partially approved"
              : sent
                ? "Ready for your review"
                : "Shop is preparing your estimate",
          aggregate: true,
        },
      ];
    }

    return quoteLines.map((line) => {
      const meta = metadata(line.metadata);
      const partsOnly = clean(meta.request_kind) === "parts_only";
      const sent =
        Boolean(line.sent_to_customer_at) ||
        ["sent", "customer_review", "customer_approved"].includes(
          clean(line.stage).toLowerCase(),
        );
      const approved = Boolean(line.approved_at || line.work_order_line_id);
      return {
        key: `line:${line.id}`,
        workOrderId: workOrder.id,
        title: clean(line.description) || "Quote request",
        detail: partsOnly
          ? "Parts-only • Pickup"
          : "Repair quote • Appointment after approval",
        partsOnly,
        sent,
        approved,
        status: approved
          ? partsOnly
            ? "Approved for pickup order"
            : workOrder.scheduled_at
              ? "Appointment requested"
              : "Approved — book when ready"
          : sent
            ? "Ready for your review"
            : "Shop is preparing your quote",
        aggregate: false,
      };
    });
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 text-[color:var(--theme-text-primary)]">
      <PortalPageHeader
        eyebrow="Customer portal"
        title="Quotes"
        subtitle="Request pricing, review the shop’s response, and continue when you are ready."
        actions={
          <Link
            href="/portal/quotes/request"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)]"
          >
            <Plus className="h-4 w-4" /> Request a quote
          </Link>
        }
      />

      {cards.length === 0 ? (
        <PortalEmptyState
          title="No quote requests yet"
          body="Request a repair estimate or ask Parts to price an item for pickup."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => {
            const Icon = card.partsOnly ? PackageOpen : Wrench;
            const StatusIcon = card.approved ? CheckCircle2 : Clock3;
            return (
              <article
                key={card.key}
                className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[color:var(--theme-surface-subtle)] text-[var(--accent-copper-light)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                    <StatusIcon className="h-3.5 w-3.5" /> {card.status}
                  </span>
                </div>
                <h2 className="mt-4 text-base font-semibold">{card.title}</h2>
                <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  {card.detail}
                </p>
                {card.sent ? (
                  <Link
                    href={`/portal/quotes/${card.workOrderId}`}
                    className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[var(--accent-copper-light)]"
                  >
                    {card.approved
                      ? card.aggregate
                        ? "View approved estimate"
                        : "View approved quote"
                      : card.aggregate
                        ? "Review estimate"
                        : "Review quote"}
                  </Link>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
