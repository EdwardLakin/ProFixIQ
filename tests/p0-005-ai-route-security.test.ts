import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR_ID = "55000000-0000-4000-8000-000000000001";
const SHOP_ID = "a5100000-0000-4000-8000-000000000001";
const JOB_ID = "a5300000-0000-4000-8000-000000000001";
const WORK_ORDER_ID = "a5400000-0000-4000-8000-000000000001";
const VEHICLE_ID = "a5500000-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  createAdmin: vi.fn(),
  claimQuota: vi.fn(),
  completeQuota: vi.fn(),
  openAICreate: vi.fn(),
  from: vi.fn(),
  threadUpsert: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdmin,
}));

vi.mock("@/features/shared/lib/server/durable-ai-guard", () => ({
  claimDurableAIRouteQuota: mocks.claimQuota,
  completeDurableAIRouteQuota: mocks.completeQuota,
}));

vi.mock("@/features/shared/lib/server/openai", () => ({
  getOpenAIClient: () => ({
    chat: { completions: { create: mocks.openAICreate } },
  }),
}));

function query(result: unknown, error: unknown = null) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: result, error })),
    upsert: mocks.threadUpsert,
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

function postRequest(path: string, body: unknown, headers?: HeadersInit): Request {
  return new Request(`https://profixiq.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function completion(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

describe("P0-005 AI route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    mocks.requireAccess.mockResolvedValue({
      ok: true,
      profile: { id: ACTOR_ID, shop_id: SHOP_ID, role: "mechanic" },
      canonicalRole: "mechanic",
      supabase: {},
    });
    mocks.claimQuota.mockResolvedValue({ allowed: true, receiptId: "quota-receipt" });
    mocks.completeQuota.mockResolvedValue(undefined);
    mocks.threadUpsert.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "work_order_lines") {
        return query({
          id: JOB_ID,
          work_order_id: WORK_ORDER_ID,
          job_type: "diagnosis",
          complaint: "Check engine light",
          description: "Diagnose P0420",
          cause: null,
          correction: null,
          labor_time: null,
          notes: null,
        });
      }
      if (table === "work_orders") {
        return query({
          id: WORK_ORDER_ID,
          custom_id: "WO-005",
          shop_id: SHOP_ID,
          vehicle_id: VEHICLE_ID,
          notes: null,
        });
      }
      if (table === "vehicles") {
        return query({
          year: 2020,
          make: "Honda",
          model: "Accord",
          engine: "2.0L",
          fuel_type: "gas",
          drivetrain: "FWD",
          transmission: "automatic",
          vin: "1HGCM82633A004352",
          unit_number: null,
          license_plate: null,
        });
      }
      if (table === "work_order_line_dtc_threads") return query(null);
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createAdmin.mockReturnValue({ from: mocks.from });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("denies anonymous DTC access before privileged or provider work", async () => {
    mocks.requireAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Not authenticated" }, { status: 401 }),
    });
    const { POST } = await import("../app/api/dtc-suggest/route");

    const response = await POST(postRequest("/api/dtc-suggest", { jobId: JOB_ID }));

    expect(response.status).toBe(401);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.claimQuota).not.toHaveBeenCalled();
    expect(mocks.openAICreate).not.toHaveBeenCalled();
  });

  it("denies a role without inspection capability before provider work", async () => {
    mocks.requireAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    });
    const { POST } = await import("../app/api/ai/interpret/route");

    const response = await POST(
      postRequest("/api/ai/interpret", { transcript: "brakes pass" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.requireAccess).toHaveBeenCalledWith({
      requiredCapability: "canRunInspections",
    });
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.claimQuota).not.toHaveBeenCalled();
    expect(mocks.openAICreate).not.toHaveBeenCalled();
  });

  it("denies anonymous access to the canonical technician DTC route", async () => {
    mocks.requireAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Not authenticated" }, { status: 401 }),
    });
    const { POST } = await import("../app/api/work-orders/dtc-suggest/route");

    const response = await POST(
      postRequest("/api/work-orders/dtc-suggest", {
        jobId: JOB_ID,
        userMessage: "P0420 stored",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.claimQuota).not.toHaveBeenCalled();
    expect(mocks.openAICreate).not.toHaveBeenCalled();
  });

  it("returns not found without calling AI for a cross-shop DTC job", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "work_order_lines") {
        return query({ id: JOB_ID, work_order_id: WORK_ORDER_ID });
      }
      if (table === "work_orders") return query(null);
      throw new Error(`Unexpected table ${table}`);
    });
    const { POST } = await import("../app/api/dtc-suggest/route");

    const response = await POST(postRequest("/api/dtc-suggest", { jobId: JOB_ID }));

    expect(response.status).toBe(404);
    expect(mocks.claimQuota).not.toHaveBeenCalled();
    expect(mocks.openAICreate).not.toHaveBeenCalled();
  });

  it("rejects oversized inspection input before quota or provider use", async () => {
    const { POST } = await import("../app/api/ai/interpret/route");

    const response = await POST(
      postRequest("/api/ai/interpret", { transcript: "x".repeat(4001) }),
    );

    expect(response.status).toBe(400);
    expect(mocks.claimQuota).not.toHaveBeenCalled();
    expect(mocks.openAICreate).not.toHaveBeenCalled();
  });

  it("enforces a distributed rate denial before provider use", async () => {
    mocks.claimQuota.mockResolvedValue({
      allowed: false,
      reason: "rate_limited",
      retryAfterSeconds: 42,
    });
    const { POST } = await import("../app/api/ai/interpret/route");

    const response = await POST(
      postRequest("/api/ai/interpret", { transcript: "left front tread 8 mm" }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(mocks.openAICreate).not.toHaveBeenCalled();
  });

  it("returns a bounded failure and releases quota on provider timeout", async () => {
    mocks.openAICreate.mockRejectedValue(new Error("Inspection interpretation timed out"));
    const { POST } = await import("../app/api/ai/interpret/route");

    const response = await POST(
      postRequest("/api/ai/interpret", { transcript: "left front tread 8 mm" }),
    );

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual([]);
    expect(mocks.completeQuota).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: false, actualCostUsd: 0 }),
    );
  });

  it("preserves same-shop DTC suggestion output and records usage", async () => {
    mocks.openAICreate.mockResolvedValue(
      completion(JSON.stringify({ cause: "Catalyst efficiency low", correction: "Continue testing", laborTime: 1 })),
    );
    const { POST } = await import("../app/api/dtc-suggest/route");

    const response = await POST(postRequest("/api/dtc-suggest", { jobId: JOB_ID }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      suggestion: {
        cause: "Catalyst efficiency low",
        correction: "Continue testing",
        laborTime: 1,
      },
    });
    expect(mocks.completeQuota).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: true, receiptId: "quota-receipt" }),
    );
  });

  it("secures the canonical technician DTC conversation flow", async () => {
    mocks.openAICreate.mockResolvedValue(
      completion(
        JSON.stringify({
          reply: "Test the downstream oxygen sensor next.",
          summary: { dtc: "P0420", commonRepairs: [], recommendedTests: ["Check O2 response"] },
        }),
      ),
    );
    const { POST } = await import("../app/api/work-orders/dtc-suggest/route");

    const response = await POST(
      postRequest("/api/work-orders/dtc-suggest", {
        jobId: JOB_ID,
        code: "P0420",
        userMessage: "Rear O2 stays near 0.72V",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.claimQuota).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: ACTOR_ID, shopId: SHOP_ID }),
    );
    expect(mocks.threadUpsert).toHaveBeenCalled();
  });
});
