"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import MobileTechnicianAssistant from "@/features/mobile/technician/MobileTechnicianAssistant";
import ModalShell from "@/features/shared/components/ModalShell";
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
    return (
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="ASK PROFIXIQ"
        size="lg"
        hideFooter
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-copper-light)]">
              AI / Tech Assistant
            </div>
            <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
              Ask diagnosis, testing, specification, or repair questions using
              this job and vehicle context. Nothing is changed automatically.
            </p>
          </div>

          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-3 shadow-[var(--theme-shadow-medium)]">
            <TechAssistant
              defaultVehicle={defaultVehicle}
              workOrderLineId={workOrderLineId}
            />
          </div>
        </div>
      </ModalShell>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-end justify-center overflow-hidden">
      <button
        type="button"
        className="absolute inset-0 bg-[color:var(--theme-surface-inset)] backdrop-blur-md"
        onClick={onClose}
        aria-label="Close assistant"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask ProFixIQ"
        className="relative z-[610] max-h-[100dvh] w-full overflow-hidden rounded-t-[28px] border border-b-0 border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)]"
      >
        <div className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,rgba(184,115,51,0),rgba(184,115,51,0.95),rgba(253,186,116,0.95),rgba(184,115,51,0))]" />
        <div className="pointer-events-none absolute inset-x-10 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(184,115,51,0.14),transparent_72%)]" />

        <div className="relative flex items-start justify-between gap-3 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
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
