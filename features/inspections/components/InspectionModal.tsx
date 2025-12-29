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
  sp.forEach((v, k) => {
    out[k] = v;
  });
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

  // 🎨 Shared with WorkOrderIdClient
  const cardBase =
    "rounded-2xl border border-slate-700/70 " +
    "bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.10),rgba(15,23,42,0.98))] " +
    "shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl";

  const innerShell =
    "rounded-2xl border border-slate-700/70 bg-slate-950/95";

  return (
    <Dialog
      open={open}
      onClose={close}
      className="fixed inset-0 z-[300] flex items-center justify-center px-2 py-6 sm:px-4"
    >
      {/* dimmed backdrop, keep it consistent with app */}
      <div className="fixed inset-0 z-[290] bg-black/70 backdrop-blur-sm" aria-hidden />

      <Dialog.Panel
        className={`relative z-[310] mx-auto w-full ${panelWidth} ${cardBase}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 rounded-t-2xl border-b border-slate-700/80 bg-slate-950/95 px-4 py-3">
          <div className="space-y-1">
            <Dialog.Title className="text-base font-semibold tracking-wide text-foreground sm:text-lg">
              {title}
            </Dialog.Title>
            {derived.template && (
              <p className="text-[11px] text-muted-foreground">
                Template:{" "}
                <span className="font-mono text-[rgba(184,115,51,0.95)]">
                  {derived.template}
                </span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] text-foreground hover:border-[rgba(184,115,51,0.9)] hover:bg-slate-900/80"
            >
              {compact ? "Expand" : "Shrink"}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-muted-foreground hover:bg-slate-800"
              aria-label="Close inspection"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          ref={scrollRef}
          className={`${bodyHeight} overflow-y-auto overscroll-contain ${innerShell} rounded-b-2xl p-4 text-foreground`}
          style={{ WebkitOverflowScrolling: "touch", scrollbarGutter: "stable both-edges" }}
        >
          {derived.missingWOLine && (
            <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
              <strong>Heads up:</strong>{" "}
              <code className="font-mono text-amber-50">workOrderLineId</code> is missing;
              save/finish will be blocked.
            </div>
          )}

          {!derived.template ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-6 text-center text-sm text-muted-foreground">
              No inspection selected.
            </div>
          ) : (
            <div className="mx-auto w-full max-w-5xl">
              <InspectionHost template={derived.template} embed params={derived.params} />
            </div>
          )}

          {/* Footer actions */}
          <div className="mt-4 flex flex-col gap-2 border-t border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-muted-foreground hover:border-[rgba(184,115,51,0.9)] hover:text-foreground hover:bg-slate-900/80 sm:text-[11px]"
            >
              {compact ? "Expand view" : "Shrink view"}
            </button>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs text-muted-foreground hover:bg-slate-800 sm:text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded-full border border-[rgba(184,115,51,0.9)] bg-[rgba(184,115,51,0.12)] px-4 py-1.5 text-xs font-medium text-[rgba(252,211,77,0.98)] hover:bg-[rgba(184,115,51,0.22)] sm:text-sm"
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