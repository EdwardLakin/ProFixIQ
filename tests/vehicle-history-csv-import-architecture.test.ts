import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = () =>
  readFileSync("app/api/work-orders/history/import/route.ts", "utf8");
const cardSource = () =>
  readFileSync(
    "features/work-orders/components/VehicleHistoryCsvImportCard.tsx",
    "utf8",
  );
const helperSource = () =>
  readFileSync("features/shared/lib/import/csv.ts", "utf8");

describe("vehicle history CSV import multipart architecture", () => {
  it("sends FormData with the CSV file instead of huge JSON rows", () => {
    const source = cardSource();

    expect(source).toContain("const formData = new FormData()");
    expect(source).toContain('formData.append("file", file)');
    expect(source).toContain('formData.append("guidedSessionId"');
    expect(source).toContain('formData.append("guidedStep"');
    expect(source).toContain('formData.append("returnTo"');
    expect(source).toContain('body: formData');
    expect(source).not.toContain("JSON.stringify({ rows: importableRows })");
  });

  it("keeps progress wording accurate and disables duplicate import clicks", () => {
    const source = cardSource();

    for (const phase of [
      "Uploading CSV",
      "Processing on server",
      "Importing records",
      "Finalizing",
    ]) {
      expect(source).toContain(`phase: "${phase}"`);
    }
    expect(source).toContain("if (importing || completingOnboarding) return");
    const footer = readFileSync("features/shared/components/import/GuidedImportFooterActions.tsx", "utf8");
    expect(footer).toContain("disabled={importing || completing || !canConfirm}");
  });

  it("accepts multipart form-data and parses the CSV server-side", () => {
    const source = routeSource();

    expect(source).toContain('contentType.includes("multipart/form-data")');
    expect(source).toContain("await req.formData()");
    expect(source).toContain("parseCsvFileFromFormData<HistoryImportRow>");
    expect(source).not.toContain("await req.json()");
  });

  it("rejects missing or non-CSV uploads with clear errors", () => {
    const helper = helperSource();
    const route = routeSource();

    expect(helper).toContain("Missing CSV file");
    expect(helper).toContain("Unsupported file type");
    expect(helper).toContain("Malformed CSV");
    expect(helper).toContain("CSV file is too large");
    expect(route).toContain("{ status: 400 }");
    expect(route).toContain("{ status: 415 }");
  });

  it("imports valid history rows in batches without creating work orders or dispatch records", () => {
    const source = routeSource();

    expect(source).toContain("HISTORY_IMPORT_BATCH_SIZE = 250");
    expect(source).toContain("chunkArray(payloads, HISTORY_IMPORT_BATCH_SIZE)");
    expect(source).toContain('.from("history")');
    expect(source).not.toContain('.from("work_orders")');
    expect(source).not.toContain('.from("dispatch');
    expect(source).not.toContain('.from("work_order_queue');
  });

  it("returns only compact import summary samples", () => {
    const source = routeSource();
    const helper = helperSource();

    expect(source).toContain("compactImportSummary");
    expect(source).toContain("HISTORY_IMPORT_SAMPLE_LIMIT = 25");
    expect(helper).toContain("skippedRows.slice(0, sampleLimit)");
    expect(helper).toContain("failedRows.slice(0, sampleLimit)");
    expect(helper).toContain("truncated");
    expect(source).toContain("totalRows: rows.length");
  });

  it("completes guided vehicle_history only after successful zero-failure imports", () => {
    const source = cardSource();

    expect(source).toContain("/steps/vehicle_history/complete");
    expect(source).toContain('summary: { importType: "vehicle_history_csv", ...nextCounts }');
    expect(source).toContain("payload.counts.imported > 0");
    expect(source).toContain("payload.counts.failed === 0");
    const footer = readFileSync("features/shared/components/import/GuidedImportFooterActions.tsx", "utf8");
    expect(footer).toContain("Continue onboarding");
  });
});
