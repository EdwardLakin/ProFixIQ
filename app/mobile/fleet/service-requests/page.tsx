"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchMobileFleetServiceRequests,
  type MobileFleetServiceRequest,
} from "@/features/mobile/fleet/client";

type RequestFilter = "active" | "scheduled" | "closed" | "all";

function normalizedStatus(request: MobileFleetServiceRequest): string {
  return String(request.status ?? "open").toLowerCase().replaceAll(" ", "_");
}

function isClosed(request: MobileFleetServiceRequest): boolean {
  return ["closed", "completed", "resolved", "cancelled"].includes(
    normalizedStatus(request),
  );
}

function matchesFilter(
  request: MobileFleetServiceRequest,
  filter: RequestFilter,
): boolean {
  const status = normalizedStatus(request);
  if (filter === "all") return true;
  if (filter === "closed") return isClosed(request);
  if (filter === "scheduled") return status === "scheduled";
  return !isClosed(request) && status !== "scheduled";
}

function severityClass(severity: string | null): string {
  const value = String(severity ?? "").toLowerCase();
  if (value === "safety" || value === "compliance" || value === "critical") {
    return "border-red-400/45 bg-red-500/10 text-red-100";
  }
  if (value === "high" || value === "urgent") {
    return "border-amber-400/45 bg-amber-500/10 text-amber-100";
  }
  return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-secondary)]";
}

export default function MobileFleetServiceRequestsPage() {
  const searchParams = useSearchParams();
  const selectedVehicleId = searchParams.get("vehicleId");
  const [requests, setRequests] = useState<MobileFleetServiceRequest[]>([]);
  const [filter, setFilter] = useState<RequestFilter>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await fetchMobileFleetServiceRequests());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Service requests could not be loaded.",
      );
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRequests = useMemo(
    () =>
      requests
        .filter(
          (request) =>
            (!selectedVehicleId || request.vehicleId === selectedVehicleId) &&
            matchesFilter(request, filter),
        )
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        ),
    [filter, requests, selectedVehicleId],
  );

  const counts = useMemo(
    () => ({
      active: requests.filter((request) => matchesFilter(request, "active")).length,
      scheduled: requests.filter((request) =>
        matchesFilter(request, "scheduled"),
      ).length,
      closed: requests.filter((request) => matchesFilter(request, "closed")).length,
    }),
    [requests],
  );

  const filters: Array<{ value: RequestFilter; label: string; count: number }> = [
    { value: "active", label: "Active", count: counts.active },
    { value: "scheduled", label: "Scheduled", count: counts.scheduled },
    { value: "closed", label: "Closed", count: counts.closed },
    { value: "all", label: "All", count: requests.length },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-3 sm:px-4">
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Fleet maintenance
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          Service requests
        </h1>
        <p className="mt-1 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          Review reported unit issues and scheduled follow-up. New driver defects
          are captured through the mobile pre-trip form.
        </p>
        {selectedVehicleId ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--accent-copper-soft)]/40 bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-xs">
            <span className="truncate text-[color:var(--theme-text-secondary)]">
              Filtered to one unit
            </span>
            <Link
              href="/mobile/fleet/service-requests"
              className="shrink-0 font-semibold text-[var(--accent-copper)]"
            >
              Clear
            </Link>
          </div>
        ) : null}
      </section>

      <section className="flex gap-2 overflow-x-auto pb-1" aria-label="Request filters">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
            className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${
              filter === item.value
                ? "border-[color:var(--accent-copper)] bg-[color:var(--accent-copper)] text-white"
                : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]"
            }`}
          >
            {item.label} {item.count}
          </button>
        ))}
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-100">
          <div className="font-semibold">Requests could not be loaded</div>
          <p className="mt-1 text-xs">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 min-h-10 rounded-xl border border-red-300/30 px-4 text-xs font-semibold"
          >
            Try again
          </button>
        </section>
      ) : null}

      <section className="space-y-2">
        {loading ? (
          [0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
            />
          ))
        ) : visibleRequests.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
            No service requests match this view.
          </div>
        ) : (
          visibleRequests.map((request) => (
            <article
              key={request.id}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[0.65rem] uppercase tracking-[0.15em] text-[color:var(--theme-text-secondary)]">
                    {[request.unitLabel, request.plate]
                      .filter(Boolean)
                      .join(" • ") || "Fleet unit"}
                  </div>
                  <div className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">
                    {request.title}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em] ${severityClass(request.severity)}`}
                >
                  {request.severity || "normal"}
                </span>
              </div>

              {request.summary ? (
                <p className="mt-2 text-sm leading-5 text-[color:var(--theme-text-secondary)]">
                  {request.summary}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--theme-text-muted)]">
                <span className="capitalize">
                  Status: {normalizedStatus(request).replaceAll("_", " ")}
                </span>
                <span>{new Date(request.createdAt).toLocaleDateString()}</span>
              </div>
              {request.scheduledForDate ? (
                <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  Scheduled for {request.scheduledForDate}
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  href={`/mobile/fleet?unit=${encodeURIComponent(request.vehicleId)}`}
                  className="flex min-h-10 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-xs font-semibold text-[color:var(--theme-text-primary)]"
                >
                  View unit
                </Link>
                <Link
                  href={`/mobile/fleet/pretrip/${request.vehicleId}`}
                  className="flex min-h-10 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-xs font-semibold text-[color:var(--theme-text-primary)]"
                >
                  Open pre-trip
                </Link>
              </div>
            </article>
          ))
        )}
      </section>

      <Link
        href="/mobile/fleet"
        className="flex min-h-11 items-center justify-center rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 text-sm font-semibold text-[color:var(--theme-text-primary)]"
      >
        Back to fleet
      </Link>
    </div>
  );
}
