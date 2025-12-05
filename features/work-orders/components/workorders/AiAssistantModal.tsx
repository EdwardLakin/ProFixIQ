"use client";

import ModalShell from "@/features/shared/components/ModalShell";
import TechAssistant from "@/features/shared/components/TechAssistant";

type AiAssistantModalProps = {
  isOpen: boolean;
  onClose: () => void;
  workOrderLineId?: string;
  defaultVehicle?: {
    year?: string;
    make?: string;
    model?: string;
  };
};

export default function AiAssistantModal({
  isOpen,
  onClose,
  workOrderLineId,
  defaultVehicle,
}: AiAssistantModalProps) {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="AI / Tech Assistant"
      size="lg"
      // no submit button — it’s an interactive panel
      hideFooter
    >
      {/* Make the modal body a flex column with a height cap */}
      <div className="flex max-h-[70vh] flex-col space-y-3">
        <p className="text-xs text-neutral-400">
          Ask TechAssistant for diagnostics, test plans, or repair procedures.
          It stays scoped to this job and vehicle where possible.
        </p>

        {/* scrollable inner panel */}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.85)]">
          <TechAssistant
            defaultVehicle={defaultVehicle}
            workOrderLineId={workOrderLineId}
          />
        </div>
      </div>
    </ModalShell>
  );
}