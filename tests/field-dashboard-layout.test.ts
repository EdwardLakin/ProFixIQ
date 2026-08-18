import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildFieldDashboardLayoutCache,
  createFieldDashboardLayoutSaveQueue,
  FIELD_DASHBOARD_CARD_IDS,
  getFieldDashboardLayoutCacheKey,
  moveFieldDashboardCard,
  normalizeFieldDashboardLayout,
  parseFieldDashboardLayoutCache,
  setFieldDashboardCardVisibility,
} from "@/features/mobile/service/fieldDashboardLayout";

describe("Field dashboard layout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it("restores every known card while rejecting unknown and duplicate entries", () => {
    const layout = normalizeFieldDashboardLayout([
      { id: "followups_due", y: 0, hidden: true },
      { id: "jobs_in_progress", y: 1 },
      { id: "followups_due", y: 2 },
      { id: "shop_revenue", y: 3 },
    ]);

    expect(layout.map((item) => item.id)).toEqual([
      "followups_due",
      "dispatch_queue",
      "jobs_in_progress",
      "awaiting_approval",
      "parts_required",
      "truck_inventory",
      "unpaid_invoices",
      "purchase_orders",
    ]);
    expect(layout.find((item) => item.id === "followups_due")?.hidden).toBe(
      true,
    );
    expect(new Set(layout.map((item) => item.id))).toEqual(
      new Set(FIELD_DASHBOARD_CARD_IDS),
    );
  });

  it("moves a card relative to the controls the operator can actually use", () => {
    const layout = normalizeFieldDashboardLayout(null);
    const eligible = [
      "jobs_in_progress",
      "awaiting_approval",
      "unpaid_invoices",
      "followups_due",
    ] as const;

    const moved = moveFieldDashboardCard(
      layout,
      "unpaid_invoices",
      -1,
      eligible,
    );
    const eligibleOrder = moved
      .filter((item) => eligible.includes(item.id as (typeof eligible)[number]))
      .map((item) => item.id);

    expect(eligibleOrder).toEqual([
      "jobs_in_progress",
      "unpaid_invoices",
      "awaiting_approval",
      "followups_due",
    ]);
  });

  it("hides and restores optional cards without changing their order", () => {
    const initial = normalizeFieldDashboardLayout(null);
    const hidden = setFieldDashboardCardVisibility(
      initial,
      "followups_due",
      false,
    );
    const restored = setFieldDashboardCardVisibility(
      hidden,
      "followups_due",
      true,
    );

    expect(hidden.find((item) => item.id === "followups_due")?.hidden).toBe(
      true,
    );
    expect(
      restored.find((item) => item.id === "followups_due")?.hidden,
    ).toBeUndefined();
    expect(restored.map((item) => item.id)).toEqual(
      initial.map((item) => item.id),
    );
  });

  it("scopes cached layouts to one user and shop and preserves pending sync state", () => {
    const firstScope = { userId: "user-a", shopId: "shop-a" };
    const secondScope = { userId: "user-b", shopId: "shop-a" };
    const layout = setFieldDashboardCardVisibility(
      normalizeFieldDashboardLayout(null),
      "followups_due",
      false,
    );
    const cached = buildFieldDashboardLayoutCache(firstScope, layout, true);

    expect(getFieldDashboardLayoutCacheKey(firstScope)).not.toBe(
      getFieldDashboardLayoutCacheKey(secondScope),
    );
    expect(parseFieldDashboardLayoutCache(cached, secondScope)).toBeNull();
    expect(
      parseFieldDashboardLayoutCache(cached, firstScope)?.pendingSync,
    ).toBe(true);
    expect(
      parseFieldDashboardLayoutCache(cached, firstScope)?.layout.find(
        (item) => item.id === "followups_due",
      )?.hidden,
    ).toBe(true);
  });

  it("serializes saves and coalesces edits made while an older request is in flight", async () => {
    let releaseFirstSave: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    const saved: string[] = [];
    const queue = createFieldDashboardLayoutSaveQueue(async (request) => {
      saved.push(request.serialized);
      if (saved.length === 1) await firstSave;
      return true;
    });
    const initial = normalizeFieldDashboardLayout(null);
    const firstEdit = setFieldDashboardCardVisibility(
      initial,
      "followups_due",
      false,
    );
    const latestEdit = setFieldDashboardCardVisibility(
      firstEdit,
      "purchase_orders",
      false,
    );

    queue.enqueue(firstEdit);
    const flushing = queue.flush();
    await Promise.resolve();
    expect(queue.hasWork()).toBe(true);
    queue.enqueue(latestEdit);
    expect(queue.hasPending()).toBe(true);
    releaseFirstSave?.();
    await flushing;

    expect(saved).toEqual([
      JSON.stringify(firstEdit),
      JSON.stringify(latestEdit),
    ]);
    expect(queue.hasPending()).toBe(false);
    expect(queue.hasWork()).toBe(false);
  });

  it("automatically retries the newest retained edit after a transient failure", async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const queue = createFieldDashboardLayoutSaveQueue(
      async (request) => {
        saved.push(request.serialized);
        return saved.length > 1;
      },
      { retryDelayMs: 25, maxAutomaticRetries: 1 },
    );
    const layout = setFieldDashboardCardVisibility(
      normalizeFieldDashboardLayout(null),
      "followups_due",
      false,
    );

    queue.enqueue(layout);
    await queue.flush();
    expect(queue.hasWork()).toBe(true);

    await vi.advanceTimersByTimeAsync(25);

    expect(saved).toEqual([JSON.stringify(layout), JSON.stringify(layout)]);
    expect(queue.hasWork()).toBe(false);
  });
});
