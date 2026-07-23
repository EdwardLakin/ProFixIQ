import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = () =>
  readFileSync("app/api/work-orders/history/import/route.ts", "utf8");
const workerSource = () =>
  readFileSync("features/work-orders/server/vehicle-history-import-job.ts", "utf8");
const tickSource = () =>
  readFileSync("app/api/internal/import-jobs/tick/route.ts", "utf8");
const cardSource = () =>
  readFileSync(
    "features/work-orders/components/VehicleHistoryCsvImportCard.tsx",
    "utf8",
  );
const migrationSource = () =>
  readFileSync("db/sql/2026-07-05_vehicle_history_import_jobs.sql", "utf8");

describe("vehicle history CSV import synchronous architecture", () => {
  it("upload route accepts multipart CSV, processes rows synchronously, and returns final counts", () => {
    const source = routeSource();

    expect(source).toContain('contentType.includes("multipart/form-data")');
    expect(source).toContain("await req.formData()");
    expect(source).toContain("parseCsvFileFromFormData<HistoryImportRow>");
    expect(source).toContain("importVehicleHistoryRowsSynchronously");
    expect(source).toContain("return NextResponse.json(result)");
    expect(source).not.toContain('.from("import_jobs")');
    expect(source).not.toContain('.from("import_job_rows")');
    expect(source).not.toContain("jobId");
    expect(source).not.toContain("{ status: 202 }");
    expect(source).not.toContain("await req.json()");
  });

  it("worker endpoint is protected and processes only a bounded batch", () => {
    const tick = tickSource();
    const worker = workerSource();

    expect(tick).toContain("INTERNAL_IMPORT_JOBS_SECRET");
    expect(tick).toContain("x-internal-import-jobs-secret");
    expect(tick).toContain("processVehicleHistoryImportJobBatch");
    expect(worker).toContain("VEHICLE_HISTORY_IMPORT_BATCH_SIZE = 1000");
    expect(worker).toContain(".limit(batchSize)");
    expect(worker).toContain('.from("import_job_rows")');
    expect(worker).toContain('.from("history")');
    expect(worker).toContain(".insert(batch.map((entry) => entry.payload))");
    expect(worker).not.toContain('.from("work_orders")');
    expect(worker).not.toContain('.from("dispatch');
  });

  it("synchronous importer returns compact final counts and samples", () => {
    const worker = workerSource();

    expect(worker).toContain("importVehicleHistoryRowsSynchronously");
    expect(worker).toContain("compactImportSummary");
    expect(worker).toContain("VEHICLE_HISTORY_IMPORT_SAMPLE_LIMIT");
    expect(worker).toContain("sampleLimit: VEHICLE_HISTORY_IMPORT_SAMPLE_LIMIT");
    expect(worker).toContain("totalRows: normalizedRows.length");
  });

  it("uses shop-scoped history duplicate detection without giant customer_id.in filters", () => {
    const worker = workerSource();
    const migration = migrationSource();

    expect(migration).toContain("alter table public.history add column if not exists shop_id");
    expect(migration).toContain("update public.history h");
    expect(worker).toContain("preloadDuplicateHistoryKeys");
    expect(worker).toContain('.eq("shop_id", shopId)');
    expect(worker).toContain('new Set<DuplicateKey>()');
    expect(worker).not.toContain("findDuplicateHistoryId");
    expect(worker).not.toContain('.in("customer_id"');
  });

  it("UI posts one import request and uses local progress without polling", () => {
    const source = cardSource();

    expect(source).toContain("const formData = new FormData()");
    expect(source).toContain('formData.append("file", file)');
    expect(source).toContain("payload.counts");
    expect(source).toContain('"Import complete"');
    expect(source).not.toContain("setActiveJobId");
    expect(source).not.toContain("useImportJobProgress");
    expect(source).not.toContain("handleJobComplete");
    expect(source).not.toContain("JSON.stringify({ rows: importableRows })");
  });

  it("continues onboarding only after completed zero-failure imported jobs", () => {
    const source = cardSource();

    expect(source).toContain("/steps/vehicle_history/complete");
    expect(source).toContain('summary: { importType: "vehicle_history_csv", ...nextCounts }');
    expect(source).toContain("payload.counts.imported > 0");
    expect(source).toContain("payload.counts.failed === 0");
  });
});
