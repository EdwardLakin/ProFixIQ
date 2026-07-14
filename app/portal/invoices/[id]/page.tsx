import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import {
  requireAuthedUser,
  requirePortalCustomer,
  requireWorkOrderOwnedByCustomer,
} from "@/features/portal/server/portalAuth";
import PortalInvoicePayButton from "@/features/stripe/components/PortalInvoicePayButton";
import {
  getInvoiceVersionById,
  getLatestCustomerVisibleInvoiceVersion,
} from "@/features/invoices/server/invoiceVersionQueries";

export const dynamic = "force-dynamic";

function money(value: number | null | undefined, currency: "CAD" | "USD") {
  return new Intl.NumberFormat(currency === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency,
  }).format(Number(value ?? 0));
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default async function PortalInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string; payment_session?: string }>;
}) {
  const { id: workOrderId } = await params;
  const query = await searchParams;
  const supabase = createServerSupabaseRSC();

  try {
    const { id: userId } = await requireAuthedUser(supabase);
    const customer = await requirePortalCustomer(supabase, userId);
    const workOrder = await requireWorkOrderOwnedByCustomer(
      supabase,
      workOrderId,
      customer.id,
    );

    const selectedVersion = query.version?.trim()
      ? await getInvoiceVersionById({
          supabase,
          invoiceVersionId: query.version.trim(),
          shopId: workOrder.shop_id,
          workOrderId,
        })
      : await getLatestCustomerVisibleInvoiceVersion({
          supabase,
          workOrderId,
          shopId: workOrder.shop_id,
        });

    if (!selectedVersion) redirect("/portal/invoices");

    const snapshot = selectedVersion.snapshot;
    const payable =
      ["issued", "partially_paid"].includes(selectedVersion.lifecycle_status) &&
      Number(selectedVersion.outstanding_total) >= 0.5;
    const title =
      snapshot.workOrder.custom_id ||
      selectedVersion.invoice_id ||
      `Work order ${workOrderId.slice(0, 8)}`;

    return (
      <div className="min-h-screen bg-background px-4 py-10 text-foreground">
        <main className="mx-auto max-w-4xl space-y-5">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/portal/invoices"
              className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-neutral-200"
            >
              ← Invoices
            </Link>
            <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">
              Version {selectedVersion.version_number}
            </div>
          </div>

          {query.payment_session ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Your payment is being confirmed. The balance and receipt update from the verified payment record, not the browser redirect.
            </div>
          ) : null}

          <section className="rounded-3xl border border-white/10 bg-black/35 p-6 shadow-card">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Invoice</div>
                <h1 className="mt-1 text-2xl font-semibold text-white">{title}</h1>
                <div className="mt-1 text-sm text-neutral-400">
                  Issued {dateLabel(selectedVersion.issued_at)}
                </div>
              </div>
              <div className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm capitalize text-neutral-200">
                {statusLabel(selectedVersion.lifecycle_status)}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Invoice total</div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {money(selectedVersion.total, selectedVersion.currency)}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Paid</div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {money(
                    Number(selectedVersion.paid_total) - Number(selectedVersion.refunded_total),
                    selectedVersion.currency,
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Balance</div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {money(selectedVersion.outstanding_total, selectedVersion.currency)}
                </div>
              </div>
            </div>

            {payable ? (
              <div className="mt-5">
                <PortalInvoicePayButton
                  shopId={selectedVersion.shop_id}
                  workOrderId={selectedVersion.work_order_id}
                  amountCents={Math.round(Number(selectedVersion.outstanding_total) * 100)}
                  currency={selectedVersion.currency === "CAD" ? "cad" : "usd"}
                />
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-neutral-300">
                {selectedVersion.lifecycle_status === "paid"
                  ? "Paid in full."
                  : "This invoice is not currently payable."}
              </div>
            )}

            <div className="mt-5">
              <a
                href={`/api/work-orders/${workOrderId}/invoice-pdf?version=${selectedVersion.id}&download=1`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full border border-white/10 bg-black/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white"
              >
                View issued PDF
              </a>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-black/30 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-300">Totals</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-neutral-400">Labor</span><span>{money(snapshot.laborCost, selectedVersion.currency)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-400">Parts</span><span>{money(snapshot.partsCost, selectedVersion.currency)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-400">Shop supplies</span><span>{money(snapshot.shopSuppliesTotal, selectedVersion.currency)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-400">Discount</span><span>-{money(snapshot.discountTotal, selectedVersion.currency)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-400">Tax</span><span>{money(snapshot.taxTotal, selectedVersion.currency)}</span></div>
              <div className="flex justify-between border-t border-white/10 pt-3 text-base font-semibold"><span>Total</span><span>{money(selectedVersion.total, selectedVersion.currency)}</span></div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-black/30 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-300">Work performed</h2>
            <div className="mt-4 space-y-3">
              {snapshot.lines.map((line) => (
                <div key={line.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="font-semibold text-white">{line.description || line.complaint || "Service line"}</div>
                  {line.cause ? <div className="mt-1 text-sm text-neutral-400">Cause: {line.cause}</div> : null}
                  {line.correction ? <div className="mt-1 text-sm text-neutral-300">Correction: {line.correction}</div> : null}
                </div>
              ))}
              {snapshot.lines.length === 0 ? <div className="text-sm text-neutral-500">No service lines recorded.</div> : null}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-black/30 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-300">Parts</h2>
            <div className="mt-4 space-y-2">
              {snapshot.parts.map((part) => (
                <div key={part.id} className="flex justify-between gap-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm">
                  <div><div className="font-medium text-white">{part.name}</div><div className="text-neutral-500">Qty {part.qty}</div></div>
                  <div className="text-right text-neutral-200">{money(part.totalPrice, selectedVersion.currency)}</div>
                </div>
              ))}
              {snapshot.parts.length === 0 ? <div className="text-sm text-neutral-500">No parts recorded.</div> : null}
            </div>
          </section>
        </main>
      </div>
    );
  } catch (error) {
    console.error("[portal invoice] failed", error);
    redirect("/portal/invoices");
  }
}
