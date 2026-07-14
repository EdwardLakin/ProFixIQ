"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  // Ensure we only portal once we're mounted in the browser
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto pt-10 pb-10">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[color:var(--theme-surface-overlay)] backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel wrapper */}
      <div className="relative z-[210] mx-4 w-full max-w-3xl">
        <div className="var(--theme-gradient-panel)">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-[color:var(--theme-border-soft)] px-5 py-3">
            <div>
              <h2
                className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--theme-text-secondary)]"
                style={{ fontFamily: "var(--font-blackops), system-ui" }}
              >
                AI / Tech Assistant
              </h2>
              <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                Scoped to this job and vehicle where possible.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] text-xs text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
              aria-label="Close AI assistant"
            >
              ✕
            </button>
          </div>

          {/* Body – TechAssistant handles its own inner scroll for messages */}
          <div className="px-5 py-4">
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-3 shadow-[var(--theme-shadow-medium)]">
              <TechAssistant
                defaultVehicle={defaultVehicle}
                workOrderLineId={workOrderLineId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}