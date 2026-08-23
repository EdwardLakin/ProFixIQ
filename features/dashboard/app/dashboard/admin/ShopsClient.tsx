"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RouteLoadPanel from "@/features/shared/components/ui/RouteLoadPanel";
import {
  asRouteLoadFailure,
  routeLoadFailureFromStatus,
  runBoundedRouteLoad,
  type RouteLoadFailure,
} from "@/features/shared/lib/route-load";
import {
  filterOwnerShopDirectoryRows,
  type OwnerShopDirectoryRow,
  type OwnerShopHealthFilter,
} from "@/features/dashboard/lib/ownerShopDirectory";
import {
  AdminBadge,
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPageShell,
  AdminPanel,
  AdminPanelTitle,
  AdminStatCard,
  AdminStatGrid,
  AdminToolbar,
} from "@/features/dashboard/app/dashboard/admin/AdminSurface";

type ShopDirectoryResponse = {
  shops: OwnerShopDirectoryRow[];
  secondary: {
    profileHealth: "available" | "unavailable";
    ownerSummary: "available" | "unavailable";
  };
  warnings: string[];
  requestId: string;
  loadedAt: string;
};

function isShopDirectoryResponse(
  value: unknown,
): value is ShopDirectoryResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ShopDirectoryResponse>;
  return (
    Array.isArray(record.shops) &&
    Array.isArray(record.warnings) &&
    typeof record.requestId === "string" &&
    typeof record.loadedAt === "string" &&
    Boolean(record.secondary)
  );
}

export default function AdminShopsClient() {
  const [directory, setDirectory] = useState<ShopDirectoryResponse | null>(
    null,
  );
  const [loadFailure, setLoadFailure] = useState<RouteLoadFailure | null>(null);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] =
    useState<OwnerShopHealthFilter>("all");

  const load = useCallback(async () => {
    setLoadFailure(null);
    try {
      const nextDirectory = await runBoundedRouteLoad(
        { route: "/dashboard/admin/shops", operation: "load shop directory" },
        async ({ signal, recordStatus }) => {
          const response = await fetch("/api/admin/shops", {
            cache: "no-store",
            credentials: "same-origin",
            signal,
          });
          recordStatus(response.status);
          const serverRequestId =
            response.headers.get("x-request-id")?.trim() || undefined;
          const body: unknown = await response.json().catch(() => null);

          if (!response.ok) {
            const message =
              body &&
              typeof body === "object" &&
              "error" in body &&
              typeof body.error === "string"
                ? body.error
                : "The shop directory could not be loaded.";
            throw routeLoadFailureFromStatus(
              response.status,
              message,
              serverRequestId,
            );
          }
          if (!isShopDirectoryResponse(body)) {
            throw new Error("Invalid shop directory response");
          }
          return body;
        },
      );
      setDirectory(nextDirectory);
    } catch (error) {
      setLoadFailure(
        asRouteLoadFailure(error, "The shop directory could not be loaded."),
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    return filterOwnerShopDirectoryRows(
      directory?.shops ?? [],
      search,
      healthFilter,
    );
  }, [directory?.shops, healthFilter, search]);

  const summary = useMemo(() => {
    const allRows = directory?.shops ?? [];
    const needsProfile = allRows.filter(
      (row) => row.health === "Needs profile",
    ).length;
    const withOwner = allRows.filter((row) => !!row.ownerId).length;

    return {
      total: allRows.length,
      needsProfile,
      withOwner,
      visible: filteredRows.length,
    };
  }, [directory?.shops, filteredRows.length]);

  const hasSecondaryWarning = Boolean(directory?.warnings.length);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Tenant Oversight"
        title="Shops"
        subtitle="Shops is the governance view for tenant identity completeness, ownership posture, and baseline operating metadata."
      />

      <AdminPanel>
        <AdminPanelTitle
          title="Shop Governance Summary"
          description="Highlights for fast oversight triage."
        />
        <AdminStatGrid>
          <AdminStatCard
            label="Shops"
            value={directory ? summary.total : "—"}
          />
          <AdminStatCard
            label="Needs profile follow-up"
            value={
              !directory
                ? "—"
                : directory.secondary.profileHealth === "available"
                  ? summary.needsProfile
                  : "Unavailable"
            }
            hint="Missing profile email, phone, or shop timezone"
          />
          <AdminStatCard
            label="Has owner assigned"
            value={directory ? summary.withOwner : "—"}
          />
          <AdminStatCard
            label="Visible rows"
            value={directory ? summary.visible : "—"}
          />
        </AdminStatGrid>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Filter Shop Directory"
          description="Search key identity fields and narrow by profile health for practical follow-up."
        />
        <AdminToolbar>
          <AdminField label="Search" className="flex-1">
            <input
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-orange-400/70"
              placeholder="Search shop, city, or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </AdminField>
          <AdminField label="Health" className="w-full md:w-56">
            <select
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-orange-400/70"
              value={healthFilter}
              onChange={(event) =>
                setHealthFilter(event.target.value as OwnerShopHealthFilter)
              }
            >
              <option value="all">All shops</option>
              <option value="Complete">Complete profile</option>
              <option value="Needs profile">Needs profile</option>
              <option value="Unavailable">Health unavailable</option>
            </select>
          </AdminField>
        </AdminToolbar>

        {hasSecondaryWarning ? (
          <div className="mx-4 mb-4 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            <p>{directory?.warnings.join(" ")}</p>
            <p className="mt-1 text-[color:var(--theme-text-secondary)]">
              The directory remains available. Request reference:{" "}
              {directory?.requestId}
            </p>
          </div>
        ) : null}

        {loadFailure ? (
          <div className="px-4 pb-4">
            <RouteLoadPanel
              failure={loadFailure}
              onRetry={() => void load()}
              title="Shop directory unavailable"
            />
          </div>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Shop Directory"
          description="Review key metadata and governance posture before taking follow-up action."
          action={
            <Link
              href="/dashboard/workforce/people"
              className="text-xs font-medium text-[color:var(--theme-accent-text)]"
            >
              Validate owner/staff posture →
            </Link>
          }
        />

        {!directory && !loadFailure ? (
          <AdminEmptyState
            title="Loading shops"
            body="Reading tenant shop records."
          />
        ) : !directory ? null : directory.shops.length === 0 ? (
          <AdminEmptyState
            title="No shops are configured"
            body="The tenant-scoped directory returned no shop records. Retry or contact support with the request reference below."
          />
        ) : filteredRows.length === 0 ? (
          <AdminEmptyState
            title="No shops match these filters"
            body="Clear the search or health filter to return to the full directory."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[color:var(--theme-surface-inset)] text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Shop</th>
                  <th className="px-4 py-2.5 text-left">Location</th>
                  <th className="px-4 py-2.5 text-left">Contact</th>
                  <th className="px-4 py-2.5 text-left">Plan</th>
                  <th className="px-4 py-2.5 text-left">Owner</th>
                  <th className="px-4 py-2.5 text-left">Health</th>
                  <th className="px-4 py-2.5 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
                {filteredRows.map((shop) => (
                  <tr
                    key={shop.id}
                    className="text-[color:var(--theme-text-primary)]"
                  >
                    <td className="px-4 py-2.5 font-medium text-[color:var(--theme-text-primary)]">
                      {shop.name}
                    </td>
                    <td className="px-4 py-2.5">
                      {[shop.city, shop.province].filter(Boolean).join(", ") ||
                        "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[color:var(--theme-text-secondary)]">
                      <p>{shop.email ?? "No email"}</p>
                      <p>{shop.phone ?? "No phone"}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      {shop.plan.source === "restricted"
                        ? "Owner only"
                        : shop.plan.label}
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminBadge>
                        {!shop.ownerId
                          ? "Missing owner"
                          : !shop.ownerSummaryAvailable
                            ? "Assigned · summary unavailable"
                            : (shop.ownerName ?? shop.ownerEmail ?? "Assigned")}
                      </AdminBadge>
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminBadge>{shop.health}</AdminBadge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[color:var(--theme-text-secondary)]">
                      {shop.createdAt
                        ? new Date(shop.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {directory ? (
          <div className="border-t border-[color:var(--theme-border-soft)] px-4 py-2 text-[11px] text-[color:var(--theme-text-muted)]">
            Last updated {new Date(directory.loadedAt).toLocaleString()} ·
            Request {directory.requestId}
          </div>
        ) : loadFailure?.requestId ? (
          <div className="border-t border-[color:var(--theme-border-soft)] px-4 py-2 text-[11px] text-[color:var(--theme-text-muted)]">
            Request reference: {loadFailure.requestId}
          </div>
        ) : null}
      </AdminPanel>
    </AdminPageShell>
  );
}
