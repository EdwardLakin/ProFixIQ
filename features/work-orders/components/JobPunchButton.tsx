 "use client";

import { useState } from "react";
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
        .eq("id", lineId)
        .select("id, punched_in_at, punched_out_at, status")
        .single(); // return updated row so parent refresh shows instantly
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
        .eq("id", lineId)
        .select("id, status")
        .single();
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
        .eq("id", lineId)
        .select("id, status")
        .single();
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
      onFinishRequested?.();
      return;
    }
    void start();
  };

  return (
    <div className="relative w-full">
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          onClick={handlePrimary}
          disabled={busy || disabled}
          className={`font-header flex-1 rounded border px-4 py-3 text-sm text-center transition-colors 
            ${isStarted
              ? "border-neutral-600 text-neutral-200 hover:bg-neutral-800"
              : "border-green-600 text-green-300 hover:bg-green-900/30"}
            ${busy || disabled ? "opacity-60 cursor-not-allowed" : ""}
          `}
          aria-pressed={isStarted}
          aria-busy={busy}
        >
          {busy ? "Saving..." : isStarted ? "Finish" : "Start"}
        </button>

        {isStarted && (
          <button
            type="button"
            disabled={busy || disabled}
            onClick={isPaused ? resume : pause}
            className={`font-header flex-1 rounded border px-4 py-3 text-sm text-center transition-colors
              ${isPaused
                ? "border-green-600 text-green-300 hover:bg-green-900/30"
                : "border-amber-600 text-amber-300 hover:bg-amber-900/30"}
              ${busy || disabled ? "opacity-60 cursor-not-allowed" : ""}
            `}
            aria-pressed={isPaused}
            aria-busy={busy}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
        )}
      </div>

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
          {flash === "started" ? "✓ Started" : flash === "paused" ? "⏸ Paused" : "⏯ Resumed"}
        </div>
      )}
    </div>
  );
}