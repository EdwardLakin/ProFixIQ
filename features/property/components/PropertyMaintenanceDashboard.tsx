"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  propertyOperationsRoutes,
  propertyOperationsTerminology,
} from "@/features/operations";
import type { PropertyOperationsDashboardData } from "../server/propertyOperationsQueries";
import {
  propertyDemoAssets,
  propertyDemoAssignments,
  propertyDemoIssues,
} from "../lib/propertyDemoData";

type PropertyMaintenanceDashboardProps = {
  title?: string;
  subtitle?: string;
  modeLabel?: string;
  liveData?: PropertyOperationsDashboardData;
};

type FocusFilter = "all" | "open_requests";

export default function PropertyMaintenanceDashboard({
  title = "Property Maintenance",
  subtitle = "Requests, inspections, assets, vendors, and repair history.",
  modeLabel,
  liveData,
}: PropertyMaintenanceDashboardProps) {
  const hasLiveData = Boolean(
    liveData &&
      (liveData.assets.length > 0 ||
        liveData.issues.length > 0 ||
        liveData.assignments.length > 0),
  );

  const assets = hasLiveData ? liveData!.assets : propertyDemoAssets;
  const issues = hasLiveData ? liveData!.issues : propertyDemoIssues;
  const assignments = hasLiveData
    ? liveData!.assignments
    : propertyDemoAssignments;

  const [locationFilter, setLocationFilter] = useState<string | "all">("all");
  const [focusFilter, setFocusFilter] = useState<FocusFilter>("all");

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const asset of assets) {
      if (asset.location?.trim()) set.add(asset.location.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [assets]);

  const filteredAssets = useMemo(() => {
    let nextAssets = assets;
    if (locationFilter !== "all") {
      nextAssets = nextAssets.filter((asset) => asset.location === locationFilter);
    }
    if (focusFilter === "open_requests") {
      const assetIdsWithOpenIssues = new Set(
        issues
          .filter((issue) => issue.status !== "completed")
          .map((issue) => issue.assetId),
      );
      nextAssets = nextAssets.filter((asset) => assetIdsWithOpenIssues.has(asset.id));
    }
    return nextAssets;
  }, [assets, focusFilter, issues, locationFilter]);

  const filteredAssetIds = useMemo(
    () => new Set(filteredAssets.map((asset) => asset.id)),
    [filteredAssets],
  );

  const visibleIssues = useMemo(
    () => issues.filter((issue) => filteredAssetIds.has(issue.assetId)),
    [filteredAssetIds, issues],
  );

  const openIssues = useMemo(
    () => visibleIssues.filter((issue) => issue.status !== "completed"),
    [visibleIssues],
  );

  const inProgressIssues = useMemo(
    () => visibleIssues.filter((issue) => ["in_progress", "scheduled"].includes(issue.status)).length,
    [visibleIssues],
  );

  const inspectionFindings = useMemo(
    () =>
      visibleIssues.filter((issue) => ["safety", "compliance"].includes(issue.severity))
        .length,
    [visibleIssues],
  );

  const pendingVendorFollowUps = useMemo(
    () =>
      assignments.filter((assignment) =>
        ["blocked", "in_progress", "inspection_due"].includes(assignment.state),
      ),
    [assignments],
  );

  const recentInspectionItems = useMemo(
    () =>
      visibleIssues
        .filter((issue) => ["safety", "compliance", "recommend"].includes(issue.severity))
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 5),
    [visibleIssues],
  );

  return (
    <section className="space-y-6">
      <header className="border-b border-[color:var(--metal-border-soft)] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">
              Property operations
            </p>
            <h1 className="mt-1 text-3xl text-[color:var(--theme-text-primary)] md:text-4xl" style={{ fontFamily: "var(--font-blackops)" }}>
              {title}
            </h1>
            <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
              {subtitle}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value as typeof locationFilter)}
              className="rounded-lg border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)]"
            >
              <option value="all">All property locations</option>
              {locations.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${hasLiveData ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-100" : "border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)]"}`}>
              {modeLabel ?? (hasLiveData ? "Live data" : "Demo fallback")}
            </span>
          </div>
        </div>
      </header>

      <section className="flex flex-wrap items-center gap-2 border-b border-[color:var(--metal-border-soft)] pb-4">
        {[
          { href: "/property/requests/new", label: "New maintenance request", accent: true },
          { href: "/property/inspections/new", label: "New inspection" },
          { href: "/property/setup", label: "Property Setup" },
          { href: "/property/members", label: "Members" },
          { href: "/property/invites", label: "Invites" },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition ${action.accent ? "border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 text-[color:var(--theme-text-primary)] hover:bg-[color:var(--accent-copper)]/30" : "border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-inset)]"}`}
          >
            {action.label}
          </Link>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => setFocusFilter((prev) => (prev === "open_requests" ? "all" : "open_requests"))}
          className="rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-left"
        >
          <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Open requests</div>
          <div className="mt-1 text-3xl text-[color:var(--theme-text-primary)]">{openIssues.length}</div>
        </button>
        <div className="rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Scheduled / in progress</div>
          <div className="mt-1 text-3xl text-[color:var(--theme-text-primary)]">{inProgressIssues}</div>
        </div>
        <div className="rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Inspection issues</div>
          <div className="mt-1 text-3xl text-[color:var(--theme-text-primary)]">{inspectionFindings}</div>
        </div>
        <div className="rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">{propertyOperationsTerminology.assetPluralLabel}</div>
          <div className="mt-1 text-3xl text-[color:var(--theme-text-primary)]">{filteredAssets.length}</div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <div className="flex items-center justify-between border-b border-[color:var(--metal-border-soft)] pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)]">Requests needing attention</h2>
            <Link href={propertyOperationsRoutes.portalRequests} className="text-xs text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]">All requests</Link>
          </div>
          {openIssues.slice(0, 8).map((issue) => (
            <div key={issue.id} className="border-b border-[color:var(--theme-border-soft)] pb-2 last:border-b-0">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[color:var(--theme-text-primary)]">{issue.assetLabel}</span>
                <span className="text-[color:var(--theme-text-secondary)] uppercase">{issue.status.replaceAll("_", " ")}</span>
              </div>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{issue.summary}</p>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-[color:var(--theme-text-muted)]">
                <Link href={`/property/requests/${issue.id}`} className="hover:text-[color:var(--theme-text-primary)]">Request</Link>
                <Link href={`${propertyOperationsRoutes.assetDetailBase}/${issue.assetId}`} className="hover:text-[color:var(--theme-text-primary)]">Asset</Link>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <div className="flex items-center justify-between border-b border-[color:var(--metal-border-soft)] pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)]">Recent inspections</h2>
            <Link href="/property/inspections" className="text-xs text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]">All inspections</Link>
          </div>
          {recentInspectionItems.length > 0 ? recentInspectionItems.map((issue) => (
            <div key={issue.id} className="border-b border-[color:var(--theme-border-soft)] pb-2 last:border-b-0 text-xs">
              <div className="font-semibold text-[color:var(--theme-text-primary)]">{issue.assetLabel}</div>
              <div className="mt-1 text-[color:var(--theme-text-secondary)]">{issue.summary}</div>
              <div className="mt-1 text-[color:var(--theme-text-muted)]">{new Date(issue.createdAt).toLocaleDateString()}</div>
            </div>
          )) : <p className="text-xs text-[color:var(--theme-text-secondary)]">No recent inspection findings in current scope.</p>}
        </div>

        <div className="space-y-3 rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <div className="border-b border-[color:var(--metal-border-soft)] pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)]">Assets / properties</h2>
          </div>
          {filteredAssets.slice(0, 8).map((asset) => (
            <div key={asset.id} className="flex items-center justify-between border-b border-[color:var(--theme-border-soft)] pb-2 last:border-b-0 text-xs">
              <div>
                <div className="font-semibold text-[color:var(--theme-text-primary)]">{asset.label}</div>
                <div className="text-[color:var(--theme-text-secondary)]">{asset.location ?? "Unassigned location"}</div>
              </div>
              <Link href={`${propertyOperationsRoutes.assetDetailBase}/${asset.id}`} className="text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]">View</Link>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <div className="border-b border-[color:var(--metal-border-soft)] pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)]">Vendor follow-ups</h2>
          </div>
          {pendingVendorFollowUps.slice(0, 8).map((assignment) => (
            <div key={assignment.id} className="border-b border-[color:var(--theme-border-soft)] pb-2 last:border-b-0 text-xs">
              <div className="font-semibold text-[color:var(--theme-text-primary)]">{assignment.routeLabel}</div>
              <div className="mt-1 text-[color:var(--theme-text-secondary)]">{assignment.assetLabel} · {assignment.requesterName}</div>
              <div className="mt-1 uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">{assignment.state.replaceAll("_", " ")}</div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
