import Link from "next/link";
import type { ReactNode } from "react";

import type {
  ActiveWorkSummary,
  AppointmentSummary,
  VehicleAttentionItem,
  VehicleTimelineEvent,
  VehicleWorkspacePermissions,
  VehicleWorkspaceReference,
  VehicleWorkspaceSnapshot,
} from "@/features/vehicles/lib/vehicleWorkspace";

type VehicleWorkspaceProps = {
  snapshot: VehicleWorkspaceSnapshot;
  createWorkOrderHref: string | null;
  bookAppointmentHref: string | null;
  createEstimateHref: string | null;
  messageCustomerHref: string | null;
};

const PANEL =
  "rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--desktop-panel-bg-soft,var(--theme-surface-page))] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl";
const ITEM =
  "rounded-xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--desktop-item-bg,var(--theme-surface-inset))]";
const EYEBROW =
  "text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]";
const LINK_FOCUS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-copper-soft,#fdba74)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--theme-surface-page)]";

function textOrDash(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const normalized = String(value).trim();
  return normalized || "—";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCurrency(
  value: number,
  currency: string | null | undefined,
): string {
  try {
    return new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-CA", {
      style: "currency",
      currency: currency || "CAD",
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || "CAD"}`;
  }
}

function vehicleTitle(snapshot: VehicleWorkspaceSnapshot): string {
  const { identity } = snapshot;
  return (
    [identity.year, identity.make, identity.model, identity.submodel]
      .filter(Boolean)
      .join(" ") || "Vehicle"
  );
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="inline-flex max-w-full rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--theme-text-secondary)]">
      {humanize(value)}
    </span>
  );
}

function SourceFooter({
  label,
  canOpen = true,
}: {
  label: string;
  canOpen?: boolean;
}) {
  return (
    <span className="mt-3 flex items-center justify-between gap-3 border-t border-[color:var(--theme-border-soft)] pt-3 text-xs text-[color:var(--theme-text-muted)]">
      <span className="min-w-0 truncate">Source: {label}</span>
      <span aria-hidden="true" className="shrink-0 text-[color:var(--accent-copper-light,#fdba74)]">
        {canOpen ? "Open →" : "Source retained"}
      </span>
    </span>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className={`${ITEM} px-4 py-5 text-sm text-[color:var(--theme-text-muted)]`}>
      {children}
    </p>
  );
}

const WORK_ORDER_SOURCE_TYPES = new Set<
  VehicleWorkspaceReference["sourceType"]
>([
  "maintenance_suggestion",
  "work_order",
  "work_order_line",
  "work_order_media",
  "work_order_part",
]);

function canOpenReference(
  reference: VehicleWorkspaceReference,
  permissions: VehicleWorkspacePermissions,
): boolean {
  if (reference.sourceType === "history") {
    return permissions.canViewFinancials;
  }
  if (
    reference.sourceType === "invoice" ||
    reference.sourceType === "payment"
  ) {
    return permissions.canViewFinancials;
  }
  if (reference.sourceType === "inspection") {
    return permissions.canOpenInspections;
  }
  if (reference.sourceType === "work_order_quote_line") {
    return permissions.canViewEstimates;
  }
  if (WORK_ORDER_SOURCE_TYPES.has(reference.sourceType)) {
    return permissions.canOpenWorkOrders;
  }
  return true;
}

function canOpenActiveWork(
  item: ActiveWorkSummary,
  permissions: VehicleWorkspacePermissions,
): boolean {
  if (item.kind === "estimate") return permissions.canViewEstimates;
  return canOpenReference(item.reference, permissions);
}

function canOpenTimelineEvent(
  event: VehicleTimelineEvent,
  permissions: VehicleWorkspacePermissions,
): boolean {
  if (event.kind === "appointment" && !permissions.canOpenAppointments) {
    return false;
  }
  if (event.kind === "estimate") return permissions.canViewEstimates;
  if (event.kind === "approval" && !permissions.canViewEstimates) return false;
  return canOpenReference(event.reference, permissions);
}

function ActiveWorkCard({
  item,
  canOpen,
}: {
  item: ActiveWorkSummary;
  canOpen: boolean;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={EYEBROW}>{humanize(item.kind)}</p>
          <h3 className="mt-1 font-semibold">{item.title}</h3>
        </div>
        <StatusPill value={item.status} />
      </div>
      {item.detail ? (
        <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
          {item.detail}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--theme-text-muted)]">
        <span>{formatDateTime(item.occurredAt) || "Date not recorded"}</span>
        {typeof item.amount === "number" ? (
          <strong className="text-[color:var(--theme-text-primary)]">
            {formatCurrency(item.amount, item.currency)}
          </strong>
        ) : null}
      </div>
      <SourceFooter label={item.reference.sourceLabel} canOpen={canOpen} />
    </>
  );

  return (
    <li>
      {canOpen ? (
        <Link
          href={item.reference.href}
          data-source-id={item.reference.sourceId}
          data-source-type={item.reference.sourceType}
          className={`${ITEM} ${LINK_FOCUS} block h-full p-4 transition hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-[color:var(--theme-surface-subtle)]`}
        >
          {content}
        </Link>
      ) : (
        <div
          data-source-id={item.reference.sourceId}
          data-source-type={item.reference.sourceType}
          className={`${ITEM} block h-full p-4`}
        >
          {content}
        </div>
      )}
    </li>
  );
}

function AppointmentCard({
  appointment,
  canOpen,
}: {
  appointment: AppointmentSummary;
  canOpen: boolean;
}) {
  const startsAt = formatDateTime(appointment.startsAt);
  const endsAt = formatDateTime(appointment.endsAt);
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={EYEBROW}>Appointment</p>
          <h3 className="mt-1 font-semibold text-[color:var(--theme-text-primary)]">
            {appointment.title}
          </h3>
        </div>
        <StatusPill value={appointment.status} />
      </div>
      <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
        {startsAt || "Start time not recorded"}
        {endsAt ? ` – ${endsAt}` : ""}
      </p>
      {appointment.detail ? (
        <p className="mt-2 line-clamp-2 text-sm text-[color:var(--theme-text-muted)]">
          {appointment.detail}
        </p>
      ) : null}
      <SourceFooter
        label={appointment.reference.sourceLabel}
        canOpen={canOpen}
      />
    </>
  );

  return (
    <li>
      {canOpen ? (
        <Link
          href={appointment.reference.href}
          data-source-id={appointment.reference.sourceId}
          data-source-type={appointment.reference.sourceType}
          className={`${ITEM} ${LINK_FOCUS} block h-full p-4 transition hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-[color:var(--theme-surface-subtle)]`}
        >
          {content}
        </Link>
      ) : (
        <div
          data-source-id={appointment.reference.sourceId}
          data-source-type={appointment.reference.sourceType}
          className={`${ITEM} block h-full p-4`}
        >
          {content}
        </div>
      )}
    </li>
  );
}

function AttentionCard({
  item,
  canOpen,
}: {
  item: VehicleAttentionItem;
  canOpen: boolean;
}) {
  const severityClass =
    item.severity === "urgent"
      ? "border-rose-500/50 bg-rose-500/10"
      : item.severity === "warning"
        ? "border-amber-500/50 bg-amber-500/10"
        : "border-sky-500/40 bg-sky-500/10";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={EYEBROW}>{humanize(item.kind)}</p>
          <h3 className="mt-1 font-semibold text-[color:var(--theme-text-primary)]">
            {item.title}
          </h3>
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
          {item.severity}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
        {item.explanation}
      </p>
      <SourceFooter label={item.reference.sourceLabel} canOpen={canOpen} />
    </>
  );

  return (
    <li>
      {canOpen ? (
        <Link
          href={item.reference.href}
          data-source-id={item.reference.sourceId}
          data-source-type={item.reference.sourceType}
          className={`${LINK_FOCUS} block h-full rounded-xl border p-4 transition hover:brightness-110 ${severityClass}`}
        >
          {content}
        </Link>
      ) : (
        <div
          data-source-id={item.reference.sourceId}
          data-source-type={item.reference.sourceType}
          className={`block h-full rounded-xl border p-4 ${severityClass}`}
        >
          {content}
        </div>
      )}
    </li>
  );
}

function TimelineEvent({
  event,
  canOpen,
}: {
  event: VehicleTimelineEvent;
  canOpen: boolean;
}) {
  const content = (
    <>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className={EYEBROW}>{humanize(event.kind)}</p>
          <h3 className="mt-1 font-semibold text-[color:var(--theme-text-primary)]">
            {event.title}
          </h3>
        </div>
        <time
          dateTime={event.occurredAt}
          className="shrink-0 text-xs text-[color:var(--theme-text-muted)]"
        >
          {formatDateTime(event.occurredAt) || "Date not recorded"}
        </time>
      </div>
      {event.detail ? (
        <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          {event.detail}
        </p>
      ) : null}
      <SourceFooter label={event.reference.sourceLabel} canOpen={canOpen} />
    </>
  );

  return (
    <li className="relative pl-7 before:absolute before:left-[7px] before:top-3 before:h-full before:w-px before:bg-[color:var(--theme-border-soft)] last:before:hidden">
      <span
        aria-hidden="true"
        className="absolute left-0 top-2 h-[15px] w-[15px] rounded-full border-2 border-[color:var(--accent-copper-soft,#fdba74)] bg-[color:var(--theme-surface-page)]"
      />
      {canOpen ? (
        <Link
          href={event.reference.href}
          data-source-id={event.reference.sourceId}
          data-source-type={event.reference.sourceType}
          className={`${ITEM} ${LINK_FOCUS} block p-4 transition hover:border-[color:var(--accent-copper-soft,#fdba74)]`}
        >
          {content}
        </Link>
      ) : (
        <div
          data-source-id={event.reference.sourceId}
          data-source-type={event.reference.sourceType}
          className={`${ITEM} block p-4`}
        >
          {content}
        </div>
      )}
    </li>
  );
}

export function VehicleWorkspace({
  snapshot,
  createWorkOrderHref,
  bookAppointmentHref,
  createEstimateHref,
  messageCustomerHref,
}: VehicleWorkspaceProps) {
  const { identity, currentAccount } = snapshot;
  const visibleTimeline = snapshot.recentTimeline.slice(0, 8);
  const olderTimeline = snapshot.recentTimeline.slice(8);
  const identifierRows = [
    identity.unitNumber ? ["Unit", identity.unitNumber] : null,
    identity.licensePlate ? ["Plate", identity.licensePlate] : null,
    identity.vin ? ["VIN", identity.vin] : null,
  ].filter((row): row is [string, string] => Boolean(row));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 text-[color:var(--theme-text-primary)] sm:px-6 sm:py-6 lg:px-8">
      <header className={`${PANEL} sticky top-2 z-20 overflow-hidden p-4 sm:p-5`}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={EYEBROW}>Vehicle workspace</p>
              {identity.status ? <StatusPill value={identity.status} /> : null}
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              {vehicleTitle(snapshot)}
            </h1>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {identifierRows.map(([label, value]) => (
                <div key={label} className="flex min-w-0 gap-2">
                  <dt className="text-[color:var(--theme-text-muted)]">{label}</dt>
                  <dd className="max-w-[22rem] break-all font-medium text-[color:var(--theme-text-secondary)]">
                    {value}
                  </dd>
                </div>
              ))}
              {identity.mileage ? (
                <div className="flex gap-2">
                  <dt className="text-[color:var(--theme-text-muted)]">Odometer</dt>
                  <dd className="font-medium text-[color:var(--theme-text-secondary)]">
                    {identity.mileage} {identity.odometerUnit || ""}
                  </dd>
                </div>
              ) : null}
              {identity.engineHours != null ? (
                <div className="flex gap-2">
                  <dt className="text-[color:var(--theme-text-muted)]">Engine hours</dt>
                  <dd className="font-medium text-[color:var(--theme-text-secondary)]">
                    {identity.engineHours}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="flex min-w-0 flex-col gap-3 xl:items-end">
            {currentAccount ? (
              <div className="min-w-0 xl:text-right">
                <p className={EYEBROW}>Current account</p>
                {snapshot.permissions.canOpenAccount ? (
                  <Link
                    href={`/customers/${encodeURIComponent(currentAccount.id)}`}
                    className={`${LINK_FOCUS} mt-1 inline-block max-w-full truncate font-semibold text-[color:var(--accent-copper-light,#fdba74)] hover:underline`}
                  >
                    {currentAccount.displayName}
                  </Link>
                ) : (
                  <p className="mt-1 max-w-full truncate font-semibold text-[color:var(--theme-text-primary)]">
                    {currentAccount.displayName}
                  </p>
                )}
                {snapshot.permissions.canViewAccountContact &&
                (currentAccount.email || currentAccount.phone) ? (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--theme-text-muted)] xl:justify-end">
                    {currentAccount.phone ? (
                      <a
                        href={`tel:${currentAccount.phone}`}
                        className={`${LINK_FOCUS} hover:text-[color:var(--theme-text-primary)] hover:underline`}
                      >
                        {currentAccount.phone}
                      </a>
                    ) : null}
                    {currentAccount.email ? (
                      <a
                        href={`mailto:${currentAccount.email}`}
                        className={`${LINK_FOCUS} break-all hover:text-[color:var(--theme-text-primary)] hover:underline`}
                      >
                        {currentAccount.email}
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-[color:var(--theme-text-muted)]">
                No current account
              </p>
            )}
            <nav
              aria-label="Vehicle actions"
              className="flex flex-wrap gap-2 xl:justify-end"
            >
              {currentAccount &&
              snapshot.permissions.canOpenAccount ? (
                <Link
                  href={`/customers/${encodeURIComponent(currentAccount.id)}`}
                  className={`${LINK_FOCUS} rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3.5 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-subtle)]`}
                >
                  Open Account
                </Link>
              ) : null}
              {snapshot.permissions.canCreateWorkOrder && createWorkOrderHref ? (
                <Link
                  href={createWorkOrderHref}
                  className={`${LINK_FOCUS} rounded-lg border border-[color:var(--accent-copper-soft,#fdba74)] bg-[color:var(--accent-copper,#c47a3a)] px-3.5 py-2 text-sm font-semibold text-white transition hover:brightness-110`}
                >
                  Create Work Order
                </Link>
              ) : null}
              {snapshot.permissions.canBookAppointment && bookAppointmentHref ? (
                <Link
                  href={bookAppointmentHref}
                  className={`${LINK_FOCUS} rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3.5 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-subtle)]`}
                >
                  Book
                </Link>
              ) : null}
              {snapshot.permissions.canCreateEstimate && createEstimateHref ? (
                <Link
                  href={createEstimateHref}
                  className={`${LINK_FOCUS} rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3.5 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-subtle)]`}
                >
                  Estimate
                </Link>
              ) : null}
              {snapshot.permissions.canMessageCustomer && messageCustomerHref ? (
                <Link
                  href={messageCustomerHref}
                  className={`${LINK_FOCUS} rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3.5 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-subtle)]`}
                >
                  Message
                </Link>
              ) : null}
            </nav>
          </div>
        </div>

        {snapshot.conflicts.length > 0 ? (
          <div
            role="alert"
            aria-label="Vehicle record conflicts"
            className="mt-5 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800 dark:text-amber-200">
              Review record conflicts
            </p>
            <ul className="mt-2 space-y-2">
              {snapshot.conflicts.map((conflict) => (
                <li key={`${conflict.kind}:${conflict.sourceIds.join(":")}`}>
                  <p className="text-sm font-semibold">{conflict.title}</p>
                  <p className="text-sm text-[color:var(--theme-text-secondary)]">
                    {conflict.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </header>

      <section
        aria-labelledby="active-now-heading"
        className={`${PANEL} p-4 sm:p-5`}
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className={EYEBROW}>Current condition</p>
            <h2 id="active-now-heading" className="mt-1 text-xl font-bold">
              Active now
            </h2>
          </div>
          <p className="text-xs text-[color:var(--theme-text-muted)]">
            {snapshot.activeWork.length} active record
            {snapshot.activeWork.length === 1 ? "" : "s"}
            {snapshot.upcomingAppointments.length
              ? ` · ${snapshot.upcomingAppointments.length} upcoming`
              : ""}
          </p>
        </div>

        {snapshot.activeWork.length || snapshot.upcomingAppointments.length ? (
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.activeWork.map((item) => (
              <ActiveWorkCard
                key={`${item.reference.sourceType}:${item.reference.sourceId}`}
                item={item}
                canOpen={canOpenActiveWork(item, snapshot.permissions)}
              />
            ))}
            {snapshot.upcomingAppointments.map((appointment) => (
              <AppointmentCard
                key={`${appointment.reference.sourceType}:${appointment.reference.sourceId}`}
                appointment={appointment}
                canOpen={snapshot.permissions.canOpenAppointments}
              />
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyState>
              No active work or upcoming appointments are visible for this
              vehicle.
            </EmptyState>
          </div>
        )}
      </section>

      <section
        aria-labelledby="attention-heading"
        className={`${PANEL} p-4 sm:p-5`}
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className={EYEBROW}>Evidence-backed items</p>
            <h2 id="attention-heading" className="mt-1 text-xl font-bold">
              Needs attention
            </h2>
          </div>
          <p className="text-xs text-[color:var(--theme-text-muted)]">
            {snapshot.attentionItems.length} evidence item
            {snapshot.attentionItems.length === 1 ? "" : "s"}
          </p>
        </div>
        {snapshot.attentionItems.length ? (
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.attentionItems.map((item) => (
              <AttentionCard
                key={`${item.reference.sourceType}:${item.reference.sourceId}:${item.kind}:${item.title}:${item.explanation}:${item.occurredAt ?? ""}`}
                item={item}
                canOpen={canOpenReference(item.reference, snapshot.permissions)}
              />
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyState>
              No evidence-backed attention items are visible.
            </EmptyState>
          </div>
        )}
      </section>

      <section
        aria-labelledby="timeline-heading"
        className={`${PANEL} p-4 sm:p-5`}
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className={EYEBROW}>Canonical record stream</p>
            <h2 id="timeline-heading" className="mt-1 text-xl font-bold">
              Recent timeline
            </h2>
          </div>
          <p className="text-xs text-[color:var(--theme-text-muted)]">
            Most recent first
          </p>
        </div>
        {visibleTimeline.length ? (
          <>
            <ol className="mt-5 space-y-3">
              {visibleTimeline.map((event) => (
                <TimelineEvent
                  key={`${event.reference.sourceType}:${event.reference.sourceId}:${event.kind}`}
                  event={event}
                  canOpen={canOpenTimelineEvent(event, snapshot.permissions)}
                />
              ))}
            </ol>
            {olderTimeline.length ? (
              <details className={`${ITEM} mt-4 p-4`}>
                <summary
                  className={`${LINK_FOCUS} cursor-pointer text-sm font-semibold text-[color:var(--accent-copper-light,#fdba74)]`}
                >
                  Show {olderTimeline.length} older event
                  {olderTimeline.length === 1 ? "" : "s"}
                </summary>
                <ol className="mt-5 space-y-3">
                  {olderTimeline.map((event) => (
                    <TimelineEvent
                      key={`${event.reference.sourceType}:${event.reference.sourceId}:${event.kind}`}
                      event={event}
                      canOpen={canOpenTimelineEvent(event, snapshot.permissions)}
                    />
                  ))}
                </ol>
              </details>
            ) : null}
          </>
        ) : (
          <div className="mt-4">
            <EmptyState>No timeline events are visible for this vehicle.</EmptyState>
          </div>
        )}
      </section>

      <aside
        aria-label="Vehicle workspace summaries"
        className="grid gap-4 lg:grid-cols-3"
      >
        {snapshot.financialSummary.visible ? (
          <section
            className={`${PANEL} p-4`}
            aria-labelledby="financial-summary-heading"
          >
            <p className={EYEBROW}>Authorized view</p>
            <h2 id="financial-summary-heading" className="mt-1 font-bold">
              Vehicle financials
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[color:var(--theme-text-muted)]">
                  Outstanding
                </dt>
                <dd className="mt-1 font-semibold">
                  {snapshot.financialSummary.invoiceCount === 0
                    ? "No invoices"
                    : !snapshot.financialSummary.currency ||
                        snapshot.financialSummary.outstandingAmount === null
                      ? "Multiple currencies"
                      : formatCurrency(
                        snapshot.financialSummary.outstandingAmount,
                        snapshot.financialSummary.currency,
                      )}
                </dd>
              </div>
              <div>
                <dt className="text-[color:var(--theme-text-muted)]">Paid</dt>
                <dd className="mt-1 font-semibold">
                  {snapshot.financialSummary.invoiceCount === 0
                    ? "No invoices"
                    : !snapshot.financialSummary.currency ||
                        snapshot.financialSummary.paidAmount === null
                      ? "Multiple currencies"
                      : formatCurrency(
                        snapshot.financialSummary.paidAmount,
                        snapshot.financialSummary.currency,
                      )}
                </dd>
              </div>
              <div>
                <dt className="text-[color:var(--theme-text-muted)]">Invoices</dt>
                <dd className="mt-1 font-semibold">
                  {snapshot.financialSummary.invoiceCount}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        <section
          className={`${PANEL} p-4`}
          aria-labelledby="document-summary-heading"
        >
          <p className={EYEBROW}>Attached evidence</p>
          <h2 id="document-summary-heading" className="mt-1 font-bold">
            Documents
          </h2>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div className={`${ITEM} p-2`}>
              <dt className="text-xs text-[color:var(--theme-text-muted)]">
                Vehicle
              </dt>
              <dd className="mt-1 font-semibold">
                {snapshot.documentSummary.vehicleMediaCount}
              </dd>
            </div>
            <div className={`${ITEM} p-2`}>
              <dt className="text-xs text-[color:var(--theme-text-muted)]">
                Work order
              </dt>
              <dd className="mt-1 font-semibold">
                {snapshot.documentSummary.workOrderMediaCount}
              </dd>
            </div>
            <div className={`${ITEM} p-2`}>
              <dt className="text-xs text-[color:var(--theme-text-muted)]">
                Inspection
              </dt>
              <dd className="mt-1 font-semibold">
                {snapshot.documentSummary.inspectionReportCount}
              </dd>
            </div>
          </dl>
          {snapshot.documentSummary.latestReference ? (
            canOpenReference(
              snapshot.documentSummary.latestReference,
              snapshot.permissions,
            ) ? (
              <Link
                href={snapshot.documentSummary.latestReference.href}
                data-source-id={snapshot.documentSummary.latestReference.sourceId}
                data-source-type={snapshot.documentSummary.latestReference.sourceType}
                className={`${LINK_FOCUS} mt-3 inline-flex text-sm font-semibold text-[color:var(--accent-copper-light,#fdba74)] hover:underline`}
              >
                Open {snapshot.documentSummary.latestReference.sourceLabel} →
              </Link>
            ) : (
              <p
                data-source-id={snapshot.documentSummary.latestReference.sourceId}
                data-source-type={snapshot.documentSummary.latestReference.sourceType}
                className="mt-3 text-sm font-semibold text-[color:var(--theme-text-muted)]"
              >
                Source retained: {snapshot.documentSummary.latestReference.sourceLabel}
              </p>
            )
          ) : null}
        </section>

        {snapshot.permissions.canViewRelatedVehicles &&
        snapshot.relatedVehicles.length ? (
          <section
            className={`${PANEL} p-4`}
            aria-labelledby="related-vehicles-heading"
          >
            <p className={EYEBROW}>Current account</p>
            <h2 id="related-vehicles-heading" className="mt-1 font-bold">
              Related vehicles
            </h2>
            <ul className="mt-3 divide-y divide-[color:var(--theme-border-soft)]">
              {snapshot.relatedVehicles.slice(0, 6).map((vehicle) => (
                <li key={vehicle.id}>
                  <Link
                    href={vehicle.href}
                    className={`${LINK_FOCUS} flex items-center justify-between gap-3 py-2 text-sm hover:text-[color:var(--accent-copper-light,#fdba74)]`}
                  >
                    <span className="min-w-0 truncate font-medium">
                      {vehicle.label}
                    </span>
                    <span className="shrink-0 text-xs text-[color:var(--theme-text-muted)]">
                      {textOrDash(vehicle.status)} →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>
    </main>
  );
}

export default VehicleWorkspace;
