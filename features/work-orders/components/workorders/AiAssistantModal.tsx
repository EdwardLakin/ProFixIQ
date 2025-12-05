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
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel wrapper */}
      <div className="relative z-[210] mx-4 w-full max-w-3xl">
        <div className="overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)] shadow-[0_32px_80px_rgba(0,0,0,0.95)]">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-white/10 px-5 py-3">
            <div>
              <h2
                className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-300"
                style={{ fontFamily: "var(--font-blackops), system-ui" }}
              >
                AI / Tech Assistant
              </h2>
              <p className="mt-1 text-[11px] text-neutral-400">
                Scoped to this job and vehicle where possible.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/60 text-xs text-neutral-200 hover:bg-white/10"
              aria-label="Close AI assistant"
            >
              ✕
            </button>
          </div>

          {/* Body – TechAssistant handles its own inner scroll for messages */}
          <div className="px-5 py-4">
            <div className="rounded-2xl border border-white/12 bg-black/70 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.9)]">
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