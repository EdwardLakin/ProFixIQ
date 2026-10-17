import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { emptyFleetSummary } from "@/features/equipment/lib/equipmentDashboard";
import { parseEquipmentQueueFilters } from "@/features/equipment/lib/equipmentWorkQueue";
import type { EquipmentIdentityRow } from "@/features/equipment/lib/equipmentDirectoryQuery";
import type { DispatchVisit } from "@/features/dispatch/lib/contracts";
import { estimateNextOwner } from "@/features/estimates/lib/status";
const mocks = vi.hoisted(() => ({ index: vi.fn(), board: vi.fn() }));
vi.mock("@/features/equipment/server/loadEquipmentAssetList", () => ({
  loadEquipmentAssetList: mocks.index,
}));
vi.mock("@/features/dispatch/server/commands", () => ({
  getDispatchBoard: mocks.board,
}));
import { loadEquipmentOperationCounts } from "@/features/equipment/server/loadEquipmentOperationCounts";
import { loadEquipmentWorkQueue } from "@/features/equipment/server/loadEquipmentWorkQueue";
import {
  loadEquipmentFieldVisits,
  equipmentVisitWindow,
  equipmentFieldVisitsHref,
  parseEquipmentVisitWindow,
} from "@/features/equipment/server/loadEquipmentFieldVisits";
import EquipmentOperationsBoard, {
  equipmentBoardCards,
} from "@/features/equipment/components/EquipmentOperationsBoard";
import EquipmentFieldVisitsView from "@/features/equipment/components/EquipmentFieldVisitsView";
const asset = {
  assetId: "asset",
  unitNumber: "EX-1",
  year: 2025,
  make: "CAT",
  model: "320",
} as EquipmentIdentityRow;
const row = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  vehicle_id: "asset",
  shop_id: "shop",
  status: "waiting_parts",
  record_type: "work_order",
  estimate_status: null,
  created_at: "2026-10-01",
  ...patch,
});
function client(rows: ReturnType<typeof row>[], fail = false) {
  const calls: { shop?: unknown; ids?: unknown[]; columns?: string }[] = [];
  return {
    calls,
    from: () => {
      const call: (typeof calls)[number] = {};
      calls.push(call);
      let start = 0,
        end = 0;
      const query = {
        select: (columns: string) => {
          call.columns = columns;
          return query;
        },
        eq: (_key: string, value: unknown) => {
          call.shop = value;
          return query;
        },
        in: (_key: string, ids: unknown[]) => {
          call.ids = ids;
          return query;
        },
        order: () => query,
        range: (a: number, b: number) => {
          start = a;
          end = b;
          return query;
        },
        then: (resolve: (value: unknown) => void) =>
          resolve({
            data: rows
              .filter(
                (r) =>
                  r.shop_id === call.shop && call.ids?.includes(r.vehicle_id),
              )
              .slice(start, end + 1),
            error: fail ? { message: "failed" } : null,
          }),
      };
      return query;
    },
  };
}
const input = (db: ReturnType<typeof client>) => ({
  admin: db as never,
  supabase: {} as never,
  shopId: "shop",
  role: "owner" as const,
});
const window = equipmentVisitWindow(new Date("2026-10-17T12:00:00Z"));
const visit = (id: string, patch: Partial<DispatchVisit> = {}) =>
  ({
    id,
    shopId: "shop",
    mode: "mobile",
    status: "working",
    vehicle: { id: "asset", label: "EX-1" },
    ...patch,
  }) as DispatchVisit;
beforeEach(() => {
  mocks.index.mockReset().mockResolvedValue({ rows: [asset], capped: false });
  mocks.board.mockReset().mockResolvedValue({ visits: [] });
});
it("matches the canonical Work drilldowns before pagination and excludes ordinary Shop/other-tenant work", async () => {
  const db = client([
    row("repair"),
    row("sent", {
      record_type: "estimate",
      estimate_status: "sent",
      status: "new",
    }),
    row("draft", {
      record_type: "estimate",
      estimate_status: "draft",
      status: "new",
    }),
    row("converted", {
      estimate_number: "E-1",
      estimate_status: "sent",
      status: "completed",
    }),
    row("ordinary", { vehicle_id: "car" }),
    row("foreign", { shop_id: "other" }),
    ...Array.from({ length: 120 }, (_, i) =>
      row(`old-${i}`, { status: "completed" }),
    ),
  ]);
  const counts = await loadEquipmentOperationCounts(input(db));
  expect(mocks.index).toHaveBeenCalledTimes(1);
  expect(db.calls).toHaveLength(1);
  expect(estimateNextOwner("sent")).toBe("Customer");
  expect(counts.approvals.value).toBe(1);
  expect(counts.parts.value).toBe(1);
  for (const metric of [counts.approvals, counts.parts]) {
    const filters = parseEquipmentQueueFilters(
      Object.fromEntries(new URL(metric.href, "https://test").searchParams),
    );
    const list = await loadEquipmentWorkQueue({ ...input(db), filters });
    expect(metric.value).toBe(list.info.total);
    expect(metric.partial).toBe(list.partial);
  }
  expect(
    db.calls.every(
      (call) => call.shop === "shop" && call.ids?.join() === "asset",
    ),
  ).toBe(true);
  expect(
    db.calls.every(
      (call) => !/(total|cost|price|payment|\*)/.test(call.columns ?? ""),
    ),
  ).toBe(true);
});
it("retains count errors as unavailable and inherited caps as partial", async () => {
  const errors = await loadEquipmentOperationCounts(input(client([], true)));
  expect(errors.approvals.value).toBeNull();
  expect(errors.parts.value).toBeNull();
  mocks.index.mockResolvedValue({ rows: [asset], capped: true });
  const counts = await loadEquipmentOperationCounts(
    input(client([row("one")])),
  );
  const operations = {
    ...counts,
    field: {
      value: null,
      partial: false,
      href: "/equipment/dashboard/field-visits",
    },
  };
  render(
    <EquipmentOperationsBoard
      summary={emptyFleetSummary()}
      role="owner"
      operations={operations}
    />,
  );
  expect(screen.getByText("Parts holds").closest("a")).toHaveTextContent(
    "Incomplete scan",
  );
  expect(
    screen.getByText("Active field visits").closest("a"),
  ).toHaveTextContent("Unavailable");
});
it("preserves existing asset metrics and leaves Dispatch availability unconnected", async () => {
  const summary = emptyFleetSummary();
  summary.status.down = 2;
  summary.openWork.orders = 5;
  summary.pm.due = 3;
  const counts = await loadEquipmentOperationCounts(input(client([])));
  const cards = equipmentBoardCards(summary, {
    ...counts,
    field: { value: 4, partial: false, href: equipmentFieldVisitsHref(window) },
  });
  expect(Object.fromEntries(cards.map((c) => [c.key, c.value]))).toMatchObject({
    "machines-down": 2,
    "open-work": 5,
    "pm-due": 3,
    dispatch: null,
    "field-jobs": 4,
  });
});
it("uses the complete canonical Dispatch window, mobile predicate and Equipment scope for count/list parity", async () => {
  mocks.board.mockResolvedValue({
    visits: [
      visit("working"),
      visit("scheduled", { status: "scheduled" }),
      visit("paused", { status: "paused" }),
      visit("done", { status: "completed" }),
      visit("car", { vehicle: { id: "car" } }),
      visit("shop", { mode: "shop" }),
      visit("foreign", { shopId: "other" }),
      visit("no-asset", { vehicle: null }),
    ],
  });
  const data = await loadEquipmentFieldVisits({
    ...input(client([])),
    actorProfileId: "profile",
    window,
  });
  expect(data.rows.map((r) => r.id)).toEqual([
    "working",
    "scheduled",
    "paused",
  ]);
  expect(mocks.board).toHaveBeenCalledWith(
    expect.objectContaining({
      shopId: "shop",
      actorUserId: "profile",
      ...window,
    }),
  );
  expect(
    parseEquipmentVisitWindow(
      Object.fromEntries(
        new URL(equipmentFieldVisitsHref(window), "https://test").searchParams,
      ),
    ),
  ).toEqual(window);
  render(<EquipmentFieldVisitsView data={data} />);
  expect(screen.getByText("3 matching visits in this window")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "Open asset" })).toHaveLength(3);
});
it.each(["mechanic", "service", "parts"] as const)(
  "does not expose Dispatch data to %s",
  async (role) => {
    await expect(
      loadEquipmentFieldVisits({
        ...input(client([])),
        role,
        actorProfileId: "profile",
        window,
      }),
    ).rejects.toThrow("access denied");
    expect(mocks.board).not.toHaveBeenCalled();
    expect(mocks.index).not.toHaveBeenCalled();
  },
);
it("keeps Work summary links within existing Work permissions and Dispatch links gated", async () => {
  const counts = await loadEquipmentOperationCounts({
    ...input(client([])),
    role: "service",
  });
  render(
    <EquipmentOperationsBoard
      summary={emptyFleetSummary()}
      role="service"
      operations={{
        ...counts,
        field: {
          value: null,
          partial: false,
          href: equipmentFieldVisitsHref(window),
        },
      }}
    />,
  );
  expect(screen.getByText("Parts holds").closest("a")).toHaveAttribute(
    "href",
    counts.parts.href,
  );
  expect(screen.getByText("Active field visits").closest("a")).toBeNull();
});
it("rejects assigned-only users before work reads", async () => {
  const db = client([]);
  const result = await loadEquipmentOperationCounts({
    ...input(db),
    role: "mechanic",
  });
  expect(result.parts.value).toBeNull();
  expect(db.calls).toEqual([]);
  expect(mocks.index).not.toHaveBeenCalled();
});

it("pages field drilldowns without changing their count or window", () => {
  const rows = Array.from({ length: 60 }, (_, i) => visit(`v-${i}`));
  render(
    <EquipmentFieldVisitsView
      data={{ rows, partial: true, window }}
      page={2}
    />,
  );
  expect(screen.getAllByRole("link", { name: "Open asset" })).toHaveLength(10);
  expect(screen.getByText("60 matching visits in this scan")).toBeTruthy();
  const href = screen
    .getByRole("link", { name: "Previous" })
    .getAttribute("href")!;
  const params = Object.fromEntries(new URL(href, "https://test").searchParams);
  expect(parseEquipmentVisitWindow(params)).toEqual(window);
  expect(screen.getByRole("status")).toHaveTextContent("5,000 assets");
});
it("falls back to the bounded Dispatch window for malformed dates", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  try {
    expect(
      parseEquipmentVisitWindow({ startsAt: "bad", endsAt: "2100-01-01" }),
    ).toEqual(window);
  } finally {
    vi.useRealTimers();
  }
});

it("shares one bounded multi-window scan for both dashboard counts", async () => {
  const db = client(Array.from({ length: 620 }, (_, i) => row(`work-${i}`)));
  const result = await loadEquipmentOperationCounts(input(db));
  expect(result.parts.value).toBe(620);
  expect(result.approvals.value).toBe(0);
  expect(mocks.index).toHaveBeenCalledTimes(1);
  expect(db.calls).toHaveLength(2);
});
