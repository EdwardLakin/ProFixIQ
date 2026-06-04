"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import { toast } from "sonner";
import { InvoicesOnboardingSetupCard, getInvoicesGuidedOnboardingQuery } from "@/features/invoices/components/InvoicesOnboardingSetupCard";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "email"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate"> | null;
};

type Status = Exclude<WorkOrder["status"], null> | "ready_to_invoice" | "invoiced";

const BILLING_STATUSES: Status[] = ["completed", "ready_to_invoice", "invoiced"];

const INPUT_DARK =
  "desktop-input w-full px-3 py-2 text-sm";

const SELECT_DARK =
  "desktop-input w-full px-3 py-2 text-sm";

function stageAccent(status: string | null | undefined): {
  badge: string;
  border: string;
  progress: string;
} {
  const key = String(status ?? "completed").toLowerCase().replaceAll(" ", "_");

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
    return "border-slate-500/40 bg-slate-500/10 text-slate-300";
  }
  return "border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] text-neutral-300";
}

function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export default function BillingPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const searchParams = useSearchParams();
  const guidedOnboardingQuery = useMemo(
    () => getInvoicesGuidedOnboardingQuery(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    let query = supabase
      .from("work_orders")
      .select(
        `
        *,
        customers:customers(first_name,last_name,email),
        vehicles:vehicles(year,make,model,license_plate)
      `,
      )
      .order("updated_at", { ascending: false })
      .limit(100);

    if (status) {
      query = query.eq("status", status);
    } else {
      query = query.in("status", BILLING_STATUSES as unknown as string[]);
    }

    const { data, error } = await query;

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const baseRows = (data ?? []) as Row[];
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

    setRows(filtered);
    setLoading(false);
  }, [q, status, supabase]);

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
          setTimeout(() => void load(), 60);
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
  }, [supabase, load]);

  const handleAiReview = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/work-orders/${id}/ai-review`, {
        method: "POST",
      });

      const j = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            issues?: { kind: string; lineId?: string; message: string }[];
            error?: string;
          }
        | null;

      if (!res.ok || !j?.ok) {
        const msg =
          j?.issues?.length
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

        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

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

  const handleInvoice = useCallback(
    async (row: Row) => {
      if (!confirm("Create and email a Stripe invoice to the customer?")) return;

      try {
        const customerEmail = row.customers?.email?.trim() ?? "";
        if (!customerEmail) {
          toast.error("Customer email is required before sending an invoice.");
          return;
        }

        const customerName = [row.customers?.first_name ?? "", row.customers?.last_name ?? ""]
          .join(" ")
          .trim();

        const res = await fetch("/api/invoices/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId: row.id,
            customerEmail,
            customerName: customerName.length ? customerName : undefined,
          }),
        });

        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; stripeInvoiceId?: string; error?: string }
          | null;

        if (!res.ok || !j?.ok) {
          toast.error(j?.error ?? "Failed to create invoice.");
          return;
        }

        toast.success("Invoice created and emailed.");
        await load();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to create invoice.";
        toast.error(msg);
      }
    },
    [load],
  );

  const total = rows.length;
  const completedCount = useMemo(
    () =>
      rows.filter(
        (r) => String(r.status ?? "").toLowerCase().replaceAll(" ", "_") === "completed",
      ).length,
    [rows],
  );

  const readyCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          String(r.status ?? "").toLowerCase().replaceAll(" ", "_") ===
          "ready_to_invoice",
      ).length,
    [rows],
  );

  const invoicedCount = useMemo(
    () =>
      rows.filter(
        (r) => String(r.status ?? "").toLowerCase().replaceAll(" ", "_") === "invoiced",
      ).length,
    [rows],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-foreground">
      <InvoicesOnboardingSetupCard guidedQuery={guidedOnboardingQuery} />

      <section className="overflow-hidden rounded-[28px] border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] shadow-[0_0_50px_rgba(2,6,23,0.55)]">
        <div className="border-b border-[color:var(--desktop-border)] bg-[linear-gradient(180deg,rgba(56,189,248,0.12),rgba(15,23,42,0.03))] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                Operations
              </div>
              <h1
                className="mt-2 text-3xl text-white"
                style={{ fontFamily: "var(--font-blackops)" }}
              >
                Billing
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-neutral-300">
                Review completed work, move it to ready to invoice, and send invoices
                without leaving the operations flow.
              </p>

              {!loading && !err ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1 text-[11px] font-semibold text-neutral-200">
                    Total: <span className="text-white">{total}</span>
                  </div>
                  <div className="rounded-full border border-sky-500/20 bg-sky-500/5 px-3 py-1 text-[11px] font-semibold text-sky-100">
                    Completed: <span className="text-white">{completedCount}</span>
                  </div>
                  <div className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-100">
                    Ready: <span className="text-white">{readyCount}</span>
                  </div>
                  <div className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                    Invoiced: <span className="text-white">{invoicedCount}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/work-orders/view"
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:border-sky-400/60 hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_80%,black)]"
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
                placeholder="Search work order, custom id, customer, plate, YMM..."
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
              </select>

              <button
                type="button"
                onClick={() => void load()}
                className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-white transition hover:border-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/10"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </section>

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
      ) : rows.length === 0 ? (
        <div className="rounded-[24px] border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-6 text-sm text-neutral-400">
          No billing work orders match your current filters.
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

            const plateText = r.vehicles?.license_plate ? `(${r.vehicles.license_plate})` : "";
            const priorityText = priorityLabel(r.priority);
            const statusLower = String(r.status ?? "").toLowerCase().replaceAll(" ", "_");

            const laborTotal = Number(r.labor_total ?? 0);
            const partsTotal = Number(r.parts_total ?? 0);
            const invoiceTotal =
              Number(r.invoice_total ?? 0) > 0
                ? Number(r.invoice_total ?? 0)
                : laborTotal + partsTotal;

            const progressValue =
              statusLower === "invoiced"
                ? 100
                : statusLower === "ready_to_invoice"
                  ? 78
                  : 52;

            return (
              <div
                key={r.id}
                className={[
                  "overflow-hidden rounded-[24px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] shadow-[0_20px_44px_rgba(2,6,23,0.58)]",
                  accent.border,
                ].join(" ")}
              >
                <div className="border-b border-[color:var(--desktop-border)] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={href}
                          className="text-2xl font-semibold text-white hover:text-[var(--accent-copper-light)]"
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

                      <div className="mt-3 text-base font-semibold text-white">
                        {customerName}
                      </div>
                      <div className="mt-1 text-sm text-neutral-300">
                        {vehicleText} {plateText}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                        Updated
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {r.updated_at ? format(new Date(r.updated_at), "PP") : "—"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-4">
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                    <span>Billing progress</span>
                    <span>{progressValue}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${accent.progress}`}
                      style={{ width: `${progressValue}%` }}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                        Labor
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {formatMoney(laborTotal)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                        Parts
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {formatMoney(partsTotal)}
                      </div>
                    </div>

                    <div className="col-span-2 rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                        Invoice total
                      </div>
                      <div className="mt-1 text-lg font-semibold text-[var(--accent-copper-light)]">
                        {formatMoney(invoiceTotal)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-[color:var(--desktop-border)] pt-3">
                    <Link
                      href={href}
                      className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-sm font-semibold text-neutral-100 transition hover:border-sky-400/60 hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_80%,black)]"
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
                      disabled={r.status === "invoiced" || r.status === "ready_to_invoice"}
                      className="rounded-full border border-sky-400/60 bg-sky-500/10 px-3 py-1.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Mark ready to invoice"
                    >
                      Mark Ready
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleInvoice(r)}
                      disabled={r.status === "invoiced"}
                      className="rounded-full border border-emerald-400/70 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Create and email Stripe invoice"
                    >
                      Invoice
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
