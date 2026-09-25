import { describe, expect, it } from "vitest";

import type { TechnicianWorkCandidate } from "@/features/copilot/technician/server/assignedWork";
import {
  buildTechnicianDayAgenda,
  describeTechnicianDayAgenda,
} from "@/features/copilot/technician/server/dayAgenda";

function atHour(hour: number): Date {
  const date = new Date("2026-09-04T00:00:00");
  date.setHours(hour, 0, 0, 0);
  return date;
}

const brakeJob: TechnicianWorkCandidate = {
  id: "00000000-0000-4000-8000-000000000100",
  customId: "EL000005",
  status: "in_progress",
  concern: "Brake vibration",
  description: null,
  vehicleYear: 2017,
  vehicleMake: "Ford",
  vehicleModel: "Expedition",
  vehicleVin: null,
  vehicleUnitNumber: null,
  lineIds: [
    "00000000-0000-4000-8000-000000000201",
    "00000000-0000-4000-8000-000000000202",
  ],
  lines: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      complaint: "Brake inspection",
      description: null,
      status: "awaiting",
      cause: null,
      correction: null,
      holdReason: null,
      priority: 2,
      createdAt: "2026-08-15T12:00:00Z",
      updatedAt: "2026-08-15T12:05:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000202",
      complaint: "Road test",
      description: null,
      status: "in_progress",
      cause: null,
      correction: null,
      holdReason: null,
      priority: 3,
      createdAt: "2026-08-15T12:01:00Z",
      updatedAt: "2026-08-15T12:06:00Z",
    },
  ],
  lineComplaints: ["Brake inspection", "Road test"],
};

const oilChange: TechnicianWorkCandidate = {
  id: "00000000-0000-4000-8000-000000000300",
  customId: "EL000006",
  status: "awaiting",
  concern: "Oil change",
  description: null,
  vehicleYear: 2019,
  vehicleMake: "Toyota",
  vehicleModel: "Camry",
  vehicleVin: null,
  vehicleUnitNumber: null,
  lineIds: ["00000000-0000-4000-8000-000000000301"],
  lines: [
    {
      id: "00000000-0000-4000-8000-000000000301",
      complaint: "Oil and filter change",
      description: null,
      status: "waiting_parts",
      cause: null,
      correction: null,
      holdReason: "Filter on order",
      priority: 1,
      createdAt: "2026-08-15T11:00:00Z",
      updatedAt: "2026-08-15T11:05:00Z",
    },
  ],
  lineComplaints: ["Oil and filter change"],
};

const roadTestLineId = "00000000-0000-4000-8000-000000000202";

describe("buildTechnicianDayAgenda", () => {
  it("orders the full assigned queue and counts by status, not just the next line", () => {
    const agenda = buildTechnicianDayAgenda(
      [brakeJob, oilChange],
      new Set([roadTestLineId]),
    );

    expect(agenda.totalCount).toBe(3);
    expect(agenda.inProgressCount).toBe(1);
    expect(agenda.readyCount).toBe(1);
    expect(agenda.waitingPartsCount).toBe(1);
    expect(agenda.activeItem?.lineLabel).toBe("Road test");
    // in_progress ranks first regardless of created-at order.
    expect(agenda.items[0].lineLabel).toBe("Road test");
  });

  it("reports no active item and zero counts for an empty queue", () => {
    const agenda = buildTechnicianDayAgenda([]);
    expect(agenda.totalCount).toBe(0);
    expect(agenda.activeItem).toBeNull();
  });

  it("never claims the technician is punched in from line status alone", () => {
    // Reported bug: a line's status can still read "in_progress" (e.g. via
    // the legacy "active" status alias) long after the technician actually
    // punched out — an auto punch-out at shift end deliberately preserves
    // line status so the job still reads as unfinished. Without an actual
    // open labor segment for this technician, the line must not be reported
    // as the active/punched-in item.
    const agenda = buildTechnicianDayAgenda([brakeJob, oilChange]);

    expect(agenda.inProgressCount).toBe(1);
    expect(agenda.activeItem).toBeNull();
  });
});

describe("describeTechnicianDayAgenda", () => {
  it("tells an idle technician what's already in progress instead of restating the whole queue", () => {
    const agenda = buildTechnicianDayAgenda(
      [brakeJob, oilChange],
      new Set([roadTestLineId]),
    );
    const greeting = describeTechnicianDayAgenda(
      agenda,
      "Edward",
      atHour(8),
      "UTC",
    );

    expect(greeting).toContain("Good morning, Edward.");
    expect(greeting).toContain("already punched into Road test");
    expect(greeting).toContain("WO #EL000005");
    expect(greeting).toContain("2 more lines queued up after that");
  });

  it("previews the queue and asks where to begin when nothing is active yet", () => {
    const agenda = buildTechnicianDayAgenda([oilChange]);
    const greeting = describeTechnicianDayAgenda(
      agenda,
      "Edward",
      atHour(14),
      "UTC",
    );

    expect(greeting).toContain("Good afternoon, Edward.");
    expect(greeting).toContain("You've got 1 job lined up today");
    expect(greeting).toContain("1 waiting on parts");
    expect(greeting).toContain("Oil and filter change");
    expect(greeting).toContain("Where would you like to begin?");
  });

  it("never invents a name or a job when there isn't one", () => {
    const agenda = buildTechnicianDayAgenda([]);
    const greeting = describeTechnicianDayAgenda(agenda, null, atHour(19), "UTC");

    expect(greeting).toBe(
      "Good evening. You don't have any assigned jobs right now. Let me know if you want me to check for anything.",
    );
  });

  it("reads the salutation against the shop's own timezone, not the server's UTC clock", () => {
    // 18:00 UTC is evening on the server, but it's still 11:00 (late
    // morning) in Los Angeles (UTC-7 in September) — the greeting must
    // reflect the shop's local time, not the server's, or a shop mid-morning
    // gets told "good evening" the way the reported bug did.
    const agenda = buildTechnicianDayAgenda([]);
    const serverEveningUtc = new Date("2026-09-04T18:00:00Z");

    const shopLocalGreeting = describeTechnicianDayAgenda(
      agenda,
      null,
      serverEveningUtc,
      "America/Los_Angeles",
    );
    expect(shopLocalGreeting.startsWith("Good morning.")).toBe(true);

    const utcGreeting = describeTechnicianDayAgenda(
      agenda,
      null,
      serverEveningUtc,
      "UTC",
    );
    expect(utcGreeting.startsWith("Good evening.")).toBe(true);
  });
});
