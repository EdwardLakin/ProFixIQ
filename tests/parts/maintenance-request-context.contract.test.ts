import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mapper = readFileSync(
  "features/parts/components/request-workbench/mapToWorkbenchModel.ts",
  "utf8",
);
const maintenanceWriter = readFileSync(
  "features/maintenance/server/addMaintenanceSuggestionToWorkOrder.ts",
  "utf8",
);

describe("maintenance parts request context", () => {
  it("surfaces the service description when the quote has not materialized a work-order line yet", () => {
    expect(mapper).toContain("deriveJobContext");
    expect(mapper).toContain("firstItemDescription");
    expect(mapper).toContain("parts\\s+to\\s+quote");
    expect(maintenanceWriter).toContain("description: input.description");
    expect(maintenanceWriter).toContain("Service to quote: ${input.description}");
  });
});
