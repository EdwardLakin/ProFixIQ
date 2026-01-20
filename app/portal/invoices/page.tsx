import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import {
  requireAuthedUser,
  requirePortalCustomer,
} from "@/features/portal/server/portalAuth";

export const dynamic = "force-dynamic";

const COPPER = "#C57A4A";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function getInvoiceTotal(wo: WorkOrderRow): number | null {
  if (wo.invoice_total != null) return Number(wo.invoice_total);
  const labor = wo.labor_total != null ? Number(wo.labor_total) : 0;
  const parts = wo.parts_total != null ? Number(wo.parts_total) : 0;
  const sum = labor + parts;
  return Number.isFinite(sum) ? sum : null;
}

function getWorkOrderLabel(wo: WorkOrderRow): string {
  if (wo.custom_id && wo.custom_id.trim().length > 0) return wo.custom_id;
  return `Work Order ${wo.id.slice(0, 8)}…`;
}

export default async function PortalInvoicesIndexPage() {
  const cookieStore = cookies();
  const supabase = createServerComponentClient<DB>({
    cookies: () => cookieStore,
  });

  let invoices: WorkOrderRow[] = [];

  try {
    // Auth + portal customer
    const { id: userId } = await requireAuthedUser(supabase);
    const customer = await requirePortalCustomer(supabase, userId);

    // Load all customer work orders, then filter for invoice-bearing ones.
    const { data, error } = await supabase
      .from("work_orders")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = (data ?? []) as WorkOrderRow[];

    invoices = rows.filter((wo) => {
      const hasInvoiceSent = !!wo.invoice_sent_at;
      const hasPdf = !!wo.invoice_pdf_url;
      const hasInvoiceUrl = !!wo.invoice_url;
      const hasInvoiceTotal = wo.invoice_total != null;
      const status = (wo.status ?? "").trim();

      const invoiceStatus = status === "ready_to_invoice" || status === "invoiced";

      return (
        hasInvoiceSent || hasPdf || hasInvoiceUrl || hasInvoiceTotal || invoiceStatus
      );
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[portal invoices index] failed:", err);
    redirect("/portal");
  }

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-blackops" style={{ color: COPPER }}>
            Invoices
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            View and download invoices for completed work orders.
          </p>
        </div>

        <Link
          href="/portal"
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-neutral-200 hover:bg-black/70 hover:text-white"
        >
          <span aria-hidden className="text-base leading-none">
            ←
          </span>
          Back
        </Link>
      </div>

      {/* List */}
      <div className="rounded-3xl border border-white/10 bg-black/25 p-4 backdrop-blur-md ring-1 ring-inset ring-white/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Your invoices
          </div>
          <div className="text-[11px] text-neutral-500">
            {invoices.length === 0
              ? "No invoices yet"
              : `${invoices.length} invoice(s)`}
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-neutral-400">
            No invoices have been issued yet. Once a work order is finalized, the
            invoice will show up here.
          </div>
        ) : (
          <div className="space-y-2">
            {invoices.map((wo) => {
              const total = getInvoiceTotal(wo);
              const label = getWorkOrderLabel(wo);

              return (
                <Link
                  key={wo.id}
                  href={`/portal/invoices/${wo.id}`}
                  className="block rounded-2xl border border-white/10 bg-black/35 px-4 py-3 transition hover:bg-black/45 hover:border-white/14"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-neutral-100">
                        {label}
                      </div>
                      <div className="mt-0.5 text-[11px] text-neutral-500">
                        Status:{" "}
                        <span className="text-neutral-300">
                          {wo.status ?? "—"}
                        </span>
                        {" • "}
                        Sent:{" "}
                        <span className="text-neutral-300">
                          {formatDate(wo.invoice_sent_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                        Total
                      </div>
                      <div className="text-base font-semibold" style={{ color: COPPER }}>
                        {total == null ? "—" : formatCurrency(total)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {wo.invoice_pdf_url ? (
                      <span className="rounded-full border border-white/12 bg-black/40 px-2.5 py-1 text-[11px] text-neutral-300">
                        PDF available
                      </span>
                    ) : null}

                    {wo.invoice_url ? (
                      <span className="rounded-full border border-white/12 bg-black/40 px-2.5 py-1 text-[11px] text-neutral-300">
                        Online invoice
                      </span>
                    ) : null}

                    {wo.invoice_last_sent_to ? (
                      <span className="rounded-full border border-white/12 bg-black/40 px-2.5 py-1 text-[11px] text-neutral-300">
                        To: {wo.invoice_last_sent_to}
                      </span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}