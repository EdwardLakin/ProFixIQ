"use client";

import { useEffect, useMemo, useState } from "react";
import type { OfflineMutationScope } from "@/features/shared/lib/offline/mutations";
import type { AdvisorWorkOrderDraftLine } from "@/features/work-orders/mobile/advisorOfflineTypes";
import {
  createOfflinePartsRequestDraft,
  createOfflinePartsRequestItem,
  getOfflinePartsRequestDraft,
  saveOfflinePartsRequestDraft,
  type OfflinePartsRequestDraft,
} from "@/features/parts/offline/partsRequestDrafts";

export function AdvisorPartsDraftEditor({
  scope,
  workOrderDraftId,
  lines,
}: {
  scope: OfflineMutationScope | null;
  workOrderDraftId: string | null;
  lines: AdvisorWorkOrderDraftLine[];
}) {
  const [selectedLineId, setSelectedLineId] = useState("");
  const [draft, setDraft] = useState<OfflinePartsRequestDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selectedLine = useMemo(
    () => lines.find((line) => line.tempId === selectedLineId) ?? null,
    [lines, selectedLineId],
  );

  useEffect(() => {
    if (!selectedLineId && lines[0]) setSelectedLineId(lines[0].tempId);
    if (
      selectedLineId &&
      !lines.some((line) => line.tempId === selectedLineId)
    ) {
      setSelectedLineId(lines[0]?.tempId ?? "");
    }
  }, [lines, selectedLineId]);

  useEffect(() => {
    if (!scope || !workOrderDraftId || !selectedLineId) {
      setDraft(null);
      return;
    }
    void (async () => {
      const existing = await getOfflinePartsRequestDraft({
        scope,
        workOrderDraftId,
        tempLineId: selectedLineId,
      });
      setDraft(
        existing ?? {
          ...createOfflinePartsRequestDraft({
            scope,
            workOrderDraftId,
            tempLineId: selectedLineId,
          }),
          items: [createOfflinePartsRequestItem()],
        },
      );
      setMessage(null);
    })();
  }, [scope, workOrderDraftId, selectedLineId]);

  if (!scope || !workOrderDraftId || lines.length === 0 || !draft) return null;

  const updateItem = (
    tempId: string,
    patch: Partial<OfflinePartsRequestDraft["items"][number]>,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.tempId === tempId ? { ...item, ...patch } : item,
            ),
            updatedAt: new Date().toISOString(),
          }
        : current,
    );
  };

  const save = async () => {
    const items = draft.items.filter(
      (item) => item.description.trim() && item.qty > 0,
    );
    if (items.length === 0) {
      setMessage("Add at least one part description and quantity.");
      return;
    }
    await saveOfflinePartsRequestDraft({
      ...draft,
      items,
      updatedAt: new Date().toISOString(),
    });
    setMessage("Parts request draft saved on this device.");
  };

  return (
    <section className="glass-card rounded-2xl border border-[color:var(--theme-border-soft)] px-3 py-3 text-[color:var(--theme-text-primary)]">
      <div>
        <p className="text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
          Parts request drafts
        </p>
        <p className="mt-1 text-[0.7rem] text-[color:var(--theme-text-muted)]">
          These requests wait for their temporary job line, then submit after
          the work order reconnects.
        </p>
      </div>
      <label className="mt-3 block text-[0.65rem] uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
        Job line
        <select
          className="input mt-1 w-full"
          value={selectedLineId}
          onChange={(event) => setSelectedLineId(event.target.value)}
        >
          {lines.map((line, index) => (
            <option key={line.tempId} value={line.tempId}>
              {index + 1}. {line.complaint}
            </option>
          ))}
        </select>
      </label>
      {selectedLine && (
        <p className="mt-2 text-[0.7rem] text-[color:var(--theme-text-muted)]">
          Requesting for: {selectedLine.complaint}
        </p>
      )}
      <textarea
        className="input mt-3 w-full"
        rows={2}
        placeholder="Note to parts (optional)"
        value={draft.notes}
        onChange={(event) =>
          setDraft({
            ...draft,
            notes: event.target.value,
            updatedAt: new Date().toISOString(),
          })
        }
      />
      <div className="mt-3 space-y-2">
        {draft.items.map((item) => (
          <div key={item.tempId} className="grid grid-cols-12 gap-2">
            <input
              className="input col-span-7"
              placeholder="Part description"
              value={item.description}
              onChange={(event) =>
                updateItem(item.tempId, { description: event.target.value })
              }
            />
            <input
              className="input col-span-3"
              type="number"
              min="1"
              max="10000"
              value={item.qty}
              onChange={(event) =>
                updateItem(item.tempId, {
                  qty: Math.max(1, Number(event.target.value) || 1),
                })
              }
            />
            <button
              type="button"
              className="col-span-2 text-xs text-red-300 disabled:opacity-40"
              disabled={draft.items.length === 1}
              onClick={() =>
                setDraft({
                  ...draft,
                  items: draft.items.filter(
                    (row) => row.tempId !== item.tempId,
                  ),
                  updatedAt: new Date().toISOString(),
                })
              }
            >
              Remove
            </button>
            <input
              className="input col-span-6"
              placeholder="Part number (optional)"
              value={item.partNumber ?? ""}
              onChange={(event) =>
                updateItem(item.tempId, {
                  partNumber: event.target.value || null,
                })
              }
            />
            <input
              className="input col-span-6"
              placeholder="Manufacturer (optional)"
              value={item.manufacturer ?? ""}
              onChange={(event) =>
                updateItem(item.tempId, {
                  manufacturer: event.target.value || null,
                })
              }
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs"
          onClick={() =>
            setDraft({
              ...draft,
              items: [...draft.items, createOfflinePartsRequestItem()],
              updatedAt: new Date().toISOString(),
            })
          }
        >
          Add part
        </button>
        <button
          type="button"
          className="rounded-full bg-[var(--accent-copper)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-on-accent)]"
          onClick={() => void save()}
        >
          Save parts draft
        </button>
      </div>
      {message && <p className="mt-2 text-[0.7rem] text-sky-200">{message}</p>}
    </section>
  );
}
