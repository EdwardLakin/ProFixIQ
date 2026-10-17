"use client";

import { useEffect, useState } from "react";

import {
  listOfflineMutations,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";

/**
 * True while a Finish for this line is queued and its classification was
 * Equipment or undetermined, i.e. one that is shown as "pending sync" until the
 * server answers. Every completion entry point on the page holds while this is
 * true, so a second tap cannot queue a duplicate Finish: replaying the first
 * would punch the caller off, and the duplicate would then find no timer and
 * fall through to the standard finish. Requests queued before the classification
 * was recorded, and ordinary Shop finishes, are not held.
 */
export function useQueuedEquipmentFinish(lineId: string): boolean {
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    const check = () => {
      try {
        setQueued(
          listOfflineMutations().some((item) => {
            if (item.actionType !== "job:punch-transition") return false;
            if (item.status === "synced") return false;
            const payload = (item.payload ?? {}) as {
              lineId?: unknown;
              action?: unknown;
              equipmentClass?: unknown;
            };
            return (
              payload.lineId === lineId &&
              payload.action === "finish" &&
              typeof payload.equipmentClass === "string" &&
              payload.equipmentClass !== "standard"
            );
          }),
        );
      } catch {
        setQueued(false);
      }
    };
    check();
    try {
      return subscribeOfflineMutations(check);
    } catch {
      return undefined;
    }
  }, [lineId]);

  return queued;
}
