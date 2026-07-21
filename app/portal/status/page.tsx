import Link from "next/link";
import PortalWorkOrderCard from "@/features/portal/components/PortalWorkOrderCard";
import {
  PortalEmptyState,
  PortalPageHeader,
} from "@/features/portal/components/PortalUi";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { listPortalWorkOrdersForCustomer } from "@/features/portal/server/portalWorkOrders";

export const dynamic = "force-dynamic";

export default async function PortalStatusPage() {
  const supabase = createServerSupabaseRSC();

  try {
    const actor = await requirePortalCustomerActor(supabase);
    if (!actor.customer.shop_id)
      throw new Error("Customer shop is not connected");

    const workOrders = await listPortalWorkOrdersForCustomer({
      supabase,
      customerId: actor.customer.id,
      shopId: actor.customer.shop_id,
    });
    const active = workOrders.filter((workOrder) => !workOrder.status.complete);
    const previous = workOrders.filter(
      (workOrder) => workOrder.status.complete,
    );

    return (
      <div className="mx-auto w-full max-w-5xl space-y-5 text-[color:var(--theme-text-primary)]">
        <PortalPageHeader
          eyebrow="Your service"
          title="Your vehicles at the shop"
          subtitle="Clear updates for your vehicles, the next step, and the person to contact."
          actions={
            <Link
              href="/portal/request/when"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)]"
            >
              Request service
            </Link>
          }
        />

        {active.length === 0 ? (
          <PortalEmptyState
            title="No vehicles are currently in service"
            body="Your next active service visit will appear here automatically."
          />
        ) : (
          <section aria-labelledby="active-service-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="active-service-heading" className="text-sm font-semibold">
                Active service
              </h2>
              <span className="text-xs text-[color:var(--theme-text-muted)]">
                {active.length} {active.length === 1 ? "vehicle" : "vehicles"}
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {active.map((workOrder) => (
                <PortalWorkOrderCard key={workOrder.id} workOrder={workOrder} />
              ))}
            </div>
          </section>
        )}

        {previous.length > 0 ? (
          <section aria-labelledby="previous-service-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2
                id="previous-service-heading"
                className="text-sm font-semibold"
              >
                Recently completed
              </h2>
              <Link
                href="/portal/history"
                className="text-xs text-[var(--accent-copper-light)]"
              >
                Full service history
              </Link>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {previous.slice(0, 4).map((workOrder) => (
                <PortalWorkOrderCard
                  key={workOrder.id}
                  workOrder={workOrder}
                  compact
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  } catch (error) {
    if (error instanceof PortalAccessError) {
      return (
        <div className="mx-auto max-w-xl rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100">
          <p className="font-semibold">Portal invite required</p>
          <p className="mt-1">
            Open the invite sent by the shop, or ask the shop to resend it.
          </p>
        </div>
      );
    }
    console.error("[portal/status] unable to load customer work orders", error);
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-100">
        <p className="font-semibold">We couldn’t load your service updates.</p>
        <p className="mt-1">
          Please refresh the page or contact the shop if this continues.
        </p>
      </div>
    );
  }
}
