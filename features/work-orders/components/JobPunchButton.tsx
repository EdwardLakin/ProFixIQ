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

// keep pause/resume hitting your existing API for now
async function callPunchEndpoint(
  lineId: string,
  action: "pause" | "resume",
) {
  const res = await fetch(`/api/work-orders/lines/${lineId}/${action}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || `Failed to ${action}`);
  return j as { success: boolean };
}

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
  const [flash, setFlash] = useState<"started" | "paused" | "resumed" | null>(
    null,
  );

  const isStarted = !!punchedInAt && !punchedOutAt;
  const isPaused = String(status).toLowerCase() === "paused";

  const showFlash = (kind: typeof flash) => {
    setFlash(kind);
    window.setTimeout(() => setFlash(null), 1200);
  };

  const start = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      // NEW: secure RPC backed by RLS + unique index
      const { error } = await supabase.rpc("punch_in", {
        line_id: lineId,
      });

      if (error) {
        // hit if user already has another active job
        if (
          error.code === "23505" ||
          (error.message || "")
            .toLowerCase()
            .includes("uq_active_punch_per_user")
        ) {
          toast.error(
            "You already have an active job punch. Punch out of the other job first.",
          );
        } else {
          toast.error(error.message || "Start failed");
        }
        return;
      }

      toast.success("Started");
      showFlash("started");
      window.dispatchEvent(new CustomEvent("wol:refresh"));
      await onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Start failed");
    } finally {
      setBusy(false);
    }
  };

  const pause = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await callPunchEndpoint(lineId, "pause");
      toast.message("Paused");
      showFlash("paused");
      window.dispatchEvent(new CustomEvent("wol:refresh"));
      await onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Pause failed");
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await callPunchEndpoint(lineId, "resume");
      toast.message("Resumed");
      showFlash("resumed");
      window.dispatchEvent(new CustomEvent("wol:refresh"));
      await onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Resume failed");
    } finally {
      setBusy(false);
    }
  };

  // Primary button:
  // - If not started → punch_in RPC
  // - If already started → go to Finish flow (Cause/Correction modal),
  //   which will set punched_out_at & completed in your existing code.
  const handlePrimary = () => {
    if (busy || disabled) return;
    if (isStarted) {
      onFinishRequested?.();
    } else {
      void start();
    }
  };

  return (
    <div className="relative w-full">
      <div className="flex w-full items-center justify-between gap-2">
        {/* Primary: Start / Finish */}
        <button
          type="button"
          onClick={handlePrimary}
          disabled={busy || disabled}
          className={`font-header flex-1 rounded border px-4 py-3 text-sm text-center transition-colors 
            ${
              isStarted
                ? "border-neutral-600 text-neutral-200 hover:bg-neutral-800"
                : "border-green-600 text-green-300 hover:bg-green-900/30"
            }
            ${busy || disabled ? "opacity-60 cursor-not-allowed" : ""}
          `}
          aria-pressed={isStarted}
          aria-busy={busy}
        >
          {busy ? "Saving..." : isStarted ? "Finish" : "Start"}
        </button>

        {/* Secondary: Pause / Resume */}
        {isStarted && (
          <button
            type="button"
            disabled={busy || disabled}
            onClick={isPaused ? resume : pause}
            className={`font-header flex-1 rounded border px-4 py-3 text-sm text-center transition-colors
              ${
                isPaused
                  ? "border-green-600 text-green-300 hover:bg-green-900/30"
                  : "border-amber-600 text-amber-300 hover:bg-amber-900/30"
              }
              ${busy || disabled ? "opacity-60 cursor-not-allowed" : ""}
            `}
            aria-pressed={isPaused}
            aria-busy={busy}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
        )}
      </div>

      {/* Flash overlay (✓ Started / ⏸ Paused / ⏯ Resumed) */}
      {flash && (
        <div
          className={`absolute inset-x-0 -top-3 mx-auto w-fit rounded px-2 py-1 text-xs font-semibold shadow-md
            ${
              flash === "started"
                ? "bg-green-700/80 text-green-100"
                : flash === "paused"
                ? "bg-amber-700/80 text-amber-100"
                : "bg-green-700/80 text-green-100"
            }`}
        >
          {flash === "started"
            ? "✓ Started"
            : flash === "paused"
            ? "⏸ Paused"
            : "⏯ Resumed"}
        </div>
      )}
    </div>
  );
}