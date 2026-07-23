import Link from "next/link";
import {
  CalendarDays,
  Car,
  ChevronRight,
  MessageCircle,
  Plus,
} from "lucide-react";
import PortalWorkOrderCard from "@/features/portal/components/PortalWorkOrderCard";
import {
  PortalActionCard,
  PortalEmptyState,
  PortalPageHeader,
  PortalSectionCard,
} from "@/features/portal/components/PortalUi";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { listCustomerBookings } from "@/features/portal/server/customerBookings";
import { listPortalWorkOrdersForCustomer } from "@/features/portal/server/portalWorkOrders";

export const dynamic = "force-dynamic";

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be confirmed";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function PortalHomePage() {
  const supabase = createServerSupabaseRSC();

  try {
    const actor = await requirePortalCustomerActor(supabase);
    if (!actor.customer.shop_id)
      throw new Error("Customer shop is not connected");

    const [workOrders, bookingResult, vehicleCountResult] = await Promise.all([
      listPortalWorkOrdersForCustomer({
        supabase,
        customerId: actor.customer.id,
        shopId: actor.customer.shop_id,
      }),
      listCustomerBookings({ supabase, customerId: actor.customer.id }),
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", actor.customer.shop_id)
        .eq("customer_id", actor.customer.id),
    ]);

    if (vehicleCountResult.error)
      throw new Error(vehicleCountResult.error.message);

    const active = workOrders.filter((workOrder) => !workOrder.status.complete);
    const attention = active.filter(
      (workOrder) => workOrder.status.actionRequired,
    );
    const attentionIds = new Set(attention.map((workOrder) => workOrder.id));
    const serviceCards = active.filter(
      (workOrder) => !attentionIds.has(workOrder.id),
    );
    const recent =
      workOrders.find((workOrder) => workOrder.status.complete) ?? null;
    const now = Date.now();
    const nextBooking = bookingResult.ok
      ? (bookingResult.data.find(
          (booking) =>
            new Date(booking.ends_at).getTime() >= now &&
            (booking.status ?? "").toLowerCase() !== "cancelled",
        ) ?? null)
      : null;
    const customerName =
      [actor.customer.first_name, actor.customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "there";

    return (
      <div className="mx-auto w-full max-w-5xl space-y-5 text-[color:var(--theme-text-primary)]">
        <PortalPageHeader
          eyebrow="Customer portal"
          title={`Good to see you, ${customerName}`}
          subtitle="See whatâ€™s happening with your vehicle and what you need to do next."
          actions={
            <Link
              href="/portal/request/when"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Request service
            </Link>
          }
        />

        {attention.length > 0 ? (
          <section aria-labelledby="attention-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="attention-heading" className="text-sm font-semibold">
                Needs your attention
              </h2>
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-100">
                {attention.length}
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {attention.map((workOrder) => (
                <PortalWorkOrderCard key={workOrder.id} workOrder={workOrder} />
              ))}
            </div>
          </section>
        ) : null}

        {serviceCards.length > 0 || attention.length === 0 ? (
          <section aria-labelledby="active-work-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="active-work-heading" className="text-sm font-semibold">
                {attention.length > 0
                  ? "Other vehicles in service"
                  : "Your vehicles in service"}
              </h2>
              {serviceCards.length > 0 ? (
                <Link
                  href="/portal/status"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-copper-light)]"
                >
                  View all
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
            {serviceCards.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {serviceCards.slice(0, 4).map((workOrder) => (
                  <PortalWorkOrderCard
                    key={workOrder.id}
                    workOrder={workOrder}
                  />
                ))}
              </div>
            ) : (
              <PortalEmptyState
                title="No vehicles are currently in service"
                body="Request service when you are ready, or review your previous visits in service history."
              />
            )}
          </section>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <PortalSectionCard title="Upcoming appointment">
            {nextBooking ? (
              <Link
                href="/portal/customer-appointments"
                className="flex min-h-24 items-center gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-500/12 text-sky-100">
                  <CalendarDays className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {dateLabel(nextBooking.starts_at)}
                  </span>
                  <span className="mt-1 block truncate text-xs text-[color:var(--theme-text-secondary)]">
                    {nextBooking.notes?.trim() || "Service appointment"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            ) : (
              <PortalEmptyState
                title="No upcoming appointment"
                body="Choose a time that works for you when you request service."
              />
            )}
          </PortalSectionCard>

          <PortalSectionCard title="Recent service">
            {recent ? (
              <Link
                href={recent.primaryAction.href}
                className="flex min-h-24 items-center gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-100">
                  <Car className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {recent.vehicleLabel}
                  </span>
                  <span className="mt-1 block text-xs text-[color:var(--theme-text-secondary)]">
                    {recent.serviceSummary[0]}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            ) : (
              <PortalEmptyState
                title="No completed service yet"
                body="Completed visits will stay available here and in service history."
              />
            )}
          </PortalSectionCard>
        </div>

        <section
          aria-label="Portal shortcuts"
          className="grid grid-cols-2 gap-3 sm:grid-cols-5"
        >
          <PortalActionCard
            href="/portal/request/when"
            title="Request service"
            subtitle="Start a new visit."
            prominent
          />
          <PortalActionCard
            href="/portal/quotes"
            title="Quotes"
            subtitle="Request or review pricing."
          />
          <PortalActionCard
            href="/portal/messages"
            title="Messages"
            subtitle="Contact your advisor."
          />
          <PortalActionCard
            href="/portal/vehicles"
            title="Vehicles"
            subtitle={`${vehicleCountResult.count ?? 0} saved`}
          />
          <PortalActionCard
            href="/portal/history"
            title="Service history"
            subtitle="Review past visits."
          />
        </section>

        <div className="flex items-center justify-center gap-2 pb-2 text-xs text-[color:var(--theme-text-muted)] sm:hidden">
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Need help? Message the shop from any service card.
        </div>
      </div>
    );
  } catch (error) {
    if (!(error instanceof PortalAccessError)) {
      console.error("[portal/home] unable to load customer portal", error);
      return (
        <div className="mx-auto max-w-xl rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-100">
          <p className="font-semibold">We couldnâ€™t load your portal.</p>
          <p className="mt-1">
            Please refresh the page or contact the shop if this continues.
          </p>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-xl space-y-4 text-[color:var(--theme-text-primary)]">
        <PortalPageHeader
          eyebrow="Customer portal"
          title="Portal invite required"
          subtitle="Open the invite link sent by the shop, or ask the shop to resend your portal invite."
        />
      </div>
    );
  }
}

