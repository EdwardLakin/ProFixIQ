"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import CauseCorrectionModal from "@work-orders/components/workorders/CauseCorrectionModal";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  runMutationWithOfflineQueue,
} from "@/features/shared/lib/offline/mutations";
import { postOfflineServerMutation } from "@/features/shared/lib/offline/server-mutations";
import { runJobPunchTransition } from "@/features/work-orders/lib/jobPunchTransitionsClient";
import MobileFocusedJob from "@/features/work-orders/mobile/MobileFocusedJob";

type StoryLine = {
  id: string;
  work_order_id: string | null;
  complaint: string | null;
  description: string | null;
  cause: string | null;
  correction: string | null;
  status: string | null;
  updated_at: string | null;
};

function operationKey(lineId: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${lineId}:story:${random}`;
}

export default function MobileJobPage() {
  const router = useRouter();
  const params = useParams<{ lineId: string }>();
  const lineId = params.lineId;
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [storyOpen, setStoryOpen] = useState(false);
  const [line, setLine] = useState<StoryLine | null>(null);
  const [loadingStory, setLoadingStory] = useState(true);

  const loadStory = useCallback(async () => {
    setLoadingStory(true);
    try {
      const { data, error } = await supabase
        .from("work_order_lines")
        .select(
          "id, work_order_id, complaint, description, cause, correction, status, updated_at",
        )
        .eq("id", lineId)
        .maybeSingle<StoryLine>();

      if (error) throw error;
      setLine(data ?? null);
    } catch (error) {
      // The focused job owns the primary load/error state. This supplemental
      // editor must never replace it with a second blocking screen.
      // eslint-disable-next-line no-console
      console.error("[mobile job story] load failed", error);
    } finally {
      setLoadingStory(false);
    }
  }, [lineId, supabase]);

  useEffect(() => {
    void loadStory();
  }, [loadStory]);

  const checkStoryConflict = useCallback(
    async (mode: "story" | "finish"): Promise<string | null> => {
      if (!navigator.onLine) return null;

      const { data, error } = await supabase
        .from("work_order_lines")
        .select("id, status")
        .eq("id", lineId)
        .maybeSingle<{ id: string; status: string | null }>();
      if (error) throw error;
      if (!data?.id) return "Job line no longer exists.";
      if (data.status === "completed") {
        return mode === "finish"
          ? "Job line is already completed."
          : "Completed job stories require advisor review.";
      }
      if (mode === "finish" && data.status === "declined") {
        return "Declined job lines cannot be completed.";
      }
      return null;
    },
    [lineId, supabase],
  );

  const saveStory = useCallback(
    async (cause: string, correction: string) => {
      if (!line) throw new Error("Job story is still loading.");

      const clientMutationId = operationKey(line.id);
      const payload = {
        lineId: line.id,
        cause,
        correction,
        baseUpdatedAt: line.updated_at,
      };
      const result = await runMutationWithOfflineQueue({
        clientMutationId,
        actionType: "save_story_draft",
        payload,
        orderKey: `${line.id}:002:story`,
        conflictCheck: () => checkStoryConflict("story"),
        runner: async () => {
          await postOfflineServerMutation({
            actionType: "save_story_draft",
            operationKey: clientMutationId,
            payload,
          });
        },
      });

      if (result.conflicted) {
        throw new Error("Story conflict detected. Reload the latest job state.");
      }

      setLine((current) =>
        current ? { ...current, cause, correction } : current,
      );

      if (result.queued) {
        toast.warning("Cause and correction queued for sync when back online.");
      } else {
        toast.success("Cause and correction saved.");
        await loadStory();
      }
    },
    [checkStoryConflict, line, loadStory],
  );

  const completeJob = useCallback(
    async (cause: string, correction: string) => {
      const conflict = await checkStoryConflict("finish");
      if (conflict) throw new Error(conflict);

      await runJobPunchTransition(lineId, "finish", { cause, correction });
      setStoryOpen(false);
      toast.success("Job completed.");
      await loadStory();
      router.refresh();
      window.dispatchEvent(
        new CustomEvent("work-order-line:completed", {
          detail: { workOrderLineId: lineId },
        }),
      );
    },
    [checkStoryConflict, lineId, loadStory, router],
  );

  const openStory = () => {
    if (!line) {
      toast.error(
        loadingStory ? "Job story is still loading." : "Job line was not found.",
      );
      return;
    }
    setStoryOpen(true);
  };

  const lineLabel =
    line?.complaint?.trim() || line?.description?.trim() || "Job story";

  return (
    <div className="pb-20">
      <MobileFocusedJob
        workOrderLineId={lineId}
        onChanged={loadStory}
        onBack={() => router.push("/mobile/tech/queue")}
      />

      <div className="fixed inset-x-0 bottom-0 z-[120] border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        <button
          type="button"
          onClick={openStory}
          aria-label="Open cause and correction editor"
          disabled={loadingStory}
          className="mx-auto flex min-h-12 w-full max-w-3xl items-center justify-center rounded-2xl border border-[var(--accent-copper-soft)]/70 bg-[color:var(--theme-surface-panel-strong)] px-4 text-sm font-semibold text-[color:var(--theme-text-primary)] active:scale-[0.99] disabled:opacity-50"
        >
          {loadingStory ? "Loading job story…" : "Cause & Correction"}
        </button>
      </div>

      {storyOpen && line ? (
        <CauseCorrectionModal
          isOpen={storyOpen}
          onClose={() => setStoryOpen(false)}
          jobId={line.id}
          lineLabel={lineLabel}
          initialCause={line.cause ?? ""}
          initialCorrection={line.correction ?? ""}
          onSaveDraft={saveStory}
          onDraftChange={(cause, correction) => {
            setLine((current) =>
              current ? { ...current, cause, correction } : current,
            );
          }}
          onSubmit={completeJob}
        />
      ) : null}
    </div>
  );
}
