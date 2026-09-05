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

describe("buildTechnicianDayAgenda", () => {
  it("orders the full assigned queue and counts by status, not just the next line", () => {
    const agenda = buildTechnicianDayAgenda([brakeJob, oilChange]);

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
});

describe("describeTechnicianDayAgenda", () => {
  it("tells an idle technician what's already in progress instead of restating the whole queue", () => {
    const agenda = buildTechnicianDayAgenda([brakeJob, oilChange]);
    const greeting = describeTechnicianDayAgenda(agenda, "Edward", atHour(8));

    expect(greeting).toContain("Good morning, Edward.");
    expect(greeting).toContain("already punched into Road test");
    expect(greeting).toContain("WO #EL000005");
    expect(greeting).toContain("2 more lines queued up after that");
  });

  it("previews the queue and asks where to begin when nothing is active yet", () => {
    const agenda = buildTechnicianDayAgenda([oilChange]);
    const greeting = describeTechnicianDayAgenda(agenda, "Edward", atHour(14));

    expect(greeting).toContain("Good afternoon, Edward.");
    expect(greeting).toContain("You've got 1 job lined up today");
    expect(greeting).toContain("1 waiting on parts");
    expect(greeting).toContain("Oil and filter change");
    expect(greeting).toContain("Where would you like to begin?");
  });

  it("never invents a name or a job when there isn't one", () => {
    const agenda = buildTechnicianDayAgenda([]);
    const greeting = describeTechnicianDayAgenda(agenda, null, atHour(19));

    expect(greeting).toBe(
      "Good evening. You don't have any assigned jobs right now. Let me know if you want me to check for anything.",
    );
  });
});
