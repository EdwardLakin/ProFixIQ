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
      const template =
        idx >= 0 ? parts[idx + 1] : parts[parts.length - 1] || null;
      const params = paramsToObject(url.searchParams);
      const missingWOLine = !url.searchParams.get("workOrderLineId");
      return { template, params, missingWOLine };
    } catch {
      return {
        template: src.replace(/^\//, ""),
        params: {} as Record<string, string>,
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

  // 💡 wheel/touch guard: keep scroll inside THIS box
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

  const panelWidth = compact ? "max-w-4xl" : "max-w-6xl";
  const bodyHeight = compact ? "max-h-[78vh]" : "max-h-[90vh]";

  return (
    <Dialog
      open={open}
      onClose={close}
      className="fixed inset-0 z-[300] flex items-center justify-center px-2 py-6 sm:px-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[295] bg-black/75 backdrop-blur-md"
        aria-hidden="true"
      />

      {/* Centered panel wrapper with radial wash behind card */}
      <div className="relative z-[300] flex w-full items-center justify-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
        />

        <Dialog.Panel
          className={`relative z-[310] mx-auto w-full ${panelWidth}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/80 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl">
            {/* subtle top copper line */}
            <div className="h-[3px] w-full bg-[linear-gradient(to_right,var(--accent-copper-soft,#b45309),var(--accent-copper,#f97316))]" />

            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="space-y-1">
                <Dialog.Title
                  className="text-base sm:text-lg font-semibold text-white"
                  style={{ fontFamily: "var(--font-blackops), system-ui" }}
                >
                  {title}
                </Dialog.Title>
                {derived.template && (
                  <p className="text-[11px] text-neutral-400">
                    Template:{" "}
                    <span className="font-mono text-xs text-orange-300">
                      {derived.template}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCompact((v) => !v)}
                  className="hidden rounded-full border border-[color:var(--metal-border-soft,#374151)] bg-black/70 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.85)] hover:border-orange-500 hover:bg-black/80 sm:inline-flex"
                >
                  {compact ? "Expand" : "Shrink"}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--metal-border-soft,#374151)] bg-black/80 text-sm text-neutral-200 shadow-[0_10px_24px_rgba(0,0,0,0.85)] hover:border-red-500 hover:bg-red-900/30"
                  aria-label="Close inspection"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div
              ref={scrollRef}
              className={`${bodyHeight} overflow-y-auto overscroll-contain border-t border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-b from-slate-950/95 via-black/90 to-slate-950/95 px-4 pb-4 pt-3 text-white sm:px-5`}
              style={{
                WebkitOverflowScrolling: "touch",
                scrollbarGutter: "stable both-edges",
              }}
            >
              {derived.missingWOLine && (
                <div className="mb-3 rounded-xl border border-yellow-700/80 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-100 shadow-[0_0_18px_rgba(250,204,21,0.25)]">
                  <strong className="font-semibold">Heads up:</strong>{" "}
                  <code className="font-mono text-yellow-100">
                    workOrderLineId
                  </code>{" "}
                  is missing; Save/Finish in the inspection flow may be blocked.
                </div>
              )}

              {!derived.template ? (
                <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-4 py-6 text-center text-sm text-neutral-400 shadow-[0_18px_45px_rgba(0,0,0,0.8)]">
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

              {/* Footer actions */}
              <div className="mt-5 flex flex-col gap-2 border-t border-[color:var(--metal-border-soft,#1f2937)] pt-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setCompact((v) => !v)}
                  className="inline-flex items-center justify-center rounded-full border border-[color:var(--metal-border-soft,#374151)] bg-black/70 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.8)] hover:border-orange-500 hover:bg-black/80"
                >
                  {compact ? "Expand View" : "Shrink View"}
                </button>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full border border-[color:var(--metal-border-soft,#374151)] bg-black/70 px-4 py-1.5 text-xs sm:text-sm font-medium uppercase tracking-[0.16em] text-neutral-200 shadow-[0_10px_24px_rgba(0,0,0,0.8)] hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft,#b45309),var(--accent-copper,#f97316))] px-5 py-1.5 text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-black shadow-[0_0_24px_rgba(212,118,49,0.7)] hover:brightness-110"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}