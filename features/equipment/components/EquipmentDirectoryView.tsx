"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import EquipmentSetupDialog, {
  type EquipmentCustomerOption,
  type EquipmentSetupMode,
} from "@/features/equipment/components/EquipmentSetupDialog";
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
const BUTTON =
  "min-h-10 rounded-lg border border-[color:var(--theme-border-soft)] px-4 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-50";
const PRIMARY_BUTTON =
  "min-h-10 rounded-lg bg-[color:var(--accent-copper)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

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
  if (row.primaryMeter === "odometer") {
    return row.odometer ? `${row.odometer} ${row.odometerUnit ?? ""}`.trim() : "—";
  }
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
  canManage,
  customers,
}: {
  rows: EquipmentDirectoryRow[];
  truncated: boolean;
  canManage: boolean;
  customers: EquipmentCustomerOption[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | AssetOperatingStatus>("");
  const [equipmentClass, setEquipmentClass] = useState("");
  const [setupMode, setSetupMode] = useState<EquipmentSetupMode | null>(null);

  const classes = useMemo(
    () =>
      Array.from(
        new Map(rows.map((row) => [row.equipmentClass, row.equipmentClassLabel])),
      ).sort((a, b) => a[1].localeCompare(b[1])),
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
          <div>
            <h1 className="text-2xl font-bold">Equipment assets</h1>
            <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
              Machine health, meters, PM, inspections, components and wear history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[color:var(--theme-text-muted)]">
              {filtered.length} of {rows.length}
              {truncated ? "+" : ""}
            </span>
            {canManage ? (
              <button
                className={PRIMARY_BUTTON}
                type="button"
                onClick={() => setSetupMode("create")}
              >
                Add Equipment
              </button>
            ) : null}
          </div>
        </div>
        {rows.length > 0 ? (
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
        ) : null}
      </WorkspaceHeader>

      {rows.length === 0 ? (
        <div className={`${PANEL} p-6`}>
          <p className={EYEBROW}>Start here</p>
          <h2 className="mt-1 text-xl font-bold">Add your first machine</h2>
          <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-muted)]">
            Create a machine here or enable Equipment on an asset that already exists in
            Shop. The canonical vehicle record stays the source of truth.
          </p>
          {canManage ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                className={`${PANEL} p-4 text-left hover:bg-[color:var(--theme-surface-overlay)]`}
                onClick={() => setSetupMode("create")}
              >
                <span className="block font-semibold">Create equipment</span>
                <span className="mt-1 block text-xs text-[color:var(--theme-text-muted)]">
                  Create a canonical Shop asset, then attach its Equipment profile.
                </span>
              </button>
              <button
                type="button"
                className={`${PANEL} p-4 text-left hover:bg-[color:var(--theme-surface-overlay)]`}
                onClick={() => setSetupMode("adopt")}
              >
                <span className="block font-semibold">Add existing asset</span>
                <span className="mt-1 block text-xs text-[color:var(--theme-text-muted)]">
                  Keep the existing Shop asset and enable Equipment on it.
                </span>
              </button>
            </div>
          ) : (
            <EmptyState>Ask an owner or manager to add Equipment assets.</EmptyState>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState>No assets match these filters.</EmptyState>
      ) : (
        <>
          {canManage ? (
            <div className="flex justify-end">
              <button type="button" className={BUTTON} onClick={() => setSetupMode("adopt")}>
                Add existing asset
              </button>
            </div>
          ) : null}

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

          <div className={`${PANEL} hidden overflow-x-auto lg:block`}>
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                <tr>
                  {["Unit", "Make / model", "Serial", "Meter", "Customer / site", "Status", "Defects", "PM", "Last service", "Next service", "Active WO"].map((heading) => (
                    <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.assetId} className="border-t border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-overlay)]">
                    <td className="px-3 py-2 font-semibold"><Link href={row.href} className="hover:underline">{row.unitNumber ?? "—"}</Link></td>
                    <td className="px-3 py-2">
                      <Link href={row.href} className="hover:underline">{[row.year, row.make, row.model].filter(Boolean).join(" ") || "—"}</Link>
                      <div className="text-xs text-[color:var(--theme-text-muted)]">{row.equipmentClassLabel}</div>
                    </td>
                    <td className="px-3 py-2">{row.serialNumber ?? "—"}</td>
                    <td className="px-3 py-2">{meterText(row)}</td>
                    <td className="px-3 py-2">
                      <div>{row.customerName ?? "—"}</div>
                      {row.siteName ? <div className="text-xs text-[color:var(--theme-text-muted)]">{row.siteName}</div> : null}
                    </td>
                    <td className={`px-3 py-2 font-semibold ${STATUS_TONE[row.operatingStatus]}`}>{ASSET_OPERATING_STATUS_LABELS[row.operatingStatus]}</td>
                    <td className="px-3 py-2">{defectsText(row)}</td>
                    <td className={`px-3 py-2 ${PM_TONE[row.pm.state]}`}>{pmText(row)}</td>
                    <td className="px-3 py-2">{formatDate(row.lastServiceAt)}</td>
                    <td className="px-3 py-2">{formatDate(row.nextService?.startsAt ?? null)}</td>
                    <td className="px-3 py-2">
                      {row.activeWorkOrder?.href ? (
                        <Link href={row.activeWorkOrder.href} className="hover:underline">
                          {row.activeWorkOrder.title}
                          <span className="block text-xs text-[color:var(--theme-text-muted)]">{row.activeWorkOrder.status}</span>
                        </Link>
                      ) : row.activeWorkOrder ? (
                        <span>{row.activeWorkOrder.title}<span className="block text-xs text-[color:var(--theme-text-muted)]">{row.activeWorkOrder.status}</span></span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {setupMode ? (
        <EquipmentSetupDialog
          mode={setupMode}
          customers={customers}
          onClose={() => setSetupMode(null)}
        />
      ) : null}
    </WorkspaceShell>
  );
}
