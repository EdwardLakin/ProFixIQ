"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type Props = {
  lineId: string;
  /** current punch state to decide Start vs Finish */
  punchedInAt?: string | null;
  punchedOutAt?: string | null;
  /** current status to toggle paused/in_progress */
  status?: string | null;
  /** refresh parent data after a successful update */
  onUpdated?: () => void | Promise<void>;
  /** when user hits Finish, open Cause/Correction modal instead of writing to DB */
  onFinishRequested?: () => void;
  /** optional: disable interactions when parent is busy */
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
  const supabase = createBrowserSupabase();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<"started" | "paused" | "resumed" | null>(null);

  const isStarted = !!punchedInAt && !punchedOutAt;
  const isPaused = String(status).toLowerCase() === "paused";

  const showFlash = (kind: typeof flash) => {
    setFlash(kind);
    setTimeout(() => setFlash(null), 1200);
  };

  const start = async () => {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("work_order_lines")
        .update({ punched_in_at: now, status: "in_progress" })
        .eq("id", lineId);
      if (error) throw error;
      toast.success("Started");
      showFlash("started");
      await onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Start failed");
    } finally {
      setBusy(false);
    }
  };

  const pause = async () => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("work_order_lines")
        .update({ status: "paused" })
        .eq("id", lineId);
      if (error) throw error;
      toast.message("Paused");
      showFlash("paused");
      await onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Pause failed");
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("work_order_lines")
        .update({ status: "in_progress" })
        .eq("id", lineId);
      if (error) throw error;
      toast.message("Resumed");
      showFlash("resumed");
      await onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Resume failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePrimary = () => {
    if (busy || disabled) return;
    if (isStarted) {
      onFinishRequested?.(); // open cause/correction
      return;
    }
    start();
  };

  return (
    <div className="relative flex items-center gap-2">
      {/* Primary: Start / Finish */}
      <button
        type="button"
        onClick={handlePrimary}
        disabled={busy || disabled}
        className={`font-header rounded border px-3 py-2 text-sm transition-colors ${
          isStarted
            ? "border-neutral-600 text-neutral-200 hover:bg-neutral-800"
            : "border-green-600 text-green-300 hover:bg-green-900/20"
        } ${busy || disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        aria-pressed={isStarted}
        aria-busy={busy}
      >
        {busy ? "Saving..." : isStarted ? "Finish" : "Start"}
      </button>

      {/* Secondary: Pause / Resume (only when started) */}
      {isStarted && (
        <button
          type="button"
          disabled={busy || disabled}
          onClick={isPaused ? resume : pause}
          className={`font-header rounded border px-3 py-2 text-sm transition-colors ${
            isPaused
              ? "border-green-600 text-green-300 hover:bg-green-900/20"
              : "border-amber-600 text-amber-300 hover:bg-amber-900/20"
          } ${busy || disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          aria-pressed={isPaused}
          aria-busy={busy}
        >
          {isPaused ? "Resume" : "Pause"}
        </button>
      )}

      {/* Visual badges */}
      {flash === "started" && (
        <div className="absolute -right-1 -top-2 rounded bg-green-700/80 px-2 py-1 text-xs text-green-100 shadow-md">
          ✓ Started
        </div>
      )}
      {flash === "paused" && (
        <div className="absolute -right-1 -top-2 rounded bg-amber-700/80 px-2 py-1 text-xs text-amber-100 shadow-md">
          ⏸ Paused
        </div>
      )}
      {flash === "resumed" && (
        <div className="absolute -right-1 -top-2 rounded bg-green-700/80 px-2 py-1 text-xs text-green-100 shadow-md">
          ⏯ Resumed
        </div>
      )}
    </div>
  );
}