"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useCustomerVehicleDraft } from "app/work-orders/state/useCustomerVehicleDraft";

type DeferredItem = {
  rootLineId: string;
  quoteLineId: string;
  workOrderId: string | null;
  workOrderNumber: string | null;
  title: string;
  complaint: string | null;
  decision: "declined" | "deferred";
  decisionAt: string;
  laborTotal: number;
  partsTotal: number;
  taxTotal: number;
  grandTotal: number;
};

type DeferredPayload = {
  ok?: boolean;
  vehicleId?: string | null;
  items?: DeferredItem[];
  error?: string;
};

function money(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(Number.isFinite(value) ? value : 0);
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Previous visit";
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PreviousDeferredWorkPanel() {
  const searchParams = useSearchParams();
  const vehicle = useCustomerVehicleDraft((state) => state.vehicle);
  const [items, setItems] = useState<DeferredItem[]>([]);
  const [loading, setLoading] = useState(false);

  const requestQuery = useMemo(() => {
    const params = new URLSearchParams();
    const queryVehicleId =
      searchParams.get("vehicleId")?.trim() ||
      searchParams.get("vehicle_id")?.trim() ||
      "";

    if (queryVehicleId) {
      params.set("vehicleId", queryVehicleId);
      return params.toString();
    }

    const vin = vehicle.vin?.trim() ?? "";
    const plate = vehicle.license_plate?.trim() ?? "";
    const unit = vehicle.unit_number?.trim() ?? "";
    if (vin) params.set("vin", vin);
    else if (plate) params.set("plate", plate);
    else if (unit) params.set("unit", unit);

    return params.toString();
  }, [searchParams, vehicle.license_plate, vehicle.unit_number, vehicle.vin]);

  useEffect(() => {
    if (!requestQuery) {
      setItems([]);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void fetch(`/api/work-orders/deferred-history?${requestQuery}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as DeferredPayload | null;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Previous deferred work could not be loaded.");
        }
        setItems(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [requestQuery]);

  if (!requestQuery || (!loading && items.length === 0)) return null;

  return (
    <section className="mx-auto mb-4 w-full max-w-[1600px] px-3 sm:px-4 lg:px-6" aria-label="Previous deferred work">
      <div className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
              Previous deferred work
            </div>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              Unresolved work from earlier visits will follow this vehicle into the new work order as deferred, non-punchable lines.
            </p>
          </div>
          {items.length > 0 ? (
            <span className="rounded-full border border-[color:var(--desktop-border)] px-3 py-1 text-xs font-semibold text-[color:var(--theme-text-primary)]">
              {items.length} previous {items.length === 1 ? "item" : "items"}
            </span>
          ) : null}
        </div>

        {loading && items.length === 0 ? (
          <div className="mt-3 text-sm text-[color:var(--theme-text-muted)]">Checking previous recommendations…</div>
        ) : (
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {items.map((item) => (
              <article
                key={item.rootLineId}
                className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[color:var(--theme-text-primary)]">{item.title}</div>
                    <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {item.decision === "declined" ? "Declined" : "Deferred"} {dateLabel(item.decisionAt)}
                      {item.workOrderNumber ? ` · ${item.workOrderNumber}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">Last quoted</div>
                    <div className="text-base font-bold text-[color:var(--theme-text-primary)]">{money(item.grandTotal)}</div>
                  </div>
                </div>

                {item.complaint && item.complaint.trim() !== item.title.trim() ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">{item.complaint}</p>
                ) : null}

                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[color:var(--theme-text-muted)]">
                  <span>Labor {money(item.laborTotal)}</span>
                  <span>Parts {money(item.partsTotal)}</span>
                  {item.taxTotal > 0 ? <span>Tax {money(item.taxTotal)}</span> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
