export const FIELD_DASHBOARD_LAYOUT_SCOPE = "field";
export const FIELD_DASHBOARD_LAYOUT_CACHE_PREFIX =
  "profixiq:field-dashboard:layout:v2";
export const FIELD_DASHBOARD_LEGACY_LAYOUT_CACHE_KEY =
  "profixiq:field-dashboard:layout:v1";

export const FIELD_DASHBOARD_CARD_IDS = [
  "jobs_in_progress",
  "awaiting_approval",
  "parts_required",
  "truck_inventory",
  "unpaid_invoices",
  "followups_due",
  "purchase_orders",
] as const;

export type FieldDashboardCardId = (typeof FIELD_DASHBOARD_CARD_IDS)[number];

export type FieldDashboardLayoutItem = {
  id: FieldDashboardCardId;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
};

export type FieldDashboardLayoutCacheScope = {
  userId: string;
  shopId: string;
};

export type FieldDashboardLayoutCacheRecord = {
  version: 2;
  userId: string;
  shopId: string;
  layout: FieldDashboardLayoutItem[];
  pendingSync: boolean;
};

export type FieldDashboardLayoutSaveRequest = {
  layout: FieldDashboardLayoutItem[];
  serialized: string;
};

export type FieldDashboardLayoutSaveQueue = {
  enqueue: (layout: FieldDashboardLayoutItem[]) => void;
  flush: () => Promise<void>;
  hasPending: () => boolean;
  hasWork: () => boolean;
};

type FieldDashboardLayoutSaveQueueOptions = {
  retryDelayMs?: number;
  maxAutomaticRetries?: number;
};

type PendingFieldDashboardLayoutSave = FieldDashboardLayoutSaveRequest & {
  failedAttempts: number;
};

const CARD_ID_SET = new Set<string>(FIELD_DASHBOARD_CARD_IDS);

function cleanScopePart(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getFieldDashboardLayoutCacheKey(
  scope: FieldDashboardLayoutCacheScope,
): string | null {
  const userId = cleanScopePart(scope.userId);
  const shopId = cleanScopePart(scope.shopId);
  if (!userId || !shopId) return null;

  return `${FIELD_DASHBOARD_LAYOUT_CACHE_PREFIX}:${encodeURIComponent(shopId)}:${encodeURIComponent(userId)}`;
}

function isFieldDashboardCardId(value: unknown): value is FieldDashboardCardId {
  return typeof value === "string" && CARD_ID_SET.has(value);
}

function orderLayout(
  layout: FieldDashboardLayoutItem[],
): FieldDashboardLayoutItem[] {
  return [...layout]
    .sort((left, right) => left.y - right.y)
    .map((item, index) => ({
      id: item.id,
      x: 0,
      y: index,
      w: 1,
      h: 1,
      ...(item.hidden === true ? { hidden: true } : {}),
    }));
}

export function buildDefaultFieldDashboardLayout(): FieldDashboardLayoutItem[] {
  return FIELD_DASHBOARD_CARD_IDS.map((id, index) => ({
    id,
    x: 0,
    y: index,
    w: 1,
    h: 1,
  }));
}

export function normalizeFieldDashboardLayout(
  value: unknown,
): FieldDashboardLayoutItem[] {
  const seen = new Set<FieldDashboardCardId>();
  const parsed: FieldDashboardLayoutItem[] = [];

  if (Array.isArray(value)) {
    for (const candidate of value) {
      if (!candidate || typeof candidate !== "object") continue;
      const record = candidate as Record<string, unknown>;
      if (!isFieldDashboardCardId(record.id) || seen.has(record.id)) continue;

      seen.add(record.id);
      parsed.push({
        id: record.id,
        x: 0,
        y:
          typeof record.y === "number" && Number.isFinite(record.y)
            ? record.y
            : parsed.length,
        w: 1,
        h: 1,
        ...(record.hidden === true ? { hidden: true } : {}),
      });
    }
  }

  const missing = buildDefaultFieldDashboardLayout().filter(
    (item) => !seen.has(item.id),
  );

  return orderLayout([...parsed, ...missing]);
}

export function parseFieldDashboardLayoutCache(
  value: unknown,
  scope: FieldDashboardLayoutCacheScope,
): FieldDashboardLayoutCacheRecord | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const userId = cleanScopePart(scope.userId);
  const shopId = cleanScopePart(scope.shopId);
  if (
    record.version !== 2 ||
    cleanScopePart(record.userId) !== userId ||
    cleanScopePart(record.shopId) !== shopId ||
    !userId ||
    !shopId
  ) {
    return null;
  }

  return {
    version: 2,
    userId,
    shopId,
    layout: normalizeFieldDashboardLayout(record.layout),
    pendingSync: record.pendingSync === true,
  };
}

export function buildFieldDashboardLayoutCache(
  scope: FieldDashboardLayoutCacheScope,
  layout: FieldDashboardLayoutItem[],
  pendingSync: boolean,
): FieldDashboardLayoutCacheRecord | null {
  const userId = cleanScopePart(scope.userId);
  const shopId = cleanScopePart(scope.shopId);
  if (!userId || !shopId) return null;

  return {
    version: 2,
    userId,
    shopId,
    layout: normalizeFieldDashboardLayout(layout),
    pendingSync,
  };
}

export function createFieldDashboardLayoutSaveQueue(
  persist: (request: FieldDashboardLayoutSaveRequest) => Promise<boolean>,
  options: FieldDashboardLayoutSaveQueueOptions = {},
): FieldDashboardLayoutSaveQueue {
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 1_000);
  const maxAutomaticRetries = Math.max(
    0,
    options.maxAutomaticRetries ?? 2,
  );
  let pending: PendingFieldDashboardLayoutSave | null = null;
  let inFlight: Promise<void> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleRetry = () => {
    if (
      !pending ||
      pending.failedAttempts > maxAutomaticRetries ||
      retryTimer
    ) {
      return;
    }

    retryTimer = setTimeout(() => {
      retryTimer = null;
      void flush();
    }, retryDelayMs);
  };

  function flush(): Promise<void> {
    if (inFlight) return inFlight;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    inFlight = (async () => {
      while (pending) {
        const request = pending;
        pending = null;
        const saved = await persist(request).catch(() => false);
        if (!saved) {
          // Preserve the newest edit if another one arrived during the failed save.
          if (!pending) {
            pending = {
              ...request,
              failedAttempts: request.failedAttempts + 1,
            };
          }
          break;
        }
      }
    })().finally(() => {
      inFlight = null;
      scheduleRetry();
    });

    return inFlight;
  }

  return {
    enqueue(layout) {
      const normalized = normalizeFieldDashboardLayout(layout);
      pending = {
        layout: normalized,
        serialized: JSON.stringify(normalized),
        failedAttempts: 0,
      };
    },
    flush,
    hasPending: () => pending !== null,
    hasWork: () => pending !== null || inFlight !== null,
  };
}

export function setFieldDashboardCardVisibility(
  layout: FieldDashboardLayoutItem[],
  cardId: FieldDashboardCardId,
  visible: boolean,
): FieldDashboardLayoutItem[] {
  return orderLayout(
    layout.map((item) => {
      if (item.id !== cardId) return item;
      const next = { ...item };
      if (visible) delete next.hidden;
      else next.hidden = true;
      return next;
    }),
  );
}

export function moveFieldDashboardCard(
  layout: FieldDashboardLayoutItem[],
  cardId: FieldDashboardCardId,
  direction: -1 | 1,
  eligibleCardIds: readonly FieldDashboardCardId[] = FIELD_DASHBOARD_CARD_IDS,
): FieldDashboardLayoutItem[] {
  const ordered = orderLayout(layout);
  const eligible = new Set(eligibleCardIds);
  const eligibleItems = ordered.filter((item) => eligible.has(item.id));
  const currentIndex = eligibleItems.findIndex((item) => item.id === cardId);
  const target = eligibleItems[currentIndex + direction];
  const current = eligibleItems[currentIndex];
  if (!current || !target) return ordered;

  return orderLayout(
    ordered.map((item) => {
      if (item.id === current.id) return { ...item, y: target.y };
      if (item.id === target.id) return { ...item, y: current.y };
      return item;
    }),
  );
}
