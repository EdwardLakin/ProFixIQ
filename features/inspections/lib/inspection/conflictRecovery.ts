import type {
  InspectionItem,
  InspectionSession,
} from "@inspections/lib/inspection/types";

export type InspectionConflictChoice = "device" | "server";
export type InspectionSyncSource = "installed" | "mobile_web" | "desktop";

const CLIENT_ID_KEY = "profixiq.inspection.sync-client.v1";

export function inspectionSyncSource(): InspectionSyncSource {
  if (typeof window === "undefined") return "desktop";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (standalone) return "installed";
  return window.matchMedia?.("(max-width: 767px)").matches
    ? "mobile_web"
    : "desktop";
}

export function inspectionSyncClientId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY)?.trim();
    if (existing) return existing;
    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return "ephemeral-client";
  }
}

export function stampInspectionSyncSource(
  session: InspectionSession,
): InspectionSession {
  return {
    ...session,
    syncSource: inspectionSyncSource(),
    syncClientId: inspectionSyncClientId(),
  };
}

function sourcePriority(source: InspectionSyncSource | null | undefined): number {
  if (source === "installed") return 3;
  if (source === "mobile_web") return 2;
  if (source === "desktop") return 1;
  return 0;
}

export type InspectionConflictRow = {
  key: string;
  sectionIndex: number;
  itemIndex: number;
  sectionTitle: string;
  itemLabel: string;
  deviceItem: InspectionItem;
  serverItem: InspectionItem;
};

const RECOVERABLE_ITEM_FIELDS: Array<keyof InspectionItem> = [
  "status",
  "value",
  "unit",
  "notes",
  "note",
  "photoUrls",
  "parts",
  "laborHours",
  "recommend",
  "photoRequested",
  "photoReviewed",
  "findingReviewed",
];

function normalized(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function itemLabel(item: InspectionItem, index: number): string {
  return String(item.item ?? item.name ?? `Item ${index + 1}`).trim();
}

function itemIdentity(item: InspectionItem, index: number): string {
  return normalized(item.item ?? item.name) || `index:${index}`;
}

function comparableItem(item: InspectionItem): Record<string, unknown> {
  return Object.fromEntries(
    RECOVERABLE_ITEM_FIELDS.map((field) => [field, item[field] ?? null]),
  );
}

function itemsDiffer(device: InspectionItem, server: InspectionItem): boolean {
  return (
    JSON.stringify(comparableItem(device)) !==
    JSON.stringify(comparableItem(server))
  );
}

export function inspectionConflictRows(
  device: InspectionSession,
  server: InspectionSession,
): InspectionConflictRow[] {
  const rows: InspectionConflictRow[] = [];

  server.sections.forEach((serverSection, sectionIndex) => {
    const deviceSection =
      device.sections.find(
        (section) =>
          normalized(section.title) === normalized(serverSection.title),
      ) ?? device.sections[sectionIndex];
    if (!deviceSection) return;

    serverSection.items.forEach((serverItem, itemIndex) => {
      const identity = itemIdentity(serverItem, itemIndex);
      const deviceItem =
        deviceSection.items.find(
          (item, index) => itemIdentity(item, index) === identity,
        ) ?? deviceSection.items[itemIndex];
      if (!deviceItem || !itemsDiffer(deviceItem, serverItem)) return;

      rows.push({
        key: `${sectionIndex}:${itemIndex}:${identity}`,
        sectionIndex,
        itemIndex,
        sectionTitle: serverSection.title,
        itemLabel: itemLabel(serverItem, itemIndex),
        deviceItem,
        serverItem,
      });
    });
  });

  return rows;
}

export function mergeInspectionConflict(args: {
  device: InspectionSession;
  server: InspectionSession;
  choices: Record<string, InspectionConflictChoice>;
}): InspectionSession {
  const rows = inspectionConflictRows(args.device, args.server);
  const sections = args.server.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({ ...item })),
  }));

  for (const row of rows) {
    if ((args.choices[row.key] ?? "device") !== "device") continue;
    sections[row.sectionIndex].items[row.itemIndex] = {
      ...row.serverItem,
      ...row.deviceItem,
      // Uploaded evidence is append-only. Never make choosing one measurement
      // remove a photo already acknowledged by the other copy.
      photoUrls: Array.from(
        new Set([
          ...(row.serverItem.photoUrls ?? []),
          ...(row.deviceItem.photoUrls ?? []),
        ]),
      ),
    };
  }

  return {
    ...args.server,
    sections,
    lastUpdated: new Date().toISOString(),
    // The canonical revision is the concurrency token for the recovery write.
    // Device timestamps are deliberately not used to choose a winner.
    syncRevision: args.server.syncRevision,
    serverUpdatedAt: args.server.serverUpdatedAt,
  };
}

export function automaticallyMergeInspectionConflict(args: {
  device: InspectionSession;
  server: InspectionSession;
  currentSource: InspectionSyncSource;
  currentClientId: string;
}): InspectionSession | null {
  const devicePriority = sourcePriority(args.currentSource);
  const serverPriority = sourcePriority(args.server.syncSource);
  const sameClient =
    Boolean(args.server.syncClientId) &&
    args.server.syncClientId === args.currentClientId;
  const rows = inspectionConflictRows(args.device, args.server);

  // A second device at the same tier changing the same item is the only case
  // that needs a human choice. Every other case follows the declared authoring
  // priority: installed app, then mobile web, then desktop.
  if (rows.length > 0 && devicePriority === serverPriority && !sameClient) {
    return null;
  }

  const preferDevice = sameClient || devicePriority > serverPriority;
  const choices = Object.fromEntries(
    rows.map((row) => [row.key, preferDevice ? "device" : "server"]),
  ) as Record<string, InspectionConflictChoice>;
  const merged = mergeInspectionConflict({
    device: args.device,
    server: args.server,
    choices,
  });
  return {
    ...merged,
    syncSource: args.currentSource,
    syncClientId: args.currentClientId,
  };
}
