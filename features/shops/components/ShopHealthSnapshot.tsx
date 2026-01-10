// /features/shops/components/ShopHealthSnapshot.tsx
"use client";

import type { ReactNode } from "react";

import type {
  ShopHealthSnapshot,
  ShopHealthTopTech,
  ShopHealthIssue,
  ShopHealthRecommendation,
} from "@/features/integrations/ai/shopBoostType";
import { formatCurrency } from "@shared/lib/formatters";

// Theme tokens (matches your newer glass + slate + orange accents)
const cardBase =
  "rounded-2xl border border-slate-700/70 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.10),rgba(15,23,42,0.98))] shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl";
const cardInner = "rounded-xl border border-slate-700/60 bg-slate-950/60";

type Props = {
  snapshot: ShopHealthSnapshot;
};

function looksLikePersonName(label: string): boolean {
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

    // ✅ new
    topTechs,
    issuesDetected,
    recommendations,
  } = snapshot;

  const safeMostCommon = (mostCommonRepairs ?? []).map((r) => ({
    ...r,
    label: normalizeRepairLabel(r.label),
  }));

  const safeHighValue = (highValueRepairs ?? []).map((r) => ({
    ...r,
    label: normalizeRepairLabel(r.label),
  }));

  const safeTopTechs = (topTechs ?? []).filter((t) => t && t.techId);

  return (
    <section className={`space-y-6 p-4 sm:p-6 ${cardBase}`}>
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300/70">
          Shop Health Snapshot
        </p>

        <h2
          className="text-xl sm:text-2xl text-white"
          style={{ fontFamily: "var(--font-blackops)" }}
        >
          How your shop looks on day one
        </h2>

        <p className="text-[11px] text-slate-300/70">
          Based on {Number(totalRepairOrders ?? 0).toLocaleString()} repair orders (
          {timeRangeDescription}).
        </p>

        {/* AI summary under title */}
        <div className={`mt-2 w-full max-w-3xl px-4 py-4 ${cardInner}`}>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
            AI Summary
          </div>
          <p className="mt-2 text-[13px] sm:text-[14px] leading-relaxed text-white/90 whitespace-pre-wrap">
            {narrativeSummary || "No summary yet."}
          </p>
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total revenue (period)" value={formatCurrency(totalRevenue)} />
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
                className={`flex items-center justify-between gap-3 px-3 py-2 ${cardInner}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[12px] font-medium text-white/90">
                    {repair.label}
                  </p>
                  <p className="text-[11px] text-white/60">
                    {repair.count.toLocaleString()} jobs
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-white/80">
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
            {safeMostCommon.length === 0 ? (
              <li className="text-[11px] text-white/45">
                We didn’t detect any repair history yet. Import repair orders to unlock this section.
              </li>
            ) : null}
          </ul>
        </Panel>

        <Panel title="Top revenue drivers">
          <ul className="space-y-2 text-xs text-neutral-200">
            {safeHighValue.slice(0, 5).map((repair) => (
              <li
                key={`${repair.label}-${repair.count}-${repair.revenue}`}
                className={`flex items-center justify-between gap-3 px-3 py-2 ${cardInner}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[12px] font-medium text-white/90">
                    {repair.label}
                  </p>
                  <p className="text-[11px] text-white/60">
                    {repair.count.toLocaleString()} jobs
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-orange-200">
                    {formatCurrency(repair.revenue)}
                  </p>
                </div>
              </li>
            ))}
            {safeHighValue.length === 0 ? (
              <li className="text-[11px] text-white/45">
                We’ll highlight your biggest money-makers once we see some history.
              </li>
            ) : null}
          </ul>
        </Panel>
      </div>

      {/* ✅ NEW: Top techs */}
      <Panel title="Top revenue producing techs">
        <ul className="space-y-2 text-xs text-neutral-200">
          {safeTopTechs.length > 0 ? (
            safeTopTechs.slice(0, 5).map((t: ShopHealthTopTech) => (
              <li
                key={t.techId}
                className={`flex items-center justify-between gap-3 px-3 py-2 ${cardInner}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-white/90">
                    {t.name}
                  </p>
                  <p className="text-[11px] text-white/60">
                    {t.jobs.toLocaleString()} jobs • {t.clockedHours.toFixed(1)} hrs
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-orange-200">
                    {formatCurrency(t.revenue)}
                  </p>
                  <p className="text-[10px] text-white/45">
                    {formatCurrency(t.revenuePerHour)}/hr
                  </p>
                </div>
              </li>
            ))
          ) : (
            <li className="text-[11px] text-white/45">
              No tech revenue data yet (invoices/timecards). Once you run billing + timecards, this populates.
            </li>
          )}
        </ul>
      </Panel>

      {/* Comeback risk + fleet metrics */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Potential comeback risks">
          <ul className="space-y-2 text-xs text-neutral-200">
            {(comebackRisks ?? []).length > 0 ? (
              comebackRisks.map((risk) => (
                <li
                  key={risk.label}
                  className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2"
                >
                  <p className="text-[12px] font-medium text-rose-200">{risk.label}</p>
                  <p className="mt-0.5 text-[11px] text-rose-200/80">
                    {risk.count.toLocaleString()} events
                    {typeof risk.estimatedLostHours === "number"
                      ? ` • ~${risk.estimatedLostHours.toFixed(1)} hrs lost`
                      : null}
                  </p>
                  {risk.note ? (
                    <p className="mt-1 text-[11px] text-rose-100/80">{risk.note}</p>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="text-[11px] text-white/45">No obvious repeat issues detected yet.</li>
            )}
          </ul>
        </Panel>

        <Panel title="Fleet snapshot (if applicable)">
          <ul className="space-y-2 text-xs text-neutral-200">
            {(fleetMetrics ?? []).length > 0 ? (
              fleetMetrics.map((metric) => (
                <li
                  key={metric.label}
                  className={`flex items-center justify-between gap-3 px-3 py-2 ${cardInner}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-white/90">{metric.label}</p>
                    {metric.note ? <p className="text-[11px] text-white/60">{metric.note}</p> : null}
                  </div>
                  <div className="text-right text-[11px] text-orange-200">
                    {metric.value.toLocaleString()} {metric.unit ?? ""}
                  </div>
                </li>
              ))
            ) : (
              <li className="text-[11px] text-white/45">
                Connect fleets and pre-trip reports to see metrics here.
              </li>
            )}
          </ul>
        </Panel>
      </div>

      {/* ✅ NEW: Issues detected */}
      <Panel title="Issues detected (what to fix first)">
        <ul className="space-y-2 text-xs text-neutral-200">
          {(issuesDetected ?? []).length > 0 ? (
            (issuesDetected as ShopHealthIssue[]).map((iss) => (
              <li key={iss.key} className={`px-3 py-2 ${cardInner}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] font-semibold text-white/90">{iss.title}</p>
                  <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] text-neutral-200">
                    {iss.severity.toUpperCase()}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-white/70">{iss.detail}</p>
                {iss.evidence ? (
                  <p className="mt-1 text-[10px] text-white/45">Evidence: {iss.evidence}</p>
                ) : null}
              </li>
            ))
          ) : (
            <li className="text-[11px] text-white/45">
              No major issues flagged yet. As data grows, we’ll surface bottlenecks automatically.
            </li>
          )}
        </ul>
      </Panel>

      {/* AI suggestions: menus + inspections */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Suggested service menus">
          <ul className="space-y-2 text-xs text-neutral-200">
            {menuSuggestions.slice(0, 5).map((menu) => (
              <li key={menu.id} className={`px-3 py-2 ${cardInner}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[12px] font-medium text-white/90">{menu.name}</p>
                    {menu.targetVehicleYmm ? (
                      <p className="text-[11px] text-white/60">For {menu.targetVehicleYmm}</p>
                    ) : null}
                  </div>
                  <div className="text-right text-[11px] text-orange-200">
                    {formatCurrency(menu.recommendedPrice)}
                    <p className="text-[10px] text-white/45">
                      ~{menu.estimatedLaborHours.toFixed(1)} hrs
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-white/70">{menu.description}</p>
              </li>
            ))}
            {menuSuggestions.length === 0 ? (
              <li className="text-[11px] text-white/45">
                Once you have enough history, we’ll suggest ready-to-use menu services.
              </li>
            ) : null}
          </ul>
        </Panel>

        <Panel title="Suggested inspections">
          <ul className="space-y-2 text-xs text-neutral-200">
            {inspectionSuggestions.slice(0, 5).map((inspection) => (
              <li key={inspection.id} className={`px-3 py-2 ${cardInner}`}>
                <p className="text-[12px] font-medium text-white/90">{inspection.name}</p>
                <p className="text-[11px] text-white/60">
                  Best for: <span className="capitalize">{inspection.usageContext}</span> work
                </p>
                {inspection.note ? <p className="mt-1 text-[11px] text-white/70">{inspection.note}</p> : null}
              </li>
            ))}
            {inspectionSuggestions.length === 0 ? (
              <li className="text-[11px] text-white/45">
                AI will propose inspection templates as the system learns.
              </li>
            ) : null}
          </ul>
        </Panel>
      </div>

      {/* ✅ NEW: Actionable recommendations */}
      <Panel title="Recommendations (do these next)">
        <ul className="space-y-2 text-xs text-neutral-200">
          {(recommendations ?? []).length > 0 ? (
            (recommendations as ShopHealthRecommendation[]).map((rec) => (
              <li key={rec.key} className={`px-3 py-2 ${cardInner}`}>
                <p className="text-[12px] font-semibold text-white/90">{rec.title}</p>
                <p className="mt-1 text-[11px] text-white/70">{rec.why}</p>
                <ul className="mt-2 list-disc pl-4 text-[11px] text-white/70 space-y-1">
                  {rec.actionSteps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                {rec.expectedImpact ? (
                  <p className="mt-2 text-[10px] text-white/45">
                    Expected impact: {rec.expectedImpact}
                  </p>
                ) : null}
              </li>
            ))
          ) : (
            <li className="text-[11px] text-white/45">
              No recommendations generated yet.
            </li>
          )}
        </ul>
      </Panel>
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
    <div className={cardInner + " p-3"}>
      <p className="text-[11px] text-white/60">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {subValue ? <p className="mt-0.5 text-[11px] text-white/45">{subValue}</p> : null}
    </div>
  );
}

type PanelProps = {
  title: string;
  children: ReactNode;
};

function Panel({ title, children }: PanelProps) {
  return (
    <section className={cardBase + " p-3 sm:p-4"}>
      <h3 className="mb-2 text-sm font-semibold text-white/90">{title}</h3>
      {children}
    </section>
  );
}