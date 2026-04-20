import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const WORK_ORDER_ID = "11111111-1111-4111-8111-111111111111";
const LINE_ID_1 = "22222222-2222-4222-8222-222222222222";
const LINE_ID_2 = "33333333-3333-4333-8333-333333333333";

type AccessResult =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      profile: { id: string; role: string; shop_id: string };
      canonicalRole: "advisor";
      supabase: ReturnType<typeof createSupabaseMock>;
    };

const state = {
  accessResult: null as AccessResult | null,
  workOrderFound: true,
  scopedLineCount: 2,
};

function createSupabaseMock() {
  const rpc = vi.fn(async () => ({ error: null }));

  const from = vi.fn((table: string) => {
    if (table === "work_orders") {
      const query: any = {};
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => query);
      query.maybeSingle = vi.fn(async () => ({
        data: state.workOrderFound ? { id: WORK_ORDER_ID } : null,
        error: null,
      }));
      return query;
    }

    if (table === "work_order_lines") {
      const query: any = {};
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => query);
      query.in = vi.fn(async () => ({
        data: Array.from({ length: state.scopedLineCount }, (_, i) => ({
          id: i === 0 ? LINE_ID_1 : LINE_ID_2,
        })),
        error: null,
      }));
      return query;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { from, rpc };
}

const requireShopScopedApiAccessMock = vi.fn(async () => state.accessResult);
const logOperationalEventMock = vi.fn(async () => undefined);

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: requireShopScopedApiAccessMock,
}));

vi.mock("@/features/work-orders/server/logOperationalEvent", () => ({
  logOperationalEvent: logOperationalEventMock,
}));

describe("POST /api/quotes/send-for-approval", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    state.workOrderFound = true;
    state.scopedLineCount = 2;
    state.accessResult = {
      ok: true,
      profile: { id: "actor-id", role: "advisor", shop_id: "shop-a" },
      canonicalRole: "advisor",
      supabase: createSupabaseMock(),
    };
  });

  it("rejects anonymous callers and never invokes RPC", async () => {
    state.accessResult = {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };

    const { POST } = await import("../app/api/quotes/send-for-approval/route");
    const response = await POST(
      new Request("http://localhost/api/quotes/send-for-approval", {
        method: "POST",
        body: JSON.stringify({ workOrderId: WORK_ORDER_ID, lineIds: [LINE_ID_1] }),
      }),
    );

    expect(response.status).toBe(401);
    const supabase = (state.accessResult as any).supabase;
    expect(supabase?.rpc).toBeUndefined();
  });

  it("rejects wrong-role callers and never invokes RPC", async () => {
    state.accessResult = {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };

    const { POST } = await import("../app/api/quotes/send-for-approval/route");
    const response = await POST(
      new Request("http://localhost/api/quotes/send-for-approval", {
        method: "POST",
        body: JSON.stringify({ workOrderId: WORK_ORDER_ID, lineIds: [LINE_ID_1] }),
      }),
    );

    expect(response.status).toBe(403);
    const supabase = (state.accessResult as any).supabase;
    expect(supabase?.rpc).toBeUndefined();
  });

  it("rejects cross-shop work order access and never invokes RPC", async () => {
    state.workOrderFound = false;

    const { POST } = await import("../app/api/quotes/send-for-approval/route");
    const response = await POST(
      new Request("http://localhost/api/quotes/send-for-approval", {
        method: "POST",
        body: JSON.stringify({ workOrderId: WORK_ORDER_ID, lineIds: [LINE_ID_1] }),
      }),
    );

    expect(response.status).toBe(403);

    const supabase = (state.accessResult as Extract<AccessResult, { ok: true }>).supabase;
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("allows authorized callers in the same shop and invokes RPC", async () => {
    const { POST } = await import("../app/api/quotes/send-for-approval/route");
    const response = await POST(
      new Request("http://localhost/api/quotes/send-for-approval", {
        method: "POST",
        body: JSON.stringify({
          workOrderId: WORK_ORDER_ID,
          lineIds: [LINE_ID_1, LINE_ID_2],
        }),
      }),
    );

    expect(response.status).toBe(200);

    const supabase = (state.accessResult as Extract<AccessResult, { ok: true }>).supabase;
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("send_for_approval", {
      _wo: WORK_ORDER_ID,
      _line_ids: [LINE_ID_1, LINE_ID_2],
      _set_wo_status: true,
    });
    expect(logOperationalEventMock).toHaveBeenCalledTimes(1);
  });
});
