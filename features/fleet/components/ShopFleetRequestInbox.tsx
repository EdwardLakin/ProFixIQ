"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, RefreshCw, Truck } from "lucide-react";

import { formatFleetDate } from "@/features/fleet/lib/fleetDate";
import { convertFleetServiceRequest } from "@/features/fleet/lib/convertFleetServiceRequest";
import type {
  FleetServiceRequestItem,
  FleetServiceRequestsPayload,
} from "@/features/fleet/types/serviceRequests";

type Filter = "pending" | "converted" | "all";

const TERMINAL_STATUSES = new Set([
  "completed",
  "closed",
  "cancelled",
  "declined",
  "rejected",
]);

function requestDate(value: string | null) {
  return formatFleetDate(value, {
    fallback: "Not requested",
    options: { month: "short", day: "numeric", year: "numeric" },
  });
}

function isPending(item: FleetServiceRequestItem) {
  return !item.workOrder && !TERMINAL_STATUSES.has(item.status);
}

export default function ShopFleetRequestInbox() {
  const router = useRouter();
  const [payload, setPayload] = useState<FleetServiceRequestsPayload | null>(
    null,
  );
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(true);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/fleet/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        cache: "no-store",
        signal,
      });
      const body = (await response
        .json()
        .catch(() => ({}))) as FleetServiceRequestsPayload & { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Unable to load Fleet requests");
      }
      setPayload(body);
    } catch (cause) {
      if (!signal?.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load Fleet requests",
        );
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => {
    const requests = payload?.requests ?? [];
    if (filter === "pending") return requests.filter(isPending);
    if (filter === "converted")
      return requests.filter((item) => item.workOrder);
    return requests;
  }, [filter, payload?.requests]);

  const pendingCount = useMemo(
    () => payload?.requests.filter(isPending).length ?? 0,
    [payload?.requests],
  );

  async function acceptRequest(item: FleetServiceRequestItem) {
    setConvertingId(item.id);
    setError(null);
    try {
      const workOrderId = await convertFleetServiceRequest(item.id);
      router.push(`/work-orders/${encodeURIComponent(workOrderId)}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create the work order",
      );
      setConvertingId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 text-[color:var(--theme-text-primary)]">
      <header className="flex flex-col gap-4 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper)]">
            Shop intake
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Fleet service requests
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
            Review maintenance requests approved by Fleet dispatch. Accepting a
            request creates the Shop work order; raw driver defects never appear
            here.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3">
          <div className="text-2xl font-semibold text-amber-700 dark:text-amber-100">
            {loading ? "—" : pendingCount}
          </div>
          <div className="text-xs text-[color:var(--theme-text-secondary)]">
            Awaiting Shop intake
          </div>
        </div>
      </header>

      <section className="overflow-hidden rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] p-3">
          <div
            className="flex gap-2"
            role="tablist"
            aria-label="Fleet request filters"
          >
            {(
              [
                ["pending", "Awaiting intake"],
                ["converted", "Accepted"],
                ["all", "All"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={
                  filter === value
                    ? "rounded-xl bg-[var(--accent-copper)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-on-accent)]"
                    : "rounded-xl px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-subtle)]"
                }
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error ? (
          <p className="border-b border-red-400/20 bg-red-400/10 p-4 text-sm text-red-700 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {loading && !payload ? (
          <p className="p-6 text-sm text-[color:var(--theme-text-secondary)]">
            Loading approved Fleet requests…
          </p>
        ) : null}

        {!loading && visible.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
            <h2 className="mt-3 font-semibold">Nothing in this view</h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              New items appear only after Fleet dispatch sends them to the Shop.
            </p>
          </div>
        ) : null}

        <div className="divide-y divide-[color:var(--theme-border-soft)]">
          {visible.map((item) => (
            <article
              key={item.id}
              className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                    <Truck className="h-4 w-4 text-sky-500" />
                    {item.unitLabel}
                  </span>
                  <span className="text-xs text-[color:var(--theme-text-muted)]">
                    {item.fleetName} · {item.vehicleDescription}
                  </span>
                  <span className="rounded-full bg-sky-400/10 px-2 py-1 text-[10px] font-semibold uppercase text-sky-700 dark:text-sky-200">
                    {item.severity}
                  </span>
                </div>
                <h2 className="mt-2 font-semibold">{item.title}</h2>
                {item.summary ? (
                  <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                    {item.summary}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
                  Submitted {requestDate(item.createdAt)} · Requested service{" "}
                  {requestDate(item.requestedForDate)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {item.workOrder ? (
                  <Link
                    href={`/work-orders/${encodeURIComponent(item.workOrder.id)}`}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    Open {item.workOrder.reference}
                  </Link>
                ) : isPending(item) && payload?.canManage ? (
                  <button
                    type="button"
                    disabled={convertingId !== null}
                    onClick={() => void acceptRequest(item)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-xs font-semibold text-[color:var(--theme-text-on-accent)] disabled:cursor-wait disabled:opacity-60"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    {convertingId === item.id
                      ? "Creating work order…"
                      : "Accept into Shop"}
                  </button>
                ) : (
                  <span className="text-xs text-[color:var(--theme-text-muted)]">
                    {item.status.replaceAll("_", " ")}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
