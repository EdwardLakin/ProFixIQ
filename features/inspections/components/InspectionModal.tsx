// features/inspections/components/InspectionModal.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@headlessui/react";
import InspectionHost from "@/features/inspections/components/inspectionHost";

/* -------------------------------- types -------------------------------- */
type Props = {
  open: boolean;
  src: string | null;
  title?: string;
  onClose?: () => void;
};

type Derived = {
  template: string | null;
  params: Record<string, string>;
  missingWOLine: boolean;
};

/* ------------------------------ utils/helpers ------------------------------ */
function paramsToObject(sp: URLSearchParams) {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => (out[k] = v));
  return out;
}

/**
 * Keeps the modal’s scroll area alive even if nested content (or a parent)
 * flips overflow to hidden. Also restores iOS momentum scrolling.
 */
function useScrollJailbreaker(active: boolean, panelRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!active) return;
    const el = panelRef.current;
    if (!el) return;

    const restore = () => {
      // keep the scroller healthy
      el.style.overflowY = "auto";
      el.style.maxHeight = "85vh";
      el.style.setProperty("-webkit-overflow-scrolling", "touch");
      el.style.setProperty("scrollbar-gutter", "stable both-edges");
      el.style.setProperty("overscroll-behavior", "contain");

      // if something locked the page, flip it back
      const docEl = document.documentElement;
      const body = document.body;
      if (getComputedStyle(docEl).overflow === "hidden") docEl.style.overflow = "auto";
      if (getComputedStyle(body).overflow === "hidden") body.style.overflow = "auto";
    };

    // run immediately and shortly after hydration/layout
    restore();
    const t1 = setTimeout(restore, 300);
    const t2 = setTimeout(restore, 1500);

    // watch for anything that toggles overflow on html/body
    const flipIfHidden = () => {
      const de = document.documentElement;
      const bo = document.body;
      if (getComputedStyle(de).overflow === "hidden") de.style.overflow = "auto";
      if (getComputedStyle(bo).overflow === "hidden") bo.style.overflow = "auto";
    };
    const mo1 = new MutationObserver(flipIfHidden);
    const mo2 = new MutationObserver(flipIfHidden);
    mo1.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    mo2.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      mo1.disconnect();
      mo2.disconnect();
    };
  }, [active, panelRef]);
}

/* -------------------------------- component -------------------------------- */
export default function InspectionModal({ open, src, title = "Inspection", onClose }: Props) {
  const [compact, setCompact] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollJailbreaker(open, scrollRef);

  const derived = useMemo<Derived>(() => {
    if (!src) return { template: null, params: {}, missingWOLine: false };

    try {
      const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
      const url = new URL(src, base);
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "inspection" || p === "inspections");
      const template = idx >= 0 ? parts[idx + 1] : parts[parts.length - 1];
      const params = paramsToObject(url.searchParams);
      const missingWOLine = !url.searchParams.get("workOrderLineId");
      return { template, params, missingWOLine };
    } catch {
      return { template: src.replace(/^\//, ""), params: {}, missingWOLine: false };
    }
  }, [src]);

  const close = () => {
    onClose?.();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("inspection:close"));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      // keep this ABOVE FocusedJobModal (that uses z-[100]/[110])
      className="fixed inset-0 z-[300] flex items-center justify-center"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel wrapper — matches Focused Job width */}
      <div className="relative z-[310] mx-4 my-6 w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        {/* Title row (outside scroller, stays put) */}
        <div className="mb-2 flex items-start justify-between gap-3">
          <Dialog.Title className="text-lg font-header font-semibold tracking-wide text-white">
            {title}
          </Dialog.Title>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-800"
              title={compact ? "Maximize" : "Minimize"}
            >
              {compact ? "Maximize" : "Minimize"}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scroll container */}
        <div
          ref={scrollRef}
          className="inspection-scroll max-h-[85vh] overflow-y-auto overscroll-contain rounded-lg border border-orange-400 bg-neutral-950 p-4 text-white shadow-xl min-h-0"
        >
          {/* Neutralize layout breakers from children inside the scroll area only */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
                .inspection-scroll :is(.h-screen,[class*="h-screen"]){height:auto!important}
                .inspection-scroll :is(.min-h-screen,[class*="min-h-screen"]){min-height:0!important}
                /* If any child forces overflow-hidden, don't let it kill the scroller */
                .inspection-scroll :is(.overflow-hidden,[class*="overflow-hidden"]){overflow:visible!important}
              `,
            }}
          />

          {/* Optional warning if WO line is missing */}
          {derived.missingWOLine && (
            <div className="mb-3 rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-200">
              <strong>Heads up:</strong> <code>workOrderLineId</code> is missing; Save/Finish may be blocked.
            </div>
          )}

          {/* Body */}
          {!derived.template ? (
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-center text-neutral-400">
              No inspection selected.
            </div>
          ) : (
            <div className="mx-auto w-full max-w-5xl min-h-0">
              <InspectionHost template={derived.template} embed params={derived.params} />
            </div>
          )}

          {/* Footer (inside scroller so it stays reachable on small screens) */}
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs hover:bg-neutral-800"
            >
              {compact ? "Maximize" : "Minimize"}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}