import { beforeEach, describe, expect, it, vi } from "vitest";

const expireAbandonedReceiptAttachmentsMock = vi.fn();
const createAdminSupabaseMock = vi.fn(() => ({ mocked: true }));

vi.mock("@/features/invoices/server/expireAbandonedReceiptAttachments", () => ({
  expireAbandonedReceiptAttachments: expireAbandonedReceiptAttachmentsMock,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
}));

function buildResult(overrides?: Partial<any>) {
  return {
    dryRun: true,
    now: "2026-09-29T00:00:00.000Z",
    candidates: 2,
    candidateIds: ["a", "b"],
    deleted: 0,
    warnings: [],
    ...overrides,
  };
}

describe("/api/internal/payments/expire-stale-receipts route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    process.env.INTERNAL_CRON_SECRET = "test-secret";
    expireAbandonedReceiptAttachmentsMock.mockResolvedValue(buildResult());
  });

  it("rejects unauthorized GET requests", async () => {
    const { GET } = await import(
      "../app/api/internal/payments/expire-stale-receipts/route"
    );
    const response = await GET(
      new Request("http://localhost/api/internal/payments/expire-stale-receipts", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(401);
    expect(expireAbandonedReceiptAttachmentsMock).not.toHaveBeenCalled();
  });

  it("allows scheduled GET using Vercel CRON_SECRET and executes with bounded limit and dryRun=false", async () => {
    delete process.env.INTERNAL_CRON_SECRET;
    process.env.CRON_SECRET = "vercel-cron-secret";
    expireAbandonedReceiptAttachmentsMock.mockResolvedValue(
      buildResult({ dryRun: false, deleted: 2 }),
    );

    const { GET } = await import(
      "../app/api/internal/payments/expire-stale-receipts/route"
    );
    const response = await GET(
      new Request("http://localhost/api/internal/payments/expire-stale-receipts", {
        method: "GET",
        headers: {
          authorization: "Bearer vercel-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(expireAbandonedReceiptAttachmentsMock).toHaveBeenCalledTimes(1);
    expect(expireAbandonedReceiptAttachmentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: false,
        limit: 100,
        shopId: undefined,
      }),
    );

    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ ok: true }));
    expect(body.summary).toEqual(
      expect.objectContaining({ dryRun: false, candidates: 2, deleted: 2 }),
    );
  });

  it("logs the underlying cleanup error while keeping the response generic", async () => {
    const underlyingError = new Error(
      "Failed to load abandoned receipt attachments: database unavailable",
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expireAbandonedReceiptAttachmentsMock.mockRejectedValue(underlyingError);

    try {
      const { GET } = await import(
        "../app/api/internal/payments/expire-stale-receipts/route"
      );
      const response = await GET(
        new Request("http://localhost/api/internal/payments/expire-stale-receipts", {
          method: "GET",
          headers: {
            "x-internal-cron-secret": "test-secret",
          },
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "Failed to clean up abandoned receipt attachments",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "[internal/payments/expire-stale-receipts] cleanup failed",
        underlyingError,
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps POST dryRun default true and bounds limit", async () => {
    const { POST } = await import(
      "../app/api/internal/payments/expire-stale-receipts/route"
    );
    const response = await POST(
      new Request("http://localhost/api/internal/payments/expire-stale-receipts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-cron-secret": "test-secret",
        },
        body: JSON.stringify({ limit: 1000 }),
      }),
    );

    expect(response.status).toBe(200);
    expect(expireAbandonedReceiptAttachmentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        limit: 100,
      }),
    );

    const body = await response.json();
    expect(body.summary).toEqual(expect.objectContaining({ dryRun: true }));
  });
});
