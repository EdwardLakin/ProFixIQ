"use client";

import { useEffect } from "react";

import { workOrderPartsRefreshEventName } from "@/features/work-orders/workspace/workOrderWorkspace";

export function notifyWorkOrderPartsRefresh(workOrderLineId: string): void {
  window.dispatchEvent(
    new Event(workOrderPartsRefreshEventName(workOrderLineId)),
  );
}

export function useWorkOrderPartsRefresh(
  workOrderLineId: string,
  refresh: () => void | Promise<void>,
): void {
  useEffect(() => {
    const eventName = workOrderPartsRefreshEventName(workOrderLineId);
    const handlePartsRefresh = () => void refresh();
    window.addEventListener(eventName, handlePartsRefresh);
    return () => window.removeEventListener(eventName, handlePartsRefresh);
  }, [refresh, workOrderLineId]);
}
