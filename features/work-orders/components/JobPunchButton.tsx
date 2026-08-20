"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import { runJobPunchTransition } from "@/features/work-orders/lib/jobPunchTransitionsClient";

type Props = {
  lineId: string;
  punchedInAt?: string | null;
  punchedOutAt?: string | null;
  status?: string | null;
  isActive?: boolean;
  onUpdated?: () => void | Promise<void>;
  onFinishRequested?: () => void;
  disabled?: boolean;
};

function safeErrMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return fallback;
}

export default function JobPunchButton({
  lineId,
  punchedInAt,
  punchedOutAt,
  status,
  isActive,
  onUpdated,
  onFinishRequested,
  disabled = false,
}: Props): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [pickBusy, setPickBusy] = useState(false);
  const [flash, setFlash] = useState<"started" | "finished" | null>(null);

  const normalizedStatus = (status ?? "").toLowerCase();
  const isOnHold = normalizedStatus === "on_hold";

  const isStarted = (isActive ?? (!!punchedInAt && !punchedOutAt)) && !isOnHold;
  const effectiveDisabled = disabled || isOnHold;

  const showFlash = (kind: typeof flash) => {
    setFlash(kind);
    window.setTimeout(() => setFlash(null), 1200);
  };

  const showTransitionError = (message: string): boolean => {
    const msgLc = message.toLowerCase();

    if (msgLc.includes("schema cache") || msgLc.includes("could not find the function")) {
      toast.error("System updated. Refresh the page and try again.");
      return true;
    }

    if (msgLc.includes("not assigned")) {
      toast.error("This job is assigned to another tech. Ask a manager to reassign it.");
      return true;
    }

    if (msgLc.includes("forbidden") || msgLc.includes("not allowed")) {
      toast.error("You don’t have permission to start this job.");
      return true;
    }

    if (msgLc.includes("active job") || msgLc.includes("already has an active")) {
      toast.error("You already have another active job. Finish it first.");
      return true;
    }

    return false;
  };

  const requestPick = async (): Promise<void> => {
    if (pickBusy || !lineId) return;
    setPickBusy(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch(
        `/api/work-orders/lines/${encodeURIComponent(lineId)}/request-pick`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ idempotencyKey }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
        requested?: boolean;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not request a Parts pick.");
      }
      if (payload?.requested === false) {
        toast.info(payload.message ?? "No approved parts are waiting to be picked.");
      } else {
        toast.success(payload?.message ?? "Parts has been notified to pick this job.");
      }
      window.dispatchEvent(new CustomEvent("wol:refresh"));
      await onUpdated?.();
    } catch (e: unknown) {
      toast.error(safeErrMsg(e, "Could not request a Parts pick."));
    } finally {
      setPickBusy(false);
    }
  };

  const start = async (): Promise<void> => {
    if (busy || effectiveDisabled) return;
    if (!lineId) {
      toast.error("Missing job line id.");
      return;
    }

    setBusy(true);
    try {
      await runJobPunchTransition(lineId, "start");

      toast.success("Started job");
      showFlash("started");
      window.dispatchEvent(new CustomEvent("wol:refresh"));
      await onUpdated?.();
    } catch (e: unknown) {
      const message = safeErrMsg(e, "Start failed");
      if (!showTransitionError(message)) {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePrimary = (): void => {
    if (busy || effectiveDisabled) return;

    if (isStarted) {
      if (!onFinishRequested) {
        toast.error("Finish flow is not wired on this page.");
        return;
      }
      onFinishRequested();
      showFlash("finished");
      return;
    }

    void start();
  };

  const label = busy
    ? "Saving…"
    : isStarted
      ? "Finish job"
      : isOnHold
        ? "On hold"
        : "Start job";

  const startClasses =
    "bg-emerald-600 text-[color:var(--theme-text-primary)] border-emerald-500 hover:bg-emerald-500 hover:border-emerald-400 focus-visible:ring-emerald-400";
  const finishClasses =
    "border-[var(--accent-copper-light)] text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper-faint)]";

  return (
    <div className="relative w-full space-y-2">
      <Button
        type="button"
        onClick={handlePrimary}
        disabled={busy || effectiveDisabled}
        isLoading={busy}
        variant="outline"
        size="md"
        className={[
          "inline-flex w-full items-center justify-center text-center text-sm font-blackops tracking-[0.16em] uppercase",
          isStarted ? finishClasses : startClasses,
        ].join(" ")}
        aria-pressed={isStarted}
        aria-busy={busy}
      >
        {label}
      </Button>

      <Button
        type="button"
        onClick={() => void requestPick()}
        disabled={pickBusy || disabled || !lineId}
        isLoading={pickBusy}
        variant="outline"
        size="md"
        className="inline-flex w-full items-center justify-center border-sky-400/45 bg-sky-500/10 text-center text-xs font-semibold uppercase tracking-[0.14em] text-sky-100 hover:bg-sky-500/20"
        aria-busy={pickBusy}
      >
        {pickBusy ? "Notifying Parts…" : "Request pick"}
      </Button>

      {flash && (
        <div
          className={`pointer-events-none absolute inset-x-0 -top-3 mx-auto w-fit rounded px-2 py-1 text-xs font-semibold shadow-md
            ${
              flash === "started"
                ? "bg-emerald-700/80 text-emerald-100"
                : "bg-[rgba(184,115,51,0.9)] text-[color:var(--theme-text-on-accent)] shadow-[0_0_15px_rgba(184,115,51,0.9)]"
            }`}
        >
          {flash === "started" ? "✓ Started" : "✓ Finish requested"}
        </div>
      )}

      {isOnHold && !busy && (
        <div className="text-center text-[10px] text-amber-300">
          Job is on hold — you can still request Parts to pick/stage it.
        </div>
      )}
    </div>
  );
}
