export type OfflineStorageHealth = {
  level: "unknown" | "ready" | "warning" | "critical";
  label: string;
  message: string;
  usagePercent: number | null;
  availableBytes: number | null;
};

const MIB = 1024 * 1024;

export function assessOfflineStorage(args: {
  usage: number;
  quota: number;
  persistent: boolean;
  pendingBlobBytes: number;
  pendingBlobCount: number;
}): OfflineStorageHealth {
  if (!Number.isFinite(args.quota) || args.quota <= 0) {
    return {
      level: "unknown",
      label: "Storage unknown",
      message: "This browser did not report an offline storage limit.",
      usagePercent: null,
      availableBytes: null,
    };
  }
  const usage = Math.max(0, args.usage);
  const availableBytes = Math.max(0, args.quota - usage);
  const usagePercent = Math.min(100, (usage / args.quota) * 100);
  const photoHeadroom = Math.max(50 * MIB, args.pendingBlobBytes * 2);

  if (usagePercent >= 90 || availableBytes < photoHeadroom) {
    return {
      level: "critical",
      label: "Storage critical",
      message:
        "Sync photos now and clean expired data before capturing more offline files.",
      usagePercent,
      availableBytes,
    };
  }
  if (
    usagePercent >= 75 ||
    availableBytes < 200 * MIB ||
    args.pendingBlobCount >= 40 ||
    args.pendingBlobBytes >= 250 * MIB
  ) {
    return {
      level: "warning",
      label: "Storage needs attention",
      message:
        "A large offline queue or limited free space could interrupt photo capture. Sync when practical.",
      usagePercent,
      availableBytes,
    };
  }
  if (!args.persistent) {
    return {
      level: "warning",
      label: "Best-effort storage",
      message: "Protect offline storage to reduce the chance of browser eviction.",
      usagePercent,
      availableBytes,
    };
  }
  return {
    level: "ready",
    label: "Storage ready",
    message: "Offline storage has sufficient protected capacity.",
    usagePercent,
    availableBytes,
  };
}
