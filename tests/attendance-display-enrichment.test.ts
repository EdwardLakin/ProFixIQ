import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  formatShiftRange,
  getEmployeeDisplayName,
} from "@/features/dashboard/app/dashboard/workforce/AttendanceOverviewClient";

const UUID = "cc4edd23-11e3-4a3c-8cd1-8851f1e13b2c";

describe("Attendance display enrichment", () => {
  it("uses profile full name instead of raw UUIDs", () => {
    expect(getEmployeeDisplayName({ employeeName: "Edward Lakin", employeeEmail: null, employee: null })).toBe("Edward Lakin");
  });

  it("falls back to email when full name is blank", () => {
    expect(getEmployeeDisplayName({ employeeName: "   ", employeeEmail: "edward@example.com", employee: null })).toBe("edward@example.com");
  });

  it("uses Unknown employee when no profile identity is resolvable", () => {
    expect(getEmployeeDisplayName({ employeeName: null, employeeEmail: null, employee: null })).toBe("Unknown employee");
  });

  it("does not fall back to a user UUID as the operator-facing employee name", () => {
    const label = getEmployeeDisplayName({ employeeName: null, employeeEmail: null, employee: { id: UUID, name: "", email: null } });
    expect(label).toBe("Unknown employee");
    expect(label).not.toContain(UUID);
  });

  it("displays active shifts with a null end time as in progress", () => {
    const label = formatShiftRange({ start_time: "2026-07-10T17:03:00.000Z", end_time: null }, "America/Edmonton");
    expect(label).toContain("In progress");
    expect(label).not.toContain("Unknown time");
  });

  it("displays completed shifts with the formatted end time", () => {
    const label = formatShiftRange(
      { start_time: "2026-07-10T17:03:00.000Z", end_time: "2026-07-10T17:05:00.000Z" },
      "America/Edmonton",
    );
    expect(label).not.toContain("In progress");
    expect(label).not.toContain("Unknown time");
    expect(label).toContain("11:05");
  });
});

describe("Attendance API profile enrichment contract", () => {
  const route = readFileSync("app/api/scheduling/shifts/route.ts", "utf8");

  it("batch loads profiles for returned shift user IDs", () => {
    expect(route).toContain("shiftUserIds");
    expect(route).toContain('.from("profiles")');
    expect(route).toContain('.in("id", shiftUserIds)');
  });

  it("keeps profile enrichment scoped to the caller shop", () => {
    expect(route).toContain('.eq("shop_id", a.me.shop_id)');
  });

  it("returns employee identity fields in the attendance shift DTO", () => {
    expect(route).toContain("employeeName");
    expect(route).toContain("employeeEmail");
    expect(route).toContain("employee: {");
  });
});
