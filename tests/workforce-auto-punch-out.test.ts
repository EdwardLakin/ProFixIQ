import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getRelevantScheduleDateKeys,
  isValidShopTimezone,
  resolveScheduledShiftEnd,
} from "@/features/workforce/server/autoPunchOut";

describe("workforce auto punch-out schedule resolution", () => {
  const template = {
    id: "template-1",
    shop_id: "shop-1",
    user_id: "tech-1",
    day_of_week: 1,
    is_working_day: true,
    start_time: "08:00",
    end_time: "17:00",
    updated_at: "2026-07-01T00:00:00.000Z",
  };

  const resolve = (
    input: Partial<Parameters<typeof resolveScheduledShiftEnd>[0]> = {},
  ) =>
    resolveScheduledShiftEnd({
      shopId: "shop-1",
      userId: "tech-1",
      shiftStartedAt: "2026-07-27T14:00:00.000Z",
      timezone: "America/Edmonton",
      templates: [template],
      overrides: [],
      ...input,
    });

  it("resolves recurring end time in the validated shop timezone", () => {
    expect(resolve()).toMatchObject({
      scheduledEndIso: "2026-07-27T23:00:00.000Z",
      source: "template",
      dateKey: "2026-07-27",
    });
  });

  it("uses the dated override instead of the recurring template", () => {
    expect(
      resolve({
        overrides: [
          {
            id: "override-1",
            shop_id: "shop-1",
            user_id: "tech-1",
            schedule_date: "2026-07-27",
            start_time: "2026-07-27T15:00:00.000Z",
            end_time: "2026-07-27T21:30:00.000Z",
            status: "scheduled",
          },
        ],
      }),
    ).toMatchObject({
      scheduledEndIso: "2026-07-27T21:30:00.000Z",
      source: "override",
    });
  });

  it("does not fall back when the latest override marks the day off", () => {
    expect(
      resolve({
        overrides: [
          {
            id: "override-old",
            shop_id: "shop-1",
            user_id: "tech-1",
            schedule_date: "2026-07-27",
            start_time: "2026-07-27T14:00:00.000Z",
            end_time: "2026-07-27T22:00:00.000Z",
            status: "scheduled",
            updated_at: "2026-07-01T00:00:00.000Z",
          },
          {
            id: "override-new",
            shop_id: "shop-1",
            user_id: "tech-1",
            schedule_date: "2026-07-27",
            start_time: null,
            end_time: null,
            status: "scheduled",
            updated_at: "2026-07-02T00:00:00.000Z",
          },
        ],
      }),
    ).toBeNull();
  });

  it("resolves duplicate rows deterministically to the newest update", () => {
    expect(
      resolve({
        overrides: [
          {
            id: "override-new",
            shop_id: "shop-1",
            user_id: "tech-1",
            schedule_date: "2026-07-27",
            start_time: "2026-07-27T14:00:00.000Z",
            end_time: "2026-07-27T20:00:00.000Z",
            status: "scheduled",
            updated_at: "2026-07-03T00:00:00.000Z",
          },
          {
            id: "override-old",
            shop_id: "shop-1",
            user_id: "tech-1",
            schedule_date: "2026-07-27",
            start_time: "2026-07-27T14:00:00.000Z",
            end_time: "2026-07-27T22:00:00.000Z",
            status: "scheduled",
            updated_at: "2026-07-01T00:00:00.000Z",
          },
        ],
      })?.scheduledEndIso,
    ).toBe("2026-07-27T20:00:00.000Z");
  });

  it("ignores schedule rows from a former shop", () => {
    expect(
      resolve({
        templates: [
          { ...template, shop_id: "former-shop", end_time: "12:00" },
          template,
        ],
      })?.scheduledEndIso,
    ).toBe("2026-07-27T23:00:00.000Z");
  });

  it("supports recurring overnight shifts", () => {
    expect(
      resolve({
        shiftStartedAt: "2026-07-28T04:00:00.000Z",
        templates: [
          { ...template, start_time: "22:00", end_time: "06:00" },
        ],
      }),
    ).toMatchObject({
      scheduledEndIso: "2026-07-28T12:00:00.000Z",
      dateKey: "2026-07-27",
    });
  });

  it("matches a late after-midnight punch to the previous overnight shift", () => {
    expect(
      resolve({
        shiftStartedAt: "2026-07-28T06:05:00.000Z",
        templates: [
          { ...template, start_time: "22:00", end_time: "06:00" },
        ],
      }),
    ).toMatchObject({
      scheduledEndIso: "2026-07-28T12:00:00.000Z",
      dateKey: "2026-07-27",
    });
  });

  it("rejects missing and invalid payroll timezones", () => {
    expect(isValidShopTimezone(null)).toBe(false);
    expect(isValidShopTimezone("Not/A_Timezone")).toBe(false);
    expect(resolve({ timezone: "Not/A_Timezone" })).toBeNull();
  });

  it("bounds override lookups to the start day and previous day", () => {
    expect(
      getRelevantScheduleDateKeys(
        "2026-07-28T06:05:00.000Z",
        "America/Edmonton",
      ),
    ).toEqual(["2026-07-28", "2026-07-27"]);
  });
});

describe("workforce auto punch-out route contract", () => {
  const route = readFileSync(
    "app/api/internal/workforce/auto-punch-out/route.ts",
    "utf8",
  );
  const migration = readFileSync(
    "supabase/migrations/20260728181241_workforce_atomic_scheduled_shift_end.sql",
    "utf8",
  );
  const vercel = readFileSync("vercel.json", "utf8");

  it("delegates the complete lifecycle to one atomic service-role RPC", () => {
    expect(route).toContain('rpc("complete_scheduled_shift_end_atomic"');
    expect(route).not.toContain("closeAllActiveTechnicianJobLabor");
    expect(migration).toContain(
      "create or replace function public.complete_scheduled_shift_end_atomic",
    );
    expect(migration).toContain("to service_role");
  });

  it("locks the employee and closes labor before completing the shift", () => {
    expect(migration).toContain("from public.profiles p");
    expect(migration).toContain("for update");
    expect(migration).toContain("public.apply_job_punch_transition_atomic");
    expect(migration.indexOf("public.apply_job_punch_transition_atomic")).toBeLessThan(
      migration.indexOf("update public.tech_shifts"),
    );
  });

  it("clamps late starts without completing the work-order line", () => {
    expect(migration).toContain("max(seg.started_at)");
    expect(migration).toContain("greatest(");
    expect(migration).toContain("'pause'");
    expect(migration).toContain("true,\n+      false,".replace("+", ""));
  });

  it("cancels resume context and records an automatic audit note atomically", () => {
    expect(migration).toContain("public.workforce_job_resume_contexts");
    expect(migration).toContain("cancel_reason = 'scheduled_shift_ended'");
    expect(migration).toContain("automatic:scheduled_shift_end");
  });

  it("uses cursor pagination and date-bounded, shop-scoped schedule reads", () => {
    expect(route).toContain('query.gt("id", cursorId)');
    expect(route).toContain("while (true)");
    expect(route).toContain('"id, shop_id, user_id');
    expect(route).toContain('.in("schedule_date", relevantDateKeys)');
  });

  it("runs every minute behind an internal secret", () => {
    expect(route).toContain("CRON_SECRET");
    expect(vercel).toContain("/api/internal/workforce/auto-punch-out");
    expect(vercel).toContain('"schedule": "* * * * *"');
  });
});
