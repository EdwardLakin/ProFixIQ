"use client";

import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const mobileRoute = pathname.startsWith("/mobile");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[600] flex justify-center overflow-hidden ${
        mobileRoute
          ? "items-end"
          : "items-start overflow-y-auto px-4 pb-10 pt-10"
      }`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close assistant"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={mobileRoute ? "Ask ProFixIQ" : "AI tech assistant"}
        className={`relative z-[610] w-full border border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] shadow-[var(--theme-shadow-medium)] ${
          mobileRoute
            ? "max-h-[100dvh] rounded-t-[28px] border-b-0"
            : "max-w-3xl rounded-[28px]"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2
              className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-primary)]"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              {mobileRoute ? "Ask ProFixIQ" : "AI / Tech Assistant"}
            </h2>
            <p className="mt-1 text-[0.72rem] leading-5 text-[color:var(--theme-text-secondary)]">
              {mobileRoute
                ? "Ask diagnosis, testing, specification, or repair questions using this job and vehicle context. Nothing is changed automatically."
                : "Scoped to this job and vehicle where possible."}
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
          className={`overflow-y-auto ${
            mobileRoute
              ? "max-h-[calc(100dvh-7rem)] px-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3"
              : "max-h-[calc(100vh-9rem)] px-5 py-4"
          }`}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <TechAssistant
            defaultVehicle={defaultVehicle}
            workOrderLineId={workOrderLineId}
            compact={mobileRoute}
            questionOnly={mobileRoute}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
