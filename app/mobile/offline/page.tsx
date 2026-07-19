"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  clearSyncedOfflineMutations,
  getOfflineMutationScope,
  getOfflineSyncSummary,
  hydrateOfflineMutationQueue,
  listOfflineMutations,
  subscribeOfflineMutations,
  type PendingMutation,
} from "@/features/shared/lib/offline/mutations";
import { replayAndReconcileOfflineMutations } from "@/features/shared/lib/offline/replay";

function mutationLabel(actionType: string): string {
  const labels: Record<string, string> = {
    "inspection:save-session": "Inspection progress",
    "inspection:upload-photo": "Inspection photo",
    "shift:punch-event": "Shift punch",
    update_work_order_line_notes: "Job notes",
    upload_job_photo: "Job photo",
    save_story_draft: "Cause and correction",
    "job:punch-transition": "Job status",
    "parts-request:create-draft": "Parts request",
  };
  return labels[actionType] ?? actionType.replaceAll("_", " ");
}

function statusClass(status: PendingMutation["status"]): string {
  if (status === "synced") return "text-emerald-200";
  if (status === "syncing") return "text-sky-200";
  if (status === "failed" || status === "conflicted") return "text-red-200";
  return "text-amber-200";
}

export default function MobileOfflinePage() {
  const [items, setItems] = useState<PendingMutation[]>([]);
  const [summary, setSummary] = useState(() => getOfflineSyncSummary());
  const [online, setOnline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await hydrateOfflineMutationQueue();
    const scope = getOfflineMutationScope();
    setItems(listOfflineMutations(scope));
    setSummary(getOfflineSyncSummary());
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeOfflineMutations(() => void refresh());
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      unsubscribe();
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, [refresh]);

  const syncNow = async () => {
    if (!online || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await replayAndReconcileOfflineMutations();
      setMessage(
        `Synced ${result.replayed}. ${result.failed} failed and ${result.conflicted} need review.`,
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync could not finish.");
    } finally {
      setBusy(false);
    }
  };

  const clearCompleted = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await clearSyncedOfflineMutations();
      setMessage("Completed sync history cleared.");
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Completed history could not be cleared.",
      );
    } finally {
      setBusy(false);
    }
  };

  const pending = items.filter((item) => item.status !== "synced");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-3 sm:px-4">
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
              Device work
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
              Offline &amp; sync
            </h1>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              Review work saved for the active user and shop on this device.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
              online
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                : "border-amber-400/40 bg-amber-500/10 text-amber-100"
            }`}
          >
            {online ? "Connected" : "Offline"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <Metric label="Queued" value={summary.queued} />
          <Metric label="Syncing" value={summary.syncing} />
          <Metric label="Failed" value={summary.failed} warning />
          <Metric label="Conflicts" value={summary.conflicted} warning />
        </div>

        <button
          type="button"
          disabled={!online || busy || pending.length === 0}
          onClick={() => void syncNow()}
          className="mt-4 min-h-12 w-full rounded-2xl bg-[color:var(--accent-copper)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Working…" : "Sync now"}
        </button>
        {message ? (
          <p className="mt-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
            {message}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]">
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <h2 className="font-semibold text-[color:var(--theme-text-primary)]">
              Device queue
            </h2>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              {pending.length} update{pending.length === 1 ? "" : "s"} require attention.
            </p>
          </div>
          <button
            type="button"
            disabled={busy || items.every((item) => item.status !== "synced")}
            onClick={() => void clearCompleted()}
            className="text-xs font-semibold text-[var(--accent-copper)] disabled:opacity-40"
          >
            Clear completed
          </button>
        </div>

        <div className="divide-y divide-[color:var(--theme-border-soft)]">
          {items.length === 0 ? (
            <div className="p-4 text-sm text-[color:var(--theme-text-secondary)]">
              Nothing is queued on this device.
            </div>
          ) : (
            items.slice(0, 50).map((item) => (
              <div key={item.clientMutationId} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                      {mutationLabel(item.actionType)}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                    {item.lastError ? (
                      <div className="mt-1 text-xs text-red-200">{item.lastError}</div>
                    ) : null}
                    {item.conflictReason ? (
                      <div className="mt-1 text-xs text-amber-200">
                        {item.conflictReason}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold capitalize ${statusClass(item.status)}`}
                  >
                    {item.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <Link
        href="/mobile"
        className="flex min-h-11 items-center justify-center rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 text-sm font-semibold text-[color:var(--theme-text-primary)]"
      >
        Return to mobile home
      </Link>
    </div>
  );
}

function Metric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-2">
      <div
        className={`text-lg font-semibold ${
          warning && value > 0
            ? "text-red-200"
            : "text-[color:var(--theme-text-primary)]"
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 truncate text-[0.56rem] uppercase tracking-[0.1em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
    </div>
  );
}
