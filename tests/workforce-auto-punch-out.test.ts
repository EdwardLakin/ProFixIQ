import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveScheduledShiftEnd } from "@/features/workforce/server/autoPunchOut";

describe("workforce auto punch-out schedule resolution", () => {
  const template = {
    user_id: "tech-1",
    day_of_week: 1,
    is_working_day: true,
    start_time: "08:00",
    end_time: "17:00",
  };

  it("resolves recurring end time in the shop timezone", () => {
    expect(
      resolveScheduledShiftEnd({
        userId: "tech-1",
        shiftStartedAt: "2026-07-27T14:00:00.000Z",
        timezone: "America/Edmonton",
        templates: [template],
        overrides: [],
      }),
    ).toMatchObject({
      scheduledEndIso: "2026-07-27T23:00:00.000Z",
      source: "template",
      dateKey: "2026-07-27",
    });
  });

  it("uses the dated override instead of the recurring template", () => {
    expect(
      resolveScheduledShiftEnd({
        userId: "tech-1",
        shiftStartedAt: "2026-07-27T14:00:00.000Z",
        timezone: "America/Edmonton",
        templates: [template],
        overrides: [{
          user_id: "tech-1",
          schedule_date: "2026-07-27",
          start_time: "2026-07-27T15:00:00.000Z",
          end_time: "2026-07-27T21:30:00.000Z",
          status: "scheduled",
        }],
      }),
    ).toMatchObject({
      scheduledEndIso: "2026-07-27T21:30:00.000Z",
      source: "override",
    });
  });

  it("does not fall back to a template when an override marks the day off", () => {
    expect(
      resolveScheduledShiftEnd({
        userId: "tech-1",
        shiftStartedAt: "2026-07-27T14:00:00.000Z",
        timezone: "America/Edmonton",
        templates: [template],
        overrides: [{
          user_id: "tech-1",
          schedule_date: "2026-07-27",
          start_time: null,
          end_time: null,
          status: "scheduled",
        }],
      }),
    ).toBeNull();
  });

  it("supports recurring overnight shifts", () => {
    expect(
      resolveScheduledShiftEnd({
        userId: "tech-1",
        shiftStartedAt: "2026-07-28T04:00:00.000Z",
        timezone: "America/Edmonton",
        templates: [{ ...template, start_time: "22:00", end_time: "06:00" }],
        overrides: [],
      }),
    ).toMatchObject({
      scheduledEndIso: "2026-07-28T12:00:00.000Z",
      dateKey: "2026-07-27",
    });
  });
});

describe("workforce auto punch-out route contract", () => {
  const route = readFileSync(
    "app/api/internal/workforce/auto-punch-out/route.ts",
    "utf8",
  );
  const vercel = readFileSync("vercel.json", "utf8");

  it("closes job labor before the canonical shift at the scheduled timestamp", () => {
    expect(route).toContain("closeAllActiveTechnicianJobLabor");
    expect(route).toContain('reason: "scheduled_shift_end"');
    expect(route).toContain('event: "job_stopped_at_scheduled_end_day"');
    expect(route).toContain("p_timestamp: schedule.scheduledEndIso");
    expect(route.indexOf("closeAllActiveTechnicianJobLabor")).toBeLessThan(
      route.indexOf('rpc("complete_canonical_shift"'),
    );
  });

  it("cancels break/lunch resume context instead of leaving a resumable job", () => {
    expect(route).toContain('"workforce_job_resume_contexts"');
    expect(route).toContain('cancel_reason: "scheduled_shift_ended"');
  });

  it("runs every minute behind an internal secret", () => {
    expect(route).toContain("CRON_SECRET");
    expect(vercel).toContain("/api/internal/workforce/auto-punch-out");
    expect(vercel).toContain('"schedule": "* * * * *"');
  });
});
