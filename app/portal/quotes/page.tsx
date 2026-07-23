import Link from "next/link";
import { CheckCircle2, Clock3, PackageOpen, Plus, Wrench } from "lucide-react";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalPageHeader, PortalEmptyState } from "@/features/portal/components/PortalUi";

export const dynamic = "force-dynamic";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default async function PortalQuotesPage() {
  const supabase = createServerSupabaseRSC();
  const actor = await requirePortalCustomerActor(supabase);
  const shopId = actor.customer.shop_id;

  const { data: workOrders, error } = shopId
    ? await supabase
        .from("work_orders")
        .select("id,vehicle_id,created_at,scheduled_at,invoice_sent_at,work_order_quote_lines(id,description,status,stage,approved_at,work_order_line_id,sent_to_customer_at,metadata)")
        .eq("shop_id", shopId)
        .eq("customer_id", actor.customer.id)
        .like("external_id", "portal_quote:%")
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (error) throw new Error(error.message);
  const rows = workOrders ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 text-[color:var(--theme-text-primary)]">
      <PortalPageHeader
        eyebrow="Customer portal"
        title="Quotes"
        subtitle="Request pricing, review the shop’s response, and continue when you are ready."
        actions={
          <Link href="/portal/quotes/request" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)]">
            <Plus className="h-4 w-4" /> Request a quote
          </Link>
        }
      />

      {rows.length === 0 ? <PortalEmptyState title="No quote requests yet" body="Request a repair estimate or ask Parts to price an item for pickup." /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.flatMap((workOrder) => (workOrder.work_order_quote_lines ?? []).map((line) => {
            const meta = metadata(line.metadata);
            const partsOnly = clean(meta.request_kind) === "parts_only";
            const sent = Boolean(line.sent_to_customer_at) || ["sent", "customer_review", "customer_approved"].includes(clean(line.stage).toLowerCase());
            const approved = Boolean(line.approved_at || line.work_order_line_id);
            const Icon = partsOnly ? PackageOpen : Wrench;
            const StatusIcon = approved ? CheckCircle2 : Clock3;
            const status = approved ? (partsOnly ? "Approved for pickup order" : workOrder.scheduled_at ? "Appointment requested" : "Approved — book when ready") : sent ? "Ready for your review" : "Shop is preparing your quote";
            return (
              <article key={line.id} className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[color:var(--theme-surface-subtle)] text-[var(--accent-copper-light)]"><Icon className="h-5 w-5" /></span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[11px] text-[color:var(--theme-text-secondary)]"><StatusIcon className="h-3.5 w-3.5" /> {status}</span>
                </div>
                <h2 className="mt-4 text-base font-semibold">{clean(line.description) || "Quote request"}</h2>
                <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{partsOnly ? "Parts-only • Pickup" : "Repair quote • Appointment after approval"}</p>
                {sent ? (
                  <Link href={`/portal/quotes/${workOrder.id}`} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[var(--accent-copper-light)]">
                    {approved ? "View approved quote" : "Review quote"}
                  </Link>
                ) : null}
              </article>
            );
          }))}
        </div>
      )}
    </div>
  );
}
