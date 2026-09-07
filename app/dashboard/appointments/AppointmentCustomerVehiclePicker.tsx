"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AppointmentCustomerSearchResult,
  AppointmentCustomerVehicleSearchResponse,
  AppointmentVehicleSearchResult,
} from "@/features/scheduling/lib/appointmentCustomerVehicleSearch";

type PickerSelection = {
  customer: AppointmentCustomerSearchResult;
  vehicle: AppointmentVehicleSearchResult | null;
};

export default function AppointmentCustomerVehiclePicker({
  selectedCustomerId,
  selectedCustomerName,
  selectedVehicleId,
  selectedVehicleLabel,
  onSelect,
  onClear,
}: {
  selectedCustomerId: string;
  selectedCustomerName: string;
  selectedVehicleId: string;
  selectedVehicleLabel: string;
  onSelect: (selection: PickerSelection) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] =
    useState<AppointmentCustomerVehicleSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const requestNumber = useRef(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const trimmed = query.trim();
  const hasSelection = Boolean(selectedCustomerId);

  useEffect(() => {
    if (trimmed.length < 2) {
      setResult(null);
      setLoading(false);
      setError(null);
      return;
    }

    const requestId = ++requestNumber.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void fetch(
        `/api/scheduling/customer-vehicle-search?q=${encodeURIComponent(trimmed)}`,
        { cache: "no-store", signal: controller.signal },
      )
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as
            | AppointmentCustomerVehicleSearchResponse
            | { error?: string }
            | null;
          if (!response.ok) {
            throw new Error(
              body && "error" in body && body.error
                ? body.error
                : "Unable to search customers and vehicles.",
            );
          }
          if (requestId !== requestNumber.current) return;
          setResult(body as AppointmentCustomerVehicleSearchResponse);
          setOpen(true);
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted || requestId !== requestNumber.current) return;
          setResult(null);
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to search customers and vehicles.",
          );
          setOpen(true);
        })
        .finally(() => {
          if (requestId === requestNumber.current) setLoading(false);
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const visibleGroups = useMemo(() => result?.groups ?? [], [result]);

  function select(selection: PickerSelection) {
    onSelect(selection);
    setQuery("");
    setResult(null);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="space-y-2">
      <label className="block text-xs text-[color:var(--theme-text-secondary)]">
        Customer / vehicle
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (trimmed.length >= 2) setOpen(true);
          }}
          autoComplete="off"
          className="mt-1 w-full rounded-md border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-[rgba(184,115,51,0.55)] focus:ring-1 focus:ring-[rgba(184,115,51,0.25)]"
          placeholder="Search name, phone, email, VIN, plate or unit…"
          aria-label="Search customer or vehicle"
          aria-expanded={open}
          aria-controls="appointment-customer-vehicle-results"
        />
      </label>

      {hasSelection ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="truncate font-semibold text-[color:var(--theme-text-primary)]">
              {selectedCustomerName || "Selected customer"}
            </div>
            {selectedVehicleId ? (
              <div className="mt-0.5 truncate text-xs text-[color:var(--theme-text-secondary)]">
                {selectedVehicleLabel || "Selected vehicle"}
              </div>
            ) : (
              <div className="mt-0.5 text-xs text-[color:var(--theme-text-muted)]">
                No vehicle selected
              </div>
            )}
          </div>
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-[color:var(--theme-text-secondary)] underline-offset-2 hover:underline"
            onClick={() => {
              onClear();
              setQuery("");
              setResult(null);
            }}
          >
            Clear
          </button>
        </div>
      ) : (
        <p className="text-xs text-[color:var(--theme-text-muted)]">
          Select an existing customer before saving the appointment.
        </p>
      )}

      {open && trimmed.length >= 2 ? (
        <div
          id="appointment-customer-vehicle-results"
          role="listbox"
          className="max-h-80 overflow-y-auto rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg)] shadow-[var(--theme-shadow-medium)]"
        >
          {loading ? (
            <div className="px-3 py-3 text-sm text-[color:var(--theme-text-muted)]">
              Searching…
            </div>
          ) : null}
          {!loading && error ? (
            <div className="px-3 py-3 text-sm text-red-700 dark:text-red-200">
              {error}
            </div>
          ) : null}
          {!loading && !error && visibleGroups.length === 0 ? (
            <div className="px-3 py-3 text-sm text-[color:var(--theme-text-muted)]">
              No matching customer or vehicle.
            </div>
          ) : null}
          {!error
            ? visibleGroups.map((group) => {
                const matchedVehicleIds = new Set(group.matchedVehicleIds);
                const vehicles = [...group.vehicles]
                  .sort((a, b) =>
                    Number(matchedVehicleIds.has(b.id)) -
                    Number(matchedVehicleIds.has(a.id)),
                  )
                  .slice(0, 4);
                return (
                  <div
                    key={group.customer.id}
                    className="border-b border-[color:var(--theme-border-soft)] last:border-b-0"
                  >
                    <button
                      type="button"
                      role="option"
                      className="block w-full px-3 py-2.5 text-left hover:bg-[color:var(--theme-surface-subtle)]"
                      onClick={() =>
                        select({ customer: group.customer, vehicle: null })
                      }
                    >
                      <div className="font-medium text-[color:var(--theme-text-primary)]">
                        {group.customer.displayName}
                      </div>
                      <div className="mt-0.5 text-xs text-[color:var(--theme-text-muted)]">
                        {[group.customer.phone, group.customer.email]
                          .filter(Boolean)
                          .join(" · ") || "Customer record"}
                      </div>
                    </button>
                    {vehicles.length > 0 ? (
                      <div className="pb-2 pl-3 pr-2">
                        {vehicles.map((vehicle) => (
                          <button
                            key={vehicle.id}
                            type="button"
                            role="option"
                            className="mt-1 block w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-2 text-left hover:bg-[color:var(--theme-surface-subtle)]"
                            onClick={() =>
                              select({ customer: group.customer, vehicle })
                            }
                          >
                            <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">
                              {vehicle.label}
                            </div>
                            <div className="mt-0.5 text-[0.7rem] text-[color:var(--theme-text-muted)]">
                              {[vehicle.vin, vehicle.licensePlate, vehicle.unitNumber]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            : null}
        </div>
      ) : null}
    </div>
  );
}
