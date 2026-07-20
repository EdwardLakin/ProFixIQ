"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import { toast } from "sonner";
import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";
import { InvoiceCsvImportCard } from "@/features/billing/components/InvoiceCsvImportCard";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Invoice = DB["public"]["Tables"]["invoices"]["Row"];

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "email"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate"> | null;
  resolved_labor_total?: number | null;
  resolved_parts_total?: number | null;
  resolved_shop_supplies_total?: number | null;
  resolved_tax_total?: number | null;
  resolved_invoice_total?: number | null;
  pricing_error?: string | null;
};

type BillingRowsResponse = {
  ok?: boolean;
  rows?: Row[];
  error?: string;
};

type HistoricalInvoiceRow = Invoice & {
  customers: Pick<Customer, "first_name" | "last_name" | "email"> | null;
};

type InvoiceMetadata = {
  imported?: boolean;
  read_only?: boolean;
  work_order_number?: string | null;
  vin?: string | null;
  vehicle_id?: string | null;
  source_system?: string | null;
  raw_row?: Record<string, unknown> | null;
  legacy_customer_id?: string | null;
  legacy_vehicle_id?: string | null;
  customer_match_failed_reason?: string | null;
  matched_customer_id?: string | null;
  customer_match_source?: string | null;
};

type Status =
  | Exclude<WorkOrder["status"], null>
  | "ready_to_invoice"
  | "invoiced"
  | "draft"
  | "issued"
  | "paid"
  | "void";

const BILLING_STATUSES: Status[] = [
  "completed",
  "ready_to_invoice",
  "invoiced",
];

const INPUT_DARK = "desktop-input w-full px-3 py-2 text-sm";

const SELECT_DARK = "desktop-input w-full px-3 py-2 text-sm";
const HISTORICAL_INVOICE_PAGE_SIZE = 250;

function stageAccent(status: string | null | undefined): {
  badge: string;
  border: string;
  progress: string;
} {
  const key = String(status ?? "completed")
    .toLowerCase()
    .replaceAll(" ", "_");

  if (key === "ready_to_invoice") {
    return {
      badge: "border-sky-400/45 bg-sky-500/10 text-sky-100",
      border: "border-sky-500/25",
      progress: "bg-sky-400",
    };
  }

  if (key === "invoiced") {
    return {
      badge: "border-emerald-400/70 bg-emerald-500/10 text-emerald-100",
      border: "border-emerald-500/25",
      progress: "bg-emerald-400",
    };
  }

  return {
    badge: "border-sky-400/60 bg-sky-500/10 text-sky-100",
    border: "border-sky-500/25",
    progress: "bg-sky-400",
  };
}

function priorityLabel(priority: number | null | undefined): string | null {
  if (priority === 1) return "Urgent";
  if (priority === 2) return "High";
  if (priority === 3) return "Normal";
  if (priority === 4) return "Low";
  return null;
}

function priorityChip(priority: number | null | undefined): string {
  if (priority === 1) {
    return "border-red-500/50 bg-red-500/15 text-red-200";
  }
  if (priority === 2) {
    return "border-sky-500/50 bg-sky-500/15 text-sky-100";
  }
  if (priority === 4) {
    return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-secondary)]";
  }
  return "border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] text-[color:var(--theme-text-secondary)]";
}

function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export default function BillingPage(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [rows, setRows] = useState<Row[]>([]);
  const [historicalInvoices, setHistoricalInvoices] = useState<
    HistoricalInvoiceRow[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [err, setErr] = useState<string | null>(null);
  const [historicalVisibleLimit, setHistoricalVisibleLimit] = useState(25);
  const [historicalHasMore, setHistoricalHasMore] = useState(false);
  const [historicalLoadingMore, setHistoricalLoadingMore] = useState(false);
  const [expandedHistoricalInvoiceId, setExpandedHistoricalInvoiceId] =
    useState<string | null>(null);
  const [invoiceImportActive, setInvoiceImportActive] = useState(false);

  const load = useCallback(
    async (options?: { background?: boolean }) => {
      if (!options?.background) setLoading(true);
      setErr(null);

      const [billingResult, historicalResult] = await Promise.all([
        fetch("/api/billing/work-orders", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }).then(async (response) => ({
          response,
          body: (await response.json().catch(() => null)) as BillingRowsResponse | null,
        })).catch((error: unknown) => ({
          response: null,
          body: {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Customer billing request failed.",
          } as BillingRowsResponse,
        })),
        supabase
          .from("invoices")
          .select("*, customers:customers(first_name,last_name,email)")
          .or("metadata->>imported.eq.true,metadata->>read_only.eq.true")
          .order("issued_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(0, HISTORICAL_INVOICE_PAGE_SIZE - 1),
      ]);

      if (!billingResult.response?.ok || !billingResult.body?.ok) {
        setErr(
          billingResult.body?.error ??
            "Customer billing could not load invoice pricing.",
        );
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: invoiceData, error: invoiceError } = historicalResult;

      if (invoiceError) {
        setErr(invoiceError.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const statusRows = (billingResult.body.rows ?? []).filter((row) =>
        status && (BILLING_STATUSES as string[]).includes(status)
          ? row.status === status
          : (BILLING_STATUSES as string[]).includes(String(row.status ?? "")),
      );
      const baseRows = statusRows as Row[];
      const qlc = q.trim().toLowerCase();

      const filtered =
        qlc.length === 0
          ? baseRows
          : baseRows.filter((r) => {
              const name = [
                r.customers?.first_name ?? "",
                r.customers?.last_name ?? "",
              ]
                .join(" ")
                .toLowerCase();

              const plate = r.vehicles?.license_plate?.toLowerCase() ?? "";

              const ymm = [
                r.vehicles?.year ?? "",
                r.vehicles?.make ?? "",
                r.vehicles?.model ?? "",
              ]
                .join(" ")
                .toLowerCase();

              const cid = (r.custom_id ?? "").toLowerCase();

              return (
                r.id.toLowerCase().includes(qlc) ||
                cid.includes(qlc) ||
                name.includes(qlc) ||
                plate.includes(qlc) ||
                ymm.includes(qlc)
              );
            });

      const baseHistoricalInvoices = (invoiceData ??
        []) as HistoricalInvoiceRow[];
      setHistoricalHasMore(
        baseHistoricalInvoices.length === HISTORICAL_INVOICE_PAGE_SIZE,
      );

      const filteredHistoricalInvoices =
        qlc.length === 0
          ? baseHistoricalInvoices
          : baseHistoricalInvoices.filter((invoice) => {
              const metadata = invoice.metadata as InvoiceMetadata | null;
              const rawRow = metadata?.raw_row ?? {};
              const customerName = [
                invoice.customers?.first_name ?? "",
                invoice.customers?.last_name ?? "",
              ]
                .join(" ")
                .toLowerCase();
              const customerText = [
                customerName,
                invoice.customers?.email ?? "",
                String(rawRow.customer ?? ""),
                String(rawRow.customer_name ?? ""),
                String(rawRow.customer_id ?? ""),
              ]
                .join(" ")
                .toLowerCase();
              const vinText = [metadata?.vin ?? "", String(rawRow.vin ?? "")]
                .join(" ")
                .toLowerCase();
              const workOrderText = [
                metadata?.work_order_number ?? "",
                String(rawRow.work_order_number ?? ""),
                invoice.work_order_id ?? "",
              ]
                .join(" ")
                .toLowerCase();
              const invoiceNumber = (
                invoice.invoice_number ?? ""
              ).toLowerCase();
              const statusText = (invoice.status ?? "").toLowerCase();

              return (
                invoice.id.toLowerCase().includes(qlc) ||
                invoiceNumber.includes(qlc) ||
                customerText.includes(qlc) ||
                vinText.includes(qlc) ||
                workOrderText.includes(qlc) ||
                statusText.includes(qlc)
              );
            });

      const statusFilteredHistoricalInvoices = status
        ? filteredHistoricalInvoices.filter(
            (invoice) => invoice.status === status,
          )
        : filteredHistoricalInvoices;

      setRows(filtered);
      setHistoricalInvoices(statusFilteredHistoricalInvoices);
      setHistoricalVisibleLimit(25);
      setExpandedHistoricalInvoiceId(null);
      setLoading(false);
    },
    [q, status, supabase],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("billing:list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => {
          setTimeout(() => void load({ background: true }), 60);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        () => {
          if (!invoiceImportActive)
            setTimeout(() => void load({ background: true }), 60);
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [supabase, load, invoiceImportActive]);

  const handleLoadMoreHistoricalInvoices = useCallback(async () => {
    setHistoricalLoadingMore(true);
    setErr(null);

    const from = historicalInvoices.length;
    const to = from + HISTORICAL_INVOICE_PAGE_SIZE - 1;
    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select("*, customers:customers(first_name,last_name,email)")
      .or("metadata->>imported.eq.true,metadata->>read_only.eq.true")
      .order("issued_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    setHistoricalLoadingMore(false);

    if (invoiceError) {
      setErr(invoiceError.message);
      return;
    }

    const nextInvoices = (invoiceData ?? []) as HistoricalInvoiceRow[];
    setHistoricalInvoices((current) => [...current, ...nextInvoices]);
    setHistoricalHasMore(nextInvoices.length === HISTORICAL_INVOICE_PAGE_SIZE);
    setHistoricalVisibleLimit((current) =>
      Math.max(current, from + Math.min(nextInvoices.length, 25)),
    );
  }, [historicalInvoices.length, supabase]);

  const handleAiReview = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/work-orders/${id}/ai-review`, {
        method: "POST",
      });

      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        issues?: { kind: string; lineId?: string; message: string }[];
        error?: string;
      } | null;

      if (!res.ok || !j?.ok) {
        const msg = j?.issues?.length
          ? `Found issues: ${j.issues.map((i) => i.message).join(" • ")}`
          : j?.error || "AI review failed.";
        toast.error(msg);
        return;
      }

      toast.success("AI review passed. You can mark ready to invoice.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI review failed.";
      toast.error(msg);
    }
  }, []);

  const handleMarkReady = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/work-orders/${id}/mark-ready`, {
          method: "POST",
        });

        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;

        if (!res.ok || !j?.ok) {
          toast.error(j?.error ?? "Failed to mark ready.");
          return;
        }

        toast.success("Marked ready to invoice.");
        await load();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to mark ready.";
        toast.error(msg);
      }
    },
    [load],
  );

  const handleInvoice = useCallback((row: Row) => {
    const previewUrl = `/work-orders/invoice/${row.id}`;
    if (typeof window !== "undefined") {
      window.location.assign(previewUrl);
    }
  }, []);

  const total = rows.length + historicalInvoices.length;
  const historicalCount = historicalInvoices.length;
  const visibleHistoricalInvoices = historicalInvoices.slice(
    0,
    historicalVisibleLimit,
  );
  const completedCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          String(r.status ?? "")
            .toLowerCase()
            .replaceAll(" ", "_") === "completed",
      ).length,
    [rows],
  );

  const readyCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          String(r.status ?? "")
            .toLowerCase()
            .replaceAll(" ", "_") === "ready_to_invoice",
      ).length,
    [rows],
  );

  const invoicedCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          String(r.status ?? "")
            .toLowerCase()
            .replaceAll(" ", "_") === "invoiced",
      ).length,
    [rows],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-foreground">
      <GuidedPageStepPanel />

      <section className="overflow-hidden rounded-[28px] border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] shadow-[var(--theme-shadow-medium)]">
        <div className="border-b border-[color:var(--desktop-border)] bg-[var(--theme-gradient-panel)] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">
                Operations
              </div>
              <h1
                className="mt-2 text-3xl text-[color:var(--theme-text-primary)]"
                style={{ fontFamily: "var(--font-blackops)" }}
              >
                Billing
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
                Review completed work, move it to ready to invoice, and send
                invoices without leaving the operations flow.
              </p>

              {!loading && !err ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1 text-[11px] font-semibold text-[color:var(--theme-text-primary)]">
                    Total: <span className="text-[color:var(--theme-text-primary)]">{total}</span>
                  </div>
                  <div className="rounded-full border border-sky-500/20 bg-sky-500/5 px-3 py-1 text-[11px] font-semibold text-sky-100">
                    Completed:{" "}
                    <span className="text-[color:var(--theme-text-primary)]">{completedCount}</span>
                  </div>
                  <div className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-100">
                    Ready: <span className="text-[color:var(--theme-text-primary)]">{readyCount}</span>
                  </div>
                  <div className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                    Invoiced:{" "}
                    <span className="text-[color:var(--theme-text-primary)]">{invoicedCount}</span>
                  </div>
                  <div className="rounded-full border border-amber-500/20 bg-amber-500/5 px-3 py-1 text-[11px] font-semibold text-amber-100">
                    Imported historical:{" "}
                    <span className="text-[color:var(--theme-text-primary)]">{historicalCount}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/work-orders/view"
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:border-sky-400/60 hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_80%,_var(--theme-surface-page))]"
              >
                Open work orders
              </Link>

              <Link
                href="/work-orders/quote-review"
                className="inline-flex items-center justify-center rounded-full border border-[var(--accent-copper-light)]/35 bg-[var(--accent-copper)]/12 px-4 py-2 text-sm font-semibold text-[var(--accent-copper-light)] transition hover:bg-[var(--accent-copper)]/20"
              >
                Quote review
              </Link>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex-1">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void load()}
                placeholder="Search invoice #, customer, VIN, work order #, status, plate, YMM..."
                className={INPUT_DARK}
              />
            </div>

            <div className="flex gap-3 lg:w-auto">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status | "")}
                className={SELECT_DARK + " min-w-[220px]"}
                aria-label="Filter billing status"
              >
                <option value="">All billing stages</option>
                <option value="completed">Completed</option>
                <option value="ready_to_invoice">Ready to invoice</option>
                <option value="invoiced">Invoiced</option>
                <option value="issued">Imported issued</option>
                <option value="paid">Imported paid</option>
                <option value="draft">Imported draft</option>
                <option value="void">Imported void</option>
              </select>

              <button
                type="button"
                onClick={() => void load()}
                className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:border-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/10"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </section>

      <InvoiceCsvImportCard
        onImportActiveChange={setInvoiceImportActive}
        onImported={() => void load({ background: true })}
      />

      {err ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-[24px] border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]"
            />
          ))}
        </div>
      ) : rows.length === 0 && historicalInvoices.length === 0 ? (
        <div className="rounded-[24px] border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-6 text-sm text-[color:var(--theme-text-secondary)]">
          No live billing work orders or imported historical invoices match your
          current filters.
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const href = `/work-orders/${r.custom_id ?? r.id}?mode=view`;
            const accent = stageAccent(r.status);

            const customerName = r.customers
              ? [r.customers.first_name ?? "", r.customers.last_name ?? ""]
                  .filter(Boolean)
                  .join(" ") || "No customer"
              : "No customer";

            const vehicleText = r.vehicles
              ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${r.vehicles.model ?? ""}`
                  .trim()
                  .replace(/\s+/g, " ") || "No vehicle"
              : "No vehicle";

            const plateText = r.vehicles?.license_plate
              ? `(${r.vehicles.license_plate})`
              : "";
            const priorityText = priorityLabel(r.priority);
            const statusLower = String(r.status ?? "")
              .toLowerCase()
              .replaceAll(" ", "_");

            const laborTotal = Number(r.resolved_labor_total ?? 0);
            const partsTotal = Number(r.resolved_parts_total ?? 0);
            const invoiceTotal = Number(
              r.resolved_invoice_total ?? laborTotal + partsTotal,
            );
            const pricingAvailable = !r.pricing_error;
            const billingState = r.pricing_error
              ? "Pricing unavailable"
              : statusLower === "invoiced"
                ? "Invoice issued"
                : statusLower === "ready_to_invoice"
                  ? "Ready for invoice review"
                  : "Completed — review pricing";

            return (
              <div
                key={r.id}
                className={[
                  "overflow-hidden rounded-[24px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] shadow-[var(--theme-shadow-medium)]",
                  accent.border,
                ].join(" ")}
              >
                <div className="border-b border-[color:var(--desktop-border)] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={href}
                          className="text-2xl font-semibold text-[color:var(--theme-text-primary)] hover:text-[var(--accent-copper-light)]"
                        >
                          {r.custom_id ? r.custom_id : `#${r.id.slice(0, 8)}`}
                        </Link>

                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${accent.badge}`}
                        >
                          {String(r.status ?? "completed").replaceAll("_", " ")}
                        </span>

                        {priorityText ? (
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityChip(
                              r.priority,
                            )}`}
                          >
                            {priorityText}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 text-base font-semibold text-[color:var(--theme-text-primary)]">
                        {customerName}
                      </div>
                      <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                        {vehicleText} {plateText}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                        Updated
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {r.updated_at
                          ? format(new Date(r.updated_at), "PP")
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-4">
                  <div
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                      pricingAvailable
                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                        : "border-red-400/35 bg-red-500/10 text-red-100"
                    }`}
                  >
                    {billingState}
                    {r.pricing_error ? (
                      <div className="mt-1 font-normal text-[color:var(--theme-text-secondary)]">
                        {r.pricing_error}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Labor
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {pricingAvailable ? formatMoney(laborTotal) : "—"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Parts
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {pricingAvailable ? formatMoney(partsTotal) : "—"}
                      </div>
                    </div>

                    <div className="col-span-2 rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Invoice total
                      </div>
                      <div className="mt-1 text-lg font-semibold text-[var(--accent-copper-light)]">
                        {pricingAvailable ? formatMoney(invoiceTotal) : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-[color:var(--desktop-border)] pt-3">
                    <Link
                      href={href}
                      className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:border-sky-400/60 hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_80%,_var(--theme-surface-page))]"
                    >
                      Open WO
                    </Link>

                    <button
                      type="button"
                      onClick={() => void handleAiReview(r.id)}
                      className="rounded-full border border-sky-500/60 bg-sky-500/10 px-3 py-1.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20"
                      title="Run AI checklist"
                    >
                      AI Review
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleMarkReady(r.id)}
                      disabled={
                        r.status === "invoiced" ||
                        r.status === "ready_to_invoice"
                      }
                      className="rounded-full border border-sky-400/60 bg-sky-500/10 px-3 py-1.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Mark ready to invoice"
                    >
                      Mark Ready
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleInvoice(r)}
                      className="rounded-full border border-emerald-400/70 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      title={statusLower === "invoiced" ? "Open issued invoice" : "Open invoice preview"}
                    >
                      {statusLower === "invoiced" ? "Open Invoice" : "Invoice"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {!loading && historicalInvoices.length > 0 ? (
        <section className="overflow-hidden rounded-[24px] border border-amber-500/25 bg-[var(--theme-gradient-panel)] shadow-[var(--theme-shadow-medium)]">
          <div className="border-b border-amber-500/20 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/80">
                  Imported / Historical
                </div>
                <h2 className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
                  Historical invoice records
                </h2>
                <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                  Read-only invoices imported from legacy data. They are not
                  active work orders and cannot be invoiced from this page.
                </p>
              </div>
              <div className="text-sm font-semibold text-amber-100">
                Showing {visibleHistoricalInvoices.length} of{" "}
                {historicalInvoices.length}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-amber-500/15 text-xs uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
                <tr>
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Work order / VIN</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
                {visibleHistoricalInvoices.map((invoice) => {
                  const metadata = invoice.metadata as InvoiceMetadata | null;
                  const rawRow = metadata?.raw_row ?? {};
                  const legacyCustomerId = String(
                    rawRow.customer_id ?? metadata?.legacy_customer_id ?? "",
                  ).trim();
                  const customerName =
                    [
                      invoice.customers?.first_name ?? "",
                      invoice.customers?.last_name ?? "",
                    ]
                      .filter(Boolean)
                      .join(" ") ||
                    String(rawRow.customer_name ?? rawRow.customer ?? "") ||
                    (legacyCustomerId
                      ? `Unknown customer · ${legacyCustomerId}`
                      : "Unknown customer");
                  const workOrderText =
                    metadata?.work_order_number ??
                    String(rawRow.work_order_number ?? "No work order number");
                  const vinText =
                    metadata?.vin ?? String(rawRow.vin ?? "No VIN");

                  return (
                    <Fragment key={invoice.id}>
                      <tr
                        className="cursor-pointer text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]"
                        onClick={() =>
                          setExpandedHistoricalInvoiceId((current) =>
                            current === invoice.id ? null : invoice.id,
                          )
                        }
                      >
                        <td className="px-5 py-4">
                          <div className="font-semibold text-[color:var(--theme-text-primary)]">
                            {invoice.invoice_number ??
                              `#${invoice.id.slice(0, 8)}`}
                          </div>
                          <div className="mt-1 inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                            Read-only historical
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div>{customerName}</div>
                          {invoice.customers?.email ? (
                            <div className="text-xs text-[color:var(--theme-text-muted)]">
                              {invoice.customers.email}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">
                          <div>{workOrderText}</div>
                          <div className="text-xs text-[color:var(--theme-text-muted)]">
                            VIN {vinText}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-100">
                            {invoice.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-semibold text-[var(--accent-copper-light)]">
                          {formatMoney(invoice.total)}
                        </td>
                        <td className="px-5 py-4 text-[color:var(--theme-text-secondary)]">
                          {invoice.issued_at
                            ? format(new Date(invoice.issued_at), "PP")
                            : "—"}
                          <div className="mt-1 text-xs text-amber-100/80">
                            {expandedHistoricalInvoiceId === invoice.id
                              ? "Hide details"
                              : "View details"}
                          </div>
                        </td>
                      </tr>
                      {expandedHistoricalInvoiceId === invoice.id ? (
                        <tr className="bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)]">
                          <td colSpan={6} className="px-5 py-4">
                            <div className="grid gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 md:grid-cols-3">
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                                  Legacy customer id
                                </div>
                                <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
                                  {String(
                                    rawRow.customer_id ??
                                      metadata?.legacy_customer_id ??
                                      "—",
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                                  Customer match diagnostics
                                </div>
                                <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
                                  {metadata?.customer_match_source ??
                                    metadata?.customer_match_failed_reason ??
                                    "—"}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                                  Legacy vehicle id
                                </div>
                                <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
                                  {String(
                                    rawRow.vehicle_id ??
                                      metadata?.legacy_vehicle_id ??
                                      "—",
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                                  Source
                                </div>
                                <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
                                  {metadata?.source_system ??
                                    String(
                                      rawRow.source_system ?? "CSV import",
                                    )}
                                </div>
                              </div>
                              <div className="md:col-span-3">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                                  Notes
                                </div>
                                <div className="mt-1 whitespace-pre-wrap text-sm text-[color:var(--theme-text-primary)]">
                                  {invoice.notes ||
                                    String(
                                      rawRow.description ??
                                        rawRow.notes ??
                                        "No notes",
                                    )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visibleHistoricalInvoices.length < historicalInvoices.length ? (
            <div className="border-t border-amber-500/15 px-5 py-4 text-center sm:px-6">
              <button
                type="button"
                onClick={() => setHistoricalVisibleLimit((limit) => limit + 25)}
                className="rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20"
              >
                Show 25 more historical invoices
              </button>
            </div>
          ) : historicalHasMore ? (
            <div className="border-t border-amber-500/15 px-5 py-4 text-center sm:px-6">
              <button
                type="button"
                onClick={handleLoadMoreHistoricalInvoices}
                disabled={historicalLoadingMore}
                className="rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {historicalLoadingMore
                  ? "Loading historical invoices…"
                  : "Load more historical invoices"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
