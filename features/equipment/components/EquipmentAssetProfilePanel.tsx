"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ASSET_EQUIPMENT_CLASS_OPTIONS,
  ASSET_OPERATING_STATUSES,
  ASSET_OPERATING_STATUS_LABELS,
  ASSET_PRIMARY_METERS,
  ASSET_PRIMARY_METER_LABELS,
  type EquipmentAssetRecord,
} from "@/features/equipment/lib/assetProfile";
import type { VehicleWorkspaceSearchResponse } from "@/features/vehicles/lib/vehicleWorkspace";
import {
  WorkspaceEmptyState as EmptyState,
  WorkspaceSection,
  WORKSPACE_ITEM as ITEM,
} from "@/features/workspace/components";

type LoadState =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; record: EquipmentAssetRecord; canEdit: boolean };

type AttributeRow = { key: string; value: string };

type FormState = {
  equipmentClass: string;
  serialNumber: string;
  pin: string;
  engineMake: string;
  engineModel: string;
  engineSerial: string;
  primaryMeter: string;
  engineHours: string;
  odometer: string;
  currentCycles: string;
  siteName: string;
  operatingStatus: string;
  mountedOnAssetId: string;
  mountedOnLabel: string;
  attributes: AttributeRow[];
};

const INPUT =
  "w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:ring-2 focus:ring-[color:var(--accent-copper)]/50";
const LABEL = "text-xs font-semibold text-[color:var(--theme-text-muted)]";
const BUTTON =
  "min-h-9 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-50";
const PRIMARY_BUTTON =
  "min-h-9 rounded-lg bg-[color:var(--accent-copper)] px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

function toForm(record: EquipmentAssetRecord): FormState {
  const { asset, profile } = record;
  return {
    equipmentClass: profile?.equipmentClass ?? "",
    serialNumber: profile?.serialNumber ?? "",
    pin: profile?.pin ?? asset.vin ?? "",
    engineMake: profile?.engineMake ?? "",
    engineModel: profile?.engineModel ?? "",
    engineSerial: profile?.engineSerial ?? "",
    primaryMeter: profile?.primaryMeter ?? "hours",
    engineHours: asset.engineHours === null ? "" : String(asset.engineHours),
    odometer: asset.odometer ?? "",
    currentCycles: profile?.currentCycles == null ? "" : String(profile.currentCycles),
    siteName: profile?.siteName ?? "",
    operatingStatus: profile?.operatingStatus ?? "operational",
    mountedOnAssetId: profile?.mountedOnAssetId ?? "",
    mountedOnLabel: profile?.mountedOnAssetId ? "Linked host asset" : "",
    attributes: Object.entries(profile?.attributes ?? {}).map(([key, value]) => ({
      key,
      value: value === null ? "" : String(value),
    })),
  };
}

function toPayload(form: FormState) {
  const attributes: Record<string, string> = {};
  for (const row of form.attributes) {
    const key = row.key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (key) attributes[key] = row.value.trim();
  }
  return {
    equipmentClass: form.equipmentClass,
    serialNumber: form.serialNumber,
    pin: form.pin,
    engineMake: form.engineMake,
    engineModel: form.engineModel,
    engineSerial: form.engineSerial,
    primaryMeter: form.primaryMeter,
    engineHours: form.engineHours.trim() === "" ? null : form.engineHours,
    odometer: form.odometer.trim() === "" ? null : form.odometer,
    currentCycles: form.currentCycles.trim() === "" ? null : form.currentCycles,
    siteName: form.siteName,
    operatingStatus: form.operatingStatus,
    mountedOnAssetId: form.mountedOnAssetId || null,
    attributes,
  };
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (char) => char.toUpperCase());
}

function display(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function HostAssetPicker({
  assetId,
  value,
  label,
  onChange,
}: {
  assetId: string;
  value: string;
  label: string;
  onChange: (id: string, label: string) => void;
}) {
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
              .filter((card) => card.vehicle.id !== assetId)
              .slice(0, 8)
              .map((card) => ({
                id: card.vehicle.id,
                label:
                  [
                    card.vehicle.unitNumber ? `Unit ${card.vehicle.unitNumber}` : null,
                    [card.vehicle.year, card.vehicle.make, card.vehicle.model]
                      .filter(Boolean)
                      .join(" "),
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
  }, [assetId, query]);

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <span className="truncate text-sm">{label || "Linked host asset"}</span>
        <button type="button" className={BUTTON} onClick={() => onChange("", "")}>
          Detach
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <input
        className={INPUT}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search unit #, VIN or make (attachments only)"
        aria-label="Search host asset"
      />
      {results.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto rounded-lg border border-[color:var(--theme-border-soft)]">
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--theme-surface-overlay)]"
                onClick={() => {
                  onChange(result.id, result.label);
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
 * Equipment asset profile panel for the canonical vehicle/asset workspace.
 * Renders nothing for shops without the Equipment add-on.
 */
export default function EquipmentAssetProfilePanel({ assetId }: { assetId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ kind: "loading" });

    void fetch(`/api/equipment/assets/${assetId}/profile`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          entitled?: boolean;
          canEdit?: boolean;
          error?: string;
        } & Partial<EquipmentAssetRecord>;
        if (!active) return;
        if (response.ok && payload.entitled === false) {
          setState({ kind: "hidden" });
          return;
        }
        if (!response.ok || !payload.asset) {
          // 401/403/404 mean this viewer has no Equipment view of this asset.
          if ([401, 403, 404].includes(response.status)) {
            setState({ kind: "hidden" });
            return;
          }
          setState({
            kind: "error",
            message: payload.error ?? "Equipment profile could not be loaded.",
          });
          return;
        }
        setState({
          kind: "ready",
          record: { asset: payload.asset, profile: payload.profile ?? null },
          canEdit: payload.canEdit === true,
        });
      })
      .catch((error) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setState({ kind: "error", message: "Equipment profile could not be loaded." });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [assetId, attempt]);

  const save = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/equipment/assets/${assetId}/profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      } & Partial<EquipmentAssetRecord>;
      if (!response.ok || !payload.asset) {
        setSaveError(payload.error ?? "The Equipment profile could not be saved.");
        return;
      }
      setState({
        kind: "ready",
        record: { asset: payload.asset, profile: payload.profile ?? null },
        canEdit: true,
      });
      setForm(null);
    } catch {
      setSaveError("The Equipment profile could not be saved. Check your connection.");
    } finally {
      setSaving(false);
    }
  }, [assetId, form]);

  const selectedFamily = useMemo(
    () =>
      ASSET_EQUIPMENT_CLASS_OPTIONS.find((option) => option.value === form?.equipmentClass)
        ?.family ?? null,
    [form?.equipmentClass],
  );

  if (state.kind === "hidden") return null;

  const update = (patch: Partial<FormState>) =>
    setForm((current) => (current ? { ...current, ...patch } : current));

  return (
    <WorkspaceSection
      headingId="equipment-profile-heading"
      eyebrow="Equipment"
      title="Equipment profile"
      summary={
        state.kind === "ready" && state.record.profile
          ? state.record.profile.equipmentClassLabel
          : undefined
      }
    >
      <div className="mt-4">
        {state.kind === "loading" ? (
          <p className="text-sm text-[color:var(--theme-text-muted)]">
            Loading Equipment profile…
          </p>
        ) : state.kind === "error" ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
            <span>{state.message}</span>
            <button type="button" className={BUTTON} onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </button>
          </div>
        ) : form ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1">
                <span className={LABEL}>Equipment class *</span>
                <select
                  className={INPUT}
                  required
                  value={form.equipmentClass}
                  onChange={(event) => update({ equipmentClass: event.target.value })}
                >
                  <option value="">Select class…</option>
                  {ASSET_EQUIPMENT_CLASS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {selectedFamily ? (
                  <span className="text-[11px] text-[color:var(--theme-text-muted)]">
                    Family: {humanizeKey(selectedFamily)}
                  </span>
                ) : null}
              </label>
              <label className="space-y-1">
                <span className={LABEL}>Operating status</span>
                <select
                  className={INPUT}
                  value={form.operatingStatus}
                  onChange={(event) => update({ operatingStatus: event.target.value })}
                >
                  {ASSET_OPERATING_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {ASSET_OPERATING_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className={LABEL}>Site / location</span>
                <input
                  className={INPUT}
                  value={form.siteName}
                  maxLength={200}
                  onChange={(event) => update({ siteName: event.target.value })}
                />
              </label>
              {(
                [
                  ["serialNumber", "Serial number"],
                  ["pin", "PIN / VIN"],
                  ["engineMake", "Engine make"],
                  ["engineModel", "Engine model"],
                  ["engineSerial", "Engine serial"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="space-y-1">
                  <span className={LABEL}>{label}</span>
                  <input
                    className={INPUT}
                    value={form[field]}
                    maxLength={120}
                    onChange={(event) => update({ [field]: event.target.value })}
                  />
                </label>
              ))}
            </div>

            <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <legend className={`${LABEL} mb-2`}>Meters</legend>
              <label className="space-y-1">
                <span className={LABEL}>Primary meter</span>
                <select
                  className={INPUT}
                  value={form.primaryMeter}
                  onChange={(event) => update({ primaryMeter: event.target.value })}
                >
                  {ASSET_PRIMARY_METERS.map((meter) => (
                    <option key={meter} value={meter}>
                      {ASSET_PRIMARY_METER_LABELS[meter]}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["engineHours", "Engine hours", "0.1"],
                  ["odometer", "Odometer", "1"],
                  ["currentCycles", "Cycles", "1"],
                ] as const
              ).map(([field, label, step]) => (
                <label key={field} className="space-y-1">
                  <span className={LABEL}>{label}</span>
                  <input
                    className={INPUT}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={step}
                    value={form[field]}
                    onChange={(event) => update({ [field]: event.target.value })}
                  />
                </label>
              ))}
            </fieldset>

            <div className="space-y-1">
              <span className={LABEL}>Mounted on (for attachments / work tools)</span>
              <HostAssetPicker
                assetId={assetId}
                value={form.mountedOnAssetId}
                label={form.mountedOnLabel}
                onChange={(id, label) => update({ mountedOnAssetId: id, mountedOnLabel: label })}
              />
            </div>

            <div className="space-y-2">
              <span className={LABEL}>Equipment attributes</span>
              {form.attributes.map((row, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    className={INPUT}
                    placeholder="Attribute (e.g. Operating weight)"
                    value={row.key}
                    onChange={(event) =>
                      update({
                        attributes: form.attributes.map((current, i) =>
                          i === index ? { ...current, key: event.target.value } : current,
                        ),
                      })
                    }
                  />
                  <input
                    className={INPUT}
                    placeholder="Value"
                    value={row.value}
                    maxLength={500}
                    onChange={(event) =>
                      update({
                        attributes: form.attributes.map((current, i) =>
                          i === index ? { ...current, value: event.target.value } : current,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className={BUTTON}
                    aria-label="Remove attribute"
                    onClick={() =>
                      update({ attributes: form.attributes.filter((_, i) => i !== index) })
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={BUTTON}
                onClick={() =>
                  update({ attributes: [...form.attributes, { key: "", value: "" }] })
                }
              >
                Add attribute
              </button>
            </div>

            {saveError ? (
              <p role="alert" className="text-sm text-red-400">
                {saveError}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button type="submit" className={PRIMARY_BUTTON} disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={saving}
                onClick={() => {
                  setForm(null);
                  setSaveError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : state.record.profile ? (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["Class", state.record.profile.equipmentClassLabel],
                  ["Status", ASSET_OPERATING_STATUS_LABELS[state.record.profile.operatingStatus]],
                  ["Site", state.record.profile.siteName],
                  ["Serial", state.record.profile.serialNumber],
                  ["PIN / VIN", state.record.profile.pin ?? state.record.asset.vin],
                  [
                    "Engine",
                    [state.record.profile.engineMake, state.record.profile.engineModel]
                      .filter(Boolean)
                      .join(" ") || null,
                  ],
                  ["Engine serial", state.record.profile.engineSerial],
                  ["Primary meter", ASSET_PRIMARY_METER_LABELS[state.record.profile.primaryMeter]],
                  ["Hours", state.record.asset.engineHours],
                  [
                    "Odometer",
                    state.record.asset.odometer
                      ? `${state.record.asset.odometer} ${state.record.asset.odometerUnit ?? ""}`.trim()
                      : null,
                  ],
                  ["Cycles", state.record.profile.currentCycles],
                  [
                    "Meters updated",
                    state.record.profile.metersUpdatedAt
                      ? new Date(state.record.profile.metersUpdatedAt).toLocaleString()
                      : null,
                  ],
                ] as Array<[string, string | number | null]>
              ).map(([label, value]) => (
                <div key={label} className={`${ITEM} p-2`}>
                  <dt className="text-xs text-[color:var(--theme-text-muted)]">{label}</dt>
                  <dd className="mt-1 font-semibold">{display(value)}</dd>
                </div>
              ))}
            </dl>
            {state.record.profile.mountedOnAssetId ? (
              <p className="text-sm">
                Mounted on{" "}
                <Link
                  className="font-semibold underline"
                  href={`/vehicles/${state.record.profile.mountedOnAssetId}`}
                >
                  host asset
                </Link>
              </p>
            ) : null}
            {Object.keys(state.record.profile.attributes).length > 0 ? (
              <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(state.record.profile.attributes).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <dt className="text-[color:var(--theme-text-muted)]">{humanizeKey(key)}</dt>
                    <dd className="font-medium">{display(value as string | number | null)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {state.canEdit ? (
              <button
                type="button"
                className={BUTTON}
                onClick={() => setForm(toForm(state.record))}
              >
                Edit Equipment profile
              </button>
            ) : null}
          </div>
        ) : (
          <EmptyState>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>This asset has no Equipment profile yet.</span>
              {state.canEdit ? (
                <button
                  type="button"
                  className={PRIMARY_BUTTON}
                  onClick={() => setForm(toForm(state.record))}
                >
                  Set up Equipment profile
                </button>
              ) : null}
            </div>
          </EmptyState>
        )}
      </div>
    </WorkspaceSection>
  );
}
