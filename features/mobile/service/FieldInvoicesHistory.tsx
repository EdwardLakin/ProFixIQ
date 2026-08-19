"use client";

import {
  CheckCircle2,
  ChevronRight,
  FileDown,
  ReceiptText,
  RefreshCw,
  Search,
  WalletCards,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  filterFieldInvoiceHistoryRows,
  summarizeFieldInvoiceHistory,
  type FieldInvoiceFilter,
  type FieldInvoiceHistoryRow,
} from "@/features/mobile/service/fieldInvoiceHistory";
import {
  getOfflineSnapshot,
  removeOfflineSnapshots,
  saveOfflineSnapshot,
} from "@/features/shared/lib/offline/database";
import { getOfflineMutationScope } from "@/features/shared/lib/offline/mutations";

type InvoiceHistoryResponse = {
  ok?: boolean;
  rows?: FieldInvoiceHistoryRow[];
  error?: string;
};

const FILTERS: Array<{ value: FieldInvoiceFilter; label: string }> = [
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
  { value: "all", label: "All history" },
];
const SNAPSHOT_KIND = "field-invoice-history";
const SNAPSHOT_ENTITY = "latest";
const SNAPSHOT_MAX_AGE_MS = 1000 * 60 * 60 * 12;
let snapshotWriteQueue: Promise<void> = Promise.resolve();

function enqueueSnapshotWrite(operation: () => Promise<void>): Promise<void> {
  const write = snapshotWriteQueue.catch(() => undefined).then(operation);
  snapshotWriteQueue = write.catch(() => undefined);
  return write;
}

class InvoiceHistoryResponseError extends Error {
  constructor(
    message: string,
    readonly allowsSavedSnapshot: boolean,
  ) {
    super(message);
    this.name = "InvoiceHistoryResponseError";
  }
}

function isRetryableResponseStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency || "CAD",
    maximumFractionDigits: 2,
  }).format(value);
}

function dateLabel(value: string | null): string {
  if (!value) return "Issue date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function invoiceIdentity(row: FieldInvoiceHistoryRow): string {
  return row.invoiceNumber || `Invoice version ${row.versionNumber}`;
}

export default function FieldInvoicesHistory() {
  const [rows, setRows] = useState<FieldInvoiceHistoryRow[]>([]);
  const [filter, setFilter] = useState<FieldInvoiceFilter>("unpaid");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);
  const [showingSaved, setShowingSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const snapshotFallbackBlocked = useRef(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    const generation = ++loadGeneration.current;
    const isLatest = () => loadGeneration.current === generation;
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setErrorMessage(null);

    const scope = getOfflineMutationScope();
    try {
      const response = await fetch("/api/mobile/service/invoices", {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = (await response
        .json()
        .catch(() => null)) as InvoiceHistoryResponse | null;
      if (!isLatest()) return;
      if (response.status === 401 || response.status === 403) {
        snapshotFallbackBlocked.current = true;
        setRows([]);
        setShowingSaved(false);
        setErrorMessage(
          body?.error ?? "You no longer have access to invoices.",
        );
        if (scope) {
          try {
            await enqueueSnapshotWrite(() =>
              removeOfflineSnapshots({
                scope,
                kind: SNAPSHOT_KIND,
                entityIds: [SNAPSHOT_ENTITY],
              }),
            );
          } catch (snapshotError) {
            console.warn("[field-invoices] denied snapshot cleanup failed", {
              message:
                snapshotError instanceof Error
                  ? snapshotError.message
                  : "Unknown error",
            });
          }
        }
        return;
      }
      if (!response.ok || !body?.ok) {
        throw new InvoiceHistoryResponseError(
          body?.error ?? "Invoices and history could not load.",
          response.ok || isRetryableResponseStatus(response.status),
        );
      }

      const nextRows = body.rows ?? [];
      snapshotFallbackBlocked.current = false;
      setRows(nextRows);
      setShowingSaved(false);
      if (scope) {
        try {
          await enqueueSnapshotWrite(() =>
            saveOfflineSnapshot({
              scope,
              kind: SNAPSHOT_KIND,
              entityId: SNAPSHOT_ENTITY,
              data: nextRows,
              maxAgeMs: SNAPSHOT_MAX_AGE_MS,
            }),
          );
        } catch (snapshotError) {
          console.warn("[field-invoices] snapshot save failed", {
            message:
              snapshotError instanceof Error
                ? snapshotError.message
                : "Unknown error",
          });
        }
      }
    } catch (error) {
      if (!isLatest()) return;
      const allowsSavedSnapshot =
        !snapshotFallbackBlocked.current &&
        (!(error instanceof InvoiceHistoryResponseError) ||
          error.allowsSavedSnapshot);
      const snapshot =
        allowsSavedSnapshot && scope
          ? await getOfflineSnapshot<FieldInvoiceHistoryRow[]>({
              scope,
              kind: SNAPSHOT_KIND,
              entityId: SNAPSHOT_ENTITY,
            })
          : null;
      if (!isLatest()) return;

      if (snapshot) {
        setRows(snapshot.data);
        setShowingSaved(true);
        setErrorMessage(null);
      } else {
        setRows([]);
        setShowingSaved(false);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Invoices and history could not load.",
        );
      }
    } finally {
      if (isLatest()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    void load();
    return () => {
      loadGeneration.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const refreshIfOnline = () => {
      const isOnline = navigator.onLine;
      setOnline(isOnline);
      if (isOnline) void load("refresh");
    };
    const markOffline = () => setOnline(false);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshIfOnline();
    };

    window.addEventListener("online", refreshIfOnline);
    window.addEventListener("offline", markOffline);
    window.addEventListener("focus", refreshIfOnline);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("online", refreshIfOnline);
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("focus", refreshIfOnline);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  const summary = useMemo(() => summarizeFieldInvoiceHistory(rows), [rows]);
  const filteredRows = useMemo(
    () => filterFieldInvoiceHistoryRows(rows, filter, query),
    [filter, query, rows],
  );
  const outstandingLabels = Object.entries(summary.outstandingByCurrency);
  const liveActionsAvailable = online && !showingSaved;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mobile-dashboard-hero__eyebrow">Money</div>
            <h1 className="mobile-dashboard-hero__title">
              Invoices &amp; history
            </h1>
            <p className="mobile-dashboard-hero__subtitle">
              Collect open balances and find completed Field invoices.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load("refresh")}
            aria-label="Refresh invoices and history"
            className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-white disabled:opacity-55"
            disabled={refreshing || !online}
          >
            <RefreshCw
              aria-hidden
              className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </section>

      {!online || showingSaved ? (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-100">
          <WifiOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {showingSaved
              ? "Saved invoice history is available for reference. Reconnect before collecting payment or opening a PDF."
              : "You are offline. Reconnect to refresh invoice balances."}
          </span>
        </div>
      ) : null}

      <section
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        aria-label="Invoice summary"
      >
        <div className="mobile-command-panel border p-3">
          <WalletCards aria-hidden className="h-4 w-4 text-amber-500" />
          <div className="mt-2 text-2xl font-black text-[color:var(--theme-text-primary)]">
            {summary.unpaidCount}
          </div>
          <div className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Unpaid invoices
          </div>
        </div>
        <div className="mobile-command-panel border p-3">
          <CheckCircle2 aria-hidden className="h-4 w-4 text-emerald-500" />
          <div className="mt-2 text-2xl font-black text-[color:var(--theme-text-primary)]">
            {summary.paidCount}
          </div>
          <div className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Paid history
          </div>
        </div>
        <div className="mobile-command-panel col-span-2 border p-3 sm:col-span-1">
          <ReceiptText aria-hidden className="h-4 w-4 text-sky-500" />
          <div className="mt-2 text-base font-black text-[color:var(--theme-text-primary)]">
            {outstandingLabels.length > 0
              ? outstandingLabels
                  .map(([currency, value]) => money(value, currency))
                  .join(" · ")
              : money(0, "CAD")}
          </div>
          <div className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Outstanding
          </div>
        </div>
      </section>

      <section className="mobile-command-panel overflow-hidden border">
        <div className="flex items-center gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              aria-pressed={filter === item.value}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                filter === item.value
                  ? "border-[color:var(--accent-copper)] bg-[color:var(--accent-copper)] text-white"
                  : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-secondary)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="relative border-t border-[color:var(--theme-border-soft)] p-3">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search invoice, RO, customer, plate or vehicle"
            aria-label="Search invoices and history"
            className="w-full pl-10 pr-4"
          />
        </div>
      </section>

      {errorMessage ? (
        <div
          className={`rounded-2xl border p-3 text-sm ${
            showingSaved
              ? "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-100"
              : "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-200"
          }`}
        >
          {errorMessage}
        </div>
      ) : null}

      <section className="space-y-2.5" aria-label="Invoice results">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]"
            />
          ))
        ) : filteredRows.length === 0 ? (
          <div className="mobile-command-panel border p-6 text-center">
            <ReceiptText
              aria-hidden
              className="mx-auto h-8 w-8 text-[color:var(--theme-text-muted)]"
            />
            <h2 className="mt-2 text-base font-extrabold text-[color:var(--theme-text-primary)]">
              {filter === "unpaid" ? "No unpaid invoices" : "No invoices found"}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              {query
                ? "Try another invoice, customer, work order or vehicle."
                : "Completed Field invoices will appear here."}
            </p>
          </div>
        ) : (
          filteredRows.map((row) => (
            <article
              key={row.invoiceVersionId}
              className="mobile-command-row overflow-hidden border p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-extrabold text-[color:var(--theme-text-primary)]">
                      {invoiceIdentity(row)}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-[0.12em] ${
                        row.paymentState === "paid"
                          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-200"
                          : "bg-amber-500/12 text-amber-700 dark:text-amber-200"
                      }`}
                    >
                      {row.paymentState}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                    {row.workOrderNumber || `#${row.workOrderId.slice(0, 8)}`} ·{" "}
                    {row.customerName}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                    {row.vehicleLabel}
                    {row.licensePlate ? ` · ${row.licensePlate}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-black text-[color:var(--theme-text-primary)]">
                    {money(
                      row.paymentState === "unpaid"
                        ? row.outstandingTotal
                        : row.total,
                      row.currency,
                    )}
                  </div>
                  <div className="text-[0.68rem] text-[color:var(--theme-text-muted)]">
                    {row.paymentState === "unpaid" ? "due" : "total"}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--theme-border-soft)] pt-3">
                <span className="text-xs text-[color:var(--theme-text-muted)]">
                  {dateLabel(row.issuedAt)}
                </span>
                <div className="flex flex-wrap justify-end gap-2">
                  {liveActionsAvailable ? (
                    <Link
                      href={`/api/work-orders/${encodeURIComponent(row.workOrderId)}/invoice-pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[color:var(--theme-border-soft)] px-3 text-xs font-bold text-[color:var(--theme-text-primary)]"
                    >
                      <FileDown aria-hidden className="h-4 w-4" /> PDF
                    </Link>
                  ) : null}
                  <Link
                    href={`/mobile/work-orders/${encodeURIComponent(row.workOrderId)}`}
                    className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[color:var(--theme-border-soft)] px-3 text-xs font-bold text-[color:var(--theme-text-primary)]"
                  >
                    Work order <ChevronRight aria-hidden className="h-4 w-4" />
                  </Link>
                  {liveActionsAvailable ? (
                    <Link
                      href={`/mobile/service/closeout/${encodeURIComponent(row.workOrderId)}`}
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-[color:var(--accent-copper)] px-3 text-xs font-extrabold text-white"
                    >
                      {row.paymentState === "unpaid"
                        ? "Collect payment"
                        : "View receipt"}
                      <ChevronRight aria-hidden className="h-4 w-4" />
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
