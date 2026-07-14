import Link from "next/link";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { listCustomerVisibleInvoiceVersions } from "@/features/invoices/server/invoiceVersionQueries";

export const dynamic = "force-dynamic";

function money(value: number, currency: "CAD" | "USD") {
  return new Intl.NumberFormat(currency === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency,
  }).format(Number(value ?? 0));
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default async function PortalInvoicesPage() {
  const supabase = createServerSupabaseRSC();

  try {
    const actor = await requirePortalCustomerActor(supabase);
    const { data: workOrders, error: workOrderError } = await supabase
      .from("work_orders")
      .select("id,custom_id")
      .eq("customer_id", actor.customer.id)
      .returns<Array<{ id: string; custom_id: string | null }>>();
    if (workOrderError) throw new Error(workOrderError.message);

    const labels = new Map((workOrders ?? []).map((row) => [row.id, row.custom_id]));
    const versions = await listCustomerVisibleInvoiceVersions({
      supabase,
      workOrderIds: (workOrders ?? []).map((row) => row.id),
    });

    return (
      <div className="space-y-6 text-[color:var(--theme-text-primary)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Invoices</h1>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              Issued invoice versions, payment balances, and historical corrections.
            </p>
          </div>
          <Link
            href="/portal"
            className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-xs text-[color:var(--theme-text-primary)]"
          >
            ← Portal
          </Link>
        </div>

        <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card">
          {versions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] p-5 text-sm text-[color:var(--theme-text-secondary)]">
              No invoices have been issued yet.
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((version) => {
                const label = labels.get(version.work_order_id) || `Work order ${version.work_order_id.slice(0, 8)}`;
                return (
                  <Link
                    key={version.id}
                    href={`/portal/invoices/${version.work_order_id}?version=${version.id}`}
                    className="block rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 transition hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-inset)]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-semibold text-[color:var(--theme-text-primary)]">{label}</div>
                        <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                          Version {version.version_number} • Issued {dateLabel(version.issued_at)}
                        </div>
                        <div className="mt-1 text-xs capitalize text-[color:var(--theme-text-secondary)]">
                          {version.lifecycle_status.replaceAll("_", " ")}
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <div className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
                          {money(version.total, version.currency)}
                        </div>
                        <div className="text-xs text-[color:var(--theme-text-muted)]">
                          Balance {money(version.outstanding_total, version.currency)}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load invoices";
    return (
      <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-100">
        {message}
      </div>
    );
  }
}
