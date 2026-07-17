import { describe, expect, it } from "vitest";
import {
  DEMO_UPLOAD_MAX_FILE_BYTES,
  DEMO_UPLOAD_MAX_TOTAL_BYTES,
  validateDemoUploadFileDescriptors,
} from "@/features/integrations/shopBoost/demoUploadContract";

describe("instant analysis staged upload contract", () => {
  it("accepts the five guided-onboarding datasets", () => {
    const files = ["customers", "vehicles", "history", "invoices", "parts"].map(
      (dataset) => ({
        dataset,
        fileName: `${dataset}.csv`,
        sizeBytes: 1024,
        contentType: "text/csv",
      }),
    );

    const result = validateDemoUploadFileDescriptors(files);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files.map((file) => file.dataset)).toEqual([
        "customers",
        "vehicles",
        "history",
        "invoices",
        "parts",
      ]);
    }
  });

  it("rejects unsupported, duplicate, oversized, and combined oversized uploads", () => {
    expect(
      validateDemoUploadFileDescriptors([
        {
          dataset: "staff",
          fileName: "staff.csv",
          sizeBytes: 100,
          contentType: "text/csv",
        },
      ]).ok,
    ).toBe(false);

    expect(
      validateDemoUploadFileDescriptors([
        {
          dataset: "customers",
          fileName: "one.csv",
          sizeBytes: 100,
          contentType: "text/csv",
        },
        {
          dataset: "customers",
          fileName: "two.csv",
          sizeBytes: 100,
          contentType: "text/csv",
        },
      ]).ok,
    ).toBe(false);

    expect(
      validateDemoUploadFileDescriptors([
        {
          dataset: "customers",
          fileName: "large.csv",
          sizeBytes: DEMO_UPLOAD_MAX_FILE_BYTES + 1,
          contentType: "text/csv",
        },
      ]).ok,
    ).toBe(false);

    const combined = ["customers", "vehicles", "history", "invoices"].map(
      (dataset) => ({
        dataset,
        fileName: `${dataset}.csv`,
        sizeBytes: Math.floor(DEMO_UPLOAD_MAX_TOTAL_BYTES / 4) + 1,
        contentType: "text/csv",
      }),
    );
    expect(validateDemoUploadFileDescriptors(combined).ok).toBe(false);
  });
});
