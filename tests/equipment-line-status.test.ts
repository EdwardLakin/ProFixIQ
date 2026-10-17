import { describe, expect, it } from "vitest";

import { deriveLineView, latestWorkers, type LineSegmentInput } from "@/features/equipment/dispatch/lib/lineStatus";

const ME = "tech-me";
const OTHER = "tech-other";
const seg = (technicianId: string, over: Partial<LineSegmentInput> = {}): LineSegmentInput => ({
  technicianId,
  startedAt: "2026-10-17T10:00:00Z",
  endedAt: null,
  pauseReason: null,
  ...over,
});
const base = {
  lineStatus: "in_progress",
  approvalState: "approved",
  holdReason: null,
  viewerProfileId: ME,
  viewerCanManage: false,
};

describe("latestWorkers", () => {
  it("uses each technician's latest segment", () => {
    const workers = latestWorkers([
      seg(ME, { startedAt: "2026-10-17T08:00:00Z", endedAt: "2026-10-17T09:00:00Z", pauseReason: "parts" }),
      seg(ME, { startedAt: "2026-10-17T10:00:00Z" }),
    ]);
    expect(workers).toEqual([{ technicianId: ME, state: "running", since: "2026-10-17T10:00:00Z" }]);
  });

  it("maps end reasons to states", () => {
    const states = latestWorkers([
      seg("a", { endedAt: "x", pauseReason: "punched_off" }),
      seg("b", { endedAt: "x", pauseReason: "completed" }),
      seg("c", { endedAt: "x", pauseReason: "office_closed" }),
      seg("d", { endedAt: "x", pauseReason: "hold:parts" }),
    ]).map((w) => w.state);
    expect(states).toEqual(["punched_off", "completed", "office_closed", "on_hold"]);
  });
});

describe("punch-off visibility", () => {
  it("lets a running technician punch off, and closes the line only when alone", () => {
    const alone = deriveLineView({ ...base, segments: [seg(ME)] });
    expect(alone.canPunchOff).toBe(true);
    expect(alone.punchOffClosesLine).toBe(true);

    const crew = deriveLineView({ ...base, segments: [seg(ME), seg(OTHER)] });
    expect(crew.canPunchOff).toBe(true);
    expect(crew.punchOffClosesLine).toBe(false);
    expect(crew.othersRunning).toEqual([OTHER]);
  });

  it("does not count a held or punched-off technician as still working", () => {
    const view = deriveLineView({
      ...base,
      segments: [seg(ME), seg(OTHER, { endedAt: "x", pauseReason: "parts" })],
    });
    expect(view.punchOffClosesLine).toBe(true);
  });

  it("offers nothing to a technician with no running timer or on a closed line", () => {
    expect(deriveLineView({ ...base, segments: [seg(OTHER)] }).canPunchOff).toBe(false);
    expect(deriveLineView({ ...base, lineStatus: "completed", segments: [seg(ME)] }).canPunchOff).toBe(false);
  });
});

describe("office close visibility", () => {
  const office = { ...base, viewerProfileId: "office", viewerCanManage: true };

  it("is offered to dispatch staff for a line with logged time", () => {
    const view = deriveLineView({ ...office, segments: [seg(OTHER)] });
    expect(view.canOfficeClose).toBe(true);
    expect(view.officeCloseBlockedReason).toBeNull();
  });

  it("is never offered to non-managers", () => {
    const view = deriveLineView({ ...base, segments: [seg(OTHER)] });
    expect(view.canOfficeClose).toBe(false);
    expect(view.officeCloseBlockedReason).toBeNull();
  });

  it("mirrors the database approval fences", () => {
    expect(deriveLineView({ ...office, approvalState: "pending", segments: [seg(OTHER)] }).officeCloseBlockedReason)
      .toMatch(/waiting for approval/);
    expect(
      deriveLineView({
        ...office,
        approvalState: "pending",
        lineStatus: "on_hold",
        holdReason: "Awaiting parts quote",
        segments: [seg(OTHER)],
      }).officeCloseBlockedReason,
    ).toMatch(/parts quote/);
  });

  it("is blocked when nobody logged time or the line is closed", () => {
    expect(deriveLineView({ ...office, segments: [] }).canOfficeClose).toBe(false);
    expect(deriveLineView({ ...office, lineStatus: "completed", segments: [seg(OTHER)] }).canOfficeClose).toBe(false);
  });
});
