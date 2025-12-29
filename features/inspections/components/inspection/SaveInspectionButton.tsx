//features/inspections/components/inspection/SaveInspectionButton.tsx

"use client";

import { toast } from "sonner";
import { saveInspectionSession } from "@inspections/lib/inspection/save";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import { Button } from "@shared/components/ui/Button";

type Props = {
  session: InspectionSession;
  workOrderLineId: string;
};

export function SaveInspectionButton({ session, workOrderLineId }: Props) {
  const handleSave = async () => {
    try {
      if (!workOrderLineId) {
        throw new Error("Missing workOrderLineId");
      }
      await saveInspectionSession(session, workOrderLineId);
      toast.success("Inspection saved.");
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error("Save error:", error);
      toast.error(error?.message || "Failed to save inspection.");
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
      Save draft
    </Button>
  );
}