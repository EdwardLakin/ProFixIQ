"use client";

import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
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
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[400]" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="transition-opacity duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xl"
            aria-hidden="true"
          />
        </Transition.Child>

        {/* Centered panel */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center px-3 py-6 sm:px-4">
            <Transition.Child
              as={Fragment}
              enter="transition duration-150 transform"
              enterFrom="opacity-0 scale-95 translate-y-2"
              enterTo="opacity-100 scale-100 translate-y-0"
              leave="transition duration-150 transform"
              leaveFrom="opacity-100 scale-100 translate-y-0"
              leaveTo="opacity-0 scale-95 translate-y-2"
            >
              <Dialog.Panel className="w-full max-w-4xl overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)] text-neutral-100 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[color:var(--metal-border-soft,#1f2937)] bg-black/50 px-4 py-3 sm:px-5">
                  <div>
                    <Dialog.Title
                      className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-200"
                      style={{ fontFamily: "var(--font-blackops), system-ui" }}
                    >
                      AI / TECH ASSISTANT
                    </Dialog.Title>
                    <p className="mt-1 text-[11px] text-neutral-400">
                      Scoped to the current job and vehicle where possible.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/70 text-xs text-neutral-200 hover:bg-white/10 hover:text-white active:scale-95"
                    aria-label="Close"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>

                {/* Body – no overflow rules here on purpose, TechAssistant owns scroll */}
                <div className="px-4 py-4 sm:px-5 sm:py-5">
                  <section className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.9)]">
                    {/* Copper stripe / label */}
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-copper-soft)] bg-[color:rgba(15,23,42,0.95)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
                        Tech Assistant
                      </div>
                    </div>

                    <TechAssistant
                      defaultVehicle={defaultVehicle}
                      workOrderLineId={workOrderLineId}
                    />
                  </section>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}