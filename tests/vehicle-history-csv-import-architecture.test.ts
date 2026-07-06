import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = () =>
  readFileSync("app/api/work-orders/history/import/route.ts", "utf8");
const workerSource = () =>
  readFileSync("features/work-orders/server/vehicle-history-import-job.ts", "utf8");
const tickSource = () =>
  readFileSync("app/api/internal/import-jobs/tick/route.ts", "utf8");
const statusSource = () =>
  readFileSync("app/api/import-jobs/[jobId]/route.ts", "utf8");
const cardSource = () =>
  readFileSync(
    "features/work-orders/components/VehicleHistoryCsvImportCard.tsx",
    "utf8",
  );
const migrationSource = () =>
  readFileSync("db/sql/2026-07-05_vehicle_history_import_jobs.sql", "utf8");

describe("vehicle history CSV import job architecture", () => {
  it("upload route accepts multipart CSV, creates a job, stages rows, and returns jobId", () => {
    const source = routeSource();

    expect(source).toContain('contentType.includes("multipart/form-data")');
    expect(source).toContain("await req.formData()");
    expect(source).toContain("parseCsvFileFromFormData<HistoryImportRow>");
    expect(source).toContain('.from("import_jobs")');
    expect(source).toContain('.from("import_job_rows")');
    expect(source).toContain("jobId: job.id");
    expect(source).toContain("{ status: 202 }");
    expect(source).not.toContain('.from("history").insert');
    expect(source).not.toContain("loadResolver");
    expect(source).not.toContain("findDuplicateHistoryId");
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
    expect(worker).toContain('.from("history").insert');
    expect(worker).not.toContain('.from("work_orders")');
    expect(worker).not.toContain('.from("dispatch');
  });

  it("job progress and compact summary are persisted", () => {
    const worker = workerSource();
    const status = statusSource();

    expect(worker).toContain("processed_rows: processedRows");
    expect(worker).toContain("imported_count");
    expect(worker).toContain("skipped_count");
    expect(worker).toContain("failed_count");
    expect(worker).toContain("VEHICLE_HISTORY_IMPORT_SAMPLE_LIMIT");
    expect(worker).toContain("slice(0, VEHICLE_HISTORY_IMPORT_SAMPLE_LIMIT)");
    expect(status).toContain('.from("import_jobs")');
    expect(status).toContain('.eq("shop_id", shopId)');
    expect(status).toContain("processedRows");
  });

  it("uses shop-scoped history duplicate detection without giant customer_id.in filters", () => {
    const worker = workerSource();
    const migration = migrationSource();

    expect(migration).toContain("alter table public.history add column if not exists shop_id");
    expect(migration).toContain("update public.history h");
    expect(worker).toContain("findDuplicateHistoryId");
    expect(worker).toContain('.eq("shop_id" as "id", shopId)');
    expect(worker).not.toContain('.in("customer_id"');
  });

  it("UI creates a job, polls status, and stops polling on terminal states", () => {
    const source = cardSource();

    expect(source).toContain("const formData = new FormData()");
    expect(source).toContain('formData.append("file", file)');
    expect(source).toContain("setActiveJobId(payload.jobId)");
    expect(source).toContain("useImportJobProgress(activeJobId");
    expect(source).toContain("onComplete: handleJobComplete");
    expect(source).toContain('job.status === "failed"');
    expect(source).toContain("setActiveJobId(null)");
    expect(readFileSync("features/shared/components/import/useImportJobProgress.ts", "utf8")).toContain("clearTimeout(timeoutId)");
    expect(source).not.toContain("JSON.stringify({ rows: importableRows })");
  });

  it("continues onboarding only after completed zero-failure imported jobs", () => {
    const source = cardSource();

    expect(source).toContain("/steps/vehicle_history/complete");
    expect(source).toContain('summary: { importType: "vehicle_history_csv", ...nextCounts }');
    expect(source).toContain("counts.imported > 0 && counts.failed === 0");
  });
});
