"use client";

import ModalShell from "@/features/shared/components/ModalShell";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Full inspection URL (e.g. /inspections/maintenance50?workOrderId=...&workOrderLineId=...) */
  src: string | null;
  title?: string;
};

export default function InspectionModal(props: Props) {
  const { isOpen, onClose, src, title = "Inspection" } = props;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="xl"
      // No footer buttons for now—pure viewer. Add submitText/onSubmit later if needed.
    >
      {!src ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
          No inspection selected. Open a Focused Job with an attached inspection and click
          <span className="mx-1 rounded border border-neutral-700 px-2 py-0.5 text-neutral-300">Open Inspection</span>.
        </div>
      ) : (
        <div className="rounded border border-neutral-800 bg-neutral-950">
          <iframe
            src={src}
            // Tall, scrollable inspection viewport in dark shell
            className="h-[80vh] w-full rounded"
          />
        </div>
      )}
    </ModalShell>
  );
}