export const FIELD_DASHBOARD_LAYOUT_SCOPE = "field";
export const FIELD_DASHBOARD_LAYOUT_CACHE_KEY =
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

const CARD_ID_SET = new Set<string>(FIELD_DASHBOARD_CARD_IDS);

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
