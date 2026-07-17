"use client";

import type { OfflineDatabaseStats } from "@/features/shared/lib/offline/database";
import type {
  OfflineAttachmentAudit,
  OfflinePersistenceHealth,
  PendingMutation,
} from "@/features/shared/lib/offline/mutations";
import type { OfflineSessionHealth } from "@/features/shared/lib/offline/session";
import type { OfflineStorageHealth } from "@/features/shared/lib/offline/storage-health";

type StorageSummary = {
  usage: number;
  quota: number;
  persistent: boolean;
};

export type OfflinePilotDiagnostics = {
  schemaVersion: 1;
  generatedAt: string;
  appVersion: string;
  connectivity: "online" | "offline";
  installed: boolean;
  sessionStatus: OfflineSessionHealth["status"];
  storage: StorageSummary & {
    level: OfflineStorageHealth["level"];
    database: OfflineDatabaseStats;
    suspectedEviction: boolean;
  };
  attachments: OfflineAttachmentAudit & {
    expectedBeforeEviction: number;
  };
  updateWaiting: boolean;
  queue: {
    total: number;
    byStatus: Record<string, number>;
    byAction: Record<string, number>;
    maximumRetryCount: number;
    oldestPendingMinutes: number | null;
  };
};

export function buildOfflinePilotDiagnostics(args: {
  now?: Date;
  appVersion: string;
  online: boolean;
  installed: boolean;
  sessionHealth: OfflineSessionHealth;
  browserStorage: StorageSummary;
  storageHealth: OfflineStorageHealth;
  databaseStats: OfflineDatabaseStats;
  attachmentAudit: OfflineAttachmentAudit;
  persistenceHealth: OfflinePersistenceHealth;
  updateWaiting: boolean;
  mutations: PendingMutation[];
}): OfflinePilotDiagnostics {
  const now = args.now ?? new Date();
  const pending = args.mutations.filter((item) => item.status !== "synced");
  const byStatus: Record<string, number> = {};
  const byAction: Record<string, number> = {};
  for (const mutation of args.mutations) {
    byStatus[mutation.status] = (byStatus[mutation.status] ?? 0) + 1;
    byAction[mutation.actionType] =
      (byAction[mutation.actionType] ?? 0) + 1;
  }
  const oldest = pending.reduce<number | null>((value, mutation) => {
    const created = new Date(mutation.createdAt).getTime();
    return Number.isFinite(created) && (value == null || created < value)
      ? created
      : value;
  }, null);
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    appVersion: args.appVersion || "unknown",
    connectivity: args.online ? "online" : "offline",
    installed: args.installed,
    sessionStatus: args.sessionHealth.status,
    storage: {
      ...args.browserStorage,
      level: args.storageHealth.level,
      database: args.databaseStats,
      suspectedEviction: args.persistenceHealth.suspectedEviction,
    },
    attachments: {
      ...args.attachmentAudit,
      expectedBeforeEviction:
        args.persistenceHealth.expectedPendingAttachments,
    },
    updateWaiting: args.updateWaiting,
    queue: {
      total: args.mutations.length,
      byStatus,
      byAction,
      maximumRetryCount: args.mutations.reduce(
        (value, mutation) => Math.max(value, mutation.retryCount),
        0,
      ),
      oldestPendingMinutes:
        oldest == null
          ? null
          : Math.max(0, Math.round((now.getTime() - oldest) / 60000)),
    },
  };
}

export function downloadOfflinePilotDiagnostics(
  diagnostics: OfflinePilotDiagnostics,
): void {
  const blob = new Blob([JSON.stringify(diagnostics, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `profixiq-offline-diagnostics-${diagnostics.generatedAt.replace(/[:.]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
