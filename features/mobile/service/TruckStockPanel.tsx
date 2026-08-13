"use client";

import { Barcode, Search } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import FieldBarcodeScanner from "./FieldBarcodeScanner";
import type {
  FieldTruckInventoryItem,
  FieldTruckInventorySnapshot,
} from "./truckInventoryContracts";
import { numeric } from "./truckInventoryContracts";
import type { IdentityDraft } from "./truckInventoryUi";
import {
  actionClass,
  primaryClass,
  quantityLabel,
} from "./truckInventoryUi";

type Props = {
  snapshot: FieldTruckInventorySnapshot;
  online: boolean;
  busy: boolean;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  load: (search?: string, serviceVehicleId?: string) => Promise<void>;
  selectedPartId: string | null;
  setSelectedPartId: Dispatch<SetStateAction<string | null>>;
  selectedLineId: string;
  setSelectedLineId: Dispatch<SetStateAction<string>>;
  quantity: number;
  setQuantity: Dispatch<SetStateAction<number>>;
  identityDraft: IdentityDraft | null;
  setIdentityDraft: Dispatch<SetStateAction<IdentityDraft | null>>;
  createIdentity: () => Promise<void>;
  truckItemById: Map<string, FieldTruckInventoryItem>;
  handleUse: (partId: string) => Promise<void>;
  resolveCode: (code: string) => Promise<void>;
};

export default function TruckStockPanel({
  snapshot,
  online,
  busy,
  query,
  setQuery,
  load,
  selectedPartId,
  setSelectedPartId,
  selectedLineId,
  setSelectedLineId,
  quantity,
  setQuantity,
  identityDraft,
  setIdentityDraft,
  createIdentity,
  truckItemById,
  handleUse,
  resolveCode,
}: Props) {
  const visibleParts = query.trim() ? snapshot.catalog : snapshot.items;

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="text-sm font-semibold">
            Repair line
            <select
              value={selectedLineId}
              onChange={(event) => setSelectedLineId(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3"
            >
              <option value="">Select repair line</option>
              {snapshot.workOrderLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.lineNumber ? `#${line.lineNumber} · ` : ""}
                  {line.description}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Quantity
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value || 0))}
              className="mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 sm:w-28"
            />
          </label>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-[color:var(--theme-text-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void load(query);
              }}
              placeholder="Search truck or shop catalog"
              className="min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] pl-10 pr-3"
            />
          </div>
          <button
            type="button"
            className={actionClass}
            disabled={!online || busy}
            onClick={() => void load(query)}
          >
            Search
          </button>
        </div>
        <div className="mt-3">
          <FieldBarcodeScanner disabled={busy} onDetected={resolveCode} />
        </div>
      </section>

      {identityDraft ? (
        <section className="rounded-3xl border border-[color:var(--accent-copper)] bg-[color:var(--theme-surface-panel)] p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Barcode className="h-4 w-4 text-[color:var(--accent-copper)]" />
            Confirm new canonical part
          </div>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            The barcode will be attached here. There is no separate stock-item setup step.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              ["Part name", "name"],
              ["Part number", "partNumber"],
              ["Manufacturer", "manufacturer"],
              ["Unit cost", "unitCost"],
              ["Sell price", "unitSellPrice"],
            ].map(([label, field]) => (
              <label key={field} className="text-sm font-semibold">
                {label}
                <input
                  value={identityDraft[field as keyof IdentityDraft]}
                  onChange={(event) =>
                    setIdentityDraft((current) =>
                      current ? { ...current, [field]: event.target.value } : current,
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className={primaryClass} disabled={busy} onClick={() => void createIdentity()}>
              Create and map part
            </button>
            <button className={actionClass} disabled={busy} onClick={() => setIdentityDraft(null)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        {visibleParts.map((part) => {
          const truck = truckItemById.get(part.partId);
          const available = numeric(truck?.available);
          return (
            <article
              key={part.partId}
              className={[
                "rounded-2xl border bg-[color:var(--theme-surface-panel)] p-4",
                selectedPartId === part.partId
                  ? "border-[color:var(--accent-copper)]"
                  : "border-[color:var(--theme-border-soft)]",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => setSelectedPartId(part.partId)}
                >
                  <h3 className="font-bold">{part.name}</h3>
                  <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                    {[part.manufacturer, part.partNumber || part.sku]
                      .filter(Boolean)
                      .join(" · ") || "Canonical part"}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-[color:var(--theme-text-muted)]">
                    {part.partId}
                  </p>
                </button>
                <div className="text-right">
                  <div className="text-2xl font-extrabold tabular-nums">
                    {quantityLabel(truck?.onHand ?? 0)}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                    on truck
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-xl bg-[color:var(--theme-surface-subtle)] p-2">
                  <span className="block text-[color:var(--theme-text-muted)]">Available</span>
                  <strong>{quantityLabel(available)}</strong>
                </div>
                <div className="rounded-xl bg-[color:var(--theme-surface-subtle)] p-2">
                  <span className="block text-[color:var(--theme-text-muted)]">Reserved</span>
                  <strong>{quantityLabel(truck?.reserved ?? 0)}</strong>
                </div>
              </div>
              <button
                type="button"
                className={`${primaryClass} mt-3 w-full`}
                disabled={busy || !selectedLineId || available < quantity || quantity <= 0}
                onClick={() => void handleUse(part.partId)}
              >
                <Barcode className="h-4 w-4" /> Use {quantityLabel(quantity)} on call
              </button>
            </article>
          );
        })}
        {visibleParts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] p-8 text-center text-sm text-[color:var(--theme-text-muted)]">
            {query ? "No matching canonical parts." : "This truck has no inventory yet."}
          </div>
        ) : null}
      </section>
    </div>
  );
}
