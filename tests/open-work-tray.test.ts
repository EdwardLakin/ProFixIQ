import { describe, expect, it } from "vitest";

import {
  DASHBOARD_OPEN_WORK_ITEM,
  migrateLegacyTabs,
  resolveOpenWork,
  updateOpenWorkItem,
  upsertOpenWork,
  visibleOpenWorkItems,
} from "@/features/shared/components/tabs/openWork";
import { metaFor } from "@/features/shared/lib/routeMeta";

const WORK_ORDER_ID = "4b2ab5f1-2e74-45f1-8c71-2b12fcd32e95";

describe("Open Work route identity", () => {
  it("does not turn navigation destinations into working records", () => {
    expect(resolveOpenWork("/work-orders")).toBeNull();
    expect(resolveOpenWork("/work-orders/view")).toBeNull();
    expect(resolveOpenWork("/work-orders/quote-review")).toBeNull();
    expect(resolveOpenWork("/parts/requests")).toBeNull();
    expect(resolveOpenWork("/dashboard/owner/reports")).toBeNull();
  });

  it("deduplicates work-order actions under one canonical record", () => {
    const detail = resolveOpenWork(`/work-orders/${WORK_ORDER_ID}`, 10);
    const approval = resolveOpenWork(
      `/work-orders/${WORK_ORDER_ID}/approve`,
      20,
    );
    const quote = resolveOpenWork(`/quote-review/${WORK_ORDER_ID}`, 30);
    const focused = resolveOpenWork(
      `/work-orders/${WORK_ORDER_ID}/focused-job/line-1`,
      40,
    );

    expect(detail?.key).toBe(`work-order:${WORK_ORDER_ID}`);
    expect(approval?.key).toBe(detail?.key);
    expect(quote?.key).toBe(detail?.key);
    expect(focused?.key).toBe(detail?.key);

    let items = [DASHBOARD_OPEN_WORK_ITEM];
    for (const item of [detail, approval, quote, focused]) {
      if (item) items = upsertOpenWork(items, item);
    }
    expect(items).toHaveLength(2);
    expect(items[1].href).toBe(
      `/work-orders/${WORK_ORDER_ID}/focused-job/line-1`,
    );
  });

  it("keeps an invoice as a distinct working record with a mobile handoff", () => {
    const invoice = resolveOpenWork(
      `/work-orders/invoice/${WORK_ORDER_ID}`,
      10,
    );
    expect(invoice).toMatchObject({
      key: `invoice:${WORK_ORDER_ID}`,
      kind: "invoice",
      mobileHref: `/mobile/work-orders/${WORK_ORDER_ID}`,
    });
  });

  it("uses the same record identity on mobile without replacing the desktop resume route", () => {
    expect(
      resolveOpenWork(`/mobile/work-orders/${WORK_ORDER_ID}`, 10),
    ).toMatchObject({
      key: `work-order:${WORK_ORDER_ID}`,
      href: `/work-orders/${WORK_ORDER_ID}`,
      mobileHref: `/mobile/work-orders/${WORK_ORDER_ID}`,
    });
  });

  it("tracks inspections and customer files but excludes their directory pages", () => {
    expect(resolveOpenWork("/inspections/saved")).toBeNull();
    expect(resolveOpenWork("/customers/directory")).toBeNull();
    expect(resolveOpenWork("/inspections/inspection-123")).toMatchObject({
      key: "inspection:inspection-123",
      kind: "inspection",
    });
    expect(resolveOpenWork("/customers/customer-123")).toMatchObject({
      key: "customer:customer-123",
      kind: "customer",
    });
  });
});

describe("Open Work persistence and presentation", () => {
  it("migrates legacy action tabs into one record and drops page tabs", () => {
    const migrated = migrateLegacyTabs(
      [
        { href: "/parts/requests", title: "Parts Requests" },
        {
          href: `/work-orders/${WORK_ORDER_ID}/approve`,
          title: "WO #approve",
        },
        {
          href: `/work-orders/${WORK_ORDER_ID}/quote-review`,
          title: "WO #quote-review",
        },
      ],
      100,
    );

    expect(migrated.map((item) => item.key)).toEqual([
      "dashboard",
      `work-order:${WORK_ORDER_ID}`,
    ]);
    expect(migrated[1].title).not.toContain("approve");
  });

  it("preserves an enriched label while updating the last resume route", () => {
    const initial = resolveOpenWork(`/work-orders/${WORK_ORDER_ID}`, 10);
    expect(initial).not.toBeNull();
    let items = upsertOpenWork(
      [DASHBOARD_OPEN_WORK_ITEM],
      initial!,
    );
    items = updateOpenWorkItem(items, initial!.key, {
      title: "EL000001 · Anderson",
      status: "In progress",
    });

    const quote = resolveOpenWork(`/quote-review/${WORK_ORDER_ID}`, 20);
    items = upsertOpenWork(items, quote!);

    expect(items[1]).toMatchObject({
      title: "EL000001 · Anderson",
      status: "In progress",
      href: `/quote-review/${WORK_ORDER_ID}`,
    });
  });

  it("keeps the active record visible inside the five-item desktop limit", () => {
    const records = Array.from({ length: 7 }, (_, index) =>
      resolveOpenWork(`/work-orders/EL${index + 1}`, index + 1),
    ).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const visible = visibleOpenWorkItems(
      [DASHBOARD_OPEN_WORK_ITEM, ...records],
      "work-order:EL1",
      5,
    );

    expect(visible).toHaveLength(5);
    expect(visible[0].key).toBe("dashboard");
    expect(visible.some((item) => item.key === "work-order:EL1")).toBe(true);
  });

  it("does not mislabel a nested action as the dynamic work-order id", () => {
    expect(metaFor(`/work-orders/${WORK_ORDER_ID}/approve`).title).toBe(
      "Approve",
    );
    expect(metaFor(`/work-orders/${WORK_ORDER_ID}`).title).toContain(
      WORK_ORDER_ID.slice(0, 8),
    );
  });
});
