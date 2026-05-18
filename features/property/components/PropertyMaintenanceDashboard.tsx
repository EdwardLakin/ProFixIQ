"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  MaintenanceControlTower,
  propertyOperationsRoutes,
  propertyOperationsTerminology,
} from "@/features/operations";
import {
  propertyDemoAssets,
  propertyDemoAssignments,
  propertyDemoIssues,
} from "../lib/propertyDemoData";

type PropertyMaintenanceDashboardProps = {
  title?: string;
  subtitle?: string;
  modeLabel?: string;
};

type FocusFilter = "all" | "open_requests";

export default function PropertyMaintenanceDashboard({
  title = "Property Maintenance Tower",
  subtitle = "Track open requests, inspections, vendor work, and asset history across properties.",
  modeLabel = "Static property demo",
}: PropertyMaintenanceDashboardProps) {
  const [locationFilter, setLocationFilter] = useState<string | "all">("all");
  const [focusFilter, setFocusFilter] = useState<FocusFilter>("all");

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const asset of propertyDemoAssets) {
      if (asset.location?.trim()) set.add(asset.location.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, []);

  const filteredAssets = useMemo(() => {
    let assets = propertyDemoAssets;
    if (locationFilter !== "all") {
      assets = assets.filter((asset) => asset.location === locationFilter);
    }
    if (focusFilter === "open_requests") {
      const assetIdsWithOpenIssues = new Set(
        propertyDemoIssues
          .filter((issue) => issue.status !== "completed")
          .map((issue) => issue.assetId),
      );
      assets = assets.filter((asset) => assetIdsWithOpenIssues.has(asset.id));
    }
    return assets;
  }, [focusFilter, locationFilter]);

  const filteredAssetIds = useMemo(
    () => new Set(filteredAssets.map((asset) => asset.id)),
    [filteredAssets],
  );

  const visibleIssues = useMemo(
    () =>
      propertyDemoIssues.filter((issue) => filteredAssetIds.has(issue.assetId)),
    [filteredAssetIds],
  );

  const summary = useMemo(() => {
    const openIssues = visibleIssues.filter(
      (issue) => issue.status !== "completed",
    );
    return [
      {
        label: propertyOperationsTerminology.assetPluralLabel,
        value: filteredAssets.length,
        helper: "Static demo assets in current filter",
      },
      {
        label: `Open ${propertyOperationsTerminology.requestPluralLabel}`,
        value: openIssues.length,
        helper: "Tenant and site requests awaiting action",
      },
      {
        label: "Limited / Offline",
        value: filteredAssets.filter((asset) => asset.status !== "active")
          .length,
        helper: "Assets needing operating attention",
      },
      {
        label: "Vendor Follow-ups",
        value: propertyDemoAssignments.filter((assignment) =>
          ["blocked", "in_progress", "inspection_due"].includes(
            assignment.state,
          ),
        ).length,
        helper: "Demo assignments only — no dispatch integration",
      },
    ];
  }, [filteredAssets, visibleIssues]);

  return (
    <MaintenanceControlTower
      headerLabel="Property Operations"
      modeLabel={modeLabel}
      title={title}
      subtitle={subtitle}
      actorSurfaceLabel="Property operations"
      locationFilter={{
        value: locationFilter,
        options: locations,
        onChange: (value) => setLocationFilter(value as typeof locationFilter),
        allLabel: "All property locations",
      }}
      focusFilter={{
        active: focusFilter === "open_requests",
        label: `Assets with open ${propertyOperationsTerminology.requestPluralLabel.toLowerCase()}`,
        onClear: () => setFocusFilter("all"),
      }}
      aiSummary={
        <section className="metal-card rounded-3xl p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
            Placeholder scope
          </div>
          <p className="mt-2 text-sm text-neutral-300">
            This property branch is intentionally powered by static demo data.
            It proves the operations shell, control tower, terminology, and
            routes without property tables, RLS changes, live requests, or
            tenant/vendor authentication.
          </p>
        </section>
      }
      summaryCards={
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summary.map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => {
                if (card.label.startsWith("Open")) {
                  setFocusFilter((prev) =>
                    prev === "open_requests" ? "all" : "open_requests",
                  );
                }
              }}
              className="metal-card rounded-3xl p-4 text-left transition hover:border-[color:var(--accent-copper)]/70"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                {card.label}
              </div>
              <div className="mt-2 text-3xl font-semibold text-neutral-100">
                {card.value}
              </div>
              <p className="mt-1 text-xs text-neutral-400">{card.helper}</p>
            </button>
          ))}
        </section>
      }
      issueTables={
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <div className="metal-card rounded-3xl p-4">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-[color:var(--metal-border-soft)] pb-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                  Demo maintenance requests
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  Static property maintenance requests for architecture
                  validation.
                </p>
              </div>
              <Link
                href={propertyOperationsRoutes.portalRequests}
                className="rounded-full border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-900/60"
              >
                Requests
              </Link>
            </div>

            <div className="space-y-3">
              {visibleIssues.map((issue) => (
                <article
                  key={issue.id}
                  className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-neutral-100">
                      {issue.assetLabel}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-neutral-300">
                      {issue.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-neutral-300">
                    {issue.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-neutral-500">
                    <span>
                      {new Date(issue.createdAt).toLocaleDateString()}
                    </span>
                    <span>•</span>
                    <span className="uppercase tracking-[0.14em]">
                      {issue.severity}
                    </span>
                    <Link
                      href={`${propertyOperationsRoutes.assetDetailBase}/${issue.assetId}`}
                      className="ml-auto text-neutral-300 underline decoration-white/20 underline-offset-4 hover:text-neutral-100"
                    >
                      View asset →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="metal-card rounded-3xl p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Vendor work placeholders
            </div>
            <div className="mt-3 space-y-3">
              {propertyDemoAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-xs"
                >
                  <div className="font-semibold text-neutral-100">
                    {assignment.routeLabel}
                  </div>
                  <div className="mt-1 text-neutral-400">
                    {assignment.assetLabel} · requested by{" "}
                    {assignment.requesterName}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    {assignment.state.replaceAll("_", " ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      }
    />
  );
}
