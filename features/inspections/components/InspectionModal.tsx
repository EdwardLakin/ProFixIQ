"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Dialog } from "@headlessui/react";
import InspectionHost from "@/features/inspections/components/inspectionHost";

type Props = {
  open: boolean;
  src: string | null;
  title?: string;
  // ✅ make it required so the modal can actually close
  onClose: () => void;
};

function paramsToObject(sp: URLSearchParams) {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

/**
 * We have TWO concepts:
 * 1) screenTemplate: which inspection screen to render (e.g. "generic")
 * 2) displayTemplate: the human template identity (e.g. "Air Brake Test" or templateId)
 */
function deriveScreenTemplateFromUrl(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";

  // ✅ If we're on the fill route, screen template comes from ?template=
  if (last === "fill") {
    return url.searchParams.get("template") || null;
  }

  const idx = parts.findIndex((p) => p === "inspection" || p === "inspections");
  if (idx >= 0 && parts[idx + 1] && parts[idx + 1] !== "fill") {
    return parts[idx + 1];
  }

  return last || null;
}

function deriveDisplayTemplateFromUrl(url: URL): string | null {
  const name =
    url.searchParams.get("templateName") ||
    url.searchParams.get("template_name") ||
    null;

  const id =
    url.searchParams.get("templateId") ||
    url.searchParams.get("template_id") ||
    null;

  return name || id || deriveScreenTemplateFromUrl(url);
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
        screenTemplate: null as string | null,
        displayTemplate: null as string | null,
        params: {} as Record<string, string>,
        missingWOLine: false,
      };
    }

    try {
      const base =
        typeof window !== "undefined" ? window.location.origin : "http://localhost";
      const url = new URL(src, base);

      const screenTemplate = deriveScreenTemplateFromUrl(url);
      const displayTemplate = deriveDisplayTemplateFromUrl(url);
      const params = paramsToObject(url.searchParams);

      // ✅ Force embed mode in the modal
      params.embed = params.embed || "1";
      params.compact = params.compact || "1";

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

      const tName =
        url.searchParams.get("templateName") ||
        url.searchParams.get("template_name") ||
        undefined;
      const tId =
        url.searchParams.get("templateId") ||
        url.searchParams.get("template_id") ||
        undefined;

      if (tName) {
        params.templateName = tName;
        params.template_name = tName;
      }
      if (tId) {
        params.templateId = tId;
        params.template_id = tId;
      }

      const embedParam = url.searchParams.get("embed");
      const isEmbed =
        embedParam === "1" ||
        embedParam === "true" ||
        embedParam === "yes" ||
        embedParam === "embed" ||
        params.embed === "1" ||
        params.embed === "true" ||
        params.embed === "yes" ||
        params.embed === "embed";

      const hasWOLine =
        !!params.workOrderLineId || !!params.work_order_line_id || !!params.lineId;

      const parts = url.pathname.split("/").filter(Boolean);
      const isWorkOrderContext =
        parts.includes("work-orders") || !!params.workOrderId || !!params.work_order_id;

      const missingWOLine = isEmbed && isWorkOrderContext && !hasWOLine;

      return { screenTemplate, displayTemplate, params, missingWOLine };
    } catch {
      return {
        screenTemplate: null,
        displayTemplate: null,
        params: {},
        missingWOLine: false,
      };
    }
  }, [src]);

  const close = useCallback(() => {
    onClose();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("inspection:close"));
    }
  }, [onClose]);

  // ✅ Close when inspection finishes (FinishInspectionButton dispatches completed + close)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onCloseEvt = () => close();
    const onCompletedEvt = () => close();

    window.addEventListener("inspection:close", onCloseEvt);
    window.addEventListener("inspection:completed", onCompletedEvt);

    return () => {
      window.removeEventListener("inspection:close", onCloseEvt);
      window.removeEventListener("inspection:completed", onCompletedEvt);
    };
  }, [close]);

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

  const panelWidth = compact ? "max-w-6xl" : "max-w-[1440px]";
  const bodyHeight = compact ? "h-[82vh]" : "h-[calc(96vh-64px)]";

  const cardBase =
    "overflow-hidden rounded-[26px] border border-[color:var(--theme-border-soft)] " +
    "bg-[var(--theme-gradient-panel)] text-[color:var(--theme-text-primary)] " +
    "shadow-[var(--theme-shadow-medium)]";

  const innerShell = "bg-[var(--theme-gradient-panel)]";

  return (
    <Dialog
      open={open}
      // ✅ Backdrop click + Esc will call close()
      onClose={close}
      className="pfq-inspection-modal fixed inset-0 z-[500] flex items-center justify-center px-2 py-3 sm:px-4 sm:py-5"
    >
      {/* clickable dimmed backdrop */}
      <div
        className="fixed inset-0 bg-[color:var(--theme-surface-inset)]/90 backdrop-blur-md"
        aria-hidden
      />

      <Dialog.Panel
        className={`relative z-[510] mx-auto w-full ${panelWidth} ${cardBase}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 z-20 h-[3px] bg-[linear-gradient(90deg,rgba(184,115,51,0),rgba(184,115,51,0.95),rgba(253,186,116,0.95),rgba(184,115,51,0))]" />
        <div className="pointer-events-none absolute inset-x-10 top-0 z-10 h-24 bg-[radial-gradient(circle_at_top,rgba(184,115,51,0.14),transparent_72%)]" />

        {/* Header */}
        <div className="relative flex items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <Dialog.Title
              className="truncate text-[0.8rem] uppercase tracking-[0.22em] text-[color:var(--theme-text-primary)]"
              style={{ fontFamily: "var(--font-blackops), system-ui, sans-serif" }}
            >
              {title}
            </Dialog.Title>

            {derived.displayTemplate && (
              <p className="mt-0.5 truncate text-xs text-[color:var(--theme-text-secondary)]">
                <span className="font-medium text-[color:var(--brand-primary)]">
                  {derived.displayTemplate}
                </span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-primary)] transition hover:border-[var(--accent-copper-soft)] hover:bg-[color:var(--theme-surface-subtle)]"
            >
              {compact ? "Expand" : "Shrink"}
            </button>
            <button
              type="button"
              onClick={close}
              className="grid h-8 w-8 place-items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[0.78rem] text-[color:var(--theme-text-primary)] transition hover:border-[var(--accent-copper-soft)] hover:bg-[color:var(--theme-surface-subtle)] active:scale-95"
              aria-label="Close inspection"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          ref={scrollRef}
          className={`${bodyHeight} overflow-y-auto overscroll-contain ${innerShell} text-[color:var(--theme-text-primary)]`}
          style={{
            WebkitOverflowScrolling: "touch",
            scrollbarGutter: "stable both-edges",
          }}
        >
          {derived.missingWOLine && (
            <div className="m-4 rounded-xl border border-amber-400/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <strong>Heads up:</strong>{" "}
              <code className="font-mono text-amber-50">workOrderLineId</code> is
              missing; save/finish will be blocked.
            </div>
          )}

          {!derived.screenTemplate ? (
            <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-4 py-6 text-center text-sm text-muted-foreground">
              No inspection selected.
            </div>
          ) : (
            <div className="mx-auto w-full">
              <InspectionHost template={derived.screenTemplate} embed params={derived.params} />
            </div>
          )}
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
