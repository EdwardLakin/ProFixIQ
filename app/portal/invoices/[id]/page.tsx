// app/portal/invoices/[id]/page.tsx (FULL FILE REPLACEMENT)
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import {
  requireAuthedUser,
  requirePortalCustomer,
  requireWorkOrderOwnedByCustomer,
} from "@/features/portal/server/portalAuth";

import PortalInvoicePayButton from "@/features/stripe/components/PortalInvoicePayButton";

export const dynamic = "force-dynamic";

const COPPER = "#C57A4A";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type InvoiceRow = DB["public"]["Tables"]["invoices"]["Row"];
type WorkOrderPartRow = DB["public"]["Tables"]["work_order_parts"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];

type WorkOrderForPortalInvoice = Pick<
  WorkOrderRow,
  | "id"
  | "shop_id"
  | "customer_id"
  | "status"
  | "approval_state"
  | "created_at"
  | "custom_id"
  | "invoice_sent_at"
  | "invoice_last_sent_to"
  | "invoice_pdf_url"
  | "invoice_total"
  | "labor_total"
  | "parts_total"
>;

type InvoiceLite = Pick<
  InvoiceRow,
  | "id"
  | "invoice_number"
  | "status"
  | "currency"
  | "subtotal"
  | "parts_cost"
  | "labor_cost"
  | "discount_total"
  | "tax_total"
  | "total"
  | "issued_at"
  | "created_at"
  | "notes"
>;

type PortalLine = Pick<
  WorkOrderLineRow,
  | "id"
  | "line_no"
  | "description"
  | "complaint"
  | "cause"
  | "correction"
  | "labor_time"
>;

type WorkOrderPartWithLine = Pick<
  WorkOrderPartRow,
  "id" | "part_id" | "quantity" | "unit_price" | "total_price"
> & { work_order_line_id?: string | null };

type PartLookupRow = Pick<
  PartRow,
  "id" | "name" | "sku" | "part_number" | "unit"
>;

type PartDisplayRow = {
  id: string;
  lineId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  sku?: string;
  partNumber?: string;
  unit?: string;
};

function safeNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeInvoiceCurrency(v: unknown): "CAD" | "USD" {
  const c = String(v ?? "").trim().toUpperCase();
  return c === "CAD" ? "CAD" : "USD";
}

function normalizeCurrencyFromCountry(country: unknown): "CAD" | "USD" {
  const c = String(country ?? "").trim().toUpperCase();
  return c === "CA" ? "CAD" : "USD";
}

function formatCurrency(
  value: number | null | undefined,
  currency: "CAD" | "USD",
): string {
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

function compactCsv(parts: Array<string | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join(", ");
}

function dollarsToCents(n: number | null): number {
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: workOrderId } = await params;

  const cookieStore = cookies();
  const supabase = createServerComponentClient<DB>({
    cookies: () => cookieStore,
  });

  let workOrder: WorkOrderForPortalInvoice | null = null;
  let invoice: InvoiceLite | null = null;
  let currency: "CAD" | "USD" = "USD";

  let lines: PortalLine[] = [];
  let parts: PartDisplayRow[] = [];
  let stripeCurrency: "usd" | "cad" = "usd";

  try {
    const { id: userId } = await requireAuthedUser(supabase);
    const customer = await requirePortalCustomer(supabase, userId);
    await requireWorkOrderOwnedByCustomer(supabase, workOrderId, customer.id);

    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select(
        "id, shop_id, customer_id, status, approval_state, created_at, custom_id, invoice_sent_at, invoice_last_sent_to, invoice_pdf_url, invoice_total, labor_total, parts_total",
      )
      .eq("id", workOrderId)
      .eq("customer_id", customer.id)
      .maybeSingle<WorkOrderForPortalInvoice>();

    if (woErr) throw woErr;
    if (!wo) throw new Error("Work order not found");
    workOrder = wo;

    // Shop country (for currency fallback)
    let shopCountry: string | null = null;
    if (workOrder.shop_id) {
      const { data: shop, error: shopErr } = await supabase
        .from("shops")
        .select("country")
        .eq("id", workOrder.shop_id)
        .maybeSingle<Pick<ShopRow, "country">>();

      if (shopErr) {
        // eslint-disable-next-line no-console
        console.warn("[portal invoice] shops query failed:", shopErr.message);
      }

      shopCountry = (shop?.country ?? null) as string | null;
    }

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, status, currency, subtotal, parts_cost, labor_cost, discount_total, tax_total, total, issued_at, created_at, notes",
      )
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<InvoiceLite>();

    if (invErr) {
      // eslint-disable-next-line no-console
      console.warn("[portal invoice] invoices query failed:", invErr.message);
    }

    invoice = inv ?? null;

    currency = invoice?.currency
      ? normalizeInvoiceCurrency(invoice.currency)
      : normalizeCurrencyFromCountry(shopCountry);

    stripeCurrency = currency === "CAD" ? "cad" : "usd";

    // ✅ Pull “PDF-style” fields too
    const { data: wol, error: wolErr } = await supabase
      .from("work_order_lines")
      .select("id, line_no, description, complaint, cause, correction, labor_time")
      .eq("work_order_id", workOrderId)
      .order("line_no", { ascending: true });

    if (wolErr) {
      // eslint-disable-next-line no-console
      console.warn(
        "[portal invoice] work_order_lines query failed:",
        wolErr.message,
      );
    }

    lines = (Array.isArray(wol) ? wol : []) as PortalLine[];

    // ✅ Pull parts including optional work_order_line_id
    const { data: wopRaw, error: wopErr } = await supabase
      .from("work_order_parts")
      .select("id, work_order_line_id, part_id, quantity, unit_price, total_price")
      .eq("work_order_id", workOrderId);

    if (wopErr) {
      // eslint-disable-next-line no-console
      console.warn(
        "[portal invoice] work_order_parts query failed:",
        wopErr.message,
      );
    }

    const wop = (Array.isArray(wopRaw) ? wopRaw : []) as WorkOrderPartWithLine[];

    const partIds = Array.from(
      new Set(
        wop
          .map((p) => p.part_id)
          .filter(isNonEmptyString)
          .map((id) => id.trim()),
      ),
    );

    const partsMap = new Map<string, PartLookupRow>();

    if (partIds.length > 0) {
      const { data: partRows, error: partsErr } = await supabase
        .from("parts")
        .select("id, name, sku, part_number, unit")
        .in("id", partIds)
        .returns<PartLookupRow[]>();

      if (partsErr) {
        // eslint-disable-next-line no-console
        console.warn("[portal invoice] parts lookup failed:", partsErr.message);
      }

      for (const p of Array.isArray(partRows) ? partRows : []) {
        if (isNonEmptyString(p.id)) partsMap.set(p.id, p);
      }
    }

    parts = wop.map((r) => {
      const p = r.part_id ? partsMap.get(r.part_id) : undefined;

      const qty = safeNumber(r.quantity) || 1;
      const unitPrice = safeNumber(r.unit_price);
      const totalFromRow = safeNumber(r.total_price);
      const totalPrice =
        totalFromRow > 0 ? totalFromRow : Math.max(0, qty * unitPrice);

      const name = (p?.name ?? "Part").trim() || "Part";
      const partNumber = (p?.part_number ?? "").trim() || undefined;
      const sku = (p?.sku ?? "").trim() || undefined;
      const unit = (p?.unit ?? "").trim() || undefined;

      const lidRaw = r.work_order_line_id;
      const lineId =
        typeof lidRaw === "string" && lidRaw.trim().length > 0
          ? lidRaw.trim()
          : undefined;

      return {
        id: String(r.id),
        lineId,
        name,
        qty,
        unitPrice,
        totalPrice,
        sku,
        partNumber,
        unit,
      };
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[portal invoice] failed:", err);
    redirect("/portal");
  }

  if (!workOrder) redirect("/portal");

  const titleLabel =
    workOrder.custom_id || `Work Order ${workOrder.id.slice(0, 8)}…`;

  const woInvoiceTotal = safeNumberOrNull(workOrder.invoice_total);
  const woLabor = safeNumberOrNull(workOrder.labor_total);
  const woParts = safeNumberOrNull(workOrder.parts_total);

  const invoiceTotalFallback =
    woInvoiceTotal != null
      ? woInvoiceTotal
      : woLabor != null || woParts != null
        ? (woLabor ?? 0) + (woParts ?? 0)
        : null;

  const total =
    invoice?.total != null ? safeNumberOrNull(invoice.total) : invoiceTotalFallback;

  const payAmountCents = dollarsToCents(total);

  const subtotal =
    invoice?.subtotal != null ? safeNumberOrNull(invoice.subtotal) : undefined;
  const laborCost =
    invoice?.labor_cost != null ? safeNumberOrNull(invoice.labor_cost) : undefined;
  const partsCost =
    invoice?.parts_cost != null ? safeNumberOrNull(invoice.parts_cost) : undefined;
  const discountTotal =
    invoice?.discount_total != null
      ? safeNumberOrNull(invoice.discount_total)
      : undefined;
  const taxTotal =
    invoice?.tax_total != null ? safeNumberOrNull(invoice.tax_total) : undefined;

  const statusLabel =
    (invoice?.status ?? "").trim() || (workOrder.status ?? "").trim() || "—";

  const issuedAt =
    invoice?.issued_at != null
      ? formatDate(invoice.issued_at)
      : invoice?.created_at != null
        ? formatDate(invoice.created_at)
        : "—";

  const notes = (invoice?.notes ?? "").trim();
  const sentAt = workOrder.invoice_sent_at;
  const sentTo = workOrder.invoice_last_sent_to;

  // group parts per line + unassigned
  const partsByLine = new Map<string, PartDisplayRow[]>();
  const unassignedParts: PartDisplayRow[] = [];

  for (const p of parts) {
    if (p.lineId) {
      const arr = partsByLine.get(p.lineId) ?? [];
      arr.push(p);
      partsByLine.set(p.lineId, arr);
    } else {
      unassignedParts.push(p);
    }
  }

  const partCount = parts.reduce(
    (acc, p) => acc + (Number.isFinite(p.qty) ? p.qty : 0),
    0,
  );

  return (
    <div className="min-h-screen px-4 text-foreground bg-background bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center py-10">
        <div className="w-full rounded-3xl border border-[color:var(--metal-border-soft,#1f2937)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_82%)] shadow-[0_32px_80px_rgba(0,0,0,0.95)] px-6 py-7 sm:px-8 sm:py-9">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Link
              href="/portal/invoices"
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-neutral-200 hover:bg-black/70 hover:text-white"
            >
              <span aria-hidden className="text-base leading-none">
                ←
              </span>
              Back
            </Link>

            <div
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-neutral-300"
              style={{ color: COPPER }}
            >
              <span>Invoice</span>
              <span className="text-neutral-500">•</span>
              <span className="text-neutral-300">
                {invoice?.invoice_number?.trim()
                  ? `#${invoice.invoice_number.trim()}`
                  : `WO ${workOrder.custom_id ?? workOrder.id.slice(0, 8)}`}
              </span>
            </div>
          </div>

          <div className="mb-6 space-y-1">
            <h1
              className="text-2xl font-semibold text-white sm:text-3xl"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              {titleLabel}
            </h1>
            <p className="text-xs text-neutral-400 sm:text-sm">
              View your invoice details and history for this work order.
            </p>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Invoice Total
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {formatCurrency(total ?? null, currency)}
              </div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                Currency: {currency}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Status
              </div>
              <div className="mt-1 text-sm font-semibold text-neutral-100">
                {statusLabel}
              </div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                Issued: {issuedAt}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Invoice Sent
              </div>
              <div className="mt-1 text-sm font-semibold text-neutral-100">
                {formatDate(sentAt)}
              </div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                To: {sentTo || "—"}
              </div>
            </div>
          </div>

          {/* ✅ Payment (Stripe Checkout via /api/portal/payments/checkout) */}
          {workOrder.shop_id ? (
            <div className="mb-6">
              <PortalInvoicePayButton
                shopId={workOrder.shop_id}
                workOrderId={workOrder.id}
                amountCents={payAmountCents}
                currency={stripeCurrency}
                disabled={payAmountCents < 50}
              />
            </div>
          ) : null}

          {/* Optional PDF link */}
          {workOrder.invoice_pdf_url ? (
            <div className="mb-6">
              <a
                href={workOrder.invoice_pdf_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-100 hover:bg-black/80"
              >
                <span>View PDF Invoice</span>
              </a>
            </div>
          ) : null}

          {/* Totals breakdown */}
          <div className="mb-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-4 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
                Totals
              </div>
              <div className="text-[11px] text-neutral-500">
                {invoice?.id
                  ? "From invoice record"
                  : "Estimate (work order totals)"}
              </div>
            </div>

            {!invoice?.id ? (
              <div className="text-xs text-neutral-400">
                The shop hasn’t finalized an invoice record yet. Some totals may
                be estimated.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/5 bg-black/40 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    Subtotal
                  </div>
                  <div className="mt-1 text-sm font-semibold text-neutral-100">
                    {formatCurrency(subtotal ?? null, currency)}
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-black/40 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    Labor
                  </div>
                  <div className="mt-1 text-sm font-semibold text-neutral-100">
                    {formatCurrency(laborCost ?? null, currency)}
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-black/40 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    Parts
                  </div>
                  <div className="mt-1 text-sm font-semibold text-neutral-100">
                    {formatCurrency(partsCost ?? null, currency)}
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-black/40 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    Tax
                  </div>
                  <div className="mt-1 text-sm font-semibold text-neutral-100">
                    {formatCurrency(taxTotal ?? null, currency)}
                  </div>
                </div>

                {discountTotal != null && discountTotal > 0 ? (
                  <div className="rounded-xl border border-white/5 bg-black/40 px-3 py-2 sm:col-span-2">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                      Discount
                    </div>
                    <div className="mt-1 text-sm font-semibold text-neutral-100">
                      -{formatCurrency(discountTotal, currency)}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-xl border border-white/10 bg-black/55 px-3 py-2 sm:col-span-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                    Total
                  </div>
                  <div
                    className="mt-1 text-lg font-semibold"
                    style={{ color: COPPER }}
                  >
                    {formatCurrency(total ?? null, currency)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {notes.length ? (
            <div className="mb-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-4 sm:px-5 sm:py-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
                Notes
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-neutral-200">
                {notes}
              </div>
            </div>
          ) : null}

          {/* Line items + parts-per-line */}
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
                Line Items
              </div>
              <div className="text-[11px] text-neutral-500">
                {lines.length === 0
                  ? "No line items recorded yet"
                  : `${lines.length} items`}
              </div>
            </div>

            {lines.length > 0 ? (
              <div className="space-y-2">
                {lines.map((line) => {
                  const label =
                    (line.description ?? "").trim() ||
                    (line.complaint ?? "").trim() ||
                    "Line item";

                  const lp = partsByLine.get(line.id) ?? [];

                  return (
                    <div
                      key={line.id}
                      className="rounded-xl border border-white/5 bg-black/40 px-3 py-3"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-neutral-100">
                            {label}
                          </div>
                          <div className="mt-0.5 text-[11px] text-neutral-500">
                            Line #{line.line_no ?? "—"}
                            {line.labor_time != null
                              ? ` • ${String(line.labor_time)} hr`
                              : ""}
                          </div>
                        </div>
                      </div>

                      {(line.cause ?? "").trim().length ||
                      (line.correction ?? "").trim().length ? (
                        <div className="mt-2 space-y-1 text-[12px] text-neutral-300">
                          {(line.cause ?? "").trim().length ? (
                            <div>
                              <span className="text-neutral-500">Cause:</span>{" "}
                              <span className="text-neutral-200">
                                {String(line.cause)}
                              </span>
                            </div>
                          ) : null}
                          {(line.correction ?? "").trim().length ? (
                            <div>
                              <span className="text-neutral-500">
                                Correction:
                              </span>{" "}
                              <span className="text-neutral-200">
                                {String(line.correction)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {lp.length > 0 ? (
                        <div className="mt-3 rounded-lg border border-white/5 bg-black/35 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                            Parts
                          </div>
                          <div className="mt-2 space-y-1">
                            {lp.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-baseline justify-between gap-2 text-sm"
                              >
                                <div className="min-w-0 text-neutral-200">
                                  <span className="text-neutral-500">
                                    x{p.qty}
                                  </span>{" "}
                                  {p.name}
                                  {p.partNumber ? (
                                    <span className="text-neutral-500">
                                      {" "}
                                      ({p.partNumber})
                                    </span>
                                  ) : null}
                                </div>
                                <div className="whitespace-nowrap font-semibold text-neutral-100">
                                  {formatCurrency(p.totalPrice, currency)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-neutral-400">
                Once the shop finalizes the invoice, you&apos;ll see line items
                here.
              </div>
            )}
          </div>

          {/* Overall Parts (including unassigned) */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-4 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
                Parts
              </div>
              <div className="text-[11px] text-neutral-500">
                {parts.length === 0
                  ? "No parts recorded"
                  : `${parts.length} parts • Qty ${partCount}`}
              </div>
            </div>

            {parts.length > 0 ? (
              <div className="space-y-2">
                {unassignedParts.length > 0 ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-200">
                    Some parts aren’t linked to a specific line item (missing{" "}
                    <span className="font-mono">work_order_line_id</span>). They’re
                    listed below.
                  </div>
                ) : null}

                {parts.map((p) => {
                  const meta = compactCsv([
                    p.partNumber,
                    p.sku,
                    p.unit ? `Unit: ${p.unit}` : undefined,
                    p.lineId ? `Line: ${p.lineId.slice(0, 6)}…` : undefined,
                  ]);

                  return (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-white/5 bg-black/40 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-neutral-100">
                          {p.name}
                        </div>
                        {meta.length ? (
                          <div className="text-[11px] text-neutral-500">
                            {meta}
                          </div>
                        ) : null}
                        <div className="text-[11px] text-neutral-500">
                          Qty: {p.qty}
                        </div>
                      </div>

                      <div className="text-right text-xs text-neutral-300">
                        <div className="text-[11px] text-neutral-500">
                          Unit: {formatCurrency(p.unitPrice, currency)}
                        </div>
                        <div className="text-sm font-semibold">
                          {formatCurrency(p.totalPrice, currency)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-neutral-400">
                Parts will appear here when they’re added to the work order.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}