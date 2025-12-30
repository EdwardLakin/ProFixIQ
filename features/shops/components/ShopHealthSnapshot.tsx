// src/features/shops/components/ShopHealthSnapshot.tsx
"use client";

import type { ReactNode } from "react";

import type { ShopHealthSnapshot } from "@/features/integrations/ai/shopBoostType";
import { formatCurrency } from "@shared/lib/formatters";

type Props = {
  snapshot: ShopHealthSnapshot;
};

export default function ShopHealthSnapshotView({ snapshot }: Props) {
  const {
    timeRangeDescription,
    totalRepairOrders,
    totalRevenue,
    averageRo,
    mostCommonRepairs,
    highValueRepairs,
    comebackRisks,
    fleetMetrics,
    menuSuggestions,
    inspectionSuggestions,
    narrativeSummary,
  } = snapshot;

  return (
    <section className="space-y-6 rounded-3xl border border-white/10 bg-black/40 p-4 sm:p-6 backdrop-blur-xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
            Shop Health Snapshot
          </p>
          <h2
            className="mt-1 text-xl text-neutral-100 sm:text-2xl"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            How your shop looks on day one
          </h2>
          <p className="mt-1 text-[11px] text-neutral-400">
            Based on {totalRepairOrders.toLocaleString()} repair orders{" "}
            ({timeRangeDescription}).
          </p>
        </div>
        <div className="max-w-xs rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-right text-xs text-neutral-100">
          <div className="text-[10px] uppercase tracking-[0.18em] text-orange-300">
            AI Summary
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-100">
            {narrativeSummary}
          </p>
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Total revenue (period)"
          value={formatCurrency(totalRevenue)}
        />
        <MetricCard label="Average RO" value={formatCurrency(averageRo)} />
        <MetricCard
          label="Most common job"
          value={mostCommonRepairs[0]?.label ?? "—"}
          subValue={
            mostCommonRepairs[0]
              ? `${mostCommonRepairs[0].count.toLocaleString()} jobs`
              : undefined
          }
        />
      </div>

      {/* Repairs + High value */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top repairs by volume">
          <ul className="space-y-2 text-xs text-neutral-200">
            {mostCommonRepairs.slice(0, 5).map((repair) => (
              <li
                key={repair.label}
                className="flex items-center justify-between gap-3 rounded-lg bg-neutral-900/60 px-3 py-2"
              >
                <div className="flex-1">
                  <p className="truncate text-[12px] font-medium">
                    {repair.label}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {repair.count.toLocaleString()} jobs
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-neutral-300">
                    {formatCurrency(repair.revenue)}
                  </p>
                  {typeof repair.averageLaborHours === "number" && (
                    <p className="text-[10px] text-neutral-500">
                      {repair.averageLaborHours.toFixed(1)} hrs avg
                    </p>
                  )}
                </div>
              </li>
            ))}
            {mostCommonRepairs.length === 0 && (
              <li className="text-[11px] text-neutral-500">
                We didn’t detect any repair history yet. Import repair orders to
                unlock this section.
              </li>
            )}
          </ul>
        </Panel>

        <Panel title="Top revenue drivers">
          <ul className="space-y-2 text-xs text-neutral-200">
            {highValueRepairs.slice(0, 5).map((repair) => (
              <li
                key={repair.label}
                className="flex items-center justify-between gap-3 rounded-lg bg-neutral-900/60 px-3 py-2"
              >
                <div className="flex-1">
                  <p className="truncate text-[12px] font-medium">
                    {repair.label}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {repair.count.toLocaleString()} jobs
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-orange-300">
                    {formatCurrency(repair.revenue)}
                  </p>
                </div>
              </li>
            ))}
            {highValueRepairs.length === 0 && (
              <li className="text-[11px] text-neutral-500">
                We’ll highlight your biggest money-makers once we see some
                history.
              </li>
            )}
          </ul>
        </Panel>
      </div>

      {/* Comeback risk + fleet metrics */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Potential comeback risks">
          <ul className="space-y-2 text-xs text-neutral-200">
            {comebackRisks.length > 0 ? (
              comebackRisks.map((risk) => (
                <li
                  key={risk.label}
                  className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2"
                >
                  <p className="text-[12px] font-medium text-red-200">
                    {risk.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-red-300">
                    {risk.count.toLocaleString()} events
                    {typeof risk.estimatedLostHours === "number"
                      ? ` • ~${risk.estimatedLostHours.toFixed(1)} hrs lost`
                      : null}
                  </p>
                  {risk.note && (
                    <p className="mt-1 text-[11px] text-red-200/80">
                      {risk.note}
                    </p>
                  )}
                </li>
              ))
            ) : (
              <li className="text-[11px] text-neutral-500">
                No obvious repeat issues detected yet. We’ll flag patterns like
                repeat failures or frequent re-checks as the system learns.
              </li>
            )}
          </ul>
        </Panel>

        <Panel title="Fleet snapshot (if applicable)">
          <ul className="space-y-2 text-xs text-neutral-200">
            {fleetMetrics.length > 0 ? (
              fleetMetrics.map((metric) => (
                <li
                  key={metric.label}
                  className="flex items-center justify-between gap-3 rounded-lg bg-neutral-900/60 px-3 py-2"
                >
                  <div className="flex-1">
                    <p className="text-[12px] font-medium">{metric.label}</p>
                    {metric.note && (
                      <p className="text-[11px] text-neutral-400">
                        {metric.note}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-orange-300">
                    {metric.value.toLocaleString()} {metric.unit ?? ""}
                  </div>
                </li>
              ))
            ) : (
              <li className="text-[11px] text-neutral-500">
                Connect fleets and pre-trip reports to see downtime and
                maintenance opportunities here.
              </li>
            )}
          </ul>
        </Panel>
      </div>

      {/* AI suggestions: menus + inspections */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Suggested service menus">
          <ul className="space-y-2 text-xs text-neutral-200">
            {menuSuggestions.slice(0, 5).map((menu) => (
              <li
                key={menu.id}
                className="rounded-lg bg-neutral-900/60 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-[12px] font-medium">{menu.name}</p>
                    {menu.targetVehicleYmm && (
                      <p className="text-[11px] text-neutral-400">
                        For {menu.targetVehicleYmm}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-orange-300">
                    {formatCurrency(menu.recommendedPrice)}
                    <p className="text-[10px] text-neutral-500">
                      ~{menu.estimatedLaborHours.toFixed(1)} hrs
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-neutral-300">
                  {menu.description}
                </p>
              </li>
            ))}
            {menuSuggestions.length === 0 && (
              <li className="text-[11px] text-neutral-500">
                Once you have enough history, we’ll suggest ready-to-use menu
                services built from what you already do.
              </li>
            )}
          </ul>
        </Panel>

        <Panel title="Suggested inspections">
          <ul className="space-y-2 text-xs text-neutral-200">
            {inspectionSuggestions.slice(0, 5).map((inspection) => (
              <li
                key={inspection.id}
                className="rounded-lg bg-neutral-900/60 px-3 py-2"
              >
                <p className="text-[12px] font-medium">{inspection.name}</p>
                <p className="text-[11px] text-neutral-400">
                  Best for:{" "}
                  <span className="capitalize">{inspection.usageContext}</span>{" "}
                  work
                </p>
                {inspection.note && (
                  <p className="mt-1 text-[11px] text-neutral-300">
                    {inspection.note}
                  </p>
                )}
              </li>
            ))}
            {inspectionSuggestions.length === 0 && (
              <li className="text-[11px] text-neutral-500">
                AI will propose inspection templates that match your common jobs
                and fleet requirements.
              </li>
            )}
          </ul>
        </Panel>
      </div>
    </section>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  subValue?: string;
};

function MetricCard({ label, value, subValue }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-950/70 p-3">
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {subValue && (
        <p className="mt-0.5 text-[11px] text-neutral-500">{subValue}</p>
      )}
    </div>
  );
}

type PanelProps = {
  title: string;
  children: ReactNode;
};

function Panel({ title, children }: PanelProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-neutral-950/70 p-3 sm:p-4">
      <h3 className="mb-2 text-sm font-semibold text-neutral-100">{title}</h3>
      {children}
    </section>
  );
}