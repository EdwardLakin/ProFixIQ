// features/work-orders/hooks/useWorkOrderActions.ts
"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];

type UseWorkOrderActionsArgs = {
  approvalPending: WorkOrderLine[];
  setPartsLineId: (id: string | null) => void;
  setBulkQueue: (ids: string[]) => void;
  setBulkActive: (active: boolean) => void;
};

export function useWorkOrderActions({
  approvalPending,
  setPartsLineId,
  setBulkQueue,
  setBulkActive,
}: UseWorkOrderActionsArgs) {
  /**
   * Send a single line to parts for quoting.
   */
  const sendToParts = useCallback(
    async (lineId: string) => {
      if (!lineId) return;

      const { error } = await supabase
        .from("work_order_lines")
        .update({
          status: "on_hold",
          hold_reason: "Awaiting parts quote",
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", lineId);

      if (error) {
        toast.error(error.message);
        return;
      }

      setPartsLineId(lineId);
      toast.success("Sent to parts for quoting");
    },
    [setPartsLineId],
  );

  /**
   * Bulk-send all approval-pending lines to parts.
   * Puts the parts drawer into “bulk” mode using the queue.
   */
  const sendAllPendingToParts = useCallback(
    async () => {
      if (!approvalPending.length) return;

      const ids = approvalPending.map((l) => l.id);

      const { error } = await supabase
        .from("work_order_lines")
        .update({
          status: "on_hold",
          hold_reason: "Awaiting parts quote",
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .in("id", ids);

      if (error) {
        toast.error(error.message);
        return;
      }

      setBulkQueue(ids);
      setBulkActive(true);
      setPartsLineId(ids[0] ?? null);

      toast.success("Queued all pending lines for parts quoting");
    },
    [approvalPending, setBulkQueue, setBulkActive, setPartsLineId],
  );

  return {
    sendToParts,
    sendAllPendingToParts,
  };
}