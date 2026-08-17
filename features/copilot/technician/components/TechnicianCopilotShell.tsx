"use client";

import { Bot, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useTechnicianCopilotAvailabilityState } from "@/features/copilot/technician/client/useTechnicianCopilotAvailability";
import { cn } from "@/features/shared/utils/cn";
import { TechnicianTextCopilot } from "./TechnicianTextCopilot";

export const OPEN_TECHNICIAN_COPILOT_EVENT =
  "profixiq:technician-copilot-open";

function isCopilotRoute(pathname: string): boolean {
  return (
    pathname === "/copilot/technician" ||
    pathname === "/mobile/copilot/technician"
  );
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

  const close = useCallback(() => {
    setOpen(false);
    if (isCopilotRoute(pathname)) {
      router.replace(surface === "mobile" ? "/mobile/tech/queue" : "/tech/queue");
    }
  }, [pathname, router, surface]);

  useEffect(() => {
    if (isCopilotRoute(pathname)) setOpen(true);
  }, [pathname]);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(OPEN_TECHNICIAN_COPILOT_EVENT, handleOpen);
    return () =>
      window.removeEventListener(OPEN_TECHNICIAN_COPILOT_EVENT, handleOpen);
  }, []);

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
      onClick={() => setOpen(true)}
      aria-label="Open Technician CoPilot"
      aria-expanded={open}
      tabIndex={open ? -1 : 0}
      className={cn(
        "fixed z-30 inline-flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring",
        surface === "mobile"
          ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4"
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
          role="dialog"
          aria-modal="true"
          aria-label="Technician CoPilot"
          aria-hidden={!open}
          className={cn(
            "fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden overscroll-contain bg-background transition-opacity duration-200",
            open
              ? "visible pointer-events-auto opacity-100"
              : "invisible pointer-events-none opacity-0",
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Technician CoPilot</div>
              <div className="text-xs text-muted-foreground">
                Stays with you as you move through the app
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close Technician CoPilot"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-background"
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

  return (
    <>
      {launcher}
      <section
        role="dialog"
        aria-label="Technician CoPilot"
        aria-hidden={!open}
        className={cn(
          "fixed bottom-4 right-4 top-16 z-30 flex w-[min(32rem,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl transition duration-200",
          open
            ? "translate-x-0 opacity-100"
            : "invisible pointer-events-none translate-x-[calc(100%+2rem)] opacity-0",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Technician CoPilot</div>
            <div className="text-xs text-muted-foreground">
              Stays with you as you move through the app
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close Technician CoPilot"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-background"
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
