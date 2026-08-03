export type OpenWorkKind =
  | "dashboard"
  | "work-order"
  | "inspection"
  | "invoice"
  | "customer"
  | "appointment";

export type OpenWorkItem = {
  key: string;
  href: string;
  mobileHref?: string;
  title: string;
  subtitle?: string;
  kind: OpenWorkKind;
  status?: string;
  dirty?: boolean;
  offline?: boolean;
  pinned?: boolean;
  lastOpenedAt: number;
};

export type OpenWorkUpdate = Partial<
  Pick<
    OpenWorkItem,
    "title" | "subtitle" | "status" | "dirty" | "offline"
  >
>;

export const DASHBOARD_OPEN_WORK_ITEM: OpenWorkItem = {
  key: "dashboard",
  href: "/dashboard",
  mobileHref: "/mobile",
  title: "Dashboard",
  kind: "dashboard",
  pinned: true,
  lastOpenedAt: 0,
};

const WORK_ORDER_STATIC_SEGMENTS = new Set([
  "board",
  "confirm",
  "create",
  "editor",
  "history",
  "invoice",
  "queue",
  "quote-review",
  "view",
]);

const INSPECTION_STATIC_SEGMENTS = new Set([
  "created",
  "custom-draft",
  "custom-inspection",
  "customer-vehicle",
  "fill",
  "findings",
  "fleet-import",
  "fleet-review",
  "genericInspection",
  "run",
  "saved",
  "summary",
  "summaries",
  "templates",
]);

const CUSTOMER_STATIC_SEGMENTS = new Set(["all", "directory", "search"]);

function cleanPath(href: string): string {
  const path = String(href || "/").split(/[?#]/, 1)[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function pathSegments(href: string): string[] {
  return cleanPath(href).split("/").filter(Boolean);
}

function shortId(id: string): string {
  const decoded = decodeURIComponent(id);
  return decoded.includes("-") && decoded.length >= 24
    ? decoded.slice(0, 8)
    : decoded;
}

function workOrderItem(
  id: string,
  href: string,
  now: number,
): OpenWorkItem {
  const label = shortId(id);
  return {
    key: `work-order:${id}`,
    href,
    mobileHref: `/mobile/work-orders/${encodeURIComponent(id)}`,
    title: `WO · ${label}`,
    kind: "work-order",
    lastOpenedAt: now,
  };
}

function invoiceItem(id: string, href: string, now: number): OpenWorkItem {
  return {
    key: `invoice:${id}`,
    href,
    mobileHref: `/mobile/work-orders/${encodeURIComponent(id)}`,
    title: `Invoice · ${shortId(id)}`,
    kind: "invoice",
    lastOpenedAt: now,
  };
}

export function resolveOpenWork(
  href: string,
  now = Date.now(),
): OpenWorkItem | null {
  const path = cleanPath(href);
  const segments = pathSegments(path);

  if (path === "/dashboard" || path === "/mobile") {
    return DASHBOARD_OPEN_WORK_ITEM;
  }

  if (
    segments[0] === "work-orders" &&
    segments[1] === "invoice" &&
    segments[2]
  ) {
    return invoiceItem(segments[2], path, now);
  }

  if (
    segments[0] === "work-orders" &&
    segments[1] === "view" &&
    segments[2]
  ) {
    return workOrderItem(segments[2], `/work-orders/${segments[2]}`, now);
  }

  if (
    segments[0] === "work-orders" &&
    segments[1] &&
    !WORK_ORDER_STATIC_SEGMENTS.has(segments[1])
  ) {
    if (segments[2] === "invoice") {
      return invoiceItem(
        segments[1],
        `/work-orders/invoice/${segments[1]}`,
        now,
      );
    }
    return workOrderItem(segments[1], path, now);
  }

  if (segments[0] === "quote-review" && segments[1]) {
    return workOrderItem(segments[1], path, now);
  }

  if (
    segments[0] === "mobile" &&
    segments[1] === "work-orders" &&
    segments[2] &&
    segments[2] !== "create" &&
    segments[2] !== "view"
  ) {
    return workOrderItem(
      segments[2],
      `/work-orders/${segments[2]}`,
      now,
    );
  }

  if (
    segments[0] === "inspections" &&
    segments[1] &&
    !INSPECTION_STATIC_SEGMENTS.has(segments[1])
  ) {
    return {
      key: `inspection:${segments[1]}`,
      href: path,
      mobileHref: `/mobile/inspections/${encodeURIComponent(segments[1])}`,
      title: `Inspection · ${shortId(segments[1])}`,
      kind: "inspection",
      lastOpenedAt: now,
    };
  }

  if (
    segments[0] === "mobile" &&
    segments[1] === "inspections" &&
    segments[2] &&
    segments[2] !== "import"
  ) {
    return {
      key: `inspection:${segments[2]}`,
      href: `/inspections/${segments[2]}`,
      mobileHref: `/mobile/inspections/${encodeURIComponent(segments[2])}`,
      title: `Inspection · ${shortId(segments[2])}`,
      kind: "inspection",
      lastOpenedAt: now,
    };
  }

  if (
    segments[0] === "customers" &&
    segments[1] &&
    !CUSTOMER_STATIC_SEGMENTS.has(segments[1])
  ) {
    return {
      key: `customer:${segments[1]}`,
      href: path,
      mobileHref: `/mobile/customers/${encodeURIComponent(segments[1])}`,
      title: `Customer · ${shortId(segments[1])}`,
      kind: "customer",
      lastOpenedAt: now,
    };
  }

  if (
    segments[0] === "mobile" &&
    segments[1] === "customers" &&
    segments[2]
  ) {
    return {
      key: `customer:${segments[2]}`,
      href: `/customers/${segments[2]}`,
      mobileHref: `/mobile/customers/${encodeURIComponent(segments[2])}`,
      title: `Customer · ${shortId(segments[2])}`,
      kind: "customer",
      lastOpenedAt: now,
    };
  }

  return null;
}

export function ensureOpenWorkDashboard(
  items: OpenWorkItem[],
): OpenWorkItem[] {
  const withoutDashboard = items.filter(
    (item) => item?.key && item.key !== DASHBOARD_OPEN_WORK_ITEM.key,
  );
  return [DASHBOARD_OPEN_WORK_ITEM, ...withoutDashboard];
}

export function upsertOpenWork(
  items: OpenWorkItem[],
  incoming: OpenWorkItem,
  maxItems = 24,
): OpenWorkItem[] {
  if (incoming.key === DASHBOARD_OPEN_WORK_ITEM.key) {
    return ensureOpenWorkDashboard(items);
  }

  const current = items.find((item) => item.key === incoming.key);
  const merged = current
    ? {
        ...current,
        ...incoming,
        title:
          current.title !== resolveOpenWork(current.href, 0)?.title
            ? current.title
            : incoming.title,
        subtitle: current.subtitle,
        status: current.status,
        dirty: current.dirty,
        offline: current.offline,
      }
    : incoming;

  const work = items
    .filter(
      (item) =>
        item.key !== DASHBOARD_OPEN_WORK_ITEM.key && item.key !== incoming.key,
    )
    .concat(merged)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, Math.max(1, maxItems - 1));

  return [DASHBOARD_OPEN_WORK_ITEM, ...work];
}

export function updateOpenWorkItem(
  items: OpenWorkItem[],
  key: string,
  update: OpenWorkUpdate,
): OpenWorkItem[] {
  return items.map((item) =>
    item.key === key ? { ...item, ...update } : item,
  );
}

export function visibleOpenWorkItems(
  items: OpenWorkItem[],
  activeKey: string,
  maxVisible = 5,
): OpenWorkItem[] {
  const dashboard =
    items.find((item) => item.key === DASHBOARD_OPEN_WORK_ITEM.key) ??
    DASHBOARD_OPEN_WORK_ITEM;
  const work = items
    .filter((item) => item.key !== DASHBOARD_OPEN_WORK_ITEM.key)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  const active = work.find((item) => item.key === activeKey);
  const remaining = work.filter((item) => item.key !== activeKey);
  return [dashboard, ...(active ? [active] : []), ...remaining].slice(
    0,
    Math.max(1, maxVisible),
  );
}

type LegacyTab = {
  href?: unknown;
  title?: unknown;
  icon?: unknown;
  pinned?: unknown;
};

export function migrateLegacyTabs(
  legacyTabs: LegacyTab[],
  now = Date.now(),
): OpenWorkItem[] {
  let next: OpenWorkItem[] = [DASHBOARD_OPEN_WORK_ITEM];
  for (const [index, legacy] of legacyTabs.entries()) {
    if (typeof legacy?.href !== "string") continue;
    const resolved = resolveOpenWork(legacy.href, now + index);
    if (!resolved || resolved.key === DASHBOARD_OPEN_WORK_ITEM.key) continue;
    next = upsertOpenWork(next, resolved);
  }
  return next;
}

export function sanitizePersistedOpenWork(
  value: unknown,
): OpenWorkItem[] {
  if (!Array.isArray(value)) return [DASHBOARD_OPEN_WORK_ITEM];

  let next: OpenWorkItem[] = [DASHBOARD_OPEN_WORK_ITEM];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Partial<OpenWorkItem>;
    if (
      typeof item.key !== "string" ||
      typeof item.href !== "string" ||
      typeof item.title !== "string" ||
      typeof item.kind !== "string"
    ) {
      continue;
    }
    const resolved = resolveOpenWork(item.href);
    if (!resolved || resolved.key !== item.key) continue;
    next = upsertOpenWork(next, {
      ...resolved,
      ...item,
      kind: resolved.kind,
      pinned: false,
      lastOpenedAt:
        typeof item.lastOpenedAt === "number" &&
        Number.isFinite(item.lastOpenedAt)
          ? item.lastOpenedAt
          : resolved.lastOpenedAt,
    });
  }
  return next;
}
