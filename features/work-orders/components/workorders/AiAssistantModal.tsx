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
      {/* give it a max height so it scrolls like the others */}
      <div className="max-h-[65vh] overflow-y-auto">
        <TechAssistant
          defaultVehicle={defaultVehicle}
          workOrderLineId={workOrderLineId}
        />
      </div>
    </ModalShell>
  );
}