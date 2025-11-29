// features/work-orders/components/workorders/extras/DtcSuggestionModal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ModalShell from "@/features/shared/components/ModalShell";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  vehicle?: {
    year?: string | null;
    make?: string | null;
    model?: string | null;
  } | null;
};

type DtcSuggestionResponse = {
  cause: string;
  correction: string;
  laborTime: number | null;
};

export default function DtcSuggestionModal({
  isOpen,
  onClose,
  jobId,
  vehicle,
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [cause, setCause] = useState("");
  const [correction, setCorrection] = useState("");
  const [laborTime, setLaborTime] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  // When modal opens, ask backend to generate suggestions from complaint line
  useEffect(() => {
    if (!isOpen || !jobId) return;

    const run = async () => {
      setGenerating(true);
      try {
        const res = await fetch("/api/work-orders/dtc-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });

        const json = (await res.json()) as
          | { suggestion?: DtcSuggestionResponse; error?: string }
          | undefined;

        if (!res.ok || !json?.suggestion) {
          throw new Error(json?.error || "AI could not generate suggestions.");
        }

        const { cause, correction, laborTime } = json.suggestion;

        setCause(cause ?? "");
        setCorrection(correction ?? "");
        setLaborTime(
          laborTime != null && !Number.isNaN(laborTime)
            ? laborTime.toString()
            : "",
        );
        setHasGenerated(true);
      } catch (err) {
        console.error("[DtcSuggestionModal] generate failed", err);
        setHasGenerated(false);
        toast.error(
          err instanceof Error
            ? err.message
            : "Could not generate DTC suggestions.",
        );
      } finally {
        setGenerating(false);
      }
    };

    void run();
  }, [isOpen, jobId]);

  const handleSave = async () => {
    const trimmedCause = cause.trim();
    const trimmedCorrection = correction.trim();
    const trimmedLabor = laborTime.trim();

    if (!trimmedCause || !trimmedCorrection) {
      toast.error("Cause and correction are required.");
      return;
    }

    const parsedLabor =
      trimmedLabor === "" ? null : Number.parseFloat(trimmedLabor);
    if (trimmedLabor !== "" && Number.isNaN(parsedLabor)) {
      toast.error("Labor time must be a valid number.");
      return;
    }

    setSaving(true);
    try {
      const updates: DB["public"]["Tables"]["work_order_lines"]["Update"] = {
        cause: trimmedCause,
        correction: trimmedCorrection,
        labor_time: parsedLabor,
      };

      const { error } = await supabase
        .from("work_order_lines")
        .update(updates)
        .eq("id", jobId);

      if (error) throw error;

      toast.success("AI cause / correction applied to this job.");
      onClose();
      // focused job modal will pick this up via refresh / realtime
    } catch (err: any) {
      console.error("[DtcSuggestionModal] save failed", err);
      toast.error(err?.message ?? "Error saving DTC suggestions.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="AI DTC Cause / Correction"
      onSubmit={handleSave}
      submitText={saving ? "Saving…" : "Apply to Job"}
      size="md"
    >
      <div className="space-y-3">
        {vehicle && (
          <p className="text-xs text-neutral-400">
            Using complaint + context for{" "}
            <span className="font-mono text-neutral-100">
              {vehicle.year ?? ""} {vehicle.make ?? ""} {vehicle.model ?? ""}
            </span>
          </p>
        )}

        {generating && (
          <div className="rounded border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
            Thinking through codes and complaint…
          </div>
        )}

        {!generating && !hasGenerated && (
          <div className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-300">
            No AI suggestion yet. You can fill in cause, correction and labor
            manually and apply.
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-neutral-400">
            Cause
          </label>
          <textarea
            rows={2}
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            placeholder="AI-generated root cause will appear here…"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-light)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-neutral-400">
            Correction
          </label>
          <textarea
            rows={3}
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="AI-generated correction steps & specs will appear here…"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-light)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-neutral-400">
            Labor time (hours)
          </label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={laborTime}
            onChange={(e) => setLaborTime(e.target.value)}
            placeholder="e.g. 1.5"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-light)]"
          />
        </div>

        <p className="mt-1 text-[11px] text-neutral-500">
          This will overwrite the job&apos;s existing{" "}
          <span className="font-semibold text-neutral-100">cause</span>,{" "}
          <span className="font-semibold text-neutral-100">correction</span> and{" "}
          <span className="font-semibold text-neutral-100">labor time</span>.
        </p>
      </div>
    </ModalShell>
  );
}