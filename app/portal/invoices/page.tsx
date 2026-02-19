// app/portal/invoices/page.tsx (FULL FILE REPLACEMENT)
import Link from "next/link";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { requireAuthedUser, requirePortalCustomer } from "@/features/portal/server/portalAuth";

export const dynamic = "force-dynamic";

const COPPER = "#C57A4A";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type InvoiceRow = DB["public"]["Tables"]["invoices"]["Row"];
type AllocationRow = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];

type WorkOrderLite = Pick<
  WorkOrderRow,
  | "id"
  | "custom_id"
  | "status"
  | "created_at"
  | "invoice_sent_at"
  | "invoice_last_sent_to"
  | "invoice_pdf_url"
  | "invoice_url"
  | "invoice_total"
  | "labor_total"
  | "parts_total"
>;

type InvoiceLite = Pick<
  InvoiceRow,
  | "id"
  | "work_order_id"
  | "invoice_number"
  | "status"
  | "currency"
  | "total"
  | "issued_at"
  | "created_at"
>;

type InvoiceListItem = {
  workOrderId: string;
  label: string;
  workOrderStatus: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  currency: "CAD" | "USD";
  total: number | null;
  issuedAt: string | null;
  sentAt: string | null;
  sentTo: string | null;
  pdfUrl: string | null;
  onlineUrl: string | null;
};

function errorCardClass() {
  return "rounded-3xl border border-red-500/35 bg-red-900/20 p-4 text-sm text-red-100 backdrop-blur-md shadow-card";
}

function safeNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeNumber0(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeCurrency(v: unknown): "CAD" | "USD" {
  const c = String(v ?? "").trim().toUpperCase();
  return c === "CAD" ? "CAD" : "USD";
}

function formatCurrency(value: number | null | undefined, currency: "CAD" | "USD"): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(currency === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function getWorkOrderLabel(wo: WorkOrderLite): string {
  if (wo.custom_id && wo.custom_id.trim().length > 0) return wo.custom_id;
  return `Work Order ${wo.id.slice(0, 8)}…`;
}

function workOrderFallbackTotal(wo: WorkOrderLite): number | null {
  const invoiceTotal = safeNumber(wo.invoice_total);
  if (invoiceTotal != null && invoiceTotal > 0) return invoiceTotal;

  const labor = safeNumber(wo.labor_total) ?? 0;
  const parts = safeNumber(wo.parts_total) ?? 0;
  const sum = labor + parts;

  return Number.isFinite(sum) && sum > 0 ? sum : null;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// ✅ only trust invoice.total if it’s a real positive number
function invoiceTotalOrNull(invTotal: unknown): number | null {
  const n = safeNumber(invTotal);
  return n != null && n > 0 ? n : null;
}

export default async function PortalInvoicesIndexPage() {
  const cookieStore = cookies();
  const supabase = createServerComponentClient<DB>({ cookies: () => cookieStore });

  try {
    const { id: userId } = await requireAuthedUser(supabase);
    const customer = await requirePortalCustomer(supabase, userId);

    const { data: woRows, error: woErr } = await supabase
      .from("work_orders")
      .select(
        "id, custom_id, status, created_at, invoice_sent_at, invoice_last_sent_to, invoice_pdf_url, invoice_url, invoice_total, labor_total, parts_total",
      )
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .returns<WorkOrderLite[]>();

    if (woErr) throw new Error(woErr.message);

    const workOrders = Array.isArray(woRows) ? woRows : [];
    const workOrderIds = workOrders.map((w) => w.id);

    // ------------------------------------------------------------
    // Pull latest invoice rows (optional) + allocation-based totals
    // ------------------------------------------------------------
    let invoiceRows: InvoiceLite[] = [];
    if (workOrderIds.length > 0) {
      const { data: invRows, error: invErr } = await supabase
        .from("invoices")
        .select("id, work_order_id, invoice_number, status, currency, total, issued_at, created_at")
        .in("work_order_id", workOrderIds)
        .order("issued_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .returns<InvoiceLite[]>();

      if (!invErr) invoiceRows = Array.isArray(invRows) ? invRows : [];
    }

    // Compute parts totals from allocations (qty * unit_cost), per work order
    const allocTotals = new Map<string, number>();

    if (workOrderIds.length > 0) {
      const { data: allocRows, error: allocErr } = await supabase
        .from("work_order_part_allocations")
        .select("work_order_id, qty, unit_cost")
        .in("work_order_id", workOrderIds)
        .returns<Array<Pick<AllocationRow, "work_order_id" | "qty" | "unit_cost">>>();

      if (allocErr) {
        // eslint-disable-next-line no-console
        console.warn("[portal invoices] allocations query failed:", allocErr.message);
      } else {
        for (const a of Array.isArray(allocRows) ? allocRows : []) {
          const woId = String(a.work_order_id ?? "").trim();
          if (!woId) continue;

          const qtyRaw = safeNumber0(a.qty);
          const qty = qtyRaw > 0 ? qtyRaw : 1;

          const unit = safeNumber0(a.unit_cost);
          const ext = Math.max(0, qty * unit);

          const prev = allocTotals.get(woId) ?? 0;
          allocTotals.set(woId, prev + ext);
        }
      }
    }

    const invoiceRowsWithWO = invoiceRows.filter(
      (inv): inv is InvoiceLite & { work_order_id: string } => isNonEmptyString(inv.work_order_id),
    );

    const latestInvoiceByWO = new Map<string, InvoiceLite & { work_order_id: string }>();

    // invoiceRows already sorted by issued_at then created_at (desc),
    // so first one we encounter per WO is the best/latest
    for (const inv of invoiceRowsWithWO) {
      if (!latestInvoiceByWO.has(inv.work_order_id)) {
        latestInvoiceByWO.set(inv.work_order_id, inv);
      }
    }

    const items: InvoiceListItem[] = workOrders
      .map((wo) => {
        const inv = latestInvoiceByWO.get(wo.id) ?? null;

        const hasInvoiceRow = !!inv?.id;
        const hasPortalMarkers =
          !!wo.invoice_pdf_url ||
          !!wo.invoice_url ||
          !!wo.invoice_sent_at ||
          wo.invoice_total != null;

        if (!hasInvoiceRow && !hasPortalMarkers) return null;

        const currency = inv?.currency ? normalizeCurrency(inv.currency) : "CAD";

        // ✅ If inv.total is 0, treat it as missing and fall back
        const invTotal = inv ? invoiceTotalOrNull(inv.total) : null;
        const woFallback = workOrderFallbackTotal(wo);

        const allocParts = allocTotals.get(wo.id);
        const labor = safeNumber0(wo.labor_total);
        const allocFallback =
          allocParts != null && Number.isFinite(allocParts) && allocParts > 0
            ? Math.max(0, labor + allocParts)
            : null;

        // Prefer:
        // 1) invoice.total (only if > 0)
        // 2) work_orders.invoice_total OR (labor_total + parts_total)
        // 3) allocations parts + labor_total
        const total = invTotal ?? woFallback ?? allocFallback;

        const issuedAt = (inv?.issued_at ?? inv?.created_at ?? null) as string | null;

        return {
          workOrderId: wo.id,
          label: getWorkOrderLabel(wo),
          workOrderStatus: (wo.status ?? null) as string | null,
          invoiceId: inv?.id ?? null,
          invoiceNumber: (inv?.invoice_number ?? null) as string | null,
          invoiceStatus: (inv?.status ?? null) as string | null,
          currency,
          total,
          issuedAt,
          sentAt: (wo.invoice_sent_at ?? null) as string | null,
          sentTo: (wo.invoice_last_sent_to ?? null) as string | null,
          pdfUrl: (wo.invoice_pdf_url ?? null) as string | null,
          onlineUrl: (wo.invoice_url ?? null) as string | null,
        };
      })
      .filter((x): x is InvoiceListItem => x !== null);

    items.sort((a, b) => {
      const ad = new Date(a.issuedAt ?? a.sentAt ?? 0).getTime();
      const bd = new Date(b.issuedAt ?? b.sentAt ?? 0).getTime();
      return bd - ad;
    });

    return (
      <div className="space-y-6 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-blackops" style={{ color: COPPER }}>
              Invoices
            </h1>
            <p className="mt-1 text-sm text-neutral-400">View and download invoices for completed work orders.</p>
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

        <div className="rounded-3xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card ring-1 ring-inset ring-white/5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">Your invoices</div>
            <div className="text-[11px] text-neutral-500">{items.length === 0 ? "No invoices yet" : `${items.length} invoice(s)`}</div>
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-neutral-400">
              No invoices have been issued yet. Once a work order is finalized, the invoice will show up here.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <Link
                  key={it.workOrderId}
                  href={`/portal/invoices/${it.workOrderId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-white/10 bg-black/35 px-4 py-3 transition hover:bg-black/45 hover:border-white/14"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-neutral-100">{it.label}</div>

                      <div className="mt-0.5 text-[11px] text-neutral-500">
                        Status: <span className="text-neutral-300">{it.workOrderStatus ?? "—"}</span>
                        {" • "}
                        Issued: <span className="text-neutral-300">{formatDate(it.issuedAt)}</span>
                      </div>

                      {it.invoiceNumber ? (
                        <div className="mt-0.5 text-[11px] text-neutral-500">
                          Invoice: <span className="text-neutral-300">#{it.invoiceNumber}</span>
                          {it.invoiceStatus ? (
                            <>
                              {" • "}
                              <span className="text-neutral-300">{it.invoiceStatus}</span>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Total</div>
                      <div className="text-base font-semibold" style={{ color: COPPER }}>
                        {it.total == null ? "—" : formatCurrency(it.total, it.currency)}
                      </div>
                      <div className="text-[11px] text-neutral-500">{it.currency}</div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {it.pdfUrl ? (
                      <span className="rounded-full border border-white/12 bg-black/40 px-2.5 py-1 text-[11px] text-neutral-300">
                        PDF available
                      </span>
                    ) : null}
                    {it.onlineUrl ? (
                      <span className="rounded-full border border-white/12 bg-black/40 px-2.5 py-1 text-[11px] text-neutral-300">
                        Online invoice
                      </span>
                    ) : null}
                    {it.sentTo ? (
                      <span className="rounded-full border border-white/12 bg-black/40 px-2.5 py-1 text-[11px] text-neutral-300">
                        To: {it.sentTo}
                      </span>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load invoices";
    return (
      <div className="space-y-4 text-white">
        <div>
          <h1 className="text-2xl font-blackops" style={{ color: COPPER }}>
            Invoices
          </h1>
          <p className="mt-1 text-sm text-neutral-400">View and download invoices for completed work orders.</p>
        </div>

        <div className={errorCardClass()}>
          <div className="font-semibold">Couldn’t load invoices.</div>
          <div className="mt-1 text-xs text-red-100/90">{msg}</div>
        </div>
      </div>
    );
  }
}