import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  logOperationalEvent: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

vi.mock("@/features/work-orders/server/logOperationalEvent", () => ({
  logOperationalEvent: mocks.logOperationalEvent,
}));

type MockOptions = {
  status?: "requested" | "quoted" | "approved" | "cancelled";
  itemCount?: number;
  requestMissing?: boolean;
  updateMissing?: boolean;
};

function buildSupabase(options: MockOptions = {}) {
  const requestFilters: Array<[string, unknown]> = [];
  const itemFilters: Array<[string, unknown]> = [];
  const updateFilters: Array<[string, unknown]> = [];
  const update = vi.fn();

  const requestReadBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: options.requestMissing
        ? null
        : {
            id: "11111111-1111-4111-8111-111111111111",
            status: options.status ?? "requested",
            work_order_id: "work-order-1",
          },
      error: null,
    })),
  };
  requestReadBuilder.select.mockReturnValue(requestReadBuilder);
  requestReadBuilder.eq.mockImplementation((key: string, value: unknown) => {
    requestFilters.push([key, value]);
    return requestReadBuilder;
  });

  const itemBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    then: (
      resolve: (value: { count: number; error: null }) => unknown,
    ) => resolve({ count: options.itemCount ?? 0, error: null }),
  };
  itemBuilder.select.mockReturnValue(itemBuilder);
  itemBuilder.eq.mockImplementation((key: string, value: unknown) => {
    itemFilters.push([key, value]);
    return itemBuilder;
  });

  const updateBuilder = {
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: options.updateMissing
        ? null
        : {
            id: "11111111-1111-4111-8111-111111111111",
            status: "cancelled",
          },
      error: null,
    })),
  };
  updateBuilder.eq.mockImplementation((key: string, value: unknown) => {
    updateFilters.push([key, value]);
    return updateBuilder;
  });
  updateBuilder.select.mockReturnValue(updateBuilder);
  update.mockReturnValue(updateBuilder);

  let requestCalls = 0;
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "part_request_items") return itemBuilder;
      if (table === "part_requests") {
        requestCalls += 1;
        return requestCalls === 1
          ? requestReadBuilder
          : { update };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return {
    supabase,
    update,
    requestFilters,
    itemFilters,
    updateFilters,
  };
}

async function post(
  supabase: ReturnType<typeof buildSupabase>["supabase"],
) {
  mocks.requireShopScopedApiAccess.mockResolvedValue({
    ok: true,
    profile: { id: "actor-1", shop_id: "shop-1" },
    supabase,
  });
  const { POST } = await import(
    "../../app/api/parts/requests/[requestId]/dismiss-empty/route"
  );
  return POST(new Request("http://localhost"), {
    params: Promise.resolve({
      requestId: "11111111-1111-4111-8111-111111111111",
    }),
  });
}

describe("dismiss empty parts request route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels a requested record only after a shop-scoped empty check", async () => {
    const db = buildSupabase();
    const response = await post(db.supabase);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      idempotent: false,
      status: "cancelled",
    });
    expect(db.requestFilters).toEqual([
      ["id", "11111111-1111-4111-8111-111111111111"],
      ["shop_id", "shop-1"],
    ]);
    expect(db.itemFilters).toEqual([
      ["request_id", "11111111-1111-4111-8111-111111111111"],
      ["shop_id", "shop-1"],
    ]);
    expect(db.update).toHaveBeenCalledWith({ status: "cancelled" });
    expect(db.updateFilters).toEqual([
      ["id", "11111111-1111-4111-8111-111111111111"],
      ["shop_id", "shop-1"],
      ["status", "requested"],
    ]);
    expect(mocks.logOperationalEvent).toHaveBeenCalledOnce();
  });

  it("rejects a request that contains items", async () => {
    const db = buildSupabase({ itemCount: 1 });
    const response = await post(db.supabase);

    expect(response.status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
    expect(mocks.logOperationalEvent).not.toHaveBeenCalled();
  });

  it("rejects requests that already entered quoting or operations", async () => {
    const db = buildSupabase({ status: "quoted" });
    const response = await post(db.supabase);

    expect(response.status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("treats repeated cancellation as idempotent", async () => {
    const db = buildSupabase({ status: "cancelled" });
    const response = await post(db.supabase);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      idempotent: true,
      status: "cancelled",
    });
    expect(db.update).not.toHaveBeenCalled();
  });
});
