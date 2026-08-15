"use client";

import { MoveRight } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import type {
  FieldCatalogPart,
  FieldTruckInventorySnapshot,
} from "./truckInventoryContracts";
import { actionClass, primaryClass, quantityLabel } from "./truckInventoryUi";

type Props = {
  snapshot: FieldTruckInventorySnapshot;
  online: boolean;
  busy: boolean;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  load: (search?: string, serviceVehicleId?: string) => Promise<void>;
  selectedPartId: string | null;
  setSelectedPartId: Dispatch<SetStateAction<string | null>>;
  sourceLocationId: string;
  setSourceLocationId: Dispatch<SetStateAction<string>>;
  sourceOptions: FieldCatalogPart["locations"];
  quantity: number;
  setQuantity: Dispatch<SetStateAction<number>>;
  transferToTruck: () => Promise<void>;
};

export default function TruckLoadPanel({
  snapshot,
  online,
  busy,
  query,
  setQuery,
  load,
  selectedPartId,
  setSelectedPartId,
  sourceLocationId,
  setSourceLocationId,
  sourceOptions,
  quantity,
  setQuantity,
  transferToTruck,
}: Props) {
  return (
    <section className="space-y-4 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
      <div>
        <h2 className="text-lg font-bold">Transfer shop stock to truck</h2>
        <p className="text-sm text-[color:var(--theme-text-secondary)]">
          Both ledger moves share one transfer identity; the canonical part never changes.
        </p>
      </div>
      {!snapshot.canManageParts ? (
        <p className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100">
          Parts-management permission is required to load a truck.
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search part to transfer"
              className="min-h-11 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3"
            />
            <button className={actionClass} onClick={() => void load(query)} disabled={!online || busy}>
              Search
            </button>
          </div>
          <select
            value={selectedPartId ?? ""}
            onChange={(event) => {
              setSelectedPartId(event.target.value || null);
              setSourceLocationId("");
            }}
            className="min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3"
          >
            <option value="">Select part</option>
            {snapshot.catalog.map((part) => (
              <option key={part.partId} value={part.partId}>
                {part.name} {part.partNumber ? `· ${part.partNumber}` : ""}
              </option>
            ))}
          </select>
          <select
            value={sourceLocationId}
            onChange={(event) => setSourceLocationId(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3"
          >
            <option value="">Select source location</option>
            {sourceOptions.map((location) => (
              <option key={location.locationId} value={location.locationId}>
                {location.code || location.name || "Stock"} · {quantityLabel(location.available)} available
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value || 0))}
            className="min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3"
          />
          <button
            className={`${primaryClass} w-full`}
            disabled={!online || busy || !selectedPartId || !sourceLocationId || quantity <= 0}
            onClick={() => void transferToTruck()}
          >
            <MoveRight className="h-4 w-4" /> Transfer to {snapshot.truck?.name}
          </button>
        </>
      )}
    </section>
  );
}
