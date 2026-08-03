"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  Wrench,
} from "lucide-react";
import type {
  EstimateListPayload,
  EstimateStatus,
} from "@/features/estimates/types";
import {
  estimateNextOwner,
  estimatePrimaryAction,
  estimateStatusLabel,
} from "@/features/estimates/lib/status";

type StatusFilter = "all" | EstimateStatus;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "waiting_for_parts", label: "With Parts" },
  { value: "ready_for_advisor", label: "Advisor Review" },
  { value: "sent", label: "Sent" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Closed" },
];

function money(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

function shortDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusClass(status: EstimateStatus): string {
  switch (status) {
    case "waiting_for_parts":
      return "border-amber-400/35 bg-amber-400/10 text-amber-700 dark:text-amber-300";
    case "ready_for_advisor":
      return "border-sky-400/35 bg-sky-400/10 text-sky-700 dark:text-sky-300";
    case "sent":
      return "border-violet-400/35 bg-violet-400/10 text-violet-700 dark:text-violet-300";
    case "approved":
    case "partially_approved":
      return "border-emerald-400/35 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300";
    case "declined":
    case "deferred":
    case "expired":
      return "border-slate-400/35 bg-slate-400/10 text-slate-600 dark:text-slate-300";
    case "draft":
      return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-muted)] text-[color:var(--theme-text-secondary)]";
  }
}

export default function EstimatesWorkspace() {
  const [payload, setPayload] = useState<EstimateListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const requestSerial = useRef(0);

  const load = useCallback(
    async (reset = true, offset = 0) => {
      const serial = ++requestSerial.current;
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          search: search.trim(),
          status,
          offset: reset ? "0" : String(offset),
        });
        const response = await fetch(`/api/estimates?${params.toString()}`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as
          | EstimateListPayload
          | { error?: string }
          | null;
        if (!response.ok || !body || !("estimates" in body)) {
          throw new Error(
            body && "error" in body && body.error
              ? body.error
              : "Could not load estimates.",
          );
        }
        if (serial !== requestSerial.current) return;
        setPayload((current) =>
          reset || !current
            ? body
            : {
                ...body,
                estimates: [...current.estimates, ...body.estimates],
              },
        );
      } catch (loadError) {
        if (serial !== requestSerial.current) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load estimates.",
        );
      } finally {
        if (serial === requestSerial.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [search, status],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(true), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = payload?.estimates ?? [];
  const queueCounts = payload?.queueCounts ?? {
    waiting: 0,
    advisor: 0,
    sent: 0,
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-6 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-primary)]">
              <ClipboardList className="h-4 w-4" />
              Estimate workspace
            </div>
            <h1 className="text-2xl font-bold text-[color:var(--theme-text-primary)] sm:text-3xl">
              {payload?.actor.mode === "parts"
                ? "Estimate parts queue"
                : "Estimates"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
              {payload?.actor.mode === "parts"
                ? "Price the current revision in Parts, then return the completed quote to its advisor."
                : "Build requested work, hand parts lines to Parts, review the completed pricing, and send one continuous record to the customer."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-muted)] px-4 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:border-[color:var(--brand-primary)] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            {payload?.actor.canCreate ? (
              <Link
                href="/estimates/new"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(23,71,255,0.2)] hover:brightness-110"
              >
                <Plus className="h-4 w-4" />
                New Estimate
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "With Parts", value: queueCounts.waiting, icon: Wrench },
            {
              label: "Advisor review",
              value: queueCounts.advisor,
              icon: UserRound,
            },
            {
              label: "Customer review",
              value: queueCounts.sent,
              icon: ArrowRight,
            },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-muted)] p-4"
            >
              <div className="flex items-center justify-between text-sm text-[color:var(--theme-text-secondary)]">
                {metric.label}
                <metric.icon className="h-4 w-4" />
              </div>
              <div className="mt-2 text-2xl font-bold text-[color:var(--theme-text-primary)]">
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      </header>

      <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]" />
          <span className="sr-only">Search estimates</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Customer, vehicle, VIN, unit or estimate number"
            className="min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-muted)] pl-10 pr-3 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-[color:var(--brand-primary)]"
          />
        </label>
        {payload?.actor.mode !== "parts" ? (
          <div className="flex max-w-full gap-1 overflow-x-auto pb-1 sm:pb-0">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatus(filter.value)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  status === filter.value
                    ? "bg-[color:var(--brand-primary)] text-white"
                    : "text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-muted)]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}

      {loading && !payload ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="h-64 animate-pulse rounded-2xl bg-[color:var(--theme-surface-muted)]"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-6 py-16 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-[color:var(--theme-text-muted)]" />
          <h2 className="mt-4 text-lg font-semibold text-[color:var(--theme-text-primary)]">
            No estimates in this view
          </h2>
          <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
            {payload?.actor.mode === "parts"
              ? "New estimate requests will appear here when an advisor submits them."
              : "Change the filters or start a new estimate."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((estimate) => {
              const total = estimate.laborTotal + estimate.partsTotal;
              return (
                <Link
                  key={estimate.id}
                  href={`/estimates/${estimate.id}`}
                  className="group flex min-h-64 flex-col rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)] transition hover:-translate-y-0.5 hover:border-[color:var(--brand-primary)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm font-bold text-[color:var(--theme-text-primary)]">
                        {estimate.estimateNumber}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                        Revision {estimate.estimateRevision} · Updated{" "}
                        {shortDate(estimate.updatedAt)}
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(estimate.estimateStatus)}`}
                    >
                      {estimateStatusLabel(estimate.estimateStatus)}
                    </span>
                  </div>

                  <div className="mt-5">
                    <h2 className="text-base font-semibold text-[color:var(--theme-text-primary)]">
                      {estimate.customerName}
                    </h2>
                    <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                      {estimate.vehicleLabel}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                      {estimate.vehicleUnitNumber
                        ? `Unit ${estimate.vehicleUnitNumber}`
                        : estimate.vehicleVin || "No VIN recorded"}
                    </p>
                  </div>

                  <div className="mt-auto border-t border-[color:var(--theme-border-soft)] pt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[color:var(--theme-text-secondary)]">
                        Next:{" "}
                        <strong className="text-[color:var(--theme-text-primary)]">
                          {estimateNextOwner(estimate.estimateStatus)}
                        </strong>
                      </span>
                      <span className="font-semibold text-[color:var(--theme-text-primary)]">
                        {payload?.actor.mode === "parts"
                          ? `${money(estimate.partsTotal)} parts`
                          : `${money(total)} subtotal`}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm font-semibold text-[color:var(--brand-primary)]">
                      {estimatePrimaryAction(
                        estimate.estimateStatus,
                        payload?.actor.mode ?? "advisor",
                      )}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {payload?.pageInfo.hasMore ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => void load(false, visible.length)}
                disabled={loadingMore}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-5 text-sm font-semibold text-[color:var(--theme-text-primary)] disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loadingMore ? "animate-spin" : ""}`}
                />
                {loadingMore ? "Loading…" : "Load more estimates"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
