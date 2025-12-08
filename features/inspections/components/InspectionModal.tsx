// features/inspections/components/InspectionModal.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@headlessui/react";
import InspectionHost from "@/features/inspections/components/inspectionHost";

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

      const embedParam = url.searchParams.get("embed");
      const isEmbed =
        embedParam === "1" ||
        embedParam === "true" ||
        embedParam === "yes" ||
        embedParam === "embed";

      // any key we use in WO context to point at a line
      const hasWOLine =
        !!url.searchParams.get("workOrderLineId") ||
        !!url.searchParams.get("work_order_line_id") ||
        !!url.searchParams.get("lineId");

      // only treat it as "work-order mode" if the URL clearly refers to a WO
      const isWorkOrderContext =
        parts.includes("work-orders") ||
        !!url.searchParams.get("workOrderId") ||
        !!url.searchParams.get("work_order_id");

      // ✅ only warn when embedded *and* we're really in a WO context
      const missingWOLine = isEmbed && isWorkOrderContext && !hasWOLine;

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

  // wheel/touch guard
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const target = el;
      const { scrollTop, scrollHeight, clientHeight } = target;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

      if ((e.deltaY > 0 && atBottom) || (e.deltaY < 0 && atTop)) {
        e.preventDefault();
        e.stopPropagation();
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

  const panelWidth = compact ? "max-w-4xl" : "max-w-6xl";
  const bodyHeight = compact ? "max-h-[80vh]" : "max-h-[92vh]";

  return (
    <Dialog
      open={open}
      onClose={close}
      className="fixed inset-0 z-[300] flex items-center justify-center px-2 py-6 sm:px-4"
    >
      <div
        className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      <Dialog.Panel
        className={`relative z-[310] mx-auto w-full ${panelWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-2 flex items-start justify-between gap-3 rounded-t-lg border border-b-0 border-orange-500 bg-neutral-950/90 px-4 py-3">
          <div className="space-y-1">
            <Dialog.Title className="text-base font-blackops tracking-wide text-orange-400 sm:text-lg">
              {title}
            </Dialog.Title>
            {derived.template && (
              <p className="text-[11px] text-neutral-400">
                Template:{" "}
                <span className="font-mono text-neutral-200">
                  {derived.template}
                </span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-[11px] text-neutral-100 hover:border-orange-500 hover:bg-neutral-800"
            >
              {compact ? "Expand" : "Shrink"}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          ref={scrollRef}
          className={`${bodyHeight} overflow-y-auto overscroll-contain rounded-b-lg border border-orange-500 bg-neutral-950 p-4 text-white shadow-xl`}
          style={{
            WebkitOverflowScrolling: "touch",
            scrollbarGutter: "stable both-edges",
          }}
        >
          {derived.missingWOLine && (
            <div className="mb-3 rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-200">
              <strong>Heads up:</strong>{" "}
              <code className="font-mono text-yellow-100">
                workOrderLineId
              </code>{" "}
              is missing; save/finish will be blocked.
            </div>
          )}

          {!derived.template ? (
            <div className="rounded border border-neutral-800 bg-neutral-900 px-4 py-6 text-center text-sm text-neutral-400">
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

          {/* Footer */}
          <div className="mt-4 flex flex-col gap-2 border-t border-neutral-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              className="inline-flex items-center justify-center rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100 hover:border-orange-500 hover:bg-neutral-800 sm:text-[11px]"
            >
              {compact ? "Expand View" : "Shrink View"}
            </button>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-xs sm:text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded border border-orange-500 bg-orange-500/10 px-4 py-1.5 text-xs sm:text-sm font-medium text-orange-100 hover:bg-orange-500/20"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}