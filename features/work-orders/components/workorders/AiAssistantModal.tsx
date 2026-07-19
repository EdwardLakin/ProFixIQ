"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import MobileTechnicianAssistant from "@/features/mobile/technician/MobileTechnicianAssistant";
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
  const pathname = usePathname();
  const mobileRoute = pathname.startsWith("/mobile");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  if (!mobileRoute) {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto pb-10 pt-10">
        <div
          className="absolute inset-0 bg-[color:var(--theme-surface-overlay)] backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <div className="relative z-[210] mx-4 w-full max-w-3xl">
          <div className="var(--theme-gradient-panel)">
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

  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-end justify-center overflow-hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close assistant"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask ProFixIQ"
        className="relative z-[610] max-h-[100dvh] w-full rounded-t-[28px] border border-b-0 border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] shadow-[var(--theme-shadow-medium)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
          <div className="min-w-0">
            <h2
              className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-primary)]"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Ask ProFixIQ
            </h2>
            <p className="mt-1 text-[0.72rem] leading-5 text-[color:var(--theme-text-secondary)]">
              Ask diagnosis, testing, specification, or repair questions using
              this job and vehicle context. Nothing is changed automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] text-sm text-[color:var(--theme-text-primary)] active:scale-95"
            aria-label="Close ProFixIQ assistant"
          >
            ✕
          </button>
        </div>

        <div
          className="max-h-[calc(100dvh-7rem)] overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <MobileTechnicianAssistant
            defaultVehicle={defaultVehicle}
            workOrderLineId={workOrderLineId}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
