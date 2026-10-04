"use client";

import Link from "next/link";
import { RefreshCw, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { setCustomerRequestPartIds } from "@/features/parts/lib/requests/customer-request-store";
import {
  customerRequestStatusLabel,
  hiddenPartRequestIds,
  paymentAttentionLabel,
  type CustomerPartsRequestRow,
} from "@/features/parts/lib/requests/customer-requests";

function money(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase() === "USD" ? "USD" : "CAD",
  }).format(amount);
}

const REFRESH_MS = 30_000;

export default function CustomerPartsQuoteRequestsPanel() {
  const [requests, setRequests] = useState<CustomerPartsRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/parts/customer-requests", { cache: "no-store" });
      const json = (await response.json().catch(() => null)) as
        | { ok?: boolean; requests?: CustomerPartsRequestRow[]; error?: string }
        | null;
      if (!response.ok || !json?.ok || !json.requests) {
        setError(json?.error ?? "Customer requests could not be loaded.");
        return;
      }
      setError(null);
      setRequests(json.requests);
      // Tell the queue page which part requests this section owns.
      setCustomerRequestPartIds(hiddenPartRequestIds(json.requests));
    } catch {
      setError("Customer requests could not be loaded.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  if (requests && requests.length === 0 && !error) return null;

  return (
    <section
      aria-label="Customer requests"
      className="rounded-xl border border-t-4 border-[color:var(--theme-border-soft)] border-t-sky-400 bg-[color:var(--theme-surface-inset)] p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em]">
          <UserRound className="h-4 w-4" aria-hidden="true" />
          Customer requests
          {requests ? (
            <span className="rounded-full bg-[color:var(--theme-surface-subtle)] px-2 py-0.5 text-xs font-medium">
              {requests.length}
            </span>
          ) : null}
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {requests === null && !error ? (
        <p className="mt-3 text-sm text-[color:var(--theme-text-secondary)]">Loading customer requests…</p>
      ) : null}

      <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {(requests ?? []).map((request) => {
          const preApproval = request.status !== "approved";
          const attention = paymentAttentionLabel(request.paymentAttention);
          return (
            <li
              key={request.id}
              className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{request.description}</div>
                  <div className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                    {[request.customerName, request.vehicleLabel].filter(Boolean).join(" • ") ||
                      "Customer request"}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[11px] font-semibold">
                  Qty {request.qty}
                </span>
              </div>

              <div className="mt-2 text-xs font-semibold text-sky-300">
                {customerRequestStatusLabel(request.status, request.paid)}
              </div>
              {request.total != null ? (
                <div className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                  Quote total {money(request.total, request.currency)}
                </div>
              ) : null}
              {attention ? (
                <div
                  role="alert"
                  className="mt-2 rounded-md border border-red-400/60 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-200"
                >
                  {attention}
                </div>
              ) : null}
              {request.prepaidApplied > 0 ? (
                <div className="mt-1 text-xs text-emerald-300">
                  Paid by the customer — {money(request.prepaidApplied, request.currency)} credited to the invoice.
                </div>
              ) : null}
              {request.status === "approved" && request.approvalChoice === "book_install" ? (
                <div className="mt-1 text-xs text-amber-300">
                  Customer would also like an install appointment.
                </div>
              ) : null}
              {request.notes ? (
                <p className="mt-1 line-clamp-2 text-xs text-[color:var(--theme-text-secondary)]">
                  {request.notes}
                </p>
              ) : null}

              {request.partRequestId ? (
                <Link
                  href={`/parts/requests/${request.partRequestId}`}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold hover:bg-[color:var(--theme-surface-overlay)]"
                >
                  {preApproval ? "Price this request" : "Open request to order"}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
