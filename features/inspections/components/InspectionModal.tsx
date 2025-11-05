// features/inspections/components/InspectionModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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

export default function InspectionModal({ open, src, title = "Inspection", onClose }: Props) {
  const [compact, setCompact] = useState(true);

  const derived = useMemo(() => {
    if (!src) return { template: null as string | null, params: {}, missingWOLine: false };
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

  // (you can keep or delete this debug block – leaving it since you had it)
  useEffect(() => {
    const log = (...a: any[]) => console.log("[scroll-debug]", ...a);
    const html = document.documentElement;
    const body = document.body;

    const watchOverflow = (el: HTMLElement, label: string) => {
      const obs = new MutationObserver(() => {
        const s = getComputedStyle(el);
        log(`${label} overflow`, { overflow: s.overflow, overflowY: s.overflowY });
      });
      obs.observe(el, { attributes: true, attributeFilter: ["style", "class"] });
      return obs;
    };

    const obs1 = watchOverflow(html, "html");
    const obs2 = watchOverflow(body, "body");

    const obs3 = new MutationObserver((muts) => {
      for (const m of muts) {
        if (
          m.target instanceof HTMLElement &&
          /(overflow-hidden|min-h-screen|h-screen)/.test(m.target.className)
        ) {
          log("child changed:", m.target, "class=", m.target.className);
        }
      }
    });
    obs3.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    const handler = (e: Event) => {
      log("event:", e.type, "target:", (e.target as HTMLElement)?.tagName);
    };
    window.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("wheel", handler, { passive: true });
    window.addEventListener("touchstart", handler, { passive: true });

    return () => {
      obs1.disconnect();
      obs2.disconnect();
      obs3.disconnect();
      window.removeEventListener("scroll", handler);
      window.removeEventListener("wheel", handler);
      window.removeEventListener("touchstart", handler);
    };
  }, []);

  return (
    <Dialog
      open={open}
      onClose={close}
      // IMPORTANT: let the whole overlay scroll and start items at the top
      className="fixed inset-0 z-[300] overflow-y-auto"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      {/* The container that centers horizontally but not vertically */}
      <div className="relative z-[310] min-h-screen px-4 py-6 flex justify-center">
        <Dialog.Panel
          // make the panel itself flex/column so inner content can shrink and scroll
          className="relative w-full max-w-5xl flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
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

          {/* Scrollable body */}
          <div
            className="
              flex-1
              min-h-0
              max-h-[85vh]
              overflow-y-auto
              overscroll-contain touch-pan-y
              rounded-lg border border-orange-400 bg-neutral-950 p-4 text-white shadow-xl
            "
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarGutter: "stable both-edges",
            }}
          >
            {derived.missingWOLine && (
              <div className="mb-3 rounded border border-yellow-700 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-200">
                <strong>Heads up:</strong> <code>workOrderLineId</code> is missing; Save/Finish may be blocked.
              </div>
            )}

            {!derived.template ? (
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-center text-neutral-400">
                No inspection selected.
              </div>
            ) : (
              // 👇 this wrapper makes an h-screen/min-h-screen child behave in a scrollbox
              <div className="mx-auto w-full max-w-5xl min-h-0">
                <InspectionHost template={derived.template} embed params={derived.params} />
              </div>
            )}

            {/* footer inside scroll so it's reachable on short screens */}
            <div className="mt-4 flex items-center justify-between gap-2">
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
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}