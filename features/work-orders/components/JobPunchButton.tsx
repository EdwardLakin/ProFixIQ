// shared/components/JobPunchButton.tsx
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type Props = {
  lineId: string;
  punchedInAt?: string | null;
  punchedOutAt?: string | null;
  status?: string | null;
  onUpdated?: () => void | Promise<void>;
  onFinishRequested?: () => void;
  disabled?: boolean;
};

type DB = Database;

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

  const isStarted = !!punchedInAt && !punchedOutAt && !isOnHold;
  const effectiveDisabled = disabled || isOnHold;

  const showFlash = (kind: typeof flash) => {
    setFlash(kind);
    window.setTimeout(() => setFlash(null), 1200);
  };

  const start = async () => {
    if (busy || effectiveDisabled) return;
    setBusy(true);
    try {
      // Uses your RPC (enforces one active job, assignment, etc.)
      const { error: punchErr } = await supabase.rpc("punch_in", {
        line_id: lineId,
      });

      if (punchErr) {
        if (punchErr.code === "23505") {
          toast.error("You already have another active job. Finish it first.");
        } else if (punchErr.code === "28000") {
          toast.error("Job is not assigned to you.");
        } else {
          toast.error(punchErr.message ?? "Start failed");
        }
        return;
      }

      const nowIso = new Date().toISOString();

      const update: DB["public"]["Tables"]["work_order_lines"]["Update"] = {
        status: "in_progress",
        punched_out_at: null,
      };

      if (!punchedInAt) update.punched_in_at = nowIso;

      const { error: lineErr } = await supabase
        .from("work_order_lines")
        .update(update)
        .eq("id", lineId);

      if (lineErr) {
        toast.error(lineErr.message ?? "Failed to update job status");
        return;
      }

      toast.success("Started job");
      showFlash("started");

      window.dispatchEvent(new CustomEvent("wol:refresh"));
      await onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Start failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePrimary = () => {
    if (busy || effectiveDisabled) return;

    if (isStarted) {
      onFinishRequested?.();
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

  return (
    <div className="relative w-full">
      <Button
        type="button"
        onClick={handlePrimary}
        disabled={busy || effectiveDisabled}
        isLoading={busy}
        variant={isStarted ? "outline" : "copper"}
        size="md"
        className="inline-flex w-full items-center justify-center text-center text-sm font-blackops tracking-[0.16em] uppercase"
        aria-pressed={isStarted}
        aria-busy={busy}
      >
        {label}
      </Button>

      {flash && (
        <div
          className={`pointer-events-none absolute inset-x-0 -top-3 mx-auto w-fit rounded px-2 py-1 text-xs font-semibold shadow-md
            ${
              flash === "started"
                ? "bg-emerald-700/80 text-emerald-100"
                : "bg-[rgba(184,115,51,0.9)] text-black shadow-[0_0_15px_rgba(184,115,51,0.9)]"
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