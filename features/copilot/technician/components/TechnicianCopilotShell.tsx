"use client";

import { Bot, Maximize2, Minimize2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { useTechnicianCopilotAvailabilityState } from "@/features/copilot/technician/client/useTechnicianCopilotAvailability";
import {
  getMobileWorkflowDock,
  subscribeToMobileWorkflowDock,
} from "@/features/copilot/technician/client/mobileWorkflowDock";
import { cn } from "@/features/shared/utils/cn";
import { TechnicianTextCopilot } from "./TechnicianTextCopilot";

export const OPEN_TECHNICIAN_COPILOT_EVENT =
  "profixiq:technician-copilot-open";

export function openTechnicianCopilot(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_TECHNICIAN_COPILOT_EVENT));
}

function isCopilotRoute(pathname: string): boolean {
  return (
    pathname === "/copilot/technician" ||
    pathname === "/mobile/copilot/technician"
  );
}

function isStandaloneMobileJobRoute(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return (
    segments.length === 3 &&
    segments[0] === "mobile" &&
    segments[1] === "jobs"
  );
}

function isShortMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  const visualHeight = window.visualViewport?.height;
  const viewportHeight =
    typeof visualHeight === "number"
      ? Math.min(window.innerHeight, visualHeight)
      : window.innerHeight;
  return viewportHeight <= 360;
}

export function TechnicianCopilotShell({
  shouldCheck,
  surface,
}: {
  shouldCheck: boolean;
  surface: "desktop" | "mobile";
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const availability = useTechnicianCopilotAvailabilityState(shouldCheck);
  const [open, setOpen] = useState(() => isCopilotRoute(pathname));
  const [expanded, setExpanded] = useState(
    () => surface === "mobile" && isShortMobileViewport(),
  );
  const [shortMobileViewport, setShortMobileViewport] = useState(
    () => surface === "mobile" && isShortMobileViewport(),
  );
  const registeredWorkflowDock = useSyncExternalStore(
    subscribeToMobileWorkflowDock,
    getMobileWorkflowDock,
    () => null,
  );
  const workflowDock =
    surface === "mobile"
      ? isStandaloneMobileJobRoute(pathname)
        ? "job"
        : registeredWorkflowDock
      : null;

  const openCompact = useCallback(() => {
    setExpanded(shortMobileViewport);
    setOpen(true);
  }, [shortMobileViewport]);

  const close = useCallback(() => {
    setOpen(false);
    setExpanded(false);
    if (isCopilotRoute(pathname)) {
      router.replace(surface === "mobile" ? "/mobile/tech/queue" : "/tech/queue");
    }
  }, [pathname, router, surface]);

  useEffect(() => {
    if (isCopilotRoute(pathname)) {
      setOpen(true);
      setExpanded(shortMobileViewport);
    }
  }, [pathname, shortMobileViewport]);

  useEffect(() => {
    if (surface !== "mobile") return;

    const updateViewportState = () => {
      const isShort = isShortMobileViewport();
      setShortMobileViewport(isShort);
      if (isShort) setExpanded(true);
    };

    updateViewportState();
    window.addEventListener("resize", updateViewportState);
    window.visualViewport?.addEventListener("resize", updateViewportState);
    return () => {
      window.removeEventListener("resize", updateViewportState);
      window.visualViewport?.removeEventListener("resize", updateViewportState);
    };
  }, [surface]);

  useEffect(() => {
    const handleOpen = () => openCompact();
    window.addEventListener(OPEN_TECHNICIAN_COPILOT_EVENT, handleOpen);
    return () =>
      window.removeEventListener(OPEN_TECHNICIAN_COPILOT_EVENT, handleOpen);
  }, [openCompact]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, open]);

  if (availability.status !== "available") return null;

  const launcher = (
    <button
      type="button"
      onClick={openCompact}
      aria-label="Open Technician CoPilot"
      aria-expanded={open}
      tabIndex={open ? -1 : 0}
      className={cn(
        "fixed z-30 inline-flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring",
        surface === "mobile"
          ? cn(
              "right-4",
              workflowDock === "job"
                ? "bottom-[calc(13.7rem+max(0.75rem,env(safe-area-inset-bottom,0px)))]"
                : workflowDock === "work-order"
                  ? "bottom-[calc(10rem+env(safe-area-inset-bottom))]"
                  : "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]",
            )
          : "bottom-[calc(4rem+env(safe-area-inset-bottom))] right-4 md:bottom-6 md:right-6",
        open && "pointer-events-none translate-y-2 opacity-0",
      )}
      style={{
        borderColor: "var(--theme-border-soft)",
        background: "var(--theme-gradient-panel)",
        color: "var(--theme-text-primary)",
      }}
    >
      <Bot className="h-5 w-5" aria-hidden />
      <span>CoPilot</span>
    </button>
  );

  if (surface === "mobile") {
    return (
      <>
        {launcher}
        <section
          role={expanded ? "dialog" : "region"}
          aria-modal={expanded ? "true" : undefined}
          aria-label="Technician CoPilot"
          aria-hidden={!open}
          className={cn(
            "fixed flex min-h-0 flex-col overflow-hidden border text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-strong)] transition-[opacity,transform,border-radius] duration-200",
            expanded
              ? cn(
                  "inset-0 h-[100dvh] w-full rounded-none",
                  workflowDock ? "z-[140]" : "z-40",
                )
              : cn(
                  "inset-x-3 rounded-2xl z-40",
                  workflowDock === "job"
                    ? "bottom-[calc(13.7rem+max(0.75rem,env(safe-area-inset-bottom,0px)))] max-h-[min(21rem,calc(100dvh-14.7rem-max(0.75rem,env(safe-area-inset-bottom,0px))))]"
                    : workflowDock === "work-order"
                      ? "bottom-[calc(10rem+env(safe-area-inset-bottom))] max-h-[min(21rem,calc(100dvh-16rem))]"
                      : "bottom-[calc(1rem+env(safe-area-inset-bottom))] max-h-[min(21rem,calc(100dvh-7rem))]",
                ),
            open
              ? "visible pointer-events-auto opacity-100"
              : "invisible pointer-events-none translate-y-3 opacity-0",
          )}
          style={{
            borderColor: "var(--theme-border-strong)",
            background: expanded
              ? "var(--theme-surface-page)"
              : "var(--theme-surface-panel-strong)",
          }}
        >
          <div
            className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--theme-border-soft)" }}
          >
            <div>
              <div className="text-sm font-semibold">Technician CoPilot</div>
              <div className="text-xs text-[color:var(--theme-text-secondary)]">
                {expanded
                  ? "Conversation and repair memory"
                  : "Voice stays active while you keep working"}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {!shortMobileViewport ? (
                <button
                  type="button"
                  onClick={() => setExpanded((current) => !current)}
                  aria-label={
                    expanded
                      ? "Return to compact voice controls"
                      : "Show full CoPilot conversation"
                  }
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border"
                  style={{
                    borderColor: "var(--theme-border-soft)",
                    background: "var(--theme-surface-panel)",
                  }}
                >
                  {expanded ? (
                    <Minimize2 className="h-5 w-5" aria-hidden />
                  ) : (
                    <Maximize2 className="h-5 w-5" aria-hidden />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                onClick={close}
                aria-label="Close Technician CoPilot"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border"
                style={{
                  borderColor: "var(--theme-border-soft)",
                  background: "var(--theme-surface-panel)",
                }}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <TechnicianTextCopilot embedded active={open} compact={!expanded} />
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {launcher}
      <section
        role="dialog"
        aria-label="Technician CoPilot"
        aria-hidden={!open}
        className={cn(
          "fixed bottom-4 right-4 top-16 z-30 flex w-[min(32rem,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-2xl border text-[color:var(--theme-text-primary)] shadow-2xl transition duration-200",
          open
            ? "translate-x-0 opacity-100"
            : "invisible pointer-events-none translate-x-[calc(100%+2rem)] opacity-0",
        )}
        style={{
          borderColor: "var(--theme-border-strong)",
          background: "var(--theme-surface-panel-strong)",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--theme-border-soft)" }}
        >
          <div>
            <div className="text-sm font-semibold">Technician CoPilot</div>
            <div className="text-xs text-[color:var(--theme-text-secondary)]">
              Stays with you as you move through the app
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close Technician CoPilot"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border"
            style={{
              borderColor: "var(--theme-border-soft)",
              background: "var(--theme-surface-panel)",
            }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1">
          <TechnicianTextCopilot embedded active={open} />
        </div>
      </section>
    </>
  );
}
