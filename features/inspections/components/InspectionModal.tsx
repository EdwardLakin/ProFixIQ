// features/inspections/components/InspectionModal.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import InspectionHost from "@/features/inspections/components/inspectionHost";
import ModalShell from "@/features/shared/components/ModalShell";

type Props = {
  open: boolean;
  src: string | null;
  title?: string;
  onClose?: () => void;
};

function paramsToObject(sp: URLSearchParams) {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => (out[k] = v));
  return out;
}

export default function InspectionModal({
  open,
  src,
  title = "Inspection",
  onClose,
}: Props) {
  const [compact, setCompact] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const derived = useMemo(() => {
    if (!src) {
      return {
        template: null as string | null,
        params: {} as Record<string, string>,
        missingWOLine: false,
      };
    }

    try {
      const base =
        typeof window !== "undefined"
          ? window.location.origin
          : "http://localhost";
      const url = new URL(src, base);
      const parts = url.pathname.split("/").filter(Boolean);

      const idx = parts.findIndex(
        (p) => p === "inspection" || p === "inspections",
      );
      const template = idx >= 0 ? parts[idx + 1] : parts[parts.length - 1];

      const params = paramsToObject(url.searchParams);
      const missingWOLine = !url.searchParams.get("workOrderLineId");

      return { template, params, missingWOLine };
    } catch {
      return {
        template: src.replace(/^\//, ""),
        params: {},
        missingWOLine: false,
      };
    }
  }, [src]);

  const close = () => {
    onClose?.();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("inspection:close"));
    }
  };

  // 💡 keep scroll inside this modal body (wheel/touch guard)
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const target = el;
      const { scrollTop, scrollHeight, clientHeight } = target;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

      if (e.deltaY > 0 && atBottom) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.deltaY < 0 && atTop) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };

    let lastY = 0;
    const onTouchStart = (e: TouchEvent) => {
      lastY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const target = el;
      const { scrollTop, scrollHeight, clientHeight } = target;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
      const currentY = e.touches[0]?.clientY ?? 0;
      const goingDown = lastY > currentY;
      const goingUp = lastY < currentY;
      lastY = currentY;

      if ((goingDown && atBottom) || (goingUp && atTop)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [open]);

  const bodyHeight = compact ? "max-h-[80vh]" : "max-h-[92vh]";

  return (
    <ModalShell
      isOpen={open}
      onClose={close}
      title={title}
      size="xl"
      hideFooter
    >
      {/* Top meta row (inside shell body) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          {derived.template && (
            <p className="text-[11px] text-neutral-400">
              Template:{" "}
              <span className="font-mono text-neutral-200">
                {derived.template}
              </span>
            </p>
          )}
          {derived.missingWOLine && (
            <div className="mt-1 rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-[11px] text-yellow-200">
              <strong>Heads up:</strong>{" "}
              <code className="font-mono text-yellow-100">
                workOrderLineId
              </code>{" "}
              is missing; Save/Finish may be blocked.
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCompact((v) => !v)}
          className="rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-200 hover:bg-white/5"
        >
          {compact ? "Expand view" : "Shrink view"}
        </button>
      </div>

      {/* Scrollable inspection body */}
      <div
        ref={scrollRef}
        className={`${bodyHeight} overflow-y-auto overscroll-contain rounded-2xl border border-[var(--metal-border-soft)] bg-black/40 p-4 text-white shadow-inner`}
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarGutter: "stable both-edges",
        }}
      >
        {!derived.template ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 px-4 py-6 text-center text-sm text-neutral-400">
            No inspection selected.
          </div>
        ) : (
          <div className="mx-auto w-full max-w-5xl">
            <InspectionHost
              template={derived.template}
              embed
              params={derived.params}
            />
          </div>
        )}

        {/* Local footer for inspection */}
        <div className="mt-4 flex flex-col gap-2 border-t border-neutral-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setCompact((v) => !v)}
            className="inline-flex items-center justify-center rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-200 hover:bg-white/5"
          >
            {compact ? "Expand view" : "Shrink view"}
          </button>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-neutral-200 hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}