"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  clearSyncedOfflineMutations,
  dismissOfflineMutation,
  getOfflineMutationScope,
  hydrateOfflineMutationQueue,
  listOfflineMutations,
  pruneOfflineState,
  subscribeOfflineMutations,
  type PendingMutation,
} from "@/features/shared/lib/offline/mutations";
import {
  getOfflineDatabaseStats,
  type OfflineDatabaseStats,
} from "@/features/shared/lib/offline/database";
import { replayAndReconcileOfflineMutations } from "@/features/shared/lib/offline/replay";
import { reconcileOfflineTechnicianState } from "@/features/shared/lib/offline/reconciliation";
import {
  offlineMutationDeviceValue,
  offlineMutationTarget,
  prepareOfflineMutationRetry,
} from "@/features/shared/lib/offline/conflicts";
import {
  checkOfflineReplaySession,
  type OfflineSessionHealth,
} from "@/features/shared/lib/offline/session";
import {
  assessOfflineStorage,
  type OfflineStorageHealth,
} from "@/features/shared/lib/offline/storage-health";

type BrowserStorage = {
  usage: number;
  quota: number;
  persistent: boolean;
};

const EMPTY_DATABASE_STATS: OfflineDatabaseStats = {
  mutations: 0,
  snapshots: 0,
  blobs: 0,
  blobBytes: 0,
};

const ACTION_LABELS: Record<string, string> = {
  "inspection:save-session": "Inspection progress",
  "shift:punch-event": "Shift punch",
  update_work_order_line_notes: "Job notes",
  upload_job_photo: "Job photo",
  "inspection:upload-photo": "Inspection photo",
  save_story_draft: "Cause and correction",
  "job:punch-transition": "Job status",
  "parts-request:create-draft": "Parts request",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusTone(status: PendingMutation["status"]): string {
  if (status === "synced") return "border-emerald-500/40 text-emerald-200";
  if (status === "failed" || status === "conflicted") {
    return "border-red-500/40 text-red-200";
  }
  if (status === "syncing") return "border-sky-500/40 text-sky-200";
  return "border-amber-500/40 text-amber-200";
}

export default function OfflineSyncPage() {
  const [mutations, setMutations] = useState<PendingMutation[]>([]);
  const [databaseStats, setDatabaseStats] = useState(EMPTY_DATABASE_STATS);
  const [browserStorage, setBrowserStorage] = useState<BrowserStorage>({
    usage: 0,
    quota: 0,
    persistent: false,
  });
  const [online, setOnline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sessionHealth, setSessionHealth] = useState<OfflineSessionHealth>({
    status: "offline",
    message: "Session verification has not run yet.",
  });
  const [updateWaiting, setUpdateWaiting] = useState(false);

  const refresh = useCallback(async () => {
    await hydrateOfflineMutationQueue();
    const scope = getOfflineMutationScope();
    setMutations(listOfflineMutations(scope));
    setDatabaseStats(
      scope ? await getOfflineDatabaseStats(scope) : EMPTY_DATABASE_STATS,
    );
    const estimate = await navigator.storage?.estimate?.();
    const persistent = (await navigator.storage?.persisted?.()) ?? false;
    setBrowserStorage({
      usage: estimate?.usage ?? 0,
      quota: estimate?.quota ?? 0,
      persistent,
    });
    setSessionHealth(await checkOfflineReplaySession(scope));
    const registration = await navigator.serviceWorker?.getRegistration?.();
    setUpdateWaiting(Boolean(registration?.waiting));
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeOfflineMutations(() => void refresh());
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      unsubscribe();
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, [refresh]);

  const run = async (
    action: () => Promise<string | void>,
    fallbackSuccess: string,
  ) => {
    setBusy(true);
    setMessage(null);
    try {
      const success = await action();
      await refresh();
      setMessage(success ?? fallbackSuccess);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "That action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const syncNow = () =>
    run(async () => {
      const result = await replayAndReconcileOfflineMutations();
      const cacheWarning = Object.values(result.reconciliation).includes(
        "failed",
      )
        ? " Server sync finished, but one saved view could not be refreshed."
        : "";
      return `Synced ${result.replayed}; ${result.failed} failed; ${result.conflicted} need review.${cacheWarning}`;
    }, "Sync complete.");

  const requestPersistence = () =>
    run(async () => {
      await navigator.storage?.persist?.();
    }, "Storage protection preference updated.");

  const cleanStorage = () =>
    run(async () => {
      const result = await pruneOfflineState();
      return `Removed ${result.mutationsRemoved} completed updates, ${result.snapshotsRemoved} expired views, and ${result.blobsRemoved} unused files.`;
    }, "Offline storage cleaned.");

  const quotaPercent = browserStorage.quota
    ? Math.min(100, (browserStorage.usage / browserStorage.quota) * 100)
    : 0;
  const storageHealth: OfflineStorageHealth = assessOfflineStorage({
    ...browserStorage,
    pendingBlobBytes: databaseStats.blobBytes,
    pendingBlobCount: databaseStats.blobs,
  });
  const pendingCount = mutations.filter((item) => item.status !== "synced").length;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
              ProFixIQ offline
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Sync Center</h1>
            <p className="mt-2 text-sm text-slate-300">
              Review work stored for the active user and shop on this device.
            </p>
          </div>
          <Link
            href="/offline"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm"
          >
            Back
          </Link>
        </header>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {online ? "Connected" : "Offline"}
              </p>
              <p className="text-sm text-slate-400">
                {mutations.filter((item) => item.status !== "synced").length}{" "}
                updates require attention
              </p>
            </div>
            <button
              type="button"
              disabled={!online || busy}
              onClick={() => void syncNow()}
              className="rounded-xl bg-sky-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40"
            >
              Sync now
            </button>
          </div>
          {message && (
            <p className="mt-3 rounded-lg bg-slate-950/70 px-3 py-2 text-sm text-slate-200">
              {message}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="font-semibold">Pilot readiness</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ReadinessItem
              label="Session"
              ready={sessionHealth.status === "verified"}
              value={
                sessionHealth.status === "verified"
                  ? "Verified"
                  : sessionHealth.status === "offline"
                    ? "Verify on reconnect"
                    : "Sign-in required"
              }
              detail={sessionHealth.message}
            />
            <ReadinessItem
              label="Storage"
              ready={storageHealth.level === "ready"}
              value={storageHealth.label}
              detail={storageHealth.message}
            />
            <ReadinessItem
              label="App update"
              ready={!updateWaiting || pendingCount === 0}
              value={updateWaiting ? "Update waiting" : "Current"}
              detail={
                updateWaiting && pendingCount > 0
                  ? "Sync saved work before activating the update."
                  : "No version-skew risk is currently detected."
              }
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Device queue</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  clearSyncedOfflineMutations,
                  "Completed history cleared.",
                )
              }
              className="text-xs font-semibold text-sky-300 disabled:opacity-40"
            >
              Clear completed
            </button>
          </div>
          {mutations.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-400">
              No offline updates are stored for this user and shop.
            </div>
          ) : (
            mutations.map((mutation) => {
              const target = offlineMutationTarget(mutation);
              const deviceValue = offlineMutationDeviceValue(mutation);
              return (
                <article
                  key={mutation.clientMutationId}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {ACTION_LABELS[mutation.actionType] ??
                          mutation.actionType}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {new Date(mutation.createdAt).toLocaleString()} ·{" "}
                        {mutation.retryCount} retries
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs uppercase tracking-wider ${statusTone(mutation.status)}`}
                    >
                      {mutation.status}
                    </span>
                  </div>
                  {(mutation.conflictReason || mutation.lastError) && (
                    <p className="mt-3 rounded-lg bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
                      {mutation.conflictReason || mutation.lastError}
                    </p>
                  )}
                  {mutation.status === "conflicted" && deviceValue && (
                    <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-sm text-slate-300">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                        Saved on this device
                      </p>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap">
                        {deviceValue}
                      </p>
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    {["failed", "conflicted"].includes(mutation.status) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await prepareOfflineMutationRetry(mutation);
                            await replayAndReconcileOfflineMutations();
                          }, "Device update retried and saved views refreshed.")
                        }
                        className="rounded-lg border border-sky-500/50 px-3 py-1.5 text-xs font-semibold text-sky-200 disabled:opacity-40"
                      >
                        Retry device update
                      </button>
                    )}
                    {mutation.status === "conflicted" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await dismissOfflineMutation(
                              mutation.clientMutationId,
                            );
                            await reconcileOfflineTechnicianState([mutation]);
                          }, "Server state kept and this device's update removed.")
                        }
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
                      >
                        Use server state
                      </button>
                    )}
                    {mutation.status !== "syncing" &&
                      mutation.status !== "conflicted" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                dismissOfflineMutation(
                                  mutation.clientMutationId,
                                ),
                              "Update removed from this device.",
                            )
                          }
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      )}
                    {target && (
                      <Link
                        href={target}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                      >
                        Open record
                      </Link>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Storage</h2>
              <p className="mt-1 text-sm text-slate-400">
                {formatBytes(browserStorage.usage)} used of{" "}
                {browserStorage.quota
                  ? formatBytes(browserStorage.quota)
                  : "unknown quota"}
              </p>
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs ${browserStorage.persistent ? "border-emerald-500/40 text-emerald-200" : "border-amber-500/40 text-amber-200"}`}
            >
              {browserStorage.persistent ? "Protected" : "Best effort"}
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-sky-400"
              style={{ width: `${quotaPercent}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-slate-300">
            <div className="rounded-lg bg-slate-950/70 p-2">
              {databaseStats.snapshots}
              <br />
              saved views
            </div>
            <div className="rounded-lg bg-slate-950/70 p-2">
              {databaseStats.blobs}
              <br />
              files
            </div>
            <div className="rounded-lg bg-slate-950/70 p-2">
              {formatBytes(databaseStats.blobBytes)}
              <br />
              photos
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!browserStorage.persistent && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void requestPersistence()}
                className="rounded-lg border border-sky-500/50 px-3 py-2 text-xs font-semibold text-sky-200 disabled:opacity-40"
              >
                Protect offline storage
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void cleanStorage()}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"
            >
              Clean expired data
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function ReadinessItem(props: {
  label: string;
  ready: boolean;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-wider text-slate-400">{props.label}</p>
      <p className={props.ready ? "mt-1 font-semibold text-emerald-300" : "mt-1 font-semibold text-amber-300"}>
        {props.value}
      </p>
      <p className="mt-1 text-xs text-slate-400">{props.detail}</p>
    </div>
  );
}
