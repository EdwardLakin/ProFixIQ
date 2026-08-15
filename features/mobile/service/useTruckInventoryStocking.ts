"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  receiveTruckPart,
  transferTruckPart,
} from "./truckInventoryClient";
import type { FieldTruckInventorySnapshot } from "./truckInventoryContracts";
import { numeric } from "./truckInventoryContracts";

type Args = {
  snapshot: FieldTruckInventorySnapshot | null;
  selectedPartId: string | null;
  quantity: number;
  query: string;
  load: (search?: string, serviceVehicleId?: string) => Promise<void>;
};

export function useTruckInventoryStocking({
  snapshot,
  selectedPartId,
  quantity,
  query,
  load,
}: Args) {
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [selectedReceiptId, setSelectedReceiptId] = useState("");
  const [stockingBusy, setStockingBusy] = useState(false);

  const selectedCatalogPart = useMemo(
    () =>
      selectedPartId
        ? snapshot?.catalog.find((part) => part.partId === selectedPartId) ?? null
        : null,
    [selectedPartId, snapshot?.catalog],
  );
  const sourceOptions = useMemo(
    () =>
      (selectedCatalogPart?.locations ?? []).filter(
        (location) =>
          location.locationId !== snapshot?.truck?.stockLocationId &&
          numeric(location.available) > 0,
      ),
    [selectedCatalogPart, snapshot?.truck?.stockLocationId],
  );
  const selectedReceipt = useMemo(
    () =>
      snapshot?.openReceipts.find(
        (receipt) => receipt.purchaseOrderLineId === selectedReceiptId,
      ) ?? null,
    [selectedReceiptId, snapshot?.openReceipts],
  );

  const transferToTruck = useCallback(async () => {
    if (!snapshot?.truck?.id || !selectedPartId || !sourceLocationId) {
      toast.error("Select a part and source location.");
      return;
    }
    setStockingBusy(true);
    try {
      await transferTruckPart({
        serviceVehicleId: snapshot.truck.id,
        sourceLocationId,
        partId: selectedPartId,
        quantity,
      });
      toast.success("Part transferred to truck.");
      await load(query);
    } catch (transferError) {
      toast.error(
        transferError instanceof Error
          ? transferError.message
          : "Unable to transfer the part.",
      );
    } finally {
      setStockingBusy(false);
    }
  }, [load, query, quantity, selectedPartId, snapshot?.truck?.id, sourceLocationId]);

  const receiveToTruck = useCallback(async () => {
    if (!snapshot?.truck?.id || !selectedReceipt) {
      toast.error("Select a purchase-order line.");
      return;
    }
    const receiveQty = Math.min(quantity, numeric(selectedReceipt.remainingQuantity));
    if (receiveQty <= 0) return;
    setStockingBusy(true);
    try {
      await receiveTruckPart({
        serviceVehicleId: snapshot.truck.id,
        purchaseOrderId: selectedReceipt.purchaseOrderId,
        purchaseOrderLineId: selectedReceipt.purchaseOrderLineId,
        quantity: receiveQty,
      });
      toast.success("PO part received directly to truck.");
      await load(query);
    } catch (receiveError) {
      toast.error(
        receiveError instanceof Error ? receiveError.message : "Unable to receive the part.",
      );
    } finally {
      setStockingBusy(false);
    }
  }, [load, query, quantity, selectedReceipt, snapshot?.truck?.id]);

  return {
    sourceLocationId,
    setSourceLocationId,
    sourceOptions,
    selectedReceiptId,
    setSelectedReceiptId,
    selectedReceipt,
    stockingBusy,
    transferToTruck,
    receiveToTruck,
  };
}
