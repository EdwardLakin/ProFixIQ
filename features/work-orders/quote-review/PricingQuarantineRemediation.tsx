"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import type { ResolvedQuotePart } from "./partsModel";

type DraftItem = {
  key: string;
  id: string | null;
  requestId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  partNumber: string | null;
  manufacturer: string | null;
};

function initialDraftItems(
  quoteLineId: string,
  parts: ResolvedQuotePart[],
): DraftItem[] {
  const initial = parts.map((part, index) => ({
    key: `${quoteLineId}:${part.requestItemId ?? part.requestId ?? index}`,
    id: part.requestItemId,
    requestId: part.requestId,
    description: part.description,
    quantity: String(part.quantity),
    unitPrice: "",
    partNumber: part.selectedPartNumber ?? part.requestedPartNumber,
    manufacturer: part.manufacturer,
  }));
  return initial.length > 0
    ? initial
    : [
        {
          key: `${quoteLineId}:manual-0`,
          id: null,
          requestId: null,
          description: "",
          quantity: "1",
          unitPrice: "",
          partNumber: null,
          manufacturer: null,
        },
      ];
}

function money(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value);
}

function twoDecimalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    Math.round(parsed * 100) / 100 !== parsed
  ) {
    return null;
  }
  return parsed;
}

export function PricingQuarantineRemediation({
  quoteLineId,
  quoteLineUpdatedAt,
  finalizedPartsTotal,
  parts,
  onRemediated,
}: {
  quoteLineId: string;
  quoteLineUpdatedAt: string | null;
  finalizedPartsTotal: number | null;
  parts: ResolvedQuotePart[];
  onRemediated: () => void | Promise<void>;
}): JSX.Element {
  const nextKey = useRef(1);
  const [drafts, setDrafts] = useState<DraftItem[]>(() =>
    initialDraftItems(quoteLineId, parts),
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function patchDraft(key: string, patch: Partial<DraftItem>) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.key === key ? { ...draft, ...patch } : draft,
      ),
    );
  }

  const draftTotal = drafts.reduce<number | null>((sum, draft) => {
    if (sum == null) return null;
    const quantity = twoDecimalNumber(draft.quantity);
    const unitPrice = twoDecimalNumber(draft.unitPrice);
    if (quantity == null || quantity <= 0 || unitPrice == null) return null;
    return Math.round((sum + quantity * unitPrice) * 100) / 100;
  }, 0);
  const totalsMatch =
    finalizedPartsTotal != null &&
    draftTotal != null &&
    Math.round(finalizedPartsTotal * 100) === Math.round(draftTotal * 100);

  async function submit() {
    if (finalizedPartsTotal == null) {
      toast.error(
        "The finalized parts total is unavailable; operator repair is required.",
      );
      return;
    }

    const items = drafts.map((draft) => ({
      id: draft.id,
      request_id: draft.requestId,
      description: draft.description.trim(),
      qty: twoDecimalNumber(draft.quantity),
      unit_price: twoDecimalNumber(draft.unitPrice),
      part_number: draft.partNumber,
      manufacturer: draft.manufacturer,
    }));
    if (
      items.some(
        (item) =>
          !item.description ||
          item.qty == null ||
          item.qty <= 0 ||
          item.unit_price == null,
      )
    ) {
      toast.error(
        "Every item needs a description, positive quantity, and sell price with at most two decimal places.",
      );
      return;
    }
    if (!totalsMatch) {
      toast.error(
        `Corrected item pricing must total ${money(finalizedPartsTotal)} exactly.`,
      );
      return;
    }

    setSaving(true);
    try {
      const operationKey = `quote-pricing-remediation:${quoteLineId}:${quoteLineUpdatedAt ?? "legacy"}`;
      const response = await fetch(
        `/api/work-orders/quotes/${quoteLineId}/pricing-quarantine`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": operationKey,
          },
          body: JSON.stringify({
            operationKey,
            note: note.trim() || null,
            items,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        toast.error(payload?.error ?? "Unable to resolve pricing quarantine.");
        return;
      }
      await onRemediated();
      toast.success(
        "Customer part pricing restored; finalized totals were preserved.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to resolve pricing quarantine.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-200/30 bg-black/10 p-3">
      <div className="font-semibold text-amber-50">Owner/admin remediation</div>
      <p className="mt-1 text-amber-50/90">
        Enter the exact customer sell detail from the finalized decision. The
        item total must match{" "}
        {finalizedPartsTotal == null
          ? "the unavailable finalized total"
          : money(finalizedPartsTotal)}
        ; cost, workflow state, and finalized totals will not change.
      </p>
      <div className="mt-3 space-y-2">
        {drafts.map((draft, index) => (
          <div
            key={draft.key}
            className="grid gap-2 rounded-lg border border-amber-200/20 p-2 sm:grid-cols-[minmax(0,1fr)_90px_120px_auto]"
          >
            <label className="grid gap-1">
              <span>Description</span>
              <input
                className="desktop-input px-2 py-1.5 text-sm"
                value={draft.description}
                onChange={(event) =>
                  patchDraft(draft.key, { description: event.target.value })
                }
              />
            </label>
            <label className="grid gap-1">
              <span>Qty</span>
              <input
                className="desktop-input px-2 py-1.5 text-sm"
                type="number"
                min="0.01"
                step="0.01"
                value={draft.quantity}
                onChange={(event) =>
                  patchDraft(draft.key, { quantity: event.target.value })
                }
              />
            </label>
            <label className="grid gap-1">
              <span>Sell each</span>
              <input
                className="desktop-input px-2 py-1.5 text-sm"
                type="number"
                min="0"
                step="0.01"
                value={draft.unitPrice}
                onChange={(event) =>
                  patchDraft(draft.key, { unitPrice: event.target.value })
                }
              />
            </label>
            <button
              type="button"
              className="self-end rounded-lg border border-amber-200/30 px-2 py-1.5 font-semibold disabled:opacity-40"
              disabled={drafts.length === 1}
              onClick={() =>
                setDrafts((current) =>
                  current.filter((candidate) => candidate.key !== draft.key),
                )
              }
              aria-label={`Remove corrected part ${index + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-lg border border-amber-200/30 px-2.5 py-1.5 font-semibold"
          onClick={() => {
            const key = `${quoteLineId}:manual-${nextKey.current}`;
            nextKey.current += 1;
            setDrafts((current) => [
              ...current,
              {
                key,
                id: null,
                requestId: null,
                description: "",
                quantity: "1",
                unitPrice: "",
                partNumber: null,
                manufacturer: null,
              },
            ]);
          }}
        >
          Add item
        </button>
        <div
          className={
            totalsMatch
              ? "font-semibold text-emerald-100"
              : "font-semibold text-amber-100"
          }
        >
          Corrected total:{" "}
          {draftTotal == null ? "Incomplete" : money(draftTotal)}
        </div>
      </div>
      <label className="mt-2 grid gap-1">
        <span>Audit note (optional)</span>
        <textarea
          className="desktop-input min-h-20 px-2 py-1.5 text-sm"
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="desktop-btn-primary mt-3 rounded-xl px-3 py-2 font-semibold disabled:opacity-45"
        disabled={saving || !totalsMatch}
        onClick={() => void submit()}
      >
        {saving ? "Resolving…" : "Resolve pricing quarantine"}
      </button>
    </div>
  );
}
