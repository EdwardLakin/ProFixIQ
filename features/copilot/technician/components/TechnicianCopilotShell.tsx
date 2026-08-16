"use client";

import { Bot, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useTechnicianCopilotAvailability } from "@/features/copilot/technician/client/useTechnicianCopilotAvailability";
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
  const available = useTechnicianCopilotAvailability(shouldCheck);
  const [open, setOpen] = useState(() => isCopilotRoute(pathname));

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
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!available) return null;

  const close = () => {
    setOpen(false);
    if (isCopilotRoute(pathname)) {
      router.replace(surface === "mobile" ? "/mobile/tech/queue" : "/tech/queue");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Technician CoPilot"
        aria-expanded={open}
        className={cn(
          "fixed z-[70] inline-flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring",
          surface === "mobile"
            ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4"
            : "bottom-6 right-6",
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

      {surface === "mobile" && open ? (
        <button
          type="button"
          aria-label="Close Technician CoPilot"
          onClick={close}
          className="fixed inset-0 z-[74] bg-black/50"
        />
      ) : null}

      <section
        role="dialog"
        aria-modal={surface === "mobile"}
        aria-label="Technician CoPilot"
        aria-hidden={!open}
        className={cn(
          "fixed z-[75] flex min-h-0 flex-col overflow-hidden border bg-background shadow-2xl transition duration-200",
          surface === "mobile"
            ? "inset-x-0 bottom-0 top-[env(safe-area-inset-top,0px)] rounded-t-3xl"
            : "bottom-4 right-4 top-16 w-[min(32rem,calc(100vw-2rem))] rounded-2xl",
          open
            ? "translate-x-0 translate-y-0 opacity-100"
            : surface === "mobile"
              ? "invisible pointer-events-none translate-y-full opacity-0"
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
