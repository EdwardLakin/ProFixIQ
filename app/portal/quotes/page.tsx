import Link from "next/link";
import { CheckCircle2, Clock3, PackageOpen, Plus, Wrench } from "lucide-react";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import {
  PortalPageHeader,
  PortalEmptyState,
} from "@/features/portal/components/PortalUi";
import { runBoundedRouteLoad } from "@/features/shared/lib/route-load";
import { listPortalQuotesForCustomer } from "@/features/portal/server/listPortalQuotes";

export const dynamic = "force-dynamic";

export default async function PortalQuotesPage() {
  const supabase = createServerSupabaseRSC();
  const actor = await requirePortalCustomerActor(supabase);
  const shopId = actor.customer.shop_id;

  const cards = await runBoundedRouteLoad(
    {
      route: "/portal/quotes",
      operation: "load customer quotes",
      tenantId: shopId,
      actorId: actor.userId,
      role: "customer",
    },
    async ({ signal }) =>
      shopId
        ? listPortalQuotesForCustomer({
            supabase,
            customerId: actor.customer.id,
            shopId,
            signal,
          })
        : [],
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 text-[color:var(--theme-text-primary)]">
      <PortalPageHeader
        eyebrow="Customer portal"
        title="Quotes"
        subtitle="Request pricing, review the shop’s response, and continue when you are ready."
        actions={
          <Link
            href="/portal/quotes/request"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)]"
          >
            <Plus className="h-4 w-4" /> Request a quote
          </Link>
        }
      />

      {cards.length === 0 ? (
        <PortalEmptyState
          title="No quote requests yet"
          body="Request a repair estimate or ask Parts to price an item for pickup."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => {
            const Icon = card.partsOnly ? PackageOpen : Wrench;
            const StatusIcon = card.approved ? CheckCircle2 : Clock3;
            return (
              <article
                key={card.key}
                className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[color:var(--theme-surface-subtle)] text-[var(--accent-copper-light)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                    <StatusIcon className="h-3.5 w-3.5" /> {card.status}
                  </span>
                </div>
                <h2 className="mt-4 text-base font-semibold">{card.title}</h2>
                <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  {card.detail}
                </p>
                {card.sent ? (
                  <Link
                    href={`/portal/quotes/${card.workOrderId}`}
                    className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[var(--accent-copper-light)]"
                  >
                    {card.approved
                      ? card.aggregate
                        ? "View approved estimate"
                        : "View approved quote"
                      : card.aggregate
                        ? "Review estimate"
                        : "Review quote"}
                  </Link>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
