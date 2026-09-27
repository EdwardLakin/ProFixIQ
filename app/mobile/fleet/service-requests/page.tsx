"use client";

import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Truck,
  Wrench,
} from "lucide-react";
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
    return "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-200";
  }
  if (value === "high" || value === "urgent") {
    return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200";
  }
  return "border-blue-500/25 bg-blue-500/8 text-blue-700 dark:text-blue-200";
}

function requestRail(request: MobileFleetServiceRequest): string {
  const value = String(request.severity ?? "").toLowerCase();
  if (value === "safety" || value === "compliance" || value === "critical") {
    return "bg-red-500";
  }
  if (value === "high" || value === "urgent") return "bg-amber-500";
  if (isClosed(request)) return "bg-emerald-500";
  return "bg-blue-500";
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
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
              <Wrench aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="mobile-dashboard-hero__eyebrow">Fleet maintenance</div>
              <h1 className="mobile-dashboard-hero__title">Service requests</h1>
              <p className="mobile-dashboard-hero__subtitle">
                Reported defects, scheduled follow-up and closed fleet work in one inbox.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh service requests"
            className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-white disabled:opacity-55"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {selectedVehicleId ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.075] px-3 py-2.5 text-xs">
            <span className="truncate text-slate-200">Filtered to one unit</span>
            <Link
              href="/mobile/fleet/service-requests"
              className="shrink-0 font-bold text-[#8ed4ff]"
            >
              Clear filter
            </Link>
          </div>
        ) : null}
      </section>

      <section className="mobile-command-panel overflow-hidden border">
        <div
          className="flex gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Request filters"
        >
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${
                filter === item.value
                  ? "border-[color:var(--accent-copper)] bg-[color:var(--accent-copper)] text-white"
                  : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-secondary)]"
              }`}
            >
              {item.label} · {item.count}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          <div className="font-bold">Requests could not be loaded</div>
          <p className="mt-1 text-xs">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mobile-command-secondary mt-3 px-4 text-xs font-bold"
          >
            Try again
          </button>
        </section>
      ) : null}

      <section className="space-y-2.5">
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <h2 className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
              {filters.find((item) => item.value === filter)?.label} requests
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
              Safety and urgent items appear with stronger status rails.
            </p>
          </div>
          <span className="text-xs font-bold text-[color:var(--theme-text-secondary)]">
            {visibleRequests.length}
          </span>
        </div>

        {loading ? (
          [0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-36 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]"
            />
          ))
        ) : visibleRequests.length === 0 ? (
          <div className="mobile-command-panel border p-5 text-center text-sm text-[color:var(--theme-text-secondary)]">
            No service requests match this view.
          </div>
        ) : (
          visibleRequests.map((request) => (
            <article
              key={request.id}
              className="mobile-command-row relative overflow-hidden border p-4 pl-5"
            >
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 w-1.5 ${requestRail(request)}`}
              />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
                    <Truck className="h-3.5 w-3.5" />
                    <span className="truncate">
                      {[request.unitLabel, request.plate]
                        .filter(Boolean)
                        .join(" · ") || "Fleet unit"}
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-base font-extrabold tracking-[-0.025em] text-[color:var(--theme-text-primary)]">
                    {request.title}
                  </h3>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] ${severityClass(request.severity)}`}
                >
                  {request.severity || "normal"}
                </span>
              </div>

              {request.summary ? (
                <p className="mt-2 text-sm leading-5 text-[color:var(--theme-text-secondary)]">
                  {request.summary}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--theme-text-muted)]">
                <span className="inline-flex items-center gap-1 capitalize">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {normalizedStatus(request).replaceAll("_", " ")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {request.scheduledForDate ||
                    new Date(request.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href={`/mobile/fleet?unit=${encodeURIComponent(request.vehicleId)}`}
                  className="mobile-command-secondary flex items-center justify-center px-3 text-xs font-bold"
                >
                  View unit
                </Link>
                <Link
                  href={`/mobile/fleet/pretrip/${request.vehicleId}`}
                  className="mobile-command-primary flex items-center justify-center px-3 text-xs font-bold"
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
        className="mobile-command-row flex min-h-12 items-center justify-between border px-4 text-sm font-bold text-[color:var(--theme-text-primary)]"
      >
        <span className="inline-flex items-center gap-2">
          <ChevronLeft className="h-4 w-4" />
          Back to fleet
        </span>
        <ChevronRight className="h-5 w-5 text-[color:var(--accent-copper)]" />
      </Link>
    </main>
  );
}
