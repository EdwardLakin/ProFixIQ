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

type RpcErrorLike = { message?: string | null; code?: string | null };

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

  const showUserFriendlyRpcError = (err: RpcErrorLike): boolean => {
    const msg = String(err.message ?? "");
    const msgLc = msg.toLowerCase();

    // PostgREST schema cache / function signature mismatch
    if (msgLc.includes("schema cache") || msgLc.includes("could not find the function")) {
      toast.error("System updated. Refresh the page and try again.");
      return true;
    }

    // Auth / permission style errors
    if (err.code === "28000" || msgLc.includes("not assigned")) {
      toast.error("This job is assigned to another tech. Ask a manager to reassign it.");
      return true;
    }
    if (msgLc.includes("forbidden") || msgLc.includes("not allowed")) {
      toast.error("You don’t have permission to start this job.");
      return true;
    }

    // One-active-job constraint (if you enforce it)
    if (err.code === "23505" || msgLc.includes("another active job") || msgLc.includes("active job")) {
      toast.error("You already have another active job. Finish it first.");
      return true;
    }

    return false;
  };

  async function punchInRpc(): Promise<{ ok: true } | { ok: false; error: RpcErrorLike }> {
    // ✅ Your generated types currently expect `line_id` (as shown in the TS error).
    // But if the DB function was changed to `p_line_id`, PostgREST can get out of sync briefly.
    // So we try `line_id` first, then fallback to `p_line_id` if needed.
    const first = await supabase.rpc("punch_in", { line_id: lineId });

    if (!first.error) return { ok: true };

    const msg = String(first.error.message ?? "").toLowerCase();
    const looksLikeArgMismatch =
      msg.includes("schema cache") ||
      msg.includes("could not find the function") ||
      msg.includes("function public.punch_in");

    if (!looksLikeArgMismatch) return { ok: false, error: first.error };

    // Fallback attempt (ignore TS on purpose)
    const second = await (supabase as unknown as { rpc: Function }).rpc("punch_in", {
      p_line_id: lineId,
    });

    if (!second?.error) return { ok: true };
    return { ok: false, error: second.error as RpcErrorLike };
  }

  const start = async () => {
    if (busy || effectiveDisabled) return;
    if (!lineId) {
      toast.error("Missing job line id.");
      return;
    }

    setBusy(true);
    try {
      const rpc = await punchInRpc();

      if (!rpc.ok) {
        if (!showUserFriendlyRpcError(rpc.error)) {
          toast.error(rpc.error.message ?? "Start failed");
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

  // ✅ Force visible styles for Start (green), without depending on Button variants
  const startClasses =
    "bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500 hover:border-emerald-400 focus-visible:ring-emerald-400";
  const finishClasses =
    "border-[var(--accent-copper-light)] text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper-faint)]";

  return (
    <div className="relative w-full">
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