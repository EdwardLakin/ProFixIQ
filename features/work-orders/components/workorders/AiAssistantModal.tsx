"use client";

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

/**
 * Compact AI / Tech Assistant modal
 * - Own overlay (z-[140]) so it sits above FocusedJobModal
 * - Same approximate footprint as the DTC modal
 * - Inner TechAssistant content scrolls, modal shell does not
 */
export default function AiAssistantModal({
  isOpen,
  onClose,
  workOrderLineId,
  defaultVehicle,
}: AiAssistantModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centered card */}
      <div className="relative z-[150] w-full max-w-2xl px-4">
        <div className="metal-card flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-b from-black/95 via-slate-950/95 to-black/95 shadow-[0_22px_60px_rgba(0,0,0,0.95)]">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-4 pt-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
                AI / TECH ASSISTANT
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                Scoped to this job and vehicle where possible.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-2 py-1 text-xs text-neutral-300 hover:bg-white/5"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="mt-3 flex-1 min-h-0 px-4 pb-4">
            <div className="flex h-full flex-col rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/75 shadow-[0_18px_45px_rgba(0,0,0,0.9)]">
              {/* This wrapper is the ONLY scroll container */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <TechAssistant
                  defaultVehicle={defaultVehicle}
                  workOrderLineId={workOrderLineId}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}