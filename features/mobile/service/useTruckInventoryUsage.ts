"use client";

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import type { OfflineMutationScope } from "@/features/shared/lib/offline/mutations";
import {
  createTruckPartIdentity,
  localPartByCode,
  randomInventoryKey,
  resolveTruckPartCode,
} from "./truckInventoryClient";
import type {
  FieldRecentPartUse,
  FieldTruckInventorySnapshot,
} from "./truckInventoryContracts";
import { numeric } from "./truckInventoryContracts";
import {
  returnFieldTruckPart,
  consumeFieldTruckPart,
} from "./truckInventoryOffline";
import type { IdentityDraft } from "./truckInventoryUi";

type Args = {
  snapshot: FieldTruckInventorySnapshot | null;
  setSnapshot: Dispatch<SetStateAction<FieldTruckInventorySnapshot | null>>;
  scope: OfflineMutationScope | null;
  online: boolean;
  selectedLineId: string;
  query: string;
  load: (search?: string, serviceVehicleId?: string) => Promise<void>;
};

export function useTruckInventoryUsage({
  snapshot,
  setSnapshot,
  scope,
  online,
  selectedLineId,
  query,
  load,
}: Args) {
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [identityDraft, setIdentityDraft] = useState<IdentityDraft | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);

  const truckItemById = useMemo(
    () => new Map((snapshot?.items ?? []).map((part) => [part.partId, part])),
    [snapshot?.items],
  );

  const applyOptimisticUse = useCallback(
    (partId: string, qty: number) => {
      setSnapshot((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.partId === partId
                  ? {
                      ...item,
                      onHand: Math.max(0, numeric(item.onHand) - qty),
                      available: Math.max(0, numeric(item.available) - qty),
                    }
                  : item,
              ),
            }
          : current,
      );
    },
    [setSnapshot],
  );

  const handleUse = useCallback(
    async (partId: string) => {
      if (!scope || !snapshot?.visit?.id || !selectedLineId) {
        toast.error("Open an assigned repair line before using a truck part.");
        return;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        toast.error("Quantity must be greater than zero.");
        return;
      }
      const current = truckItemById.get(partId);
      if (current && numeric(current.available) < quantity) {
        toast.error("Truck quantity is lower than the requested use quantity.");
        return;
      }

      setUsageBusy(true);
      try {
        const result = await consumeFieldTruckPart({
          scope,
          payload: {
            visitId: snapshot.visit.id,
            workOrderLineId: selectedLineId,
            partId,
            quantity,
            operationKey: randomInventoryKey("field-inventory-use"),
          },
        });
        applyOptimisticUse(partId, quantity);
        toast.success(result.queued ? "Part use saved offline." : "Part used from truck.");
        if (!result.queued) await load(query);
      } catch (useError) {
        toast.error(useError instanceof Error ? useError.message : "Unable to use the part.");
      } finally {
        setUsageBusy(false);
      }
    },
    [
      applyOptimisticUse,
      load,
      query,
      quantity,
      scope,
      selectedLineId,
      snapshot?.visit?.id,
      truckItemById,
    ],
  );

  const handleReturn = useCallback(
    async (use: FieldRecentPartUse) => {
      if (!scope || !snapshot?.visit?.id) return;
      const returnable = Math.max(0, numeric(use.quantity) - numeric(use.returnedQuantity));
      if (returnable <= 0) return;
      setUsageBusy(true);
      try {
        const result = await returnFieldTruckPart({
          scope,
          payload: {
            visitId: snapshot.visit.id,
            workOrderPartId: use.workOrderPartId,
            quantity: returnable,
            operationKey: randomInventoryKey("field-inventory-return"),
          },
        });
        setSnapshot((current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.partId === use.partId
                    ? {
                        ...item,
                        onHand: numeric(item.onHand) + returnable,
                        available: numeric(item.available) + returnable,
                      }
                    : item,
                ),
                recentUses: current.recentUses.map((entry) =>
                  entry.stockMoveId === use.stockMoveId
                    ? { ...entry, returnedQuantity: numeric(entry.quantity) }
                    : entry,
                ),
              }
            : current,
        );
        toast.success(result.queued ? "Return saved offline." : "Part returned to truck.");
        if (!result.queued) await load(query);
      } catch (returnError) {
        toast.error(
          returnError instanceof Error ? returnError.message : "Unable to return the part.",
        );
      } finally {
        setUsageBusy(false);
      }
    },
    [load, query, scope, setSnapshot, snapshot?.visit?.id],
  );

  const resolveCode = useCallback(
    async (code: string) => {
      if (!snapshot) return;
      const local = localPartByCode(snapshot, code);
      if (!online) {
        if (local) {
          setSelectedPartId(local.partId);
          toast.success(`${local.name} selected from cached truck data.`);
        } else {
          toast.error("That barcode is not in the cached truck catalog.");
        }
        return;
      }

      setUsageBusy(true);
      try {
        const result = await resolveTruckPartCode(code);
        if (result.found === false) {
          setIdentityDraft({
            code,
            name: "",
            partNumber: code,
            manufacturer: "",
            unitCost: "",
            unitSellPrice: "",
          });
          toast.message("Confirm the new part identity without leaving this call.");
          return;
        }
        setSelectedPartId(result.partId);
        await load(code);
        toast.success(`${result.part.name} selected.`);
      } catch (resolveError) {
        toast.error(
          resolveError instanceof Error ? resolveError.message : "Unable to resolve the barcode.",
        );
      } finally {
        setUsageBusy(false);
      }
    },
    [load, online, snapshot],
  );

  const createIdentity = useCallback(async () => {
    if (!identityDraft?.code || !identityDraft.name.trim()) {
      toast.error("Part name is required.");
      return;
    }
    setUsageBusy(true);
    try {
      const result = await createTruckPartIdentity(identityDraft);
      if (result.found === false) throw new Error("The part still needs identifying details.");
      setIdentityDraft(null);
      setSelectedPartId(result.partId);
      await load(identityDraft.code);
      toast.success("Canonical part created and barcode mapped.");
    } catch (createError) {
      toast.error(
        createError instanceof Error
          ? createError.message
          : "Unable to create the part identity.",
      );
    } finally {
      setUsageBusy(false);
    }
  }, [identityDraft, load]);

  return {
    selectedPartId,
    setSelectedPartId,
    quantity,
    setQuantity,
    identityDraft,
    setIdentityDraft,
    usageBusy,
    truckItemById,
    handleUse,
    handleReturn,
    resolveCode,
    createIdentity,
  };
}
