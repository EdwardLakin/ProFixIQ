import { beforeEach, describe, expect, it, vi } from "vitest";
import { PortalAccessError } from "@/features/portal/server/portalAuth";

const mocks = vi.hoisted(() => ({
  createServerSupabaseRoute: vi.fn(),
  requirePortalCustomerActor: vi.fn(),
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: mocks.createServerSupabaseRoute,
}));

vi.mock("@/features/portal/server/requirePortalActor", () => ({
  requirePortalCustomerActor: mocks.requirePortalCustomerActor,
}));

function notFoundClient() {
  const workOrderQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  workOrderQuery.select.mockReturnValue(workOrderQuery);
  workOrderQuery.eq.mockReturnValue(workOrderQuery);
  workOrderQuery.maybeSingle.mockResolvedValue({ data: null, error: null });

  return {
    workOrderQuery,
    client: {
      from: vi.fn((table: string) => {
        if (table !== "work_orders") {
          throw new Error(`Unexpected table: ${table}`);
        }
        return workOrderQuery;
      }),
    },
  };
}

describe("customer portal quote detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePortalCustomerActor.mockResolvedValue({
      userId: "portal-user-1",
      customer: { id: "customer-1", shop_id: "shop-1" },
      inviteEvidence: {},
    });
  });

  it("returns the same non-disclosing 404 for an unowned or stale quote id", async () => {
    const { client, workOrderQuery } = notFoundClient();
    mocks.createServerSupabaseRoute.mockReturnValue(client);
    const { GET } = await import("../app/api/portal/quotes/[id]/route");

    const response = await GET(new Request("https://profixiq.test"), {
      params: Promise.resolve({
        id: "86ba5754-1694-42c9-9310-4144f9fbb6a4",
      }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "This quote is unavailable.",
    });
    expect(workOrderQuery.eq).toHaveBeenCalledWith(
      "id",
      "86ba5754-1694-42c9-9310-4144f9fbb6a4",
    );
    expect(workOrderQuery.eq).toHaveBeenCalledWith("shop_id", "shop-1");
    expect(workOrderQuery.eq).toHaveBeenCalledWith("customer_id", "customer-1");
  });

  it("returns the non-disclosing 404 without querying an invalid UUID", async () => {
    const { client } = notFoundClient();
    mocks.createServerSupabaseRoute.mockReturnValue(client);
    const { GET } = await import("../app/api/portal/quotes/[id]/route");

    const response = await GET(new Request("https://profixiq.test"), {
      params: Promise.resolve({ id: "truncated-link" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "This quote is unavailable.",
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns 401 before any quote lookup when the session is missing", async () => {
    const { client } = notFoundClient();
    mocks.createServerSupabaseRoute.mockReturnValue(client);
    mocks.requirePortalCustomerActor.mockRejectedValue(
      new PortalAccessError("Not authenticated", 401),
    );
    const { GET } = await import("../app/api/portal/quotes/[id]/route");

    const response = await GET(new Request("https://profixiq.test"), {
      params: Promise.resolve({ id: "work-order-1" }),
    });

    expect(response.status).toBe(401);
    expect(client.from).not.toHaveBeenCalled();
  });
});
