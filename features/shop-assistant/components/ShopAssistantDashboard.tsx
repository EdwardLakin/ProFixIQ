"use client";

import SuggestedActionsPanel from "@/features/assistant/components/SuggestedActionsPanel";
import AppointmentPreparationList from "@/features/shop-assistant/components/AppointmentPreparationList";
import PendingConfirmationsList from "@/features/shop-assistant/components/PendingConfirmationsList";
import RecentAssistantActivityList from "@/features/shop-assistant/components/RecentAssistantActivityList";
import ShopStateMetricGrid from "@/features/shop-assistant/components/ShopStateMetricGrid";
import { useAppointmentPreparations } from "@/features/shop-assistant/hooks/useAppointmentPreparations";
import { useAssistantInboxActivity } from "@/features/shop-assistant/hooks/useAssistantInboxActivity";
import { useShopAssistantState } from "@/features/shop-assistant/hooks/useShopAssistantState";
import type { ShopAssistantContext } from "@/features/shop-assistant/types";

// Appointment preparation is only meaningful for the roles that also see
// deferred-work/pricing history elsewhere (advisor/service/ops), not for
// mechanic (Copilot is their surface) or the fleet/dispatcher portals.
const APPOINTMENT_PREP_ROLES = new Set([
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "lead_hand",
  "foreman",
]);

type Props = {
  refreshToken?: string | number;
  context?: ShopAssistantContext;
};

function roleLabel(role: string): string {
  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ShopAssistantDashboard({
  refreshToken,
  context,
}: Props) {
  const { state, loading, error, refresh } =
    useShopAssistantState(refreshToken);
  const {
    pendingActions,
    recentThreads,
    loading: activityLoading,
    error: activityError,
    reload: reloadActivity,
  } = useAssistantInboxActivity(refreshToken);
  const {
    items: appointmentPreparations,
    canViewPricing: canViewAppointmentPricing,
    loading: appointmentPrepLoading,
    error: appointmentPrepError,
    reload: reloadAppointmentPrep,
  } = useAppointmentPreparations(refreshToken);
  const showAppointmentPrep = APPOINTMENT_PREP_ROLES.has(state?.role ?? "");

  if (loading && !state) {
    return (
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
        Loading the live shop picture…
      </section>
    );
  }

  if (!state) {
    return (
      <section className="rounded-3xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-[color:var(--theme-text-primary)]">
        <div>{error ?? "The live shop picture is unavailable."}</div>
        <button
          type="button"
          className="mt-3 rounded-full border border-current/30 px-3 py-1 text-xs font-semibold"
          onClick={() => void refresh()}
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
            {roleLabel(state.role)} view •{" "}
            {state.scopeLabel ?? "live shop state"}
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
            {state.headline}
          </h1>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Updated{" "}
            {new Date(state.generatedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs text-[color:var(--theme-text-secondary)]"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </header>

      {state.role === "mechanic" ||
      state.role === "fleet_manager" ||
      state.role === "dispatcher" ? null : (
        <ShopStateMetricGrid
          metrics={state.metrics}
          visibleMetricKeys={state.visibleMetricKeys}
        />
      )}

      <SuggestedActionsPanel
        context={context}
        title="Today"
        description="Role-aware daily summary and the highest-value next moves"
        embedded
        collapsible
        maxItems={4}
        refreshToken={refreshToken}
      />

      {activityError ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-[color:var(--theme-text-primary)]">
          <span>
            Couldn&apos;t refresh pending confirmations or recent activity:{" "}
            {activityError}
          </span>
          <button
            type="button"
            className="ml-2 rounded-full border border-current/30 px-2 py-0.5 font-semibold"
            onClick={() => void reloadActivity()}
          >
            Try again
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Needs your confirmation
          </h2>
          {activityLoading ? (
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
              Loading…
            </div>
          ) : (
            <PendingConfirmationsList items={pendingActions} />
          )}
        </div>
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Recent activity
          </h2>
          {activityLoading ? (
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
              Loading…
            </div>
          ) : (
            <RecentAssistantActivityList items={recentThreads} />
          )}
        </div>
      </div>

      {showAppointmentPrep ? (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Upcoming appointment preparation
          </h2>
          {appointmentPrepLoading ? (
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
              Loading…
            </div>
          ) : appointmentPrepError ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-[color:var(--theme-text-primary)]">
              <span>
                Couldn&apos;t load upcoming appointment preparation:{" "}
                {appointmentPrepError}
              </span>
              <button
                type="button"
                className="ml-2 rounded-full border border-current/30 px-2 py-0.5 font-semibold"
                onClick={() => void reloadAppointmentPrep()}
              >
                Try again
              </button>
            </div>
          ) : (
            <AppointmentPreparationList
              items={appointmentPreparations}
              canViewPricing={canViewAppointmentPricing}
            />
          )}
        </div>
      ) : null}

      {error ? (
        <div className="text-xs text-amber-300">
          The latest background refresh failed; showing the most recent shop
          state.
        </div>
      ) : null}
    </section>
  );
}
