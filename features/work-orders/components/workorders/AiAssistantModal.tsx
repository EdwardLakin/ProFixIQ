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
      hideFooter
      scrollBody={false} // 🔒 inner TechAssistant manages its own scroll
    >
      <div className="space-y-3">
        <p className="text-xs text-neutral-400">
          Ask TechAssistant for diagnostics, test plans, or repair procedures.
          It stays scoped to this job and vehicle where possible.
        </p>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.85)]">
          <TechAssistant
            defaultVehicle={defaultVehicle}
            workOrderLineId={workOrderLineId}
          />
        </div>
      </div>
    </ModalShell>
  );
}