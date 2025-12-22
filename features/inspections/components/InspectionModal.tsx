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

function deriveTemplateFromUrl(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";

  // ✅ If we're on the fill route, template must come from ?template=
  if (last === "fill") {
    return url.searchParams.get("template") || null;
  }

  // fallback to your previous logic
  const idx = parts.findIndex((p) => p === "inspection" || p === "inspections");
  if (idx >= 0 && parts[idx + 1] && parts[idx + 1] !== "fill") return parts[idx + 1];

  // last resort
  return last || null;
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
        typeof window !== "undefined" ? window.location.origin : "http://localhost";
      const url = new URL(src, base);

      const template = deriveTemplateFromUrl(url);
      const params = paramsToObject(url.searchParams);

      // Normalize legacy param keys
      const woId =
        url.searchParams.get("workOrderId") ||
        url.searchParams.get("work_order_id") ||
        undefined;

      const lineId =
        url.searchParams.get("workOrderLineId") ||
        url.searchParams.get("work_order_line_id") ||
        url.searchParams.get("lineId") ||
        undefined;

      if (woId) {
        params.workOrderId = woId;
        params.work_order_id = woId;
      }
      if (lineId) {
        params.workOrderLineId = lineId;
        params.work_order_line_id = lineId;
        params.lineId = lineId;
      }

      const embedParam = url.searchParams.get("embed");
      const isEmbed =
        embedParam === "1" ||
        embedParam === "true" ||
        embedParam === "yes" ||
        embedParam === "embed";

      const hasWOLine =
        !!params.workOrderLineId || !!params.work_order_line_id || !!params.lineId;

      const parts = url.pathname.split("/").filter(Boolean);
      const isWorkOrderContext =
        parts.includes("work-orders") || !!params.workOrderId || !!params.work_order_id;

      const missingWOLine = isEmbed && isWorkOrderContext && !hasWOLine;

      return { template, params, missingWOLine };
    } catch {
      return { template: null, params: {}, missingWOLine: false };
    }
  }, [src]);

  const close = () => {
    onClose?.();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("inspection:close"));
    }
  };

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
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
      const { scrollTop, scrollHeight, clientHeight } = el;
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
      <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm" aria-hidden />

      <Dialog.Panel
        className={`relative z-[310] mx-auto w-full ${panelWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-3 rounded-t-lg border border-b-0 border-orange-500 bg-neutral-950/90 px-4 py-3">
          <div className="space-y-1">
            <Dialog.Title className="text-base font-blackops tracking-wide text-orange-400 sm:text-lg">
              {title}
            </Dialog.Title>
            {derived.template && (
              <p className="text-[11px] text-neutral-400">
                Template:{" "}
                <span className="font-mono text-neutral-200">{derived.template}</span>
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

        <div
          ref={scrollRef}
          className={`${bodyHeight} overflow-y-auto overscroll-contain rounded-b-lg border border-orange-500 bg-neutral-950 p-4 text-white shadow-xl`}
          style={{ WebkitOverflowScrolling: "touch", scrollbarGutter: "stable both-edges" }}
        >
          {derived.missingWOLine && (
            <div className="mb-3 rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-200">
              <strong>Heads up:</strong>{" "}
              <code className="font-mono text-yellow-100">workOrderLineId</code> is
              missing; save/finish will be blocked.
            </div>
          )}

          {!derived.template ? (
            <div className="rounded border border-neutral-800 bg-neutral-900 px-4 py-6 text-center text-sm text-neutral-400">
              No inspection selected.
            </div>
          ) : (
            <div className="mx-auto w-full max-w-5xl">
              <InspectionHost template={derived.template} embed params={derived.params} />
            </div>
          )}

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