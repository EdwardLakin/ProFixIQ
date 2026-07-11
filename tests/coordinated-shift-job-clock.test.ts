import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobileRoute = readFileSync("app/api/mobile/shifts/route.ts", "utf8");
const jobService = readFileSync(
  "features/work-orders/server/technicianJobLabor.ts",
  "utf8",
);
const transition = readFileSync(
  "features/work-orders/server/applyJobPunchTransition.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/202607110001_workforce_job_resume_contexts.sql",
  "utf8",
);

describe("coordinated shift and job clock source contract", () => {
  it("ends day by closing active job labor before completing the canonical shift", () => {
    expect(mobileRoute).toContain("closeAllActiveTechnicianJobLabor");
    expect(mobileRoute).toContain('reason: "shift_end"');
    expect(mobileRoute).toContain('event: "job_stopped_at_end_day"');
    expect(
      mobileRoute.indexOf("closeAllActiveTechnicianJobLabor"),
    ).toBeLessThan(mobileRoute.indexOf('rpc("complete_canonical_shift"'));
  });

  it("starts break/lunch by pausing job labor without changing line status and records resume context", () => {
    expect(mobileRoute).toContain(
      "eventType === PUNCH_EVENT_TYPES.breakStart ||",
    );
    expect(mobileRoute).toContain("createResumeContext");
    expect(mobileRoute).toContain("job_paused_for_break");
    expect(mobileRoute).toContain("job_paused_for_lunch");
    expect(jobService).toContain(
      "preserveLineStatus: params.preserveLineStatus === true",
    );
    expect(transition).toContain("preserveLineStatus");
    expect(transition).toContain("? {}");
  });

  it("ends break/lunch by resuming only the context tied to the specific break/lunch punch", () => {
    expect(mobileRoute).toContain("maybeResumeJobAfterBreak");
    expect(mobileRoute).toContain('.eq("break_punch_id", params.breakPunchId)');
    expect(mobileRoute).toContain('.eq("status", "pending")');
    expect(mobileRoute).toContain("job_resumed_after_break");
    expect(mobileRoute).toContain("job_resumed_after_lunch");
  });

  it("persists durable tenant-scoped resume contexts with pending uniqueness", () => {
    expect(migration).toContain(
      "create table if not exists public.workforce_job_resume_contexts",
    );
    expect(migration).toContain("shop_id uuid not null");
    expect(migration).toContain("break_punch_id uuid not null");
    expect(migration).toContain("uq_wjrc_one_pending_per_break_punch");
    expect(migration).toContain(
      "alter table public.workforce_job_resume_contexts enable row level security",
    );
  });
});
