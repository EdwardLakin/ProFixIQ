// features/shops/components/ShopHealthSnapshot.tsx
"use client";

import type { ReactNode } from "react";

import type { ShopHealthSnapshot } from "@/features/integrations/ai/shopBoostType";
import { formatCurrency } from "@shared/lib/formatters";

type Props = {
  snapshot: ShopHealthSnapshot;
};

const COPPER = {
  border: "border-[rgba(150,92,60,0.35)]",
  borderStrong: "border-[rgba(150,92,60,0.55)]",
  text: "text-[rgba(214,176,150,0.95)]",
  textSoft: "text-[rgba(214,176,150,0.75)]",
  textMuted: "text-[rgba(210,210,210,0.75)]",
  glass:
    "bg-white/[0.04] backdrop-blur-xl shadow-[0_18px_45px_rgba(0,0,0,0.85)]",
  glassInset: "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
  panelGrad:
    "bg-[linear-gradient(135deg,rgba(120,70,45,0.18),rgba(255,255,255,0.03))]",
};

function looksLikePersonName(label: string): boolean {
  // quick heuristic: 1–2 capitalized words, no digits, no separators
  const s = label.trim();
  if (!s) return false;
  if (/\d/.test(s)) return false;
  if (/[|/_,]/.test(s)) return false;

  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return false;

  const capWord = (w: string) => /^[A-Z][a-z]+(?:'[A-Za-z]+)?$/.test(w);
  return parts.every(capWord);
}

function normalizeRepairLabel(label: string): string {
  const s = label.trim();
  if (!s) return "General Repair";
  if (looksLikePersonName(s)) return "General Repair";
  return s;
}

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

  const safeMostCommon = mostCommonRepairs.map((r) => ({
    ...r,
    label: normalizeRepairLabel(r.label),
  }));

  const safeHighValue = highValueRepairs.map((r) => ({
    ...r,
    label: normalizeRepairLabel(r.label),
  }));

  return (
    <section
      className={[
        "space-y-6 rounded-3xl border p-4 sm:p-6",
        COPPER.border,
        COPPER.glass,
        COPPER.glassInset,
        COPPER.panelGrad,
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-2">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${COPPER.textSoft}`}>
          Shop Health Snapshot
        </p>

        <h2
          className={`text-xl sm:text-2xl ${COPPER.text}`}
          style={{ fontFamily: "var(--font-blackops)" }}
        >
          How your shop looks on day one
        </h2>

        <p className={`text-[11px] ${COPPER.textMuted}`}>
          Based on {totalRepairOrders.toLocaleString()} repair orders ({timeRangeDescription}).
        </p>

        {/* AI summary UNDER title, bigger font, centered, glass */}
        <div
          className={[
            "mt-2 w-full max-w-3xl rounded-2xl border px-4 py-4",
            COPPER.border,
            "bg-white/[0.03]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
          ].join(" ")}
        >
          <div className={`text-[10px] uppercase tracking-[0.18em] ${COPPER.textSoft}`}>
            AI Summary
          </div>
          <p className={`mt-2 text-[13px] sm:text-[14px] leading-relaxed text-white/90`}>
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
          value={safeMostCommon[0]?.label ?? "—"}
          subValue={
            safeMostCommon[0]
              ? `${safeMostCommon[0].count.toLocaleString()} jobs`
              : undefined
          }
        />
      </div>

      {/* Repairs + High value */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top repairs by volume">
          <ul className="space-y-2 text-xs text-neutral-200">
            {safeMostCommon.slice(0, 5).map((repair) => (
              <li
                key={`${repair.label}-${repair.count}-${repair.revenue}`}
                className={[
                  "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
                  COPPER.border,
                  "bg-white/[0.03]",
                ].join(" ")}
              >
                <div className="flex-1">
                  <p className="truncate text-[12px] font-medium text-white/90">
                    {repair.label}
                  </p>
                  <p className="text-[11px] text-white/60">
                    {repair.count.toLocaleString()} jobs
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-white/75">
                    {formatCurrency(repair.revenue)}
                  </p>
                  {typeof repair.averageLaborHours === "number" && (
                    <p className="text-[10px] text-white/45">
                      {repair.averageLaborHours.toFixed(1)} hrs avg
                    </p>
                  )}
                </div>
              </li>
            ))}
            {safeMostCommon.length === 0 && (
              <li className="text-[11px] text-white/45">
                We didn’t detect any repair history yet. Import repair orders to
                unlock this section.
              </li>
            )}
          </ul>
        </Panel>

        <Panel title="Top revenue drivers">
          <ul className="space-y-2 text-xs text-neutral-200">
            {safeHighValue.slice(0, 5).map((repair) => (
              <li
                key={`${repair.label}-${repair.count}-${repair.revenue}`}
                className={[
                  "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
                  COPPER.border,
                  "bg-white/[0.03]",
                ].join(" ")}
              >
                <div className="flex-1">
                  <p className="truncate text-[12px] font-medium text-white/90">
                    {repair.label}
                  </p>
                  <p className="text-[11px] text-white/60">
                    {repair.count.toLocaleString()} jobs
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-[11px] ${COPPER.text}`}>
                    {formatCurrency(repair.revenue)}
                  </p>
                </div>
              </li>
            ))}
            {safeHighValue.length === 0 && (
              <li className="text-[11px] text-white/45">
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
                  className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2"
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
              <li className="text-[11px] text-white/45">
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
                  className={[
                    "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
                    COPPER.border,
                    "bg-white/[0.03]",
                  ].join(" ")}
                >
                  <div className="flex-1">
                    <p className="text-[12px] font-medium text-white/90">
                      {metric.label}
                    </p>
                    {metric.note && (
                      <p className="text-[11px] text-white/60">
                        {metric.note}
                      </p>
                    )}
                  </div>
                  <div className={`text-right text-[11px] ${COPPER.text}`}>
                    {metric.value.toLocaleString()} {metric.unit ?? ""}
                  </div>
                </li>
              ))
            ) : (
              <li className="text-[11px] text-white/45">
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
                className={[
                  "rounded-xl border px-3 py-2",
                  COPPER.border,
                  "bg-white/[0.03]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-[12px] font-medium text-white/90">
                      {menu.name}
                    </p>
                    {menu.targetVehicleYmm && (
                      <p className="text-[11px] text-white/60">
                        For {menu.targetVehicleYmm}
                      </p>
                    )}
                  </div>
                  <div className={`text-right text-[11px] ${COPPER.text}`}>
                    {formatCurrency(menu.recommendedPrice)}
                    <p className="text-[10px] text-white/45">
                      ~{menu.estimatedLaborHours.toFixed(1)} hrs
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-white/70">
                  {menu.description}
                </p>
              </li>
            ))}
            {menuSuggestions.length === 0 && (
              <li className="text-[11px] text-white/45">
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
                className={[
                  "rounded-xl border px-3 py-2",
                  COPPER.border,
                  "bg-white/[0.03]",
                ].join(" ")}
              >
                <p className="text-[12px] font-medium text-white/90">
                  {inspection.name}
                </p>
                <p className="text-[11px] text-white/60">
                  Best for:{" "}
                  <span className="capitalize">{inspection.usageContext}</span>{" "}
                  work
                </p>
                {inspection.note && (
                  <p className="mt-1 text-[11px] text-white/70">
                    {inspection.note}
                  </p>
                )}
              </li>
            ))}
            {inspectionSuggestions.length === 0 && (
              <li className="text-[11px] text-white/45">
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
    <div
      className={[
        "rounded-2xl border p-3",
        "border-[rgba(150,92,60,0.35)]",
        "bg-white/[0.03]",
        "backdrop-blur-xl",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
      ].join(" ")}
    >
      <p className="text-[11px] text-white/60">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {subValue && <p className="mt-0.5 text-[11px] text-white/45">{subValue}</p>}
    </div>
  );
}

type PanelProps = {
  title: string;
  children: ReactNode;
};

function Panel({ title, children }: PanelProps) {
  return (
    <section
      className={[
        "rounded-2xl border p-3 sm:p-4",
        "border-[rgba(150,92,60,0.35)]",
        "bg-white/[0.03]",
        "backdrop-blur-xl",
        "shadow-[0_18px_45px_rgba(0,0,0,0.65)]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
      ].join(" ")}
    >
      <h3 className="mb-2 text-sm font-semibold text-white/90">{title}</h3>
      {children}
    </section>
  );
}