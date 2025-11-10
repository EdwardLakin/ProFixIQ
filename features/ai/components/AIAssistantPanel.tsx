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
      <div className="bg-surface text-accent p-6 rounded-md shadow-card mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Need help diagnosing?</h2>
            <p className="text-sm text-muted mt-1">
              Launch TechBot to troubleshoot issues, get fix suggestions, or run
              AI-powered diagnostics.
            </p>
          </div>

          <button
            onClick={() => setOpen(true)}
            className="mt-4 sm:mt-0 bg-accent text-white px-4 py-2 rounded shadow hover:bg-accent/90 transition"
          >
            Open TechBot
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