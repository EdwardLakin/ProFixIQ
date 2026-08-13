"use client";

import { useState } from "react";

import MobileTruckInventoryScreen from "./MobileTruckInventoryScreen";
import { useTruckInventorySnapshot } from "./useTruckInventorySnapshot";
import { useTruckInventoryStocking } from "./useTruckInventoryStocking";
import { useTruckInventoryUsage } from "./useTruckInventoryUsage";
import type { TruckInventoryView } from "./truckInventoryUi";

export default function MobileTruckInventory() {
  const [view, setView] = useState<TruckInventoryView>("stock");
  const state = useTruckInventorySnapshot();
  const usage = useTruckInventoryUsage({
    snapshot: state.snapshot,
    setSnapshot: state.setSnapshot,
    scope: state.scope,
    online: state.online,
    selectedLineId: state.selectedLineId,
    query: state.query,
    load: state.load,
  });
  const stocking = useTruckInventoryStocking({
    snapshot: state.snapshot,
    selectedPartId: usage.selectedPartId,
    quantity: usage.quantity,
    query: state.query,
    load: state.load,
  });
  const busy = usage.usageBusy || stocking.stockingBusy;

  const handleTruckChange = (truckId: string) => {
    usage.setSelectedPartId(null);
    stocking.setSelectedReceiptId("");
    state.handleTruckChange(truckId);
  };

  return (
    <MobileTruckInventoryScreen
      snapshot={state.snapshot}
      online={state.online}
      view={view}
      setView={setView}
      loading={state.loading}
      busy={busy}
      error={state.error}
      query={state.query}
      setQuery={state.setQuery}
      load={state.load}
      selectedTruckId={state.selectedTruckId}
      onTruckChange={handleTruckChange}
      selectedPartId={usage.selectedPartId}
      setSelectedPartId={usage.setSelectedPartId}
      selectedLineId={state.selectedLineId}
      setSelectedLineId={state.setSelectedLineId}
      quantity={usage.quantity}
      setQuantity={usage.setQuantity}
      identityDraft={usage.identityDraft}
      setIdentityDraft={usage.setIdentityDraft}
      createIdentity={usage.createIdentity}
      sourceLocationId={stocking.sourceLocationId}
      setSourceLocationId={stocking.setSourceLocationId}
      sourceOptions={stocking.sourceOptions}
      selectedReceiptId={stocking.selectedReceiptId}
      setSelectedReceiptId={stocking.setSelectedReceiptId}
      selectedReceipt={stocking.selectedReceipt}
      truckItemById={usage.truckItemById}
      handleUse={usage.handleUse}
      handleReturn={usage.handleReturn}
      resolveCode={usage.resolveCode}
      transferToTruck={stocking.transferToTruck}
      receiveToTruck={stocking.receiveToTruck}
    />
  );
}
