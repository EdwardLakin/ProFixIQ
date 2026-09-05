import { describe, expect, it } from "vitest";

import {
  describeNewTechnicianAssignments,
  detectNewTechnicianAssignments,
  type AnnouncementAgendaItem,
} from "@/features/copilot/technician/client/dayAgendaAnnouncements";

const brakeJob: AnnouncementAgendaItem = {
  workOrderLineId: "line-1",
  workOrderLabel: "WO #EL000005",
  lineLabel: "Brake inspection",
  vehicle: "2017 Ford Expedition",
};

const oilJob: AnnouncementAgendaItem = {
  workOrderLineId: "line-2",
  workOrderLabel: "WO #EL000006",
  lineLabel: "Oil and filter change",
  vehicle: "2019 Toyota Camry",
};

describe("detectNewTechnicianAssignments", () => {
  it("announces nothing on the very first fetch — there's no baseline to compare against", () => {
    expect(detectNewTechnicianAssignments(null, [brakeJob, oilJob])).toEqual([]);
  });

  it("finds only items that weren't in the previous snapshot", () => {
    const previous = new Set(["line-1"]);
    expect(detectNewTechnicianAssignments(previous, [brakeJob, oilJob])).toEqual([
      oilJob,
    ]);
  });

  it("finds nothing new when the queue is unchanged", () => {
    const previous = new Set(["line-1", "line-2"]);
    expect(detectNewTechnicianAssignments(previous, [brakeJob, oilJob])).toEqual(
      [],
    );
  });
});

describe("describeNewTechnicianAssignments", () => {
  it("returns null instead of an empty announcement when nothing is new", () => {
    expect(describeNewTechnicianAssignments([])).toBeNull();
  });

  it("names the single job when only one is new", () => {
    expect(describeNewTechnicianAssignments([brakeJob])).toBe(
      "You've just been assigned Brake inspection on the 2017 Ford Expedition — WO #EL000005.",
    );
  });

  it("summarizes multiple new jobs instead of reading out every one", () => {
    const fourJobs = [
      brakeJob,
      oilJob,
      { ...brakeJob, workOrderLineId: "line-3", lineLabel: "Tire rotation" },
      { ...brakeJob, workOrderLineId: "line-4", lineLabel: "Alignment check" },
    ];

    const text = describeNewTechnicianAssignments(fourJobs);
    expect(text).toBe(
      "You've just been assigned 4 new jobs: Brake inspection (WO #EL000005), Oil and filter change (WO #EL000006), Tire rotation (WO #EL000005), and 1 more.",
    );
  });
});
