import { describe, expect, it } from "vitest";
import { fleetCsvCell } from "@/features/fleet/lib/fleetCsv";
import {
  formatFleetDate,
  serviceDateInTimeZone,
} from "@/features/fleet/lib/fleetDate";

describe("Fleet date behavior", () => {
  it("renders date-only database values without shifting the calendar day", () => {
    expect(
      formatFleetDate("2026-08-06", {
        locale: "en-US",
        options: { year: "numeric", month: "long", day: "numeric" },
      }),
    ).toBe("August 6, 2026");
    expect(formatFleetDate("2026-02-30", { fallback: "Invalid" })).toBe(
      "Invalid",
    );
  });

  it("derives the service date at the shop's local midnight boundary", () => {
    expect(
      serviceDateInTimeZone(
        "America/Edmonton",
        new Date("2026-08-06T05:30:00.000Z"),
      ),
    ).toBe("2026-08-05");
    expect(
      serviceDateInTimeZone(
        "America/Edmonton",
        new Date("2026-08-06T07:30:00.000Z"),
      ),
    ).toBe("2026-08-06");
  });

  it("uses the Fleet fallback timezone when a shop timezone is invalid", () => {
    const instant = new Date("2026-08-06T06:30:00.000Z");
    expect(serviceDateInTimeZone("Not/A_Timezone", instant)).toBe(
      serviceDateInTimeZone("America/Los_Angeles", instant),
    );
  });
});

describe("Fleet CSV behavior", () => {
  it("quotes values and escapes embedded quotes", () => {
    expect(fleetCsvCell('Unit "12"')).toBe('"Unit ""12"""');
    expect(fleetCsvCell(42)).toBe('"42"');
  });

  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@cmd"])(
    "neutralizes formula-like text: %s",
    (value) => {
      expect(fleetCsvCell(value)).toBe(`"'${value}"`);
    },
  );

  it("does not alter numeric values", () => {
    expect(fleetCsvCell(-12.5)).toBe('"-12.5"');
  });
});
