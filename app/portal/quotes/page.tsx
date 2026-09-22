import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  PackageOpen,
  Plus,
  Wrench,
} from "lucide-react";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import {
  PortalPageHeader,
  PortalEmptyState,
} from "@/features/portal/components/PortalUi";
import { runBoundedRouteLoad } from "@/features/shared/lib/route-load";
import {
  listPortalQuotesForCustomer,
  type PortalQuoteCard,
} from "@/features/portal/server/listPortalQuotes";

export const dynamic = "force-dynamic";

function formatPortalDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function isQuoteHistory(card: PortalQuoteCard): boolean {
  return ["Deferred", "Declined", "Decision recorded"].includes(card.status);
}

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

  const needsAttention = cards.filter(
    (card) => card.sent && !card.approved && !isQuoteHistory(card),
  );
  const waitingOnShop = cards.filter(
    (card) => !card.sent && !card.approved && !isQuoteHistory(card),
  );
  const approved = cards.filter((card) => card.approved);
  const history = cards.filter(isQuoteHistory);

  const renderCard = (card: PortalQuoteCard) => {
    const Icon = card.partsOnly ? PackageOpen : Wrench;
    const StatusIcon = card.approved ? CheckCircle2 : Clock3;
    const created = formatPortalDate(card.createdAt);

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

        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
            <span>{card.originLabel}</span>
            <span aria-hidden>•</span>
            <span>Work order {card.workOrderReference}</span>
            {card.estimateReference ? (
              <>
                <span aria-hidden>•</span>
                <span>Estimate {card.estimateReference}</span>
              </>
            ) : null}
          </div>

          <h2 className="mt-2 text-lg font-semibold text-[color:var(--theme-text-primary)]">
            {card.vehicleLabel}
          </h2>
          {card.vehicleDetail ? (
            <p className="mt-0.5 text-xs text-[color:var(--theme-text-muted)]">
              {card.vehicleDetail}
            </p>
          ) : null}

          <h3 className="mt-4 text-sm font-semibold text-[color:var(--theme-text-primary)]">
            {card.title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            {card.detail}
          </p>

          {created ? (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-[color:var(--theme-text-muted)]">
              <CalendarDays className="h-3.5 w-3.5" />
              Opened {created}
            </div>
          ) : null}
        </div>

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
  };

  const renderSection = (
    title: string,
    subtitle: string,
    items: PortalQuoteCard[],
  ) =>
    items.length ? (
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
            {title}
          </h2>
          <p className="text-sm text-[color:var(--theme-text-secondary)]">
            {subtitle}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">{items.map(renderCard)}</div>
      </section>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 text-[color:var(--theme-text-primary)]">
      <PortalPageHeader
        eyebrow="Customer portal"
        title="Quotes & Estimates"
        subtitle="See which vehicle and work order each quote belongs to, review decisions, and continue when you are ready."
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
        <div className="space-y-7">
          {renderSection(
            "Needs your attention",
            "Quotes or estimates waiting for your review or decision.",
            needsAttention,
          )}
          {renderSection(
            "Waiting on the shop",
            "Requests the shop is still preparing or pricing.",
            waitingOnShop,
          )}
          {renderSection(
            "Approved & next steps",
            "Approved work that is ready to book or already has an appointment request.",
            approved,
          )}
          {renderSection(
            "History",
            "Declined, deferred, or otherwise completed quote decisions.",
            history,
          )}
        </div>
      )}
    </div>
  );
}
