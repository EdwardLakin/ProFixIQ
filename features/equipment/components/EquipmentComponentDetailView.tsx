"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  COMPONENT_EVENT_LABELS,
  COMPONENT_POSITION_LABELS,
  COMPONENT_STATUS_LABELS,
  COMPONENT_TYPE_LABELS,
  type EquipmentComponentDetail,
} from "@/features/equipment/lib/components";
import type { VehicleWorkspaceSearchResponse } from "@/features/vehicles/lib/vehicleWorkspace";
import {
  WorkspaceEmptyState as EmptyState,
  WorkspaceHeader,
  WorkspaceSection,
  WorkspaceShell,
  WorkspaceStatus,
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_ITEM as ITEM,
} from "@/features/workspace/components";

const INPUT =
  "w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:ring-2 focus:ring-[color:var(--accent-copper)]/50";
const LABEL = "text-xs font-semibold text-[color:var(--theme-text-muted)]";
const BUTTON =
  "min-h-9 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-50";
const PRIMARY_BUTTON =
  "min-h-9 rounded-lg bg-[color:var(--accent-copper)] px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

type Mode = null | "install" | "edit" | "rebuilt" | "repaired" | "inspected" | "remove" | "scrapped";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function display(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

const FIELD_LABELS: Record<string, string> = {
  component_type: "Type",
  position: "Position",
  label: "Name",
  manufacturer: "Manufacturer",
  model: "Model",
  serial_number: "Serial number",
  part_number: "Part number",
  attributes: "Attributes",
};

function changeText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

async function readError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? "The request could not be completed.";
}

function AssetSearch({ onPick }: { onPick: (asset: { id: string; label: string }) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/vehicles/search?q=${encodeURIComponent(trimmed)}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) =>
          response.ok ? ((await response.json()) as VehicleWorkspaceSearchResponse) : null,
        )
        .then((payload) => {
          if (!payload) return;
          setResults(
            payload.groups
              .flatMap((group) => group.vehicles)
              .slice(0, 8)
              .map((card) => ({
                id: card.vehicle.id,
                label:
                  [
                    card.vehicle.unitNumber ? `Unit ${card.vehicle.unitNumber}` : null,
                    [card.vehicle.year, card.vehicle.make, card.vehicle.model].filter(Boolean).join(" "),
                  ]
                    .filter(Boolean)
                    .join(" · ") || card.vehicle.vin || "Asset",
              })),
          );
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="space-y-1">
      <input
        className={INPUT}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search unit #, VIN or make"
        aria-label="Search asset"
      />
      {results.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto rounded-lg border border-[color:var(--theme-border-soft)]">
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--theme-surface-overlay)]"
                onClick={() => {
                  onPick(result);
                  setQuery("");
                  setResults([]);
                }}
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A component's identity and its full history across every machine it has
 * served on. Facts only; the technician decides what the history means.
 */
export default function EquipmentComponentDetailView({
  detail,
  canEdit,
}: {
  detail: EquipmentComponentDetail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { component, asset, history } = detail;
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState<{ id: string; label: string } | null>(null);
  const [position, setPosition] = useState(component.position ?? "");
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [targetStatus, setTargetStatus] = useState<"in_stock" | "in_repair">("in_stock");
  const [fields, setFields] = useState({
    label: component.label,
    serialNumber: component.serialNumber ?? "",
    partNumber: component.partNumber ?? "",
    manufacturer: component.manufacturer ?? "",
    model: component.model ?? "",
  });

  const editable = canEdit && component.status !== "scrapped";
  const installed = component.status === "installed";

  // One key per opened form: retries of a lost response cannot double-record.
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());

  const reset = () => {
    setOperationKey(crypto.randomUUID());
    setMode(null);
    setError(null);
    setNotes("");
    setOccurredAt("");
    setTarget(null);
  };

  const send = async (url: string, method: "POST" | "PATCH", body: unknown) => {
    setBusy(true);
    setError(null);
    const response = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!response) return setError("Network error. Try again.");
    if (!response.ok) return setError(await readError(response));
    reset();
    router.refresh();
  };

  const submit = () => {
    if (mode === "edit") {
      return send(`/api/equipment/components/${component.id}`, "PATCH", {
        componentType: component.componentType,
        position: component.position,
        label: fields.label || null,
        serialNumber: fields.serialNumber || null,
        partNumber: fields.partNumber || null,
        manufacturer: fields.manufacturer || null,
        model: fields.model || null,
        attributes: component.attributes,
      });
    }
    if (mode === "install" && !target) return setError("Choose the asset to install on.");
    return send(`/api/equipment/components/${component.id}/actions`, "POST", {
      action: mode === "install" ? "install" : mode,
      assetId: mode === "install" ? target?.id : null,
      position: mode === "install" ? position || null : null,
      notes: notes || null,
      occurredAt: occurredAt || null,
      targetStatus,
      operationKey,
    });
  };

  const typeLabel =
    COMPONENT_TYPE_LABELS[component.componentType as keyof typeof COMPONENT_TYPE_LABELS] ??
    component.componentType;

  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={EYEBROW}>Equipment component</p>
        <h1 className="mt-1 text-2xl font-bold">{component.displayName}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <WorkspaceStatus>{typeLabel}</WorkspaceStatus>
          <WorkspaceStatus>{COMPONENT_STATUS_LABELS[component.status]}</WorkspaceStatus>
          {component.serialNumber ? <WorkspaceStatus>S/N {component.serialNumber}</WorkspaceStatus> : null}
        </div>
        <div className="mt-3">
          <Link href="/equipment" className="text-sm underline">
            Equipment directory
          </Link>
        </div>
      </WorkspaceHeader>

      <WorkspaceSection headingId="component-identity" eyebrow="Identity" title="Component">
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          {[
            ["Type", typeLabel],
            [
              "Position",
              component.position
                ? COMPONENT_POSITION_LABELS[component.position as keyof typeof COMPONENT_POSITION_LABELS] ??
                  component.position
                : "—",
            ],
            ["Status", COMPONENT_STATUS_LABELS[component.status]],
            ["Serial number", display(component.serialNumber)],
            ["Part number", display(component.partNumber)],
            ["Manufacturer / model", display([component.manufacturer, component.model].filter(Boolean).join(" "))],
            ["Component hours", component.componentHours !== null ? component.componentHours.toLocaleString() : "—"],
            ["Installed", formatDate(component.installedAt)],
          ].map(([term, value]) => (
            <div key={term}>
              <dt className={LABEL}>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div>
            <dt className={LABEL}>Current asset</dt>
            <dd>
              {asset ? (
                <Link href={asset.href} className="underline">
                  {asset.label}
                </Link>
              ) : installed ? (
                "Installed"
              ) : (
                "Not installed"
              )}
            </dd>
          </div>
        </dl>

        {editable ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={BUTTON} onClick={() => setMode("install")}>
              {installed ? "Move to another asset" : "Install on asset"}
            </button>
            {installed ? (
              <button type="button" className={BUTTON} onClick={() => setMode("remove")}>
                Remove from asset
              </button>
            ) : null}
            <button type="button" className={BUTTON} onClick={() => setMode("rebuilt")}>
              Record rebuild
            </button>
            <button type="button" className={BUTTON} onClick={() => setMode("repaired")}>
              Record repair
            </button>
            <button type="button" className={BUTTON} onClick={() => setMode("inspected")}>
              Record inspection
            </button>
            <button type="button" className={BUTTON} onClick={() => setMode("edit")}>
              Edit details
            </button>
            <button type="button" className={BUTTON} onClick={() => setMode("scrapped")}>
              Scrap
            </button>
          </div>
        ) : null}

        {mode ? (
          <div className="mt-3 grid gap-2 rounded-lg border border-[color:var(--theme-border-soft)] p-3 sm:grid-cols-2">
            {mode === "install" ? (
              <>
                <div className="grid gap-1 sm:col-span-2">
                  <span className={LABEL}>Asset</span>
                  {target ? (
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm">{target.label}</span>
                      <button type="button" className={BUTTON} onClick={() => setTarget(null)}>
                        Change
                      </button>
                    </div>
                  ) : (
                    <AssetSearch onPick={setTarget} />
                  )}
                </div>
                <label className="grid gap-1">
                  <span className={LABEL}>Position</span>
                  <select className={INPUT} value={position} onChange={(event) => setPosition(event.target.value)}>
                    <option value="">None</option>
                    {Object.entries(COMPONENT_POSITION_LABELS).map(([value, text]) => (
                      <option key={value} value={value}>{text}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            {mode === "edit" ? (
              (
                [
                  ["label", "Name", 120],
                  ["serialNumber", "Serial number", 80],
                  ["partNumber", "Part number", 80],
                  ["manufacturer", "Manufacturer", 80],
                  ["model", "Model", 80],
                ] as const
              ).map(([key, text, max]) => (
                <label key={key} className="grid gap-1">
                  <span className={LABEL}>{text}</span>
                  <input
                    className={INPUT}
                    maxLength={max}
                    value={fields[key]}
                    onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))}
                  />
                </label>
              ))
            ) : (
              <>
                {mode === "remove" ? (
                  <label className="grid gap-1">
                    <span className={LABEL}>Send to</span>
                    <select
                      className={INPUT}
                      value={targetStatus}
                      onChange={(event) => setTargetStatus(event.target.value as "in_stock" | "in_repair")}
                    >
                      <option value="in_stock">{COMPONENT_STATUS_LABELS.in_stock}</option>
                      <option value="in_repair">{COMPONENT_STATUS_LABELS.in_repair}</option>
                    </select>
                  </label>
                ) : null}
                <label className="grid gap-1">
                  <span className={LABEL}>Date (optional, defaults to now)</span>
                  <input type="date" className={INPUT} value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
                </label>
                <label className="grid gap-1 sm:col-span-2">
                  <span className={LABEL}>Notes</span>
                  <textarea className={INPUT} rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
                </label>
              </>
            )}

            {mode === "scrapped" ? (
              <p className="text-xs text-[color:var(--theme-text-muted)] sm:col-span-2">
                Scrapping retires this component permanently. Its history is kept.
              </p>
            ) : null}
            {error ? <p className="text-xs text-red-400 sm:col-span-2" role="alert">{error}</p> : null}
            <div className="flex gap-2 sm:col-span-2">
              <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void submit()}>
                {busy ? "Saving…" : mode === "scrapped" ? "Scrap component" : "Save"}
              </button>
              <button type="button" className={BUTTON} disabled={busy} onClick={reset}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </WorkspaceSection>

      <WorkspaceSection
        headingId="component-history"
        eyebrow="History"
        title="History across machines"
        summary={`${history.length} events`}
      >
        {history.length ? (
          <ul className="mt-3 grid gap-2">
            {history.map((event) => (
              <li key={event.id} className={ITEM}>
                <p className="text-sm font-semibold">
                  {COMPONENT_EVENT_LABELS[event.eventType] ?? event.eventType} · {formatDate(event.occurredAt)}
                </p>
                <p className="text-xs text-[color:var(--theme-text-muted)]">
                  {[
                    event.asset ? event.asset.label : null,
                    event.assetHours !== null ? `Asset ${event.assetHours.toLocaleString()} h` : null,
                    event.componentHours !== null ? `Component ${event.componentHours.toLocaleString()} h` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                {event.asset ? (
                  <Link href={event.asset.href} className="text-xs underline">
                    Open asset
                  </Link>
                ) : null}
                {event.details ? (
                  <ul className="mt-1 text-xs">
                    {Object.entries(event.details).map(([field, change]) => (
                      <li key={field}>
                        {FIELD_LABELS[field] ?? field}: {changeText(change.from)} → {changeText(change.to)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {event.notes ? <p className="mt-1 text-sm">{event.notes}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No history recorded.</EmptyState>
        )}
      </WorkspaceSection>
    </WorkspaceShell>
  );
}
