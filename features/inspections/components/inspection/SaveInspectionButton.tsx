//features/inspections/components/inspection/SaveInspectionButton.tsx

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { saveInspectionSession } from "@inspections/lib/inspection/save";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import { Button } from "@shared/components/ui/Button";
import { getOfflineSyncSummary, subscribeOfflineMutations } from "@/features/shared/lib/offline/mutations";

type Props = {
  session: InspectionSession;
  workOrderLineId: string;
  disabled?: boolean;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Failed to save inspection.";
}

export function SaveInspectionButton({ session, workOrderLineId, disabled = false }: Props) {
  const [syncSummary, setSyncSummary] = useState(() => getOfflineSyncSummary());

  useEffect(() => {
    const refresh = () => setSyncSummary(getOfflineSyncSummary());
    const unsub = subscribeOfflineMutations(refresh);
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    refresh();
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const handleSave = async (): Promise<void> => {
    try {
      if (!workOrderLineId) throw new Error("Missing workOrderLineId");
      const result = await saveInspectionSession(session, workOrderLineId);
      if (result.conflicted) {
        toast.error("Inspection save conflicted. Review sync queue status.");
      } else if (result.queued) {
        toast.warning("Inspection save queued and will sync when online.");
      } else {
        toast.success("Inspection saved.");
      }
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error("Save error:", error);
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        onClick={handleSave}
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className="font-medium border-[rgba(184,115,51,0.75)] text-[11px] tracking-[0.16em] uppercase"
      >
        Save Progress
      </Button>
      {(syncSummary.queued > 0 || syncSummary.syncing > 0 || syncSummary.failed > 0 || syncSummary.conflicted > 0) && (
        <p className="text-[10px] text-neutral-400">
          Sync queue: pending {syncSummary.queued + syncSummary.syncing} • failed {syncSummary.failed} • conflicted {syncSummary.conflicted}
        </p>
      )}
    </div>
  );
}
