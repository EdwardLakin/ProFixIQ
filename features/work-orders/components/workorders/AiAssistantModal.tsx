"use client";

import { Dialog } from "@headlessui/react";
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
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-[130] flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Panel wrapper – similar width to DTC Assist (size=md) */}
      <div className="relative z-[140] mx-4 w-full max-w-xl">
        <Dialog.Panel className="flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_82%)] shadow-[0_28px_80px_rgba(0,0,0,0.95)]">
          {/* Header – matches DTC style */}
          <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
            <div>
              <Dialog.Title className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-300">
                AI / Tech Assistant
              </Dialog.Title>
              <p className="mt-1 text-xs text-neutral-400">
                Scoped to this job and vehicle where possible.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/70 text-xs text-neutral-300 hover:bg-white/5"
            >
              ✕
            </button>
          </div>

          {/* Body – entire TechAssistant scrolls inside this area */}
          <div className="flex-1 overflow-y-auto px-5 pb-5 pt-3">
            <div className="rounded-2xl border border-neutral-800 bg-black/75 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.9)]">
              <TechAssistant
                defaultVehicle={defaultVehicle}
                workOrderLineId={workOrderLineId}
              />
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}