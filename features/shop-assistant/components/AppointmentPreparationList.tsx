"use client";

import Link from "next/link";

import type { AppointmentPreparationListItem } from "@/features/operations/types/appointmentPreparations";

type Props = {
  items: AppointmentPreparationListItem[];
  canViewPricing: boolean;
};

const MISSING_INFO_LABELS: Record<string, string> = {
  missing_vehicle: "No vehicle on file",
  missing_customer: "No customer on file",
  missing_vin: "Missing VIN",
  missing_mileage: "Missing mileage",
  missing_customer_contact: "No contact info",
};

function formatWhen(startsAt: string): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return startsAt;
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function vehicleLabel(item: AppointmentPreparationListItem): string {
  const vehicle = item.vehicleSnapshot;
  if (!vehicle) return "No vehicle on file";
  return (
    [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
    vehicle.vin ||
    vehicle.licensePlate ||
    "Vehicle"
  );
}

function partsReadinessSummary(
  item: AppointmentPreparationListItem,
): { label: string; tone: "ready" | "short" | "unknown" } | null {
  const lines = item.matchedMenuItems.flatMap((menuItem) => menuItem.partsReadiness);
  if (lines.length === 0) return null;
  // An optional part being short or unmatched shouldn't send staff chasing
  // inventory the repair doesn't actually need — only required lines decide
  // the headline verdict.
  const requiredLines = lines.filter((line) => line.isRequired);
  const decisiveLines = requiredLines.length > 0 ? requiredLines : lines;
  if (decisiveLines.some((line) => line.status === "short")) {
    return { label: "Parts needed", tone: "short" };
  }
  if (decisiveLines.every((line) => line.status === "ready")) {
    return { label: "Parts ready", tone: "ready" };
  }
  return { label: "Parts unconfirmed", tone: "unknown" };
}

const TONE_CLASSES: Record<string, string> = {
  ready: "border-emerald-400/35 bg-emerald-500/10 text-emerald-300",
  short: "border-red-400/35 bg-red-500/10 text-red-300",
  unknown:
    "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)]",
};

export default function AppointmentPreparationList({ items, canViewPricing }: Props) {
  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
        No upcoming appointments in the next week need preparation review yet.
      </section>
    );
  }

  return (
    <section aria-label="Upcoming appointment preparation" className="space-y-2">
      {items.map((item) => {
        const readiness = partsReadinessSummary(item);
        // bookingId is what lets the create flow link the new work order
        // back to this appointment (bookings.work_order_id); vehicleId is
        // only a convenience prefill on top of that. A card is still
        // actionable even for a booking with no vehicle on file.
        const hrefParams = new URLSearchParams({ bookingId: item.bookingId });
        if (item.vehicleId) hrefParams.set("vehicleId", item.vehicleId);
        const href = `/work-orders/create?${hrefParams.toString()}`;
        const content = (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  {vehicleLabel(item)}
                </div>
                <div className="text-xs text-[color:var(--theme-text-secondary)]">
                  {item.customerSnapshot?.name ??
                    item.customerSnapshot?.businessName ??
                    "No customer on file"}{" "}
                  •{" "}
                  {formatWhen(item.startsAt)}
                </div>
              </div>
              {readiness ? (
                <span
                  className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] ${TONE_CLASSES[readiness.tone]}`}
                >
                  {readiness.label}
                </span>
              ) : null}
            </div>

            {item.deferredItems.length > 0 ? (
              <div className="mt-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                Outstanding: {item.deferredItems.map((d) => d.title).join(", ")}
              </div>
            ) : null}

            {item.matchedMenuItems.length > 0 ? (
              <div className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                Matched repairs:{" "}
                {item.matchedMenuItems
                  .map((menuItem) =>
                    canViewPricing && menuItem.priceEstimate != null
                      ? `${menuItem.name} ($${menuItem.priceEstimate.toFixed(2)})`
                      : menuItem.name,
                  )
                  .join(", ")}
              </div>
            ) : null}

            {item.missingInfo.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.missingInfo.map((flag) => (
                  <span
                    key={flag}
                    className="whitespace-nowrap rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-amber-300"
                  >
                    {MISSING_INFO_LABELS[flag] ?? flag}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        );

        return (
          <Link
            key={item.bookingId}
            href={href}
            className="block rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 transition hover:border-[color:var(--brand-accent,#E39A6E)]/55"
          >
            {content}
          </Link>
        );
      })}
    </section>
  );
}
