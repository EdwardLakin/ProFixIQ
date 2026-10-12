"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  COMPONENT_EVENT_LABELS,
  COMPONENT_POSITION_LABELS,
  COMPONENT_STATUS_LABELS,
  COMPONENT_TYPE_LABELS,
  type EquipmentComponentNode,
} from "@/features/equipment/lib/components";
import {
  WorkspaceEmptyState as EmptyState,
  WorkspaceSection,
  WORKSPACE_ITEM as ITEM,
} from "@/features/workspace/components";

type LoadState =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; tree: EquipmentComponentNode[]; canEdit: boolean; canRecordWork: boolean };

type RecordAction = "rebuilt" | "repaired" | "inspected" | "remove";

const INPUT =
  "w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:ring-2 focus:ring-[color:var(--accent-copper)]/50";
const LABEL = "text-xs font-semibold text-[color:var(--theme-text-muted)]";
const BUTTON =
  "min-h-9 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-50";
const PRIMARY_BUTTON =
  "min-h-9 rounded-lg bg-[color:var(--accent-copper)] px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

/** A fresh idempotency key per submission attempt-set (kept across retries). */
function newOperationKey(): string {
  return crypto.randomUUID();
}

const ACTION_LABELS: Record<RecordAction, string> = {
  rebuilt: "Record rebuild",
  repaired: "Record repair",
  inspected: "Record inspection",
  remove: "Remove from asset",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

async function readError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? "The request could not be completed.";
}

function flatten(nodes: EquipmentComponentNode[], depth = 0): Array<{ node: EquipmentComponentNode; depth: number }> {
  return nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)]);
}

function ActionForm({
  componentId,
  action,
  onDone,
  onCancel,
}: {
  componentId: string;
  action: RecordAction;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [targetStatus, setTargetStatus] = useState<"in_stock" | "in_repair">("in_stock");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same key for retries of this form, so a lost response cannot double-record.
  const [operationKey] = useState(newOperationKey);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/equipment/components/${componentId}/actions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        notes: notes || null,
        occurredAt: occurredAt || null,
        targetStatus,
        operationKey,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!response) return setError("Network error. Try again.");
    if (!response.ok) return setError(await readError(response));
    onDone();
  };

  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-[color:var(--theme-border-soft)] p-3">
      <p className="text-xs font-semibold">{ACTION_LABELS[action]}</p>
      {action === "remove" ? (
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
        <input
          type="date"
          className={INPUT}
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.target.value)}
        />
      </label>
      <label className="grid gap-1">
        <span className={LABEL}>Notes</span>
        <textarea
          className={INPUT}
          rows={2}
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void submit()}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddComponentForm({
  assetId,
  parents,
  onDone,
  onCancel,
}: {
  assetId: string;
  parents: Array<{ id: string; label: string }>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [componentType, setComponentType] = useState("engine");
  const [position, setPosition] = useState("");
  const [label, setLabel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [parentComponentId, setParentComponentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operationKey] = useState(newOperationKey);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/equipment/assets/${assetId}/components`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        componentType,
        position: position || null,
        label: label || null,
        serialNumber: serialNumber || null,
        manufacturer: manufacturer || null,
        parentComponentId: parentComponentId || null,
        operationKey,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!response) return setError("Network error. Try again.");
    if (!response.ok) return setError(await readError(response));
    onDone();
  };

  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-[color:var(--theme-border-soft)] p-3 sm:grid-cols-2">
      <label className="grid gap-1">
        <span className={LABEL}>Type</span>
        <select className={INPUT} value={componentType} onChange={(event) => setComponentType(event.target.value)}>
          {Object.entries(COMPONENT_TYPE_LABELS).map(([value, text]) => (
            <option key={value} value={value}>{text}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className={LABEL}>Position</span>
        <select className={INPUT} value={position} onChange={(event) => setPosition(event.target.value)}>
          <option value="">None</option>
          {Object.entries(COMPONENT_POSITION_LABELS).map(([value, text]) => (
            <option key={value} value={value}>{text}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className={LABEL}>Name (optional)</span>
        <input className={INPUT} maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <label className="grid gap-1">
        <span className={LABEL}>Serial number</span>
        <input className={INPUT} maxLength={80} value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} />
      </label>
      <label className="grid gap-1">
        <span className={LABEL}>Manufacturer</span>
        <input className={INPUT} maxLength={80} value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} />
      </label>
      <label className="grid gap-1">
        <span className={LABEL}>Part of</span>
        <select className={INPUT} value={parentComponentId} onChange={(event) => setParentComponentId(event.target.value)}>
          <option value="">The machine</option>
          {parents.map((parent) => (
            <option key={parent.id} value={parent.id}>{parent.label}</option>
          ))}
        </select>
      </label>
      {error ? <p className="text-xs text-red-400 sm:col-span-2" role="alert">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void submit()}>
          {busy ? "Adding…" : "Add component"}
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Component hierarchy installed on an asset. Facts only: identity, life in
 * hours and the last recorded event. Renders nothing for shops without the
 * Equipment add-on.
 */
export default function EquipmentComponentPanel({
  assetId,
  canOpenHistory,
}: {
  assetId: string;
  /** Cross-machine history is a shop-wide view; assigned-only roles get none. */
  canOpenHistory: boolean;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState<{ id: string; action: RecordAction } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/equipment/assets/${assetId}/components`, {
      credentials: "include",
      cache: "no-store",
    }).catch(() => null);
    if (!response) return setState({ kind: "error", message: "Network error. Try again." });
    if (!response.ok) return setState({ kind: "error", message: await readError(response) });
    const payload = (await response.json()) as {
      entitled: boolean;
      canEdit?: boolean;
      canRecordWork?: boolean;
      tree?: EquipmentComponentNode[];
    };
    if (!payload.entitled) return setState({ kind: "hidden" });
    setState({
      kind: "ready",
      tree: payload.tree ?? [],
      canEdit: Boolean(payload.canEdit),
      canRecordWork: Boolean(payload.canRecordWork),
    });
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const seed = async () => {
    setSeeding(true);
    setNotice(null);
    const response = await fetch(`/api/equipment/assets/${assetId}/components`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: true }),
    }).catch(() => null);
    setSeeding(false);
    if (!response) return setNotice("Network error. Try again.");
    if (!response.ok) return setNotice(await readError(response));
    const { created } = (await response.json()) as { created: number };
    setNotice(created ? `Added ${created} standard components.` : "Standard components are already present.");
    await load();
  };

  if (state.kind === "hidden") return null;

  const rows = state.kind === "ready" ? flatten(state.tree) : [];

  return (
    <WorkspaceSection
      headingId="asset-components"
      eyebrow="Components"
      title="Component hierarchy"
      summary={state.kind === "ready" ? `${rows.length} installed` : undefined}
    >
      {state.kind === "loading" ? (
        <p className="mt-3 text-sm text-[color:var(--theme-text-muted)]">Loading components…</p>
      ) : null}
      {state.kind === "error" ? (
        <div className="mt-3 flex items-center gap-2">
          <p className="text-sm text-red-400" role="alert">{state.message}</p>
          <button type="button" className={BUTTON} onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {state.kind === "ready" ? (
        <>
          {state.canEdit ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={BUTTON} disabled={seeding} onClick={() => void seed()}>
                {seeding ? "Adding…" : "Add standard components"}
              </button>
              <button type="button" className={BUTTON} onClick={() => setAdding((value) => !value)}>
                Add component
              </button>
            </div>
          ) : null}
          {notice ? <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]" role="status">{notice}</p> : null}
          {adding ? (
            <AddComponentForm
              assetId={assetId}
              parents={rows.map(({ node }) => ({ id: node.id, label: node.displayName }))}
              onCancel={() => setAdding(false)}
              onDone={() => {
                setAdding(false);
                void load();
              }}
            />
          ) : null}

          {rows.length ? (
            <ul className="mt-3 grid gap-2">
              {rows.map(({ node, depth }) => (
                <li key={node.id} className={ITEM} style={{ marginLeft: `${Math.min(depth, 4) * 1}rem` }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {canOpenHistory ? (
                          <Link href={`/equipment/components/${node.id}`} className="underline">
                            {node.displayName}
                          </Link>
                        ) : (
                          node.displayName
                        )}
                      </p>
                      <p className="text-xs text-[color:var(--theme-text-muted)]">
                        {[
                          node.serialNumber ? `S/N ${node.serialNumber}` : null,
                          node.componentHours !== null ? `${node.componentHours.toLocaleString()} h` : null,
                          node.lastEvent
                            ? `${COMPONENT_EVENT_LABELS[node.lastEvent.eventType] ?? node.lastEvent.eventType} ${formatDate(node.lastEvent.occurredAt)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No recorded history"}
                      </p>
                    </div>
                    {state.canRecordWork ? (
                      <select
                        className="min-h-9 rounded-lg border border-[color:var(--theme-border-soft)] bg-transparent px-2 text-xs"
                        aria-label={`Record work on ${node.displayName}`}
                        value=""
                        onChange={(event) => {
                          const action = event.target.value as RecordAction;
                          if (action) setActive({ id: node.id, action });
                        }}
                      >
                        <option value="">Record…</option>
                        {(Object.keys(ACTION_LABELS) as RecordAction[])
                          .filter((action) => state.canEdit || action !== "remove")
                          .map((action) => (
                          <option key={action} value={action}>{ACTION_LABELS[action]}</option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                  {active?.id === node.id ? (
                    <ActionForm
                      componentId={node.id}
                      action={active.action}
                      onCancel={() => setActive(null)}
                      onDone={() => {
                        setActive(null);
                        void load();
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>
              No components recorded for this asset yet.
              {state.canEdit ? " Add the standard components for its Equipment class to start." : ""}
            </EmptyState>
          )}
        </>
      ) : null}
    </WorkspaceSection>
  );
}
