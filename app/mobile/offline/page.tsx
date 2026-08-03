"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CloudOff,
  RefreshCw,
  Trash2,
  Wifi,
} from "lucide-react";
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
  if (status === "synced") return "text-emerald-600 dark:text-emerald-300";
  if (status === "syncing") return "text-sky-600 dark:text-sky-300";
  if (status === "failed" || status === "conflicted") {
    return "text-red-600 dark:text-red-300";
  }
  return "text-amber-600 dark:text-amber-300";
}

function statusIcon(status: PendingMutation["status"]) {
  if (status === "synced") return CheckCircle2;
  if (status === "failed" || status === "conflicted") return AlertTriangle;
  return RefreshCw;
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
        error instanceof Error
          ? error.message
          : "Completed history could not be cleared.",
      );
    } finally {
      setBusy(false);
    }
  };

  const pending = items.filter((item) => item.status !== "synced");
  const healthy = online && pending.length === 0;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
              {online ? (
                <Wifi aria-hidden className="h-5 w-5" />
              ) : (
                <CloudOff aria-hidden className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0">
              <div className="mobile-dashboard-hero__eyebrow">Device center</div>
              <h1 className="mobile-dashboard-hero__title">Offline & sync</h1>
              <p className="mobile-dashboard-hero__subtitle">
                {healthy
                  ? "This device is online and every saved change is synchronized."
                  : online
                    ? `${pending.length} saved change${pending.length === 1 ? "" : "s"} require attention.`
                    : "Work remains available on this device while the connection is offline."}
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.65rem] font-extrabold ${
              online
                ? "border-emerald-300/30 bg-emerald-400/12 text-emerald-100"
                : "border-amber-300/30 bg-amber-400/12 text-amber-100"
            }`}
          >
            {online ? "Online" : "Offline"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HeroMetric label="Queued" value={summary.queued} />
          <HeroMetric label="Syncing" value={summary.syncing} />
          <HeroMetric label="Failed" value={summary.failed} attention />
          <HeroMetric label="Conflicts" value={summary.conflicted} attention />
        </div>

        <button
          type="button"
          disabled={!online || busy || pending.length === 0}
          onClick={() => void syncNow()}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#32b9f3] px-4 text-sm font-extrabold text-[#041022] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RefreshCw
            aria-hidden
            className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
          />
          {busy ? "Synchronizing…" : pending.length > 0 ? "Sync now" : "Everything is saved"}
        </button>
      </section>

      {message ? (
        <div className="mobile-command-row border px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
          {message}
        </div>
      ) : null}

      <section className="mobile-command-panel overflow-hidden border">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3.5">
          <div>
            <h2 className="text-base font-bold text-[color:var(--theme-text-primary)]">
              Device queue
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
              {pending.length} update{pending.length === 1 ? "" : "s"} require attention.
            </p>
          </div>
          <button
            type="button"
            disabled={busy || items.every((item) => item.status !== "synced")}
            onClick={() => void clearCompleted()}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[color:var(--accent-copper)] disabled:opacity-40"
          >
            <Trash2 aria-hidden className="h-4 w-4" />
            Clear completed
          </button>
        </div>

        {items.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-6 text-center">
            <div>
              <span className="mx-auto inline-grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 aria-hidden className="h-6 w-6" />
              </span>
              <h3 className="mt-3 text-base font-bold text-[color:var(--theme-text-primary)]">
                Nothing queued
              </h3>
              <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                Saved mobile work will appear here when it needs synchronization.
              </p>
            </div>
          </div>
        ) : (
          <div>
            {items.slice(0, 50).map((item) => {
              const Icon = statusIcon(item.status);
              return (
                <div
                  key={item.clientMutationId}
                  className="flex min-h-[4.9rem] items-start gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3 last:border-b-0"
                >
                  <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:var(--theme-surface-subtle)]">
                    <Icon
                      aria-hidden
                      className={`h-4 w-4 ${statusClass(item.status)} ${
                        item.status === "syncing" ? "animate-spin" : ""
                      }`}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[color:var(--theme-text-primary)]">
                      {mutationLabel(item.actionType)}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                    {item.lastError ? (
                      <div className="mt-1 text-xs text-red-600 dark:text-red-300">
                        {item.lastError}
                      </div>
                    ) : null}
                    {item.conflictReason ? (
                      <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        {item.conflictReason}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 text-[0.68rem] font-bold capitalize ${statusClass(item.status)}`}
                  >
                    {item.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Link
        href="/mobile"
        className="mobile-command-row flex min-h-12 items-center justify-between border px-4 text-sm font-bold text-[color:var(--theme-text-primary)]"
      >
        Return to mobile home
        <ChevronRight className="h-5 w-5 text-[color:var(--accent-copper)]" />
      </Link>
    </main>
  );
}

function HeroMetric({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number;
  attention?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 px-2 py-2.5 text-center">
      <div
        className={`text-lg font-extrabold ${
          attention && value > 0 ? "text-amber-300" : "text-white"
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 truncate text-[0.58rem] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
    </div>
  );
}
