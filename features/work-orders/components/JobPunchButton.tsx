"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type Props = {
  lineId: string;
  punchedInAt?: string | null;
  punchedOutAt?: string | null;
  status?: string | null;
  onUpdated?: () => void | Promise<void>;
  onFinishRequested?: () => void;
  disabled?: boolean;
};

export default function JobPunchButton({
  lineId,
  punchedInAt,
  punchedOutAt,
  status,
  onUpdated,
  onFinishRequested,
  disabled = false,
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<"started" | "finished" | null>(null);

  const normalizedStatus = (status ?? "").toLowerCase();
  const isOnHold = normalizedStatus === "on_hold";

  // 🔹 While on hold we treat it as *not started* (timer is stopped),
  // but we will disable the button so techs must release the hold first.
  const isStarted = !!punchedInAt && !punchedOutAt && !isOnHold;

  const effectiveDisabled = disabled || isOnHold;

  const showFlash = (kind: typeof flash) => {
    setFlash(kind);
    window.setTimeout(() => setFlash(null), 1200);
  };

  /* ------------------------------------------------------------------ */
  /* Core punch actions – RPC, single active job enforced by DB         */
  /* ------------------------------------------------------------------ */

  const start = async () => {
    if (busy || effectiveDisabled) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("punch_in", {
        line_id: lineId,
      });

      if (error) {
        if (error.code === "23505") {
          // partial unique index hit
          toast.error("You already have another active job. Finish it first.");
        } else if (error.code === "28000") {
          toast.error("Job is not assigned to you.");
        } else {
          toast.error(error.message ?? "Start failed");
        }
        return;
      }

      toast.success("Started job");
      showFlash("started");
      window.dispatchEvent(new CustomEvent("wol:refresh"));
      await onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Start failed");
    } finally {
      setBusy(false);
    }
  };

  // NOTE: finishing still goes through the Cause / Correction modal.
  // That modal will set status=completed + punched_out_at.
  const handlePrimary = () => {
    if (busy || effectiveDisabled) return;

    if (isStarted) {
      // Let the parent open Complete modal; when that saves it will punch_out.
      onFinishRequested?.();
      showFlash("finished");
      return;
    }

    void start();
  };

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={handlePrimary}
        disabled={busy || effectiveDisabled}
        className={`font-header inline-flex w-full items-center justify-center rounded-md border px-4 py-3 text-center text-sm tracking-[0.16em] uppercase transition
          ${
            isStarted
              ? "border-neutral-600 bg-black/40 text-neutral-100 hover:bg-black/70"
              : "border-[var(--accent-copper-soft)] bg-[var(--accent-copper-faint)] text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper-soft)] hover:text-black shadow-[0_0_18px_rgba(212,118,49,0.55)]"
          }
          ${
            busy || effectiveDisabled
              ? "cursor-not-allowed opacity-60 shadow-none"
              : ""
          }
        `}
        aria-pressed={isStarted}
        aria-busy={busy}
      >
        {busy
          ? "Saving…"
          : isStarted
          ? "Finish job"
          : isOnHold
          ? "On hold"
          : "Start job"}
      </button>

      {/* Flash overlay */}
      {flash && (
        <div
          className={`pointer-events-none absolute inset-x-0 -top-3 mx-auto w-fit rounded px-2 py-1 text-xs font-semibold shadow-md
            ${
              flash === "started"
                ? "bg-emerald-700/80 text-emerald-100"
                : "bg-[var(--accent-copper-soft)]/90 text-black"
            }`}
        >
          {flash === "started" ? "✓ Started" : "✓ Finish requested"}
        </div>
      )}

      {isOnHold && !busy && (
        <div className="mt-1 text-center text-[10px] text-amber-300">
          Job is on hold — release hold to start again.
        </div>
      )}
    </div>
  );
}