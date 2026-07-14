"use client";

import { useState } from "react";
import AiAssistantModal from "@/features/work-orders/components/workorders/AiAssistantModal";

export default function AIAssistantPanel({
  workOrderLineId,
  defaultVehicle,
}: {
  workOrderLineId?: string;
  defaultVehicle?: {
    year?: string;
    make?: string;
    model?: string;
  };
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Panel section */}
      <div className="glass-card mb-6 rounded-2xl border border-[var(--metal-border-soft)] bg-gradient-to-br from-[color:var(--theme-surface-page)] via-[color:var(--theme-surface-panel)] to-[color:var(--theme-surface-page)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-header text-base font-semibold text-[color:var(--theme-text-primary)] sm:text-lg">
              Need help diagnosing?
            </h2>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)] sm:text-sm">
              Launch the AI TechAssistant to troubleshoot concerns, get fix
              suggestions, or generate diagnostic plans tied to this job.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center rounded-full border border-[var(--accent-copper-soft)] bg-[var(--accent-copper-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--theme-text-on-accent)] shadow-[0_0_18px_rgba(248,113,22,0.45)] transition hover:border-[var(--accent-copper-light)] hover:bg-[var(--accent-copper-light)] sm:text-sm"
          >
            Open TechAssistant
          </button>
        </div>
      </div>

      {/* Modal */}
      {open && (
        <AiAssistantModal
          isOpen={open}
          onClose={() => setOpen(false)}
          workOrderLineId={workOrderLineId}
          defaultVehicle={defaultVehicle}
        />
      )}
    </>
  );
}