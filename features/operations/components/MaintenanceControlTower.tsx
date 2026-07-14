"use client";

import type { ReactNode } from "react";

export type MaintenanceControlTowerProps = {
  headerLabel: string;
  title: string;
  subtitle: string;
  actorSurfaceLabel: string;
  locationFilter: {
    value: string;
    options: string[];
    onChange: (value: string) => void;
    allLabel?: string;
  };
  modeLabel?: string;
  focusFilter?: {
    active: boolean;
    label: string;
    onClear: () => void;
  };
  summaryCards: ReactNode;
  issueTables: ReactNode;
  aiSummary?: ReactNode;
  workOrderBoard?: ReactNode;
  loading?: ReactNode;
  error?: ReactNode;
  isLoading?: boolean;
};

export function MaintenanceControlTower({
  headerLabel,
  title,
  subtitle,
  actorSurfaceLabel,
  locationFilter,
  modeLabel,
  focusFilter,
  summaryCards,
  issueTables,
  aiSummary,
  workOrderBoard,
  loading,
  error,
  isLoading = false,
}: MaintenanceControlTowerProps) {
  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">
            {headerLabel}
          </p>
          <h1
            className="mt-1 text-3xl text-[color:var(--theme-text-primary)] md:text-4xl"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            {title}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[color:var(--theme-text-secondary)]">{subtitle}</p>
          <p className="mt-1 text-[11px] text-[color:var(--theme-text-muted)]">
            Actor surface: {actorSurfaceLabel}
          </p>

          {focusFilter?.active && (
            <p className="mt-2 text-[11px] text-[color:var(--theme-text-secondary)]">
              Filter: <span className="text-[color:var(--theme-text-primary)]">{focusFilter.label}</span>{" "}
              <button
                type="button"
                onClick={focusFilter.onClear}
                className="ml-2 underline decoration-neutral-600 underline-offset-2 hover:text-[color:var(--theme-text-primary)]"
              >
                Clear
              </button>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={locationFilter.value}
            onChange={(e) => locationFilter.onChange(e.target.value)}
            className="rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)]"
          >
            <option value="all">{locationFilter.allLabel ?? "All locations"}</option>
            {locationFilter.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          {modeLabel && (
            <span className="accent-chip px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
              {modeLabel}
            </span>
          )}
        </div>
      </header>

      {workOrderBoard}

      {error}

      {isLoading && loading}

      {!isLoading && !error && (
        <>
          {aiSummary}
          {summaryCards}
          {issueTables}
        </>
      )}
    </section>
  );
}

export default MaintenanceControlTower;
