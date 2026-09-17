"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@headlessui/react";
import { createPortal } from "react-dom";

import InspectionHost from "@/features/inspections/components/inspectionHost";
import InspectionWorkspaceShell, {
  type InspectionWorkspaceCounts,
  type InspectionWorkspaceFinding,
  type InspectionWorkspaceSection,
} from "@/features/inspections/workspace/InspectionWorkspaceShell";
import {
  getLatestInspectionWorkspaceState,
  requestInspectionWorkspaceSection,
  subscribeInspectionWorkspaceState,
  type InspectionWorkspaceSessionSnapshot,
} from "@/features/inspections/workspace/inspectionWorkspaceBridge";

type Props = {
  open: boolean;
  src: string | null;
  title?: string;
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

function normalizedStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isCompletedInspectionStatus(value: unknown): boolean {
  return ["ok", "pass", "na", "fail", "recommend"].includes(
    normalizedStatus(value),
  );
}

function WorkspaceJumpControl({
  label,
  onClick,
  emphasis = false,
}: {
  label: string;
  onClick: () => void;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        emphasis
          ? "inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-sky-500/70 bg-sky-600 px-3 text-sm font-semibold text-white transition hover:bg-sky-500"
          : "inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]"
      }
    >
      {label}
    </button>
  );
}

export default function InspectionModal({
  open,
  src,
  title = "Inspection",
  onClose,
}: Props) {
  const [compact, setCompact] = useState(true);
  const [workspaceTarget, setWorkspaceTarget] = useState<HTMLElement | null>(null);
  const [workspaceSession, setWorkspaceSession] =
    useState<InspectionWorkspaceSessionSnapshot | null>(null);
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

      params.embed = params.embed || "1";
      params.compact = params.compact || "1";

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

  const workspaceIdentity = useMemo(
    () => ({
      inspectionId: derived.params.inspectionId || null,
      workOrderLineId:
        derived.params.workOrderLineId ||
        derived.params.work_order_line_id ||
        derived.params.lineId ||
        null,
    }),
    [derived.params],
  );

  const close = useCallback(() => {
    onClose();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("inspection:close"));
    }
  }, [onClose]);

  // On the Work Order page the repair-lines module already owns the exact
  // left / center / right workspace footprint. Portal the inspection into
  // that footprint instead of opening a second navigation surface or modal.
  // Other callers keep the existing modal fallback unchanged.
  useEffect(() => {
    if (!open || typeof document === "undefined") {
      setWorkspaceTarget(null);
      return;
    }

    const target = document.querySelector<HTMLElement>(
      '[data-workspace-module="repairLines"]',
    );
    if (!target) {
      setWorkspaceTarget(null);
      return;
    }

    const previousPosition = target.style.position;
    const computedPosition = window.getComputedStyle(target).position;
    if (computedPosition === "static") {
      target.style.position = "relative";
    }
    target.dataset.inspectionWorkspaceHost = "true";
    setWorkspaceTarget(target);

    return () => {
      delete target.dataset.inspectionWorkspaceHost;
      target.style.position = previousPosition;
      setWorkspaceTarget(null);
    };
  }, [open]);

  // Mirror only the canonical inspection hook's UI state. The workspace does
  // not own inspection persistence or mutations; it just renders that state.
  useEffect(() => {
    if (!open || !workspaceTarget) {
      setWorkspaceSession(null);
      return;
    }

    const matchesWorkspace = (snapshot: InspectionWorkspaceSessionSnapshot) => {
      const expectedLineId = String(workspaceIdentity.workOrderLineId ?? "").trim();
      const snapshotLineId = String(snapshot.workOrderLineId ?? "").trim();
      if (expectedLineId && snapshotLineId !== expectedLineId) return false;

      const expectedInspectionId = String(workspaceIdentity.inspectionId ?? "").trim();
      const snapshotInspectionId = String(snapshot.id ?? "").trim();
      if (
        expectedInspectionId &&
        snapshotInspectionId &&
        snapshotInspectionId !== expectedInspectionId
      ) {
        return false;
      }

      return true;
    };

    const latest = getLatestInspectionWorkspaceState(workspaceIdentity);
    if (latest && matchesWorkspace(latest)) setWorkspaceSession(latest);

    return subscribeInspectionWorkspaceState((snapshot) => {
      if (matchesWorkspace(snapshot)) setWorkspaceSession(snapshot);
    });
  }, [open, workspaceIdentity, workspaceTarget]);

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
    if (!open || workspaceTarget) return;
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
  }, [open, workspaceTarget]);

  const workspaceModel = useMemo(() => {
    const rawSections = Array.isArray(workspaceSession?.sections)
      ? workspaceSession.sections
      : [];

    const sections: InspectionWorkspaceSection[] = rawSections.map(
      (section, sectionIndex) => {
        const items = Array.isArray(section.items) ? section.items : [];
        const completed = items.filter((item) =>
          isCompletedInspectionStatus(item.status),
        ).length;

        return {
          id: String(sectionIndex),
          title: String(section.title || `Section ${sectionIndex + 1}`),
          subtitle:
            items.length > 0
              ? `${completed} of ${items.length} items completed`
              : "No checklist items",
          completed,
          total: items.length,
        };
      },
    );

    let fail = 0;
    let recommend = 0;
    let passOrNa = 0;
    let submittedFindings = 0;
    const findings: InspectionWorkspaceFinding[] = [];

    rawSections.forEach((section, sectionIndex) => {
      const items = Array.isArray(section.items) ? section.items : [];
      items.forEach((item, itemIndex) => {
        const status = normalizedStatus(item.status);
        if (status === "fail") fail += 1;
        if (status === "recommend") recommend += 1;
        if (status === "ok" || status === "pass" || status === "na") {
          passOrNa += 1;
        }
        if (item.estimateSubmitted === true) submittedFindings += 1;

        if (status === "fail" || status === "recommend") {
          const label = String(item.item || item.name || `Finding ${itemIndex + 1}`);
          const note = String(item.notes || item.note || "").trim();
          findings.push({
            id: `${sectionIndex}:${itemIndex}`,
            title: label,
            status,
            summary: note || undefined,
            meta: `${String(section.title || `Section ${sectionIndex + 1}`)}${
              item.estimateSubmitted ? " · submitted to Quote Review" : ""
            }`,
          });
        }
      });
    });

    const voiceLines = Number(
      workspaceSession?.voiceMeta?.linesAddedToWorkOrder ?? 0,
    );
    const counts: InspectionWorkspaceCounts = {
      fail,
      recommend,
      passOrNa,
      workOrderLines: Math.max(
        Number.isFinite(voiceLines) ? voiceLines : 0,
        submittedFindings,
      ),
    };

    const requestedActiveIndex = Number(workspaceSession?.currentSectionIndex ?? 0);
    const activeIndex =
      Number.isInteger(requestedActiveIndex) &&
      requestedActiveIndex >= 0 &&
      requestedActiveIndex < sections.length
        ? requestedActiveIndex
        : 0;

    return {
      sections,
      counts,
      findings,
      completedSections: sections.filter(
        (section) => section.total > 0 && section.completed >= section.total,
      ).length,
      activeIndex,
      activeSectionId: sections.length > 0 ? String(activeIndex) : null,
    };
  }, [workspaceSession]);

  const scrollToWorkspaceText = useCallback(
    (text: string) => {
      if (!workspaceTarget) return;
      const normalized = text.toLowerCase();
      const candidates = workspaceTarget.querySelectorAll<HTMLElement>(
        "button, h2, h3, label, [role='group']",
      );
      const target = Array.from(candidates).find((candidate) =>
        String(candidate.textContent ?? "").toLowerCase().includes(normalized),
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [workspaceTarget],
  );

  const scrollToActiveSection = useCallback(() => {
    if (!workspaceTarget) return;
    workspaceTarget
      .querySelector<HTMLElement>(
        `[data-section-index="${workspaceModel.activeIndex}"]`,
      )
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [workspaceModel.activeIndex, workspaceTarget]);

  const handleWorkspaceSectionSelect = useCallback(
    (sectionId: string) => {
      const sectionIndex = Number(sectionId);
      if (!Number.isInteger(sectionIndex)) return;

      requestInspectionWorkspaceSection({
        inspectionId: workspaceSession?.id || workspaceIdentity.inspectionId,
        workOrderLineId:
          workspaceSession?.workOrderLineId || workspaceIdentity.workOrderLineId,
        sectionIndex,
      });

      window.requestAnimationFrame(() => {
        workspaceTarget
          ?.querySelector<HTMLElement>(`[data-section-index="${sectionIndex}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [workspaceIdentity, workspaceSession, workspaceTarget],
  );

  const inspectionContent = (
    <>
      {derived.missingWOLine && (
        <div className="m-4 rounded-xl border border-amber-400/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <strong>Heads up:</strong>{" "}
          <code className="font-mono">workOrderLineId</code> is missing; save/finish will be blocked.
        </div>
      )}

      {!derived.screenTemplate ? (
        <div className="m-4 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-4 py-6 text-center text-sm text-muted-foreground">
          No inspection selected.
        </div>
      ) : (
        <InspectionHost
          template={derived.screenTemplate}
          embed
          params={derived.params}
        />
      )}
    </>
  );

  if (!open) return null;

  if (workspaceTarget) {
    return createPortal(
      <section
        data-inspection-workspace-transition="true"
        className="absolute inset-0 z-30 min-h-[44rem] overflow-y-auto rounded-[24px] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3 shadow-[0_20px_55px_rgba(15,23,42,0.14)]"
      >
        <div className="sticky top-0 z-40 mb-3 flex items-center justify-between gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]/95 px-4 py-2.5 backdrop-blur">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-primary)]">
              Work order inspection
            </div>
            <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
              {workspaceSession?.templateitem ||
                workspaceSession?.templateName ||
                derived.displayTemplate ||
                title}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]"
          >
            Back to job
          </button>
        </div>

        <InspectionWorkspaceShell
          title={
            workspaceSession?.templateitem ||
            workspaceSession?.templateName ||
            derived.displayTemplate ||
            title
          }
          subtitle="Live inspection state · existing inspection handlers remain canonical"
          sections={workspaceModel.sections}
          activeSectionId={workspaceModel.activeSectionId}
          onSelectSection={handleWorkspaceSectionSelect}
          counts={workspaceModel.counts}
          completedSections={workspaceModel.completedSections}
          totalSections={workspaceModel.sections.length}
          findings={workspaceModel.findings}
          center={inspectionContent}
          voiceControl={
            <WorkspaceJumpControl
              label="Go to voice controls"
              emphasis
              onClick={() => scrollToWorkspaceText("Voice controls")}
            />
          }
          reviewFindingsControl={
            <WorkspaceJumpControl
              label="Review live findings"
              onClick={() => scrollToWorkspaceText("Live Findings")}
            />
          }
          addPhotoControl={
            <WorkspaceJumpControl
              label="Active section"
              onClick={scrollToActiveSection}
            />
          }
          signControl={
            <WorkspaceJumpControl
              label="Go to signature"
              onClick={() => scrollToWorkspaceText("signature")}
            />
          }
          submitControl={
            <WorkspaceJumpControl
              label="Go to submit findings"
              emphasis
              onClick={() => scrollToWorkspaceText("Submit findings before signing")}
            />
          }
        />
      </section>,
      workspaceTarget,
    );
  }

  const panelWidth = compact ? "max-w-6xl" : "max-w-[1440px]";
  const bodyHeight = compact ? "h-[82vh]" : "h-[calc(96vh-64px)]";

  return (
    <Dialog
      open={open}
      onClose={close}
      className="pfq-inspection-modal fixed inset-0 z-[500] flex items-center justify-center px-2 py-3 sm:px-4 sm:py-5"
    >
      <div
        className="fixed inset-0 bg-[color:var(--theme-surface-inset)]/90 backdrop-blur-md"
        aria-hidden
      />

      <Dialog.Panel
        className={`relative z-[510] mx-auto w-full ${panelWidth} overflow-hidden rounded-[26px] border border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 z-20 h-[3px] bg-[linear-gradient(90deg,rgba(184,115,51,0),rgba(184,115,51,0.95),rgba(253,186,116,0.95),rgba(184,115,51,0))]" />

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

        <div
          ref={scrollRef}
          className={`${bodyHeight} overflow-y-auto overscroll-contain bg-[var(--theme-gradient-panel)] text-[color:var(--theme-text-primary)]`}
          style={{
            WebkitOverflowScrolling: "touch",
            scrollbarGutter: "stable both-edges",
          }}
        >
          {inspectionContent}
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
