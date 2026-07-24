import { describe, expect, it } from "vitest";
import { resolveWorkforceSchedulePosture } from "@/features/workforce/lib/schedulePosture";

const thursdayTemplate = {
  user_id: "person-1",
  day_of_week: 4,
  is_working_day: true,
  start_time: "08:00",
  end_time: "17:00",
  effective_from: null,
  effective_to: null,
};

describe("workforce schedule posture", () => {
  it("resolves the shop-local weekday rather than the server weekday", () => {
    const result = resolveWorkforceSchedulePosture({
      userId: "person-1",
      at: new Date("2026-07-24T05:30:00.000Z"),
      timezone: "America/Edmonton",
      templates: [thursdayTemplate],
      overrides: [],
    });

    expect(result).toMatchObject({
      dateKey: "2026-07-23",
      dayOfWeek: 4,
      scheduled: true,
      source: "template",
    });
  });

  it("lets a dated day-off override replace the recurring template", () => {
    const result = resolveWorkforceSchedulePosture({
      userId: "person-1",
      at: new Date("2026-07-23T18:00:00.000Z"),
      timezone: "America/Edmonton",
      templates: [thursdayTemplate],
      overrides: [
        {
          user_id: "person-1",
          schedule_date: "2026-07-23",
          start_time: null,
          end_time: null,
          status: "scheduled",
        },
      ],
    });

    expect(result).toMatchObject({ scheduled: false, source: "override" });
  });

  it("ignores templates outside their effective date range", () => {
    const result = resolveWorkforceSchedulePosture({
      userId: "person-1",
      at: new Date("2026-07-23T18:00:00.000Z"),
      timezone: "America/Edmonton",
      templates: [
        {
          ...thursdayTemplate,
          effective_to: "2026-07-22",
        },
      ],
      overrides: [],
    });

    expect(result).toMatchObject({ scheduled: false, source: "none" });
  });
});
