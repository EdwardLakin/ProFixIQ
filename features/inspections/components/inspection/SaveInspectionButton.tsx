"use client";

import { toast } from "sonner";
import { saveInspectionSession } from "@inspections/lib/inspection/save";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import { Button } from "@shared/components/ui/Button";

type Props = {
  session: InspectionSession;
  workOrderLineId: string;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Failed to save inspection.";
}

export function SaveInspectionButton({ session, workOrderLineId }: Props) {
  const handleSave = async (): Promise<void> => {
    try {
      if (!workOrderLineId) throw new Error("Missing workOrderLineId");
      await saveInspectionSession(session, workOrderLineId);
      toast.success("Inspection saved.");
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error("Save error:", error);
      toast.error(errorMessage(error));
    }
  };

  return (
    <Button
      onClick={handleSave}
      type="button"
      variant="outline"
      size="sm"
      className="font-medium border-[rgba(184,115,51,0.75)] text-[11px] tracking-[0.16em] uppercase"
    >
      Save Progress
    </Button>
  );
}
