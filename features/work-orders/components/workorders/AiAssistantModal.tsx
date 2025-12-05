"use client";

import React from "react";
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
  // ❗ No headlessui Dialog / ModalShell at all – just a plain overlay.
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative mx-3 my-6 w-full max-w-4xl rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] 
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)] 
        text-neutral-100 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[color:var(--metal-border-soft,#1f2937)] bg-black/55 px-4 py-3 sm:px-5">
          <div>
            <h2
              className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-200"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              AI / TECH ASSISTANT
            </h2>
            <p className="mt-1 text-[11px] text-neutral-400">
              Ask for diagnostics, test plans, or repair procedures. Scoped to
              this job and vehicle where possible.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 
            bg-black/70 text-xs text-neutral-200 hover:bg-white/10 hover:text-white active:scale-95"
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Body – NO overflow rules here; TechAssistant owns scroll */}
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <section className="rounded-2xl border border-[var(--metal-border-soft)] bg-black/70 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.9)]">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--accent-copper-soft)] 
              bg-[rgba(15,23,42,0.95)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] 
              text-[var(--accent-copper-light)]"
            >
              Tech Assistant
            </div>

            <TechAssistant
              defaultVehicle={defaultVehicle}
              workOrderLineId={workOrderLineId}
            />
          </section>
        </div>
      </div>
    </div>
  );
}