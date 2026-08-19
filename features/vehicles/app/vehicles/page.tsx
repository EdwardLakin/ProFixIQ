"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";
import { usePersistentGuidedOnboardingQuery } from "@/features/onboarding-v2/guided/persistence";
import { VehicleCsvImportCard } from "@/features/vehicles/components/VehicleCsvImportCard";
import {
  vehicleIdentityLabel,
  type VehicleWorkspacePermissions,
  type VehicleWorkspaceSearchCard,
  type VehicleWorkspaceSearchResponse,
} from "@/features/vehicles/lib/vehicleWorkspace";

const CARD_BASE =
  "rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--desktop-panel-bg-soft)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl";
const CARD_INNER =
  "rounded-xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--desktop-item-bg)]";
const ACTION_CLASS =
  "inline-flex min-h-10 items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]";

type VehicleFilesPageProps = {
  canManageVehicles: boolean;
};

function vinSuffix(vin: string | null): string | null {
  const normalized = vin?.trim();
  return normalized ? normalized.slice(-8) : null;
}

function formatMoney(amount: number, currency: string | null | undefined): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "CAD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function VehicleResultCard({
  card,
  permissions,
}: {
  card: VehicleWorkspaceSearchCard;
  permissions: VehicleWorkspacePermissions;
}) {
  const identities = [
    card.vehicle.unitNumber ? `Unit ${card.vehicle.unitNumber}` : null,
    card.vehicle.licensePlate ? `Plate ${card.vehicle.licensePlate}` : null,
    vinSuffix(card.vehicle.vin) ? `VIN •${vinSuffix(card.vehicle.vin)}` : null,
  ].filter(Boolean);
  const outstandingLabel =
    card.currency === null
      ? "Multiple/unknown currencies"
      : card.outstandingAmount !== undefined && card.currency
        ? formatMoney(card.outstandingAmount, card.currency)
        : null;

  return (
    <article className={`${CARD_INNER} p-4`} data-vehicle-id={card.vehicle.id}>
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-semibold text-[color:var(--theme-text-primary)]">
              {vehicleIdentityLabel(card.vehicle)}
            </h3>
            {card.vehicle.status ? (
              <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
                {card.vehicle.status}
              </span>
            ) : null}
          </div>

          <p className="mt-1 break-all text-xs text-[color:var(--theme-text-secondary)]">
            {identities.length
              ? identities.join(" · ")
              : "No plate, VIN, or unit recorded"}
          </p>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Account: {card.currentAccount?.displayName ?? "No current account"}
          </p>

          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="text-[color:var(--theme-text-muted)]">Latest odometer</dt>
              <dd className="mt-0.5 text-[color:var(--theme-text-primary)]">
                {card.latestOdometer ?? "Not recorded"}
              </dd>
            </div>
            <div>
              <dt className="text-[color:var(--theme-text-muted)]">Active now</dt>
              <dd className="mt-0.5 text-[color:var(--theme-text-primary)]">
                {card.activeWork.length
                  ? `${card.activeWork.length} open record${card.activeWork.length === 1 ? "" : "s"}`
                  : "No active work"}
              </dd>
            </div>
            <div>
              <dt className="text-[color:var(--theme-text-muted)]">Next appointment</dt>
              <dd className="mt-0.5 text-[color:var(--theme-text-primary)]">
                {card.nextAppointment
                  ? new Date(card.nextAppointment.startsAt).toLocaleString()
                  : "None scheduled"}
              </dd>
            </div>
            <div>
              <dt className="text-[color:var(--theme-text-muted)]">Needs attention</dt>
              <dd className="mt-0.5 text-[color:var(--theme-text-primary)]">
                {card.attentionCount} open/deferred
              </dd>
            </div>
          </dl>

          {card.activeWork.length ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Active records">
              {card.activeWork.map((work) => {
                const canOpen = work.kind === "estimate"
                  ? permissions.canViewEstimates
                  : permissions.canOpenWorkOrders;
                const content = (
                  <>
                    {work.title} · {work.status.replaceAll("_", " ")}
                  </>
                );
                const className =
                  "inline-flex min-h-8 items-center rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[11px] text-[color:var(--theme-text-secondary)]";

                return (
                  <li
                    key={`${work.reference.sourceType}:${work.reference.sourceId}`}
                  >
                    {canOpen ? (
                      <Link
                        href={work.reference.href}
                        data-source-id={work.reference.sourceId}
                        data-source-type={work.reference.sourceType}
                        className={`${className} hover:border-[var(--accent-copper-soft)] hover:text-[color:var(--theme-text-primary)]`}
                      >
                        {content}
                      </Link>
                    ) : (
                      <span
                        data-source-id={work.reference.sourceId}
                        data-source-type={work.reference.sourceType}
                        className={className}
                      >
                        {content}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-3 lg:items-end">
          {outstandingLabel ? (
            <div className="text-left lg:text-right">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                Vehicle-related outstanding
              </div>
              <div className="mt-0.5 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                {outstandingLabel}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link
              href={card.workspaceHref}
              className={`${ACTION_CLASS} border-[var(--accent-copper-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper)]`}
            >
              Open Workspace
            </Link>
            {card.createWorkOrderHref ? (
              <Link
                href={card.createWorkOrderHref}
                className={`${ACTION_CLASS} border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/70 dark:text-emerald-200`}
              >
                Create Work Order
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function AccountWithoutVehicleCard({
  account,
  canOpen,
}: {
  account: VehicleWorkspaceSearchResponse["accountsWithoutVehicles"][number];
  canOpen: boolean;
}) {
  const content = (
    <>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-[color:var(--theme-text-primary)]">
          {account.displayName}
        </span>
        <span className="block text-xs text-[color:var(--theme-text-muted)]">
          {account.accountType} account · no vehicle
        </span>
      </span>
      <span aria-hidden="true">{canOpen ? "→" : "No vehicle"}</span>
    </>
  );
  const className = `${CARD_INNER} flex min-h-14 items-center justify-between gap-3 p-3 text-sm`;

  return canOpen ? (
    <Link
      href={`/customers/${account.id}`}
      className={`${className} hover:border-[var(--accent-copper-soft)]`}
    >
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}

export default function VehicleFilesPage({
  canManageVehicles,
}: VehicleFilesPageProps) {
  const router = useRouter();
  const vehicleGuidedQuery = usePersistentGuidedOnboardingQuery("vehicles");
  const [query, setQuery] = useState("");
  const [result, setResult] =
    useState<VehicleWorkspaceSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(
          `/api/vehicles/search?${params.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error || "Vehicle search is unavailable.");
        }
        setResult((await response.json()) as VehicleWorkspaceSearchResponse);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setResult(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Vehicle search is unavailable.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const vehicleCount =
    result?.groups.reduce(
      (count, group) => count + group.vehicles.length,
      0,
    ) ?? 0;
  const visibleAccountsWithoutVehicles =
    result?.permissions.canViewAccountContact
      ? result.accountsWithoutVehicles
      : [];
  const noResults =
    !loading &&
    !error &&
    vehicleCount === 0 &&
    visibleAccountsWithoutVehicles.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 text-[color:var(--theme-text-primary)] sm:px-6">
      <GuidedPageStepPanel />

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="min-h-10 rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper-soft)]/70"
        >
          ← Back
        </button>
        <div className="text-xs text-[color:var(--theme-text-muted)]">Shop records</div>
      </div>

      {canManageVehicles ? (
        <VehicleCsvImportCard guidedQuery={vehicleGuidedQuery} />
      ) : null}

      <section
        className={`${CARD_BASE} p-4`}
        aria-labelledby="vehicle-search-heading"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1
              id="vehicle-search-heading"
              className="text-2xl font-semibold text-[color:var(--theme-text-primary)]"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Vehicle Files
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-[color:var(--theme-text-secondary)]">
              Search by customer or company, phone, email, VIN, licence plate,
              unit, year/make/model, or work-order number.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:w-[680px] sm:flex-row">
            {canManageVehicles ? (
              <button
                type="button"
                onClick={() => router.push("/customers/directory")}
                className="min-h-11 rounded-xl border border-[var(--accent-copper-soft)]/55 bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper)] hover:bg-[color:var(--theme-surface-inset)]"
                title="Select a customer file to add a vehicle."
              >
                + Create Vehicle
              </button>
            ) : null}
            <label className="sr-only" htmlFor="vehicle-record-search">
              Search customer and vehicle records
            </label>
            <input
              id="vehicle-record-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Customer, phone, VIN, plate, unit, or WO…"
              autoComplete="off"
              className="min-h-11 w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
            />
          </div>
        </div>

        <div className="mt-4" aria-live="polite">
          {loading && !result ? (
            <div
              className={`${CARD_INNER} p-4 text-sm text-[color:var(--theme-text-secondary)]`}
            >
              Searching canonical customer, vehicle, and work-order records…
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          {noResults ? (
            <div
              className={`${CARD_INNER} p-4 text-sm text-[color:var(--theme-text-secondary)]`}
            >
              {query.trim()
                ? "No customer, vehicle, or work-order record matches this search."
                : "No vehicles found yet."}
            </div>
          ) : null}

          {result ? (
            <div
              className="space-y-5 opacity-100 transition-opacity"
              data-loading={loading}
            >
              {result.groups.map((group, index) => (
                <section
                  key={group.account?.id ?? `unassigned-${index}`}
                  aria-labelledby={`account-group-${group.account?.id ?? index}`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                    <div>
                      <h2
                        id={`account-group-${group.account?.id ?? index}`}
                        className="text-sm font-semibold text-[color:var(--theme-text-primary)]"
                      >
                        {group.account?.displayName ??
                          "Vehicles without a current account"}
                      </h2>
                      <p className="text-[11px] text-[color:var(--theme-text-muted)]">
                        {group.account
                          ? `${group.account.accountType} account · ${group.vehicles.length} vehicle${group.vehicles.length === 1 ? "" : "s"}`
                          : `${group.vehicles.length} unassigned vehicle${group.vehicles.length === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    {group.account &&
                    result.permissions.canOpenAccount ? (
                      <Link
                        href={`/customers/${group.account.id}`}
                        className="inline-flex min-h-9 items-center rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs text-[color:var(--theme-text-secondary)] hover:border-[var(--accent-copper-soft)] hover:text-[color:var(--theme-text-primary)]"
                      >
                        Open account
                      </Link>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {group.vehicles.map((card) => (
                      <VehicleResultCard
                        key={card.vehicle.id}
                        card={card}
                        permissions={result.permissions}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {visibleAccountsWithoutVehicles.length ? (
                <section aria-labelledby="accounts-without-vehicles-heading">
                  <h2
                    id="accounts-without-vehicles-heading"
                    className="mb-2 px-1 text-sm font-semibold text-[color:var(--theme-text-primary)]"
                  >
                    Matching accounts without vehicles
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {visibleAccountsWithoutVehicles.map((account) => (
                      <AccountWithoutVehicleCard
                        key={account.id}
                        account={account}
                        canOpen={result.permissions.canOpenAccount}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
