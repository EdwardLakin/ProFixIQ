import { beforeEach, describe, expect, it, vi } from "vitest";

const processVehicleHistoryImportJobBatchMock = vi.fn();
const processInvoiceImportJobBatchMock = vi.fn();
const processInspectionFormImportJobBatchMock = vi.fn();
let dispatchJob: { id: string; import_type: string | null; status?: string | null; processed_rows?: number | null; updated_at?: string | null } | null = null;
let recoveredInspectionRows = 0;
const adminClient = { marker: "admin" };

type MockQuery = {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
};

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: vi.fn(() => ({
    ...adminClient,
    from: vi.fn((table: string) => {
      const filters: Record<string, string> = {};
      let updateValues: Record<string, unknown> | null = null;
      const query = {} as MockQuery;
      Object.assign(query, {
        select: vi.fn(() => query),
        update: vi.fn((values: Record<string, unknown>) => {
          updateValues = values;
          return query;
        }),
        in: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        lt: vi.fn(() => query),
        gte: vi.fn(() => query),
        eq: vi.fn((column: string, value: string) => {
          filters[column] = value;
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          const job = dispatchJob ? { status: "queued", processed_rows: 0, updated_at: new Date().toISOString(), ...dispatchJob } : null;
          if (!job) return { data: null, error: null };
          if (filters.id && filters.id !== job.id) return { data: null, error: null };
          if (filters.status && filters.status !== job.status) return { data: null, error: null };
          return { data: job, error: null };
        }),
        then: vi.fn(
          (resolve: (value: { data: null; error: null }) => unknown) => {
            if (table === "import_job_rows" && updateValues?.status === "queued") {
              recoveredInspectionRows += 1;
            }
            if (
              table === "import_jobs" &&
              dispatchJob &&
              filters.id === dispatchJob.id &&
              typeof updateValues?.status === "string"
            ) {
              dispatchJob.status = updateValues.status;
            }
            return Promise.resolve(resolve({ data: null, error: null }));
          },
        ),
      });
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

vi.mock("@/features/inspections/server/inspection-form-import-job", () => ({
  INSPECTION_FORM_IMPORT_BATCH_SIZE: 2,
  processInspectionFormImportJobBatch: processInspectionFormImportJobBatchMock,
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
    recoveredInspectionRows = 0;
    processVehicleHistoryImportJobBatchMock.mockResolvedValue({ ok: true, processed: 1, completed: true, job: { id: "vehicle-job" } });
    processInvoiceImportJobBatchMock.mockResolvedValue({ ok: true, processed: 1, completed: true, job: { id: "invoice-job" } });
    processInspectionFormImportJobBatchMock.mockResolvedValue({ ok: true, processed: 1, completed: true, job: { id: "inspection-job" } });
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

  it("dispatches durable inspection form imports", async () => {
    dispatchJob = { id: "inspection-job", import_type: "inspection_form" };

    const { GET } = await import("../app/api/internal/import-jobs/tick/route");
    const response = await GET(request("/api/internal/import-jobs/tick", { authorization: "Bearer cron-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.importType).toBe("inspection_form");
    expect(processInspectionFormImportJobBatchMock).toHaveBeenCalledWith(
      expect.anything(),
      "inspection-job",
      2,
    );
  });

  it("requeues an interrupted inspection form import instead of failing it", async () => {
    dispatchJob = {
      id: "stale-inspection-job",
      import_type: "inspection_form",
      status: "processing",
      updated_at: "2020-01-01T00:00:00.000Z",
    };

    const { GET } = await import("../app/api/internal/import-jobs/tick/route");
    const response = await GET(
      request("/api/internal/import-jobs/tick", {
        authorization: "Bearer cron-secret",
      }),
    );

    expect(response.status).toBe(200);
    expect(recoveredInspectionRows).toBe(1);
    expect(processInspectionFormImportJobBatchMock).toHaveBeenCalledWith(
      expect.anything(),
      "stale-inspection-job",
      2,
    );
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
