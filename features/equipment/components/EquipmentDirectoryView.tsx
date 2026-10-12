"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ASSET_OPERATING_STATUSES,
  ASSET_OPERATING_STATUS_LABELS,
  type AssetOperatingStatus,
} from "@/features/equipment/lib/assetProfile";
import {
  EQUIPMENT_PM_STATE_LABELS,
  equipmentAssetTitle,
  type EquipmentDirectoryRow,
  type EquipmentPmState,
} from "@/features/equipment/lib/equipmentDirectory";
import {
  WorkspaceEmptyState as EmptyState,
  WorkspaceHeader,
  WorkspaceShell,
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_PANEL as PANEL,
} from "@/features/workspace/components";

const INPUT =
  "min-h-10 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm text-[color:var(--theme-text-primary)] outline-none focus:ring-2 focus:ring-[color:var(--accent-copper)]/50";

const STATUS_TONE: Record<AssetOperatingStatus, string> = {
  operational: "text-emerald-400",
  limited: "text-amber-400",
  down: "text-red-400",
  standby: "text-sky-400",
  out_of_service: "text-red-400",
  retired: "text-[color:var(--theme-text-muted)]",
};

const PM_TONE: Record<EquipmentPmState, string> = {
  overdue: "text-red-400",
  due: "text-amber-400",
  ok: "text-emerald-400",
  not_evaluated: "text-[color:var(--theme-text-muted)]",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function meterText(row: EquipmentDirectoryRow): string {
  if (row.primaryMeter === "odometer") return row.odometer ?? "—";
  if (row.primaryMeter === "cycles") {
    return row.currentCycles == null ? "—" : `${row.currentCycles.toLocaleString()} cycles`;
  }
  return row.engineHours == null ? "—" : `${row.engineHours.toLocaleString()} h`;
}

function defectsText(row: EquipmentDirectoryRow): string {
  if (!row.openDefects.total) return "None";
  return row.openDefects.failed
    ? `${row.openDefects.total} (${row.openDefects.failed} failed)`
    : String(row.openDefects.total);
}

function pmText(row: EquipmentDirectoryRow): string {
  const label = EQUIPMENT_PM_STATE_LABELS[row.pm.state];
  return row.pm.dueCount ? `${label} · ${row.pm.dueCount}` : label;
}

export default function EquipmentDirectoryView({
  rows,
  truncated,
}: {
  rows: EquipmentDirectoryRow[];
  truncated: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | AssetOperatingStatus>("");
  const [equipmentClass, setEquipmentClass] = useState("");

  const classes = useMemo(
    () =>
      Array.from(new Map(rows.map((row) => [row.equipmentClass, row.equipmentClassLabel])))
        .sort((a, b) => a[1].localeCompare(b[1])),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status && row.operatingStatus !== status) return false;
      if (equipmentClass && row.equipmentClass !== equipmentClass) return false;
      if (!needle) return true;
      return [
        row.unitNumber,
        row.make,
        row.model,
        row.serialNumber,
        row.customerName,
        row.siteName,
        row.equipmentClassLabel,
      ].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [equipmentClass, query, rows, status]);

  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={EYEBROW}>Equipment</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-bold">Equipment assets</h1>
          <span className="text-xs text-[color:var(--theme-text-muted)]">
            {filtered.length} of {rows.length}
            {truncated ? "+ (showing the most recently updated)" : ""}
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            className={INPUT}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search unit, make, model, serial, customer or site"
            aria-label="Search Equipment assets"
          />
          <select
            className={INPUT}
            value={equipmentClass}
            onChange={(event) => setEquipmentClass(event.target.value)}
            aria-label="Filter by equipment class"
          >
            <option value="">All classes</option>
            {classes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className={INPUT}
            value={status}
            onChange={(event) => setStatus(event.target.value as "" | AssetOperatingStatus)}
            aria-label="Filter by operating status"
          >
            <option value="">All statuses</option>
            {ASSET_OPERATING_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ASSET_OPERATING_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </WorkspaceHeader>

      {rows.length === 0 ? (
        <EmptyState>
          No Equipment assets yet. Open any asset from{" "}
          <Link className="font-semibold underline" href="/vehicles">
            Vehicle Files
          </Link>{" "}
          and choose “Set up Equipment profile” to add it here.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>No assets match these filters.</EmptyState>
      ) : (
        <>
          {/* Phone / narrow tablet: cards */}
          <ul className="grid gap-3 lg:hidden">
            {filtered.map((row) => (
              <li key={row.assetId}>
                <Link href={row.href} className={`${PANEL} block p-4`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{equipmentAssetTitle(row)}</p>
                      <p className="text-xs text-[color:var(--theme-text-muted)]">
                        {row.equipmentClassLabel}
                        {row.serialNumber ? ` · S/N ${row.serialNumber}` : ""}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold ${STATUS_TONE[row.operatingStatus]}`}>
                      {ASSET_OPERATING_STATUS_LABELS[row.operatingStatus]}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-[color:var(--theme-text-muted)]">Meter</dt>
                    <dd>{meterText(row)}</dd>
                    <dt className="text-[color:var(--theme-text-muted)]">Customer / site</dt>
                    <dd className="truncate">
                      {[row.customerName, row.siteName].filter(Boolean).join(" · ") || "—"}
                    </dd>
                    <dt className="text-[color:var(--theme-text-muted)]">Defects</dt>
                    <dd>{defectsText(row)}</dd>
                    <dt className="text-[color:var(--theme-text-muted)]">PM</dt>
                    <dd className={PM_TONE[row.pm.state]}>{pmText(row)}</dd>
                    <dt className="text-[color:var(--theme-text-muted)]">Active WO</dt>
                    <dd className="truncate">{row.activeWorkOrder?.title ?? "—"}</dd>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop / landscape tablet: table */}
          <div className={`${PANEL} hidden overflow-x-auto lg:block`}>
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                <tr>
                  {[
                    "Unit",
                    "Make / model",
                    "Serial",
                    "Meter",
                    "Customer / site",
                    "Status",
                    "Defects",
                    "PM",
                    "Last service",
                    "Next service",
                    "Active WO",
                  ].map((heading) => (
                    <th key={heading} className="px-3 py-2 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.assetId}
                    className="border-t border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-overlay)]"
                  >
                    <td className="px-3 py-2 font-semibold">
                      <Link href={row.href} className="hover:underline">
                        {row.unitNumber ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={row.href} className="hover:underline">
                        {[row.year, row.make, row.model].filter(Boolean).join(" ") || "—"}
                      </Link>
                      <div className="text-xs text-[color:var(--theme-text-muted)]">
                        {row.equipmentClassLabel}
                      </div>
                    </td>
                    <td className="px-3 py-2">{row.serialNumber ?? "—"}</td>
                    <td className="px-3 py-2">{meterText(row)}</td>
                    <td className="px-3 py-2">
                      <div>{row.customerName ?? "—"}</div>
                      {row.siteName ? (
                        <div className="text-xs text-[color:var(--theme-text-muted)]">
                          {row.siteName}
                        </div>
                      ) : null}
                    </td>
                    <td className={`px-3 py-2 font-semibold ${STATUS_TONE[row.operatingStatus]}`}>
                      {ASSET_OPERATING_STATUS_LABELS[row.operatingStatus]}
                    </td>
                    <td className="px-3 py-2">{defectsText(row)}</td>
                    <td className={`px-3 py-2 ${PM_TONE[row.pm.state]}`}>{pmText(row)}</td>
                    <td className="px-3 py-2">{formatDate(row.lastServiceAt)}</td>
                    <td className="px-3 py-2">{formatDate(row.nextService?.startsAt ?? null)}</td>
                    <td className="px-3 py-2">
                      {row.activeWorkOrder ? (
                        <Link href={row.activeWorkOrder.href} className="hover:underline">
                          {row.activeWorkOrder.title}
                          <span className="block text-xs text-[color:var(--theme-text-muted)]">
                            {row.activeWorkOrder.status}
                          </span>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </WorkspaceShell>
  );
}
