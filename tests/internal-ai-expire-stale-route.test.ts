import { beforeEach, describe, expect, it, vi } from "vitest";

const expireStaleAiRecordsMock = vi.fn();
const createAdminSupabaseMock = vi.fn(() => ({ mocked: true }));

vi.mock("@/features/ai/server", () => ({
  expireStaleAiRecords: expireStaleAiRecordsMock,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
}));

function buildResult(overrides?: Partial<any>) {
  return {
    dryRun: true,
    now: "2026-04-24T00:00:00.000Z",
    recommendations: { candidates: 2, expired: 1 },
    previews: { candidates: 3, expired: 1 },
    approvals: { candidates: 1, expired: 0 },
    warnings: [],
    ...overrides,
  };
}

describe("/api/internal/ai/expire-stale route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.INTERNAL_CRON_SECRET = "test-secret";
    expireStaleAiRecordsMock.mockResolvedValue(buildResult());
  });

  it("rejects unauthorized GET requests", async () => {
    const { GET } = await import("../app/api/internal/ai/expire-stale/route");
    const response = await GET(new Request("http://localhost/api/internal/ai/expire-stale", { method: "GET" }));

    expect(response.status).toBe(401);
    expect(expireStaleAiRecordsMock).not.toHaveBeenCalled();
  });

  it("allows scheduled GET using bearer token and executes with bounded limit", async () => {
    expireStaleAiRecordsMock.mockResolvedValue(buildResult({ dryRun: false }));

    const { GET } = await import("../app/api/internal/ai/expire-stale/route");
    const response = await GET(new Request("http://localhost/api/internal/ai/expire-stale", {
      method: "GET",
      headers: {
        authorization: "Bearer test-secret",
      },
    }));

    expect(response.status).toBe(200);
    expect(expireStaleAiRecordsMock).toHaveBeenCalledTimes(1);
    expect(expireStaleAiRecordsMock).toHaveBeenCalledWith(expect.objectContaining({
      dryRun: false,
      limit: 100,
      shopId: undefined,
    }));

    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ ok: true }));
    expect(body.summary).toEqual(expect.objectContaining({
      dryRun: false,
      recommendations: expect.objectContaining({ candidates: 2, expired: 1 }),
      previews: expect.objectContaining({ candidates: 3, expired: 1 }),
      approvals: expect.objectContaining({ candidates: 1, expired: 0 }),
    }));
  });

  it("keeps POST dryRun default true and bounds limit", async () => {
    const { POST } = await import("../app/api/internal/ai/expire-stale/route");
    const response = await POST(new Request("http://localhost/api/internal/ai/expire-stale", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-cron-secret": "test-secret",
      },
      body: JSON.stringify({ limit: 1000 }),
    }));

    expect(response.status).toBe(200);
    expect(expireStaleAiRecordsMock).toHaveBeenCalledWith(expect.objectContaining({
      dryRun: true,
      limit: 100,
    }));

    const body = await response.json();
    expect(body.summary).toEqual(expect.objectContaining({
      dryRun: true,
    }));
  });
});
