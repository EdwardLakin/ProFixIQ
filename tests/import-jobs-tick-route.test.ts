import { beforeEach, describe, expect, it, vi } from "vitest";

const processVehicleHistoryImportJobBatchMock = vi.fn();
const processInvoiceImportJobBatchMock = vi.fn();
let dispatchJob: { id: string; import_type: string | null } | null = null;
const adminClient = { marker: "admin" };

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: vi.fn(() => ({
    ...adminClient,
    from: vi.fn((table: string) => {
      expect(table).toBe("import_jobs");
      const query: any = {
        select: vi.fn(() => query),
        in: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: dispatchJob, error: null })),
      };
      return query;
    }),
  })),
}));

vi.mock("@/features/work-orders/server/vehicle-history-import-job", () => ({
  VEHICLE_HISTORY_IMPORT_BATCH_SIZE: 1000,
  processVehicleHistoryImportJobBatch: processVehicleHistoryImportJobBatchMock,
}));

vi.mock("@/features/billing/server/invoice-import-job", () => ({
  INVOICE_IMPORT_BATCH_SIZE: 1000,
  processInvoiceImportJobBatch: processInvoiceImportJobBatchMock,
}));

function request(path = "/api/internal/import-jobs/tick", headers: HeadersInit = {}) {
  return new Request(`http://localhost${path}`, { method: "GET", headers });
}

describe("/api/internal/import-jobs/tick route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.INTERNAL_IMPORT_JOBS_SECRET = "manual-secret";
    process.env.CRON_SECRET = "cron-secret";
    dispatchJob = null;
    processVehicleHistoryImportJobBatchMock.mockResolvedValue({ ok: true, processed: 1, completed: true, job: { id: "vehicle-job" } });
    processInvoiceImportJobBatchMock.mockResolvedValue({ ok: true, processed: 1, completed: true, job: { id: "invoice-job" } });
  });

  it("accepts Vercel cron bearer authorization", async () => {
    dispatchJob = { id: "invoice-job", import_type: "invoices" };

    const { GET } = await import("../app/api/internal/import-jobs/tick/route");
    const response = await GET(request("/api/internal/import-jobs/tick", { authorization: "Bearer cron-secret" }));

    expect(response.status).toBe(200);
    expect(processInvoiceImportJobBatchMock).toHaveBeenCalledWith(expect.anything(), "invoice-job", 1000);
  });

  it("accepts manual internal import jobs secret authorization", async () => {
    dispatchJob = { id: "vehicle-job", import_type: "vehicle_history" };

    const { GET } = await import("../app/api/internal/import-jobs/tick/route");
    const response = await GET(request("/api/internal/import-jobs/tick", { "x-internal-import-jobs-secret": "manual-secret" }));

    expect(response.status).toBe(200);
    expect(processVehicleHistoryImportJobBatchMock).toHaveBeenCalledWith(expect.anything(), "vehicle-job", 1000);
  });

  it("plain tick dispatches invoices when invoices are oldest and available", async () => {
    dispatchJob = { id: "oldest-invoice-job", import_type: "invoices" };

    const { GET } = await import("../app/api/internal/import-jobs/tick/route");
    const response = await GET(request("/api/internal/import-jobs/tick", { authorization: "Bearer cron-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.importType).toBe("invoices");
    expect(processInvoiceImportJobBatchMock).toHaveBeenCalledWith(expect.anything(), "oldest-invoice-job", 1000);
    expect(processVehicleHistoryImportJobBatchMock).not.toHaveBeenCalled();
  });

  it("targeted importType=invoices still works", async () => {
    const { GET } = await import("../app/api/internal/import-jobs/tick/route");
    const response = await GET(request("/api/internal/import-jobs/tick?importType=invoices", { authorization: "Bearer cron-secret" }));

    expect(response.status).toBe(200);
    expect(processInvoiceImportJobBatchMock).toHaveBeenCalledWith(expect.anything(), undefined, 1000);
    expect(processVehicleHistoryImportJobBatchMock).not.toHaveBeenCalled();
  });

  it("vehicle_history still works", async () => {
    dispatchJob = { id: "vehicle-job", import_type: "vehicle_history" };

    const { GET } = await import("../app/api/internal/import-jobs/tick/route");
    const response = await GET(request("/api/internal/import-jobs/tick", { authorization: "Bearer cron-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.importType).toBe("vehicle_history");
    expect(processVehicleHistoryImportJobBatchMock).toHaveBeenCalledWith(expect.anything(), "vehicle-job", 1000);
  });

  it("rejects unsupported targeted import types safely", async () => {
    const { GET } = await import("../app/api/internal/import-jobs/tick/route");
    const response = await GET(request("/api/internal/import-jobs/tick?importType=parts", { authorization: "Bearer cron-secret" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Unsupported import_type");
    expect(processInvoiceImportJobBatchMock).not.toHaveBeenCalled();
    expect(processVehicleHistoryImportJobBatchMock).not.toHaveBeenCalled();
  });
});
