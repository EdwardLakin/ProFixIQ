import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import {
  requireAuthedUser,
  requirePortalCustomer,
  requireWorkOrderOwnedByCustomer,
} from "@/features/portal/server/portalAuth";
import PortalInvoicePayButton from "@/features/stripe/components/PortalInvoicePayButton";
import PortalPaymentStatus from "@/features/stripe/components/PortalPaymentStatus";
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
              className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-xs text-[color:var(--theme-text-primary)]"
            >
              ← Invoices
            </Link>
            <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Version {selectedVersion.version_number}
            </div>
          </div>

          {query.payment_session ? (
            <PortalPaymentStatus sessionId={query.payment_session} />
          ) : null}

          <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 shadow-card">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">Invoice</div>
                <h1 className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">{title}</h1>
                <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                  Issued {dateLabel(selectedVersion.issued_at)}
                </div>
              </div>
              <div className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-sm capitalize text-[color:var(--theme-text-primary)]">
                {statusLabel(selectedVersion.lifecycle_status)}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Invoice total</div>
                <div className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
                  {money(selectedVersion.total, selectedVersion.currency)}
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Paid</div>
                <div className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
                  {money(
                    Number(selectedVersion.paid_total) - Number(selectedVersion.refunded_total),
                    selectedVersion.currency,
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Balance</div>
                <div className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
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
              <div className="mt-5 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
                {selectedVersion.lifecycle_status === "paid"
                  ? "Paid in full."
                  : "This invoice is not currently payable."}
              </div>
            )}

            <div className="mt-5">
              <a
                href={`/api/invoice-versions/${selectedVersion.id}/pdf?download=1`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)]"
              >
                View issued PDF
              </a>
            </div>
          </section>

          <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">Totals</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[color:var(--theme-text-secondary)]">Labor</span><span>{money(snapshot.laborCost, selectedVersion.currency)}</span></div>
              <div className="flex justify-between"><span className="text-[color:var(--theme-text-secondary)]">Parts</span><span>{money(snapshot.partsCost, selectedVersion.currency)}</span></div>
              <div className="flex justify-between"><span className="text-[color:var(--theme-text-secondary)]">Shop supplies</span><span>{money(snapshot.shopSuppliesTotal, selectedVersion.currency)}</span></div>
              <div className="flex justify-between"><span className="text-[color:var(--theme-text-secondary)]">Discount</span><span>-{money(snapshot.discountTotal, selectedVersion.currency)}</span></div>
              <div className="flex justify-between"><span className="text-[color:var(--theme-text-secondary)]">Tax</span><span>{money(snapshot.taxTotal, selectedVersion.currency)}</span></div>
              <div className="flex justify-between border-t border-[color:var(--theme-border-soft)] pt-3 text-base font-semibold"><span>Total</span><span>{money(selectedVersion.total, selectedVersion.currency)}</span></div>
            </div>
          </section>

          <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">Work performed</h2>
            <div className="mt-4 space-y-3">
              {snapshot.lines.map((line) => (
                <div key={line.id} className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
                  <div className="font-semibold text-[color:var(--theme-text-primary)]">{line.description || line.complaint || "Service line"}</div>
                  {line.cause ? <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Cause: {line.cause}</div> : null}
                  {line.correction ? <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Correction: {line.correction}</div> : null}
                </div>
              ))}
              {snapshot.lines.length === 0 ? <div className="text-sm text-[color:var(--theme-text-muted)]">No service lines recorded.</div> : null}
            </div>
          </section>

          <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">Parts</h2>
            <div className="mt-4 space-y-2">
              {snapshot.parts.map((part) => (
                <div key={part.id} className="flex justify-between gap-4 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm">
                  <div><div className="font-medium text-[color:var(--theme-text-primary)]">{part.name}</div><div className="text-[color:var(--theme-text-muted)]">Qty {part.qty}</div></div>
                  <div className="text-right text-[color:var(--theme-text-primary)]">{money(part.totalPrice, selectedVersion.currency)}</div>
                </div>
              ))}
              {snapshot.parts.length === 0 ? <div className="text-sm text-[color:var(--theme-text-muted)]">No parts recorded.</div> : null}
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
